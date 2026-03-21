/**
 * Extension UI presets — display metadata only.
 * All logic (addresses, parsing, identification) lives in @provable-games/metagame-sdk.
 */

export interface ExtensionPreset {
  name: string;
  description: string;
  isPreset: true;
  requiresSnapshotId?: boolean;
}

/** UI display presets for the extension selection dropdown in tournament creation */
export const PRESET_EXTENSIONS: Record<string, ExtensionPreset> = {
  snapshot: {
    name: "Snapshot Voting",
    description: "Validates entry based on Snapshot voting participation",
    isPreset: true,
    requiresSnapshotId: true,
  },
  erc20_balance: {
    name: "ERC20 Balance",
    description: "Validates entry based on ERC20 token balance thresholds",
    isPreset: true,
  },
  opus_troves: {
    name: "Opus Troves",
    description: "Validates entry based on Opus Trove collateral",
    isPreset: true,
  },
  zk_passport: {
    name: "ZK Passport",
    description: "Validates entry using zero-knowledge passport proofs",
    isPreset: true,
  },
  governance: {
    name: "Governance",
    description: "Validates entry based on governance participation or token balance",
    isPreset: true,
  },
};
