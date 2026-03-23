/**
 * Adapters that convert budokan prize data into metagame-sdk Prize type.
 *
 * Budokan prizes come in multiple formats:
 * 1. budokan-sdk API: { prizeId, tokenAddress, tokenType: "erc20"|"erc721", amount, tokenId, ... }
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
 * Convert a budokan-sdk Prize to metagame-sdk Prize.
 *
 * The SDK now returns flat fields: tokenType is "erc20"|"erc721",
 * amount and tokenId are separate top-level fields.
 */
export function adaptSdkPrize(p: BudokanSdkPrize): MetagamePrize {
  return {
    id: p.prizeId,
    position: p.payoutPosition,
    tokenAddress: p.tokenAddress,
    tokenType: p.tokenType as "erc20" | "erc721",
    amount:
      p.tokenType === "erc20"
        ? (p.amount ?? "0")
        : (p.tokenId ?? "0"),
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
