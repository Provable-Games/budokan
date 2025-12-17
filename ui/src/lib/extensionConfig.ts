import { indexAddress } from "@/lib/utils";

/**
 * Extension Configuration
 *
 * Maps extension contract addresses to their proof requirements.
 * Each extension can specify what data should be passed as qualification proof.
 */

export type ExtensionProofType = "address" | "custom" | "snapshot" | "tournament";

export interface ExtensionConfig {
  name: string;
  description: string;
  proofType: ExtensionProofType;
  // Function to extract proof data - receives address and any additional context
  extractProof: (address: string, context?: any) => string[];
  // For preset extensions, indicates if this is a preset configuration
  isPreset?: boolean;
  // For snapshot extensions, indicates if snapshot ID is required in config
  requiresSnapshotId?: boolean;
  // For tournament validators, indicates this validates tournament participation
  isTournamentValidator?: boolean;
}

// Preset extension configurations
export const PRESET_EXTENSIONS: Record<string, ExtensionConfig> = {
  snapshot: {
    name: "Snapshot Voting",
    description: "Validates entry based on Snapshot voting participation",
    proofType: "snapshot",
    extractProof: () => [], // No proof required for snapshot extension
    isPreset: true,
    requiresSnapshotId: true,
  },
  tournament: {
    name: "Tournament Qualification",
    description: "Validates entry based on previous tournament participation or wins",
    proofType: "tournament",
    extractProof: () => [], // Proof will be tournament token ID
    isPreset: true,
    isTournamentValidator: true,
  },
};

// Extension configurations by contract address
const extensionConfigs: Record<string, ExtensionConfig> = {
  // Dynamically registered extensions will be stored here
  // Add more extension configs here as needed
  // Each extension address should map to its specific configuration
};

/**
 * Get extension configuration by contract address
 */
export const getExtensionConfig = (
  extensionAddress: string
): ExtensionConfig | null => {
  const normalizedAddress = indexAddress(extensionAddress);
  return extensionConfigs[normalizedAddress] || null;
};

/**
 * Get proof data for an extension
 * Falls back to default (address only) if no specific config exists
 */
export const getExtensionProof = (
  extensionAddress: string,
  playerAddress: string,
  context?: any
): string[] => {
  const config = getExtensionConfig(extensionAddress);

  if (config) {
    return config.extractProof(playerAddress, context);
  }

  // Default: just pass empty array
  return [];
};

/**
 * Register a new extension configuration
 * Useful for dynamically adding extension configs at runtime
 */
export const registerExtensionConfig = (
  extensionAddress: string,
  config: ExtensionConfig
): void => {
  const normalizedAddress = indexAddress(extensionAddress);
  extensionConfigs[normalizedAddress] = config;
};

/**
 * Check if an extension has a registered configuration
 */
export const hasExtensionConfig = (extensionAddress: string): boolean => {
  const normalizedAddress = indexAddress(extensionAddress);
  return normalizedAddress in extensionConfigs;
};

/**
 * Check if an extension is a tournament validator
 */
export const isTournamentValidator = (extensionAddress: string): boolean => {
  const config = getExtensionConfig(extensionAddress);
  return config?.isTournamentValidator === true;
};

/**
 * Register the tournament validator address for a chain
 * This should be called when the chain config is loaded
 */
export const registerTournamentValidator = (
  tournamentValidatorAddress: string
): void => {
  registerExtensionConfig(tournamentValidatorAddress, PRESET_EXTENSIONS.tournament);
};

export default extensionConfigs;
