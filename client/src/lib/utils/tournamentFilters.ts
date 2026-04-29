import type { Tournament } from "@provable-games/budokan-sdk";
import type { OverviewFilters } from "@/hooks/useUIStore";

export interface AggregationTokenTotal {
  tokenAddress?: string;
  tokenType?: string;
  totalAmount?: string | number;
}

/**
 * Apply the client-side filter predicate that backs the Overview "Filters"
 * popover. Pulled out of Overview.tsx so the Profile page (and any other
 * tournament list view) can share the same semantics.
 */
export function matchesTournamentFilters(
  tournament: Tournament,
  entryCount: number,
  aggregationTokenTotals: AggregationTokenTotal[] | undefined,
  filters: OverviewFilters,
): boolean {
  // Entry Fee
  if (filters.entryFee !== "any") {
    const hasFee =
      !!(
        tournament.entryFeeToken &&
        tournament.entryFeeAmount &&
        BigInt(tournament.entryFeeAmount) > 0n
      ) ||
      !!(
        tournament.entryFee?.tokenAddress &&
        tournament.entryFee?.amount &&
        BigInt(tournament.entryFee.amount) > 0n
      );
    if (filters.entryFee === "free" && hasFee) return false;
    if (filters.entryFee === "paid" && !hasFee) return false;
  }

  // Has Prizes
  if (filters.hasPrizes) {
    const aggHasPrizes = !!aggregationTokenTotals?.some(
      (tt) =>
        Number(tt.totalAmount ?? 0) > 0 || tt.tokenType !== "erc20",
    );
    const distCount = Number(tournament.entryFee?.distributionCount ?? 0);
    const entryFeePool =
      !!(
        tournament.entryFee?.amount &&
        BigInt(tournament.entryFee.amount) > 0n
      ) &&
      entryCount > 0 &&
      distCount > 0;
    if (!aggHasPrizes && !entryFeePool) return false;
  }

  // Entry Requirement
  if (filters.entryRequirement !== "any") {
    const restricted =
      !!tournament.entryRequirement || !!tournament.hasEntryRequirement;
    if (filters.entryRequirement === "open" && restricted) return false;
    if (filters.entryRequirement === "restricted" && !restricted) return false;
  }

  // Registration window
  if (filters.registration !== "any") {
    const startDelay = Number(tournament.schedule?.registrationStartDelay ?? 0);
    const endDelay = Number(tournament.schedule?.registrationEndDelay ?? 0);
    const isOpen = startDelay === 0 && endDelay === 0;
    if (filters.registration === "open" && !isOpen) return false;
    if (filters.registration === "fixed" && isOpen) return false;
  }

  return true;
}
