/**
 * Extension UI presets — display metadata only.
 * All logic (addresses, parsing, identification) lives in @provable-games/metagame-sdk.
 */

export interface ExtensionPreset {
  name: string;
  description: string;
  isPreset: true;
  icon: string;
}

/** UI display presets for the extension selection dropdown in tournament creation */
export const PRESET_EXTENSIONS: Record<string, ExtensionPreset> = {
  snapshot: {
    name: "Allowlist",
    description: "Validates entry based on Snapshot voting participation",
    isPreset: true,
    icon: "list-checks",
  },
  erc20_balance: {
    name: "ERC20 Balance",
    description: "Validates entry based on ERC20 token balance thresholds",
    isPreset: true,
    icon: "coins",
  },
  opus_troves: {
    name: "Opus Troves",
    description: "Validates entry based on Opus Trove collateral",
    isPreset: true,
    icon: "vault",
  },
  merkle: {
    name: "Merkle Allowlist",
    description: "Validates entry against a merkle tree allowlist",
    isPreset: true,
    icon: "git-branch",
  },
};
