import { indexAddress } from "@/lib/utils";
import { ChainId } from "@/dojo/setup/networks";

/**
 * Extension Configuration
 *
 * Maps extension contract addresses to their proof requirements.
 * Each extension can specify what data should be passed as qualification proof.
 */

export type ExtensionProofType =
  | "address"
  | "custom"
  | "snapshot"
  | "tournament"
  | "erc20_balance";

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
  // For ERC20 balance validators, indicates this validates ERC20 token balance
  isERC20BalanceValidator?: boolean;
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
  erc20_balance: {
    name: "ERC20 Balance",
    description: "Validates entry based on ERC20 token balance thresholds",
    proofType: "erc20_balance",
    extractProof: () => [], // No proof required for balance check
    isPreset: true,
    isERC20BalanceValidator: true,
  },
  opus_troves: {
    name: "Opus Troves",
    description: "Validates entry based on Opus Trove collateral",
    proofType: "custom",
    extractProof: () => [], // No proof required
    isPreset: true,
  },
};

/**
 * Extension Addresses by Chain
 *
 * Stores the deployed extension contract addresses for each chain.
 * Add new extension addresses here when they are deployed.
 */
export const EXTENSION_ADDRESSES: Record<
  string,
  {
    tournamentValidator?: string;
    erc20BalanceValidator?: string;
    opusTrovesValidator?: string;
    snapshotValidator?: string;
  }
> = {
  [ChainId.SN_SEPOLIA]: {
    tournamentValidator:
      "0x04beaeea6de96394bd7256040e1396b387a7652a6d3287fc9a48ff068edee843",
    erc20BalanceValidator:
      "0x028112199f873e919963277b41ef1231365986e2fd7722501cd7d293de60b64e",
    opusTrovesValidator: "", // TODO: Add Opus Troves validator address for Sepolia
  },
  [ChainId.SN_MAIN]: {
    tournamentValidator:
      "0x04afc81a9392abfee4e70b6238a6ceaa30322010aaf09cb55894164935abb555",
    erc20BalanceValidator:
      "0x051fc2681f65ee18e99dab3cc2ca2eca1b4532c735e752f575ace91ed30f17b7",
    opusTrovesValidator:
      "0x05c6d4a9cef65f7b96b790d8754d5c0b0793093db228f8652c15872da5563e41",
  },
};

/**
 * Supported Opus Trove Assets
 *
 * List of ERC20 tokens that Opus supports as collateral.
 * Only these assets can be selected when configuring Opus Troves extension.
 */
export const OPUS_SUPPORTED_ASSETS: Record<string, string[]> = {
  [ChainId.SN_SEPOLIA]: [
    // TODO: Add Sepolia Opus supported asset addresses
  ],
  [ChainId.SN_MAIN]: [
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
    "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49", // LORDS
    "0x075afe6402ad5a5c20dd25e10ec3b3986acaa647b77e4ae24b0cbc9a54a27a87", // EKUBO
    "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", // WBTC
  ],
};

/**
 * Get extension addresses for a specific chain
 */
export const getExtensionAddresses = (chainId: string) => {
  return EXTENSION_ADDRESSES[chainId] || {};
};

/**
 * Get supported Opus trove assets for a specific chain
 */
export const getOpusSupportedAssets = (chainId: string): string[] => {
  return OPUS_SUPPORTED_ASSETS[chainId] || [];
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
  registerExtensionConfig(
    tournamentValidatorAddress,
    PRESET_EXTENSIONS.tournament
  );
};

/**
 * Check if an extension is an ERC20 balance validator
 */
export const isERC20BalanceValidator = (extensionAddress: string): boolean => {
  const config = getExtensionConfig(extensionAddress);
  return config?.isERC20BalanceValidator === true;
};

/**
 * Register the ERC20 balance validator address for a chain
 * This should be called when the chain config is loaded
 */
export const registerERC20BalanceValidator = (
  erc20BalanceValidatorAddress: string
): void => {
  registerExtensionConfig(
    erc20BalanceValidatorAddress,
    PRESET_EXTENSIONS.erc20_balance
  );
};

export default extensionConfigs;
