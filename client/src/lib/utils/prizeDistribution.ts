import { calculateDistribution } from "@/lib/utils";

/**
 * Helper function to expand distributed prizes into individual position prizes
 * Handles both nested object format (DisplayPrize) and SQL flat format (from Torii)
 */
export function expandDistributedPrize(prize: any): any[] {
  const payoutPosition = prize.position ?? prize.payout_position ?? 0;

  // If not a distributed prize (position !== 0), return as-is
  if (payoutPosition !== 0) {
    return [prize];
  }

  // Check if it's an ERC20 prize - handle both nested and SQL flat formats
  const isErc20Nested = prize.token_type?.variant?.erc20;
  const isErc20Sql =
    prize.token_type === "erc20" || prize["token_type.erc20.amount"];

  if (!isErc20Nested && !isErc20Sql) {
    return [prize]; // Only ERC20 can be distributed
  }

  // Extract data based on format
  let totalAmount: bigint;
  let distributionType: "linear" | "exponential" | "uniform" | "custom" =
    "exponential";
  let weight = 100;
  let distributionCount: number;
  let customShares: number[] | undefined;

  if (isErc20Nested) {
    // Nested object format (DisplayPrize)
    const erc20Data = prize.token_type.variant.erc20;
    const distributionOption = erc20Data.distribution;
    const distributionCountOption = erc20Data.distribution_count;

    if (!distributionOption?.Some || !distributionCountOption?.Some) {
      return [prize]; // No distribution data, skip
    }

    const distributionVariant = distributionOption.Some.variant;
    distributionCount = Number(distributionCountOption.Some);
    totalAmount = BigInt(erc20Data.amount);

    if (distributionVariant.Linear !== undefined) {
      distributionType = "linear";
      weight = Number(distributionVariant.Linear);
    } else if (distributionVariant.Exponential !== undefined) {
      distributionType = "exponential";
      weight = Number(distributionVariant.Exponential);
    } else if (distributionVariant.Uniform !== undefined) {
      distributionType = "uniform";
    } else if (distributionVariant.Custom !== undefined) {
      distributionType = "custom";
      customShares = distributionVariant.Custom;
    }
  } else {
    // SQL flat format
    const distributionOption = prize["token_type.erc20.distribution"];
    const distributionCountOption = prize["token_type.erc20.distribution_count"];

    if (distributionOption !== "Some" || distributionCountOption !== "Some") {
      return [prize]; // No distribution data, skip
    }

    const distributionVariantType = prize["token_type.erc20.distribution.Some"];
    distributionCount = Number(prize["token_type.erc20.distribution_count.Some"]);
    totalAmount = BigInt(prize["token_type.erc20.amount"]);

    if (distributionVariantType === "Linear") {
      distributionType = "linear";
      weight = Number(prize["token_type.erc20.distribution.Some.Linear"]);
    } else if (distributionVariantType === "Exponential") {
      distributionType = "exponential";
      weight = Number(prize["token_type.erc20.distribution.Some.Exponential"]);
    } else if (distributionVariantType === "Uniform") {
      distributionType = "uniform";
    } else if (distributionVariantType === "Custom") {
      distributionType = "custom";
      const customData = prize["token_type.erc20.distribution.Some.Custom"];
      customShares = customData ? JSON.parse(customData) : undefined;
    }
  }

  // Calculate distribution percentages
  let percentages: number[];
  if (distributionType === "custom" && customShares) {
    // For custom, shares are already defined
    const totalShares = customShares.reduce((sum, share) => sum + share, 0);
    percentages = customShares.map((share) => (share / totalShares) * 100);
  } else {
    // Use calculateDistribution for standard types
    percentages = calculateDistribution(
      distributionCount,
      weight / 10, // Weight is scaled by 10 in contract
      0,
      0,
      0,
      distributionType as "linear" | "exponential" | "uniform"
    );
  }

  // Create individual position prizes
  return percentages.map((percentage, index) => {
    const positionAmount =
      (totalAmount * BigInt(Math.floor(percentage * 100))) / 10000n;

    if (isErc20Sql) {
      // Return SQL flat format
      return {
        ...prize,
        position: index + 1,
        payout_position: index + 1,
        "token_type.erc20.amount": positionAmount.toString(),
      };
    } else {
      // Return nested object format
      return {
        ...prize,
        position: index + 1,
        payout_position: index + 1,
        token_type: {
          variant: {
            erc20: {
              amount: positionAmount.toString(),
            },
          },
        },
      };
    }
  });
}
