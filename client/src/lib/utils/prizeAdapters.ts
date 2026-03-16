/**
 * Adapters that convert budokan prize data into metagame-sdk Prize type.
 *
 * Budokan prizes come in multiple formats:
 * 1. budokan-sdk API: { prizeId, tokenAddress, tokenType: { erc20: { amount } } | { erc721: { id } }, ... }
 * 2. Generated models: { id, token_address, token_type: CairoCustomEnum, ... }
 * 3. DisplayPrize: extends generated model with position and type fields
 *
 * The metagame-sdk Prize is the normalized form used by shared utilities
 * (aggregation, filtering, prize table, etc).
 */

import type { Prize as MetagamePrize } from "@provable-games/metagame-sdk";
import type { Prize as BudokanSdkPrize } from "@provable-games/budokan-sdk";
import type { Prize as ContractPrize } from "@/generated/models.gen";
import type { DisplayPrize } from "@/lib/types";

/**
 * Extract token type string and amount from budokan-sdk's tokenType field.
 * The SDK returns tokenType as `unknown` which can be:
 * - An object: { erc20: { amount: string, ... } } or { erc721: { id: string } }
 * - A string: "erc20" or "erc721" (from some API responses)
 */
function parseTokenType(tokenType: unknown): {
  type: "erc20" | "erc721";
  amount: string;
} {
  if (typeof tokenType === "string") {
    return { type: tokenType as "erc20" | "erc721", amount: "0" };
  }

  if (tokenType && typeof tokenType === "object") {
    const tt = tokenType as Record<string, any>;
    if ("erc20" in tt && tt.erc20) {
      return {
        type: "erc20",
        amount: String(tt.erc20.amount ?? "0"),
      };
    }
    if ("erc721" in tt && tt.erc721) {
      return {
        type: "erc721",
        amount: String(tt.erc721.id ?? "0"),
      };
    }
  }

  return { type: "erc20", amount: "0" };
}

/**
 * Convert a budokan-sdk Prize to metagame-sdk Prize.
 */
export function adaptSdkPrize(p: BudokanSdkPrize): MetagamePrize {
  const { type, amount } = parseTokenType(p.tokenType);
  return {
    id: p.prizeId,
    position: p.payoutPosition,
    tokenAddress: p.tokenAddress,
    tokenType: type,
    amount,
    sponsorAddress: p.sponsorAddress,
  };
}

/**
 * Convert a generated contract Prize (with CairoCustomEnum) to metagame-sdk Prize.
 */
export function adaptContractPrize(
  p: ContractPrize,
  payoutPosition?: number,
): MetagamePrize {
  let tokenType: "erc20" | "erc721" = "erc20";
  let amount = "0";

  const tt = p.token_type as any;
  if (typeof tt?.activeVariant === "function") {
    const variant = tt.activeVariant();
    if (variant === "erc721") {
      tokenType = "erc721";
      amount = String(tt.variant?.erc721?.id ?? "0");
    } else {
      tokenType = "erc20";
      amount = String(tt.variant?.erc20?.amount ?? "0");
    }
  } else if (tt?.variant) {
    if (tt.variant.erc721) {
      tokenType = "erc721";
      amount = String(tt.variant.erc721.id ?? "0");
    } else if (tt.variant.erc20) {
      tokenType = "erc20";
      amount = String(tt.variant.erc20.amount ?? "0");
    }
  }

  return {
    id: String(p.id),
    position: payoutPosition ?? 0,
    tokenAddress: p.token_address,
    tokenType,
    amount,
    sponsorAddress: p.sponsor_address,
  };
}

/**
 * Convert a DisplayPrize (budokan's enriched prize) to metagame-sdk Prize.
 */
export function adaptDisplayPrize(p: DisplayPrize): MetagamePrize {
  const base = adaptContractPrize(p, Number(p.position ?? 0));
  return base;
}

/**
 * Batch convert budokan-sdk prizes.
 */
export function adaptSdkPrizes(prizes: BudokanSdkPrize[]): MetagamePrize[] {
  return prizes.map(adaptSdkPrize);
}
