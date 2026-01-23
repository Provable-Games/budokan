/**
 * Tournament validation utilities for preventing farming and gas abuse
 */

import { TournamentFormData } from "@/containers/CreateTournament";
import { Tournament } from "@/generated/models.gen";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  suggestion?: string;
}

export interface PrizeValidationConfig {
  // Minimum USD value threshold that requires entry barriers
  minValueThreshold: number;
  // Whether to enforce strict validation (reject) or just warn
  strict: boolean;
}

export const DEFAULT_VALIDATION_CONFIG: PrizeValidationConfig = {
  minValueThreshold: 50, // $50 USD minimum
  strict: true,
};

/**
 * Validates that tournaments with significant prize pools have entry barriers
 * to prevent farming, botting, and gas abuse
 */
export function validateTournamentEntryBarriers(
  prizeValueUSD: number,
  hasEntryFee: boolean,
  hasGating: boolean,
  config: PrizeValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  // If prize pool is below threshold, no validation needed
  if (prizeValueUSD < config.minValueThreshold) {
    return { isValid: true };
  }

  // Check if tournament has any entry barrier
  const hasEntryBarrier = hasEntryFee || hasGating;

  if (!hasEntryBarrier) {
    const error = `Tournaments with prize pools over $${config.minValueThreshold} must have entry barriers`;
    const suggestion = hasGating
      ? "Enable an entry fee to prevent farming and cover gas costs"
      : "Enable entry fees OR entry requirements to prevent farming and cover gas costs";

    return {
      isValid: !config.strict,
      error: config.strict ? error : undefined,
      warning: !config.strict ? error : undefined,
      suggestion,
    };
  }

  return { isValid: true };
}

/**
 * Validates tournament creation form data
 */
export function validateTournamentCreation(
  formData: TournamentFormData,
  totalPrizeValueUSD: number,
  config?: PrizeValidationConfig
): ValidationResult {
  const hasEntryFee = formData.enableEntryFees && (formData.entryFees?.amount ?? 0) > 0;
  const hasGating = formData.enableGating && !!formData.gatingOptions?.type;

  return validateTournamentEntryBarriers(
    totalPrizeValueUSD,
    hasEntryFee,
    hasGating,
    config
  );
}

/**
 * Validates adding prizes to an existing tournament
 */
export function validatePrizeAddition(
  tournament: Tournament,
  additionalPrizeValueUSD: number,
  existingPrizeValueUSD: number,
  config?: PrizeValidationConfig
): ValidationResult {
  const totalPrizeValueUSD = additionalPrizeValueUSD + existingPrizeValueUSD;

  // Check if tournament has entry fee
  const hasEntryFee = tournament.entry_fee.isSome();

  // Check if tournament has gating
  const hasGating = tournament.entry_requirement.isSome();

  return validateTournamentEntryBarriers(
    totalPrizeValueUSD,
    hasEntryFee,
    hasGating,
    config
  );
}

/**
 * Helper to calculate total prize value from entry fees
 */
export function calculateEntryFeePrizePoolValue(
  formData: TournamentFormData
): number {
  if (!formData.enableEntryFees || !formData.entryFees?.value) {
    return 0;
  }

  const creatorFee = formData.entryFees.creatorFeePercentage || 0;
  const gameFee = formData.entryFees.gameFeePercentage || 0;
  const refundShare = formData.entryFees.refundSharePercentage || 0;

  // Calculate prize pool percentage (100% - fees - refund)
  const prizePoolPercentage = Math.max(0, 100 - creatorFee - gameFee - refundShare);

  // Return prize pool value per entry (will be multiplied by # of entries)
  // For validation purposes, we use a conservative estimate
  // Assuming at least 10 entries for a meaningful prize pool
  const estimatedEntries = 10;
  return (formData.entryFees.value * prizePoolPercentage * estimatedEntries) / 100;
}

/**
 * Format validation message for display
 */
export function formatValidationMessage(result: ValidationResult): string {
  if (result.isValid) return "";

  const parts: string[] = [];

  if (result.error) {
    parts.push(result.error);
  } else if (result.warning) {
    parts.push(result.warning);
  }

  if (result.suggestion) {
    parts.push(result.suggestion);
  }

  return parts.join(". ");
}

/**
 * Get recommended entry barriers based on prize value
 */
export function getRecommendedBarriers(prizeValueUSD: number): {
  minEntryFeeUSD?: number;
  suggestedGating?: string[];
} {
  if (prizeValueUSD < 50) {
    return {}; // No requirements
  }

  if (prizeValueUSD < 200) {
    return {
      minEntryFeeUSD: 1,
      suggestedGating: ["Token balance requirement", "Address whitelist"],
    };
  }

  if (prizeValueUSD < 1000) {
    return {
      minEntryFeeUSD: 5,
      suggestedGating: [
        "Token balance requirement",
        "Previous tournament requirement",
        "Address whitelist",
      ],
    };
  }

  return {
    minEntryFeeUSD: 10,
    suggestedGating: [
      "Token balance requirement",
      "Previous tournament requirement",
      "Address whitelist",
    ],
  };
}
