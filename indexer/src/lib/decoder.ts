/**
 * Budokan Event Decoder Utilities
 *
 * Provides helper functions for decoding Starknet event data from felt252 arrays.
 *
 * Cairo Serde layout for scalar types:
 * - felt252 / ContractAddress: 1 field element
 * - u128: 1 field element
 * - u64: 1 field element
 * - u32: 1 field element
 * - bool: 1 field element (0 or 1)
 * - u256: 2 field elements (low, high)
 * - Option<T>: 1 element (0=None, 1=Some) followed by T elements if Some
 * - Span<T>: 1 element (length) followed by N * T elements
 * - ByteArray: [data_len, ...data_chunks(bytes31), pending_word, pending_word_len]
 * - Enum: 1 element (variant index) followed by variant data
 *
 * Non-flat Event enum layout:
 * The Budokan contract's Event enum has non-flat variants for its 6 custom events.
 * For non-flat variants, keys[0] is sn_keccak(variant_name) which equals
 * hash.getSelectorFromName(event_name) since variant name == struct name.
 * The struct's own #[key] fields follow at keys[1+].
 *
 * Events indexed:
 * - TournamentCreated: keys=[selector, tournament_id, game_address], data=[created_at, created_by, creator_token_id, ...complex serde data]
 * - TournamentRegistration: keys=[selector, tournament_id, game_token_id], data=[game_address, player_address, entry_number, has_submitted, is_banned]
 * - LeaderboardUpdated: keys=[selector, tournament_id], data=[...serde(Span<u64>)]
 * - PrizeAdded: keys=[selector, tournament_id, prize_id], data=[payout_position, token_address, ...serde(TokenTypeData), sponsor_address]
 * - RewardClaimed: keys=[selector, tournament_id], data=[...serde(RewardType), claimed]
 * - QualificationEntriesUpdated: keys=[selector, tournament_id], data=[...serde(QualificationProof), entry_count]
 */

import { hash } from "starknet";

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export interface EventSelectors {
  TournamentCreated: `0x${string}`;
  TournamentRegistration: `0x${string}`;
  LeaderboardUpdated: `0x${string}`;
  PrizeAdded: `0x${string}`;
  RewardClaimed: `0x${string}`;
  QualificationEntriesUpdated: `0x${string}`;
}

/**
 * Returns Starknet event selector hashes for each Budokan event.
 *
 * For non-flat enum variants where the variant name matches the struct name,
 * sn_keccak(variant_name) == sn_keccak(struct_name) == getSelectorFromName(name).
 */
export function getEventSelectors(): EventSelectors {
  return {
    TournamentCreated: hash.getSelectorFromName(
      "TournamentCreated",
    ) as `0x${string}`,
    TournamentRegistration: hash.getSelectorFromName(
      "TournamentRegistration",
    ) as `0x${string}`,
    LeaderboardUpdated: hash.getSelectorFromName(
      "LeaderboardUpdated",
    ) as `0x${string}`,
    PrizeAdded: hash.getSelectorFromName("PrizeAdded") as `0x${string}`,
    RewardClaimed: hash.getSelectorFromName("RewardClaimed") as `0x${string}`,
    QualificationEntriesUpdated: hash.getSelectorFromName(
      "QualificationEntriesUpdated",
    ) as `0x${string}`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a hex string to bigint. Returns 0n for falsy inputs.
 */
export function hexToBigInt(hex: string | undefined | null): bigint {
  if (!hex) return 0n;
  return BigInt(hex);
}

/**
 * Normalize a felt252 to unpadded lowercase hex (e.g., "0x2e0a...").
 */
export function feltToHex(felt: string | undefined | null): string {
  if (!felt) return "0x0";
  return `0x${BigInt(felt).toString(16)}`;
}

/**
 * Decode bool from felt252 (0 = false, 1 = true).
 */
export function decodeBool(felt: string | undefined): boolean {
  return hexToBigInt(felt) === 1n;
}

/**
 * Decode a Cairo short string (felt252 -> utf-8).
 * Falls back to returning the raw hex if decoding fails.
 */
export function decodeShortString(felt: string): string {
  try {
    const hex = felt.replace(/^0x/, "");
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substring(i, i + 2), 16);
      if (byte !== 0) {
        bytes.push(byte);
      }
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return felt;
  }
}

/**
 * Decode ByteArray from felt252 array.
 *
 * Cairo ByteArray Serde format:
 *   [data_len, ...data_chunks(bytes31), pending_word, pending_word_len]
 *
 * Returns the decoded string and the number of felt252 elements consumed.
 */
export function decodeByteArray(
  data: readonly string[],
  startIndex: number,
): { value: string; consumed: number } {
  const dataLen = Number(hexToBigInt(data[startIndex]));
  let result = "";
  let idx = startIndex + 1;

  // Decode full 31-byte chunks
  for (let i = 0; i < dataLen; i++) {
    const chunk = hexToBigInt(data[idx]);
    // Each chunk is 31 bytes (248 bits), stored in felt252
    const hex = chunk.toString(16).padStart(62, "0"); // 31 bytes = 62 hex chars
    for (let j = 0; j < 62; j += 2) {
      const charCode = parseInt(hex.substr(j, 2), 16);
      if (charCode > 0) result += String.fromCharCode(charCode);
    }
    idx++;
  }

  // Decode pending word (remaining bytes)
  const pendingWord = hexToBigInt(data[idx]);
  const pendingWordLen = Number(hexToBigInt(data[idx + 1]));

  if (pendingWordLen > 0) {
    const hex = pendingWord.toString(16).padStart(pendingWordLen * 2, "0");
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.substr(i, 2), 16);
      if (charCode > 0) result += String.fromCharCode(charCode);
    }
  }

  return { value: result, consumed: 1 + dataLen + 2 };
}

/**
 * JSON stringify that handles BigInt values by converting to string.
 */
export function stringifyWithBigInt(obj: unknown): string {
  return JSON.stringify(obj, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

// ---------------------------------------------------------------------------
// Decoded types
// ---------------------------------------------------------------------------

export interface DecodedTournamentCreated {
  tournamentId: bigint;
  gameAddress: string;
  createdAt: bigint;
  createdBy: string;
  creatorTokenId: bigint;
  /** Decoded tournament name (felt252 short string) */
  name: string;
  /** Decoded tournament description (ByteArray) */
  description: string;
  /** Raw data elements for schedule (complex Serde) */
  schedule: Record<string, unknown>;
  /** Raw data elements for game config (complex Serde) */
  gameConfig: Record<string, unknown>;
  /** Raw data elements for entry fee (complex Serde, Option) */
  entryFee: Record<string, unknown> | null;
  /** Raw data elements for entry requirement (complex Serde, Option) */
  entryRequirement: Record<string, unknown> | null;
}

export interface DecodedTournamentRegistration {
  tournamentId: bigint;
  gameTokenId: bigint;
  gameAddress: string;
  playerAddress: string;
  entryNumber: number;
  hasSubmitted: boolean;
  isBanned: boolean;
}

export interface DecodedLeaderboardUpdated {
  tournamentId: bigint;
  tokenIds: bigint[];
}

export interface DecodedPrizeAdded {
  tournamentId: bigint;
  prizeId: bigint;
  payoutPosition: number;
  tokenAddress: string;
  tokenType: Record<string, unknown>;
  sponsorAddress: string;
}

export interface DecodedRewardClaimed {
  tournamentId: bigint;
  rewardType: Record<string, unknown>;
  claimed: boolean;
}

export interface DecodedQualificationEntriesUpdated {
  tournamentId: bigint;
  qualificationProof: Record<string, unknown>;
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Schedule / Period decoder helpers
// ---------------------------------------------------------------------------

/**
 * Decode an Option<Period> from data starting at idx.
 * Cairo Serde for Option: variant_index (0=None, 1=Some), then T if Some.
 * Period = { start: u64, end: u64 }
 *
 * Returns the decoded value and how many felt252 elements were consumed.
 */
function decodeOptionPeriod(
  data: readonly string[],
  idx: number,
): { value: { start: string; end: string } | null; consumed: number } {
  const variant = Number(hexToBigInt(data[idx]));
  if (variant === 0) {
    return { value: null, consumed: 1 };
  }
  // variant === 1 (Some)
  const start = hexToBigInt(data[idx + 1]).toString();
  const end = hexToBigInt(data[idx + 2]).toString();
  return { value: { start, end }, consumed: 3 };
}

/**
 * Decode Schedule from data starting at idx.
 * Schedule = { registration: Option<Period>, game: Period, submission_duration: u64 }
 */
function decodeSchedule(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown>; consumed: number } {
  let consumed = 0;

  // registration: Option<Period>
  const registration = decodeOptionPeriod(data, idx + consumed);
  consumed += registration.consumed;

  // game: Period { start: u64, end: u64 }
  const gameStart = hexToBigInt(data[idx + consumed]).toString();
  consumed++;
  const gameEnd = hexToBigInt(data[idx + consumed]).toString();
  consumed++;

  // submission_duration: u64
  const submissionDuration = hexToBigInt(data[idx + consumed]).toString();
  consumed++;

  return {
    value: {
      registration: registration.value,
      game: { start: gameStart, end: gameEnd },
      submission_duration: submissionDuration,
    },
    consumed,
  };
}

/**
 * Decode GameConfig from data starting at idx.
 * GameConfig = { address: ContractAddress, settings_id: u32, soulbound: bool, play_url: ByteArray }
 */
function decodeGameConfig(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown>; consumed: number } {
  let consumed = 0;

  // address: ContractAddress
  const address = feltToHex(data[idx + consumed]);
  consumed++;

  // settings_id: u32
  const settingsId = Number(hexToBigInt(data[idx + consumed]));
  consumed++;

  // soulbound: bool
  const soulbound = decodeBool(data[idx + consumed]);
  consumed++;

  // play_url: ByteArray
  const playUrl = decodeByteArray(data, idx + consumed);
  consumed += playUrl.consumed;

  return {
    value: {
      address,
      settings_id: settingsId,
      soulbound,
      play_url: playUrl.value,
    },
    consumed,
  };
}

/**
 * Decode Distribution enum from data starting at idx.
 * Distribution = Linear(u16) | Exponential(u16) | Uniform | Custom(Span<u16>)
 */
function decodeDistribution(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown>; consumed: number } {
  const variant = Number(hexToBigInt(data[idx]));

  switch (variant) {
    case 0: {
      // Linear(u16)
      const weight = Number(hexToBigInt(data[idx + 1]));
      return { value: { type: "Linear", weight }, consumed: 2 };
    }
    case 1: {
      // Exponential(u16)
      const weight = Number(hexToBigInt(data[idx + 1]));
      return { value: { type: "Exponential", weight }, consumed: 2 };
    }
    case 2: {
      // Uniform
      return { value: { type: "Uniform" }, consumed: 1 };
    }
    case 3: {
      // Custom(Span<u16>)
      const spanLen = Number(hexToBigInt(data[idx + 1]));
      const shares: number[] = [];
      for (let i = 0; i < spanLen; i++) {
        shares.push(Number(hexToBigInt(data[idx + 2 + i])));
      }
      return { value: { type: "Custom", shares }, consumed: 2 + spanLen };
    }
    default:
      return { value: { type: "Unknown", variant }, consumed: 1 };
  }
}

/**
 * Decode Option<EntryFee> from data starting at idx.
 *
 * EntryFee = {
 *   token_address: ContractAddress,
 *   amount: u128,
 *   distribution: Distribution,
 *   tournament_creator_share: Option<u16>,
 *   game_creator_share: Option<u16>,
 *   refund_share: Option<u16>,
 *   distribution_positions: Option<u32>,
 * }
 */
function decodeOptionEntryFee(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown> | null; consumed: number } {
  const variant = Number(hexToBigInt(data[idx]));
  if (variant === 0) {
    return { value: null, consumed: 1 };
  }

  let consumed = 1; // skip Option variant

  // token_address: ContractAddress
  const tokenAddress = feltToHex(data[idx + consumed]);
  consumed++;

  // amount: u128
  const amount = hexToBigInt(data[idx + consumed]).toString();
  consumed++;

  // distribution: Distribution (enum)
  const distribution = decodeDistribution(data, idx + consumed);
  consumed += distribution.consumed;

  // tournament_creator_share: Option<u16>
  const tcsVariant = Number(hexToBigInt(data[idx + consumed]));
  consumed++;
  let tournamentCreatorShare: number | null = null;
  if (tcsVariant === 1) {
    tournamentCreatorShare = Number(hexToBigInt(data[idx + consumed]));
    consumed++;
  }

  // game_creator_share: Option<u16>
  const gcsVariant = Number(hexToBigInt(data[idx + consumed]));
  consumed++;
  let gameCreatorShare: number | null = null;
  if (gcsVariant === 1) {
    gameCreatorShare = Number(hexToBigInt(data[idx + consumed]));
    consumed++;
  }

  // refund_share: Option<u16>
  const rsVariant = Number(hexToBigInt(data[idx + consumed]));
  consumed++;
  let refundShare: number | null = null;
  if (rsVariant === 1) {
    refundShare = Number(hexToBigInt(data[idx + consumed]));
    consumed++;
  }

  // distribution_positions: Option<u32>
  const dpVariant = Number(hexToBigInt(data[idx + consumed]));
  consumed++;
  let distributionPositions: number | null = null;
  if (dpVariant === 1) {
    distributionPositions = Number(hexToBigInt(data[idx + consumed]));
    consumed++;
  }

  return {
    value: {
      token_address: tokenAddress,
      amount,
      distribution: distribution.value,
      tournament_creator_share: tournamentCreatorShare,
      game_creator_share: gameCreatorShare,
      refund_share: refundShare,
      distribution_positions: distributionPositions,
    },
    consumed,
  };
}

/**
 * Decode Option<EntryRequirement> from data starting at idx.
 *
 * EntryRequirement = { entry_limit: u32, entry_requirement_type: EntryRequirementType }
 * EntryRequirementType =
 *   token(ContractAddress) |
 *   allowlist(Span<ContractAddress>) |
 *   extension(ExtensionConfig { address: ContractAddress, config: Span<felt252> })
 */
function decodeOptionEntryRequirement(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown> | null; consumed: number } {
  const variant = Number(hexToBigInt(data[idx]));
  if (variant === 0) {
    return { value: null, consumed: 1 };
  }

  let consumed = 1; // skip Option variant

  // entry_limit: u32
  const entryLimit = Number(hexToBigInt(data[idx + consumed]));
  consumed++;

  // entry_requirement_type: EntryRequirementType (enum)
  const typeVariant = Number(hexToBigInt(data[idx + consumed]));
  consumed++;

  let entryRequirementType: Record<string, unknown>;

  switch (typeVariant) {
    case 0: {
      // token(ContractAddress)
      const tokenAddress = feltToHex(data[idx + consumed]);
      consumed++;
      entryRequirementType = { type: "token", token_address: tokenAddress };
      break;
    }
    case 1: {
      // allowlist(Span<ContractAddress>)
      const spanLen = Number(hexToBigInt(data[idx + consumed]));
      consumed++;
      const addresses: string[] = [];
      for (let i = 0; i < spanLen; i++) {
        addresses.push(feltToHex(data[idx + consumed]));
        consumed++;
      }
      entryRequirementType = { type: "allowlist", addresses };
      break;
    }
    case 2: {
      // extension(ExtensionConfig { address, config: Span<felt252> })
      const extensionAddress = feltToHex(data[idx + consumed]);
      consumed++;
      const configLen = Number(hexToBigInt(data[idx + consumed]));
      consumed++;
      const config: string[] = [];
      for (let i = 0; i < configLen; i++) {
        config.push(feltToHex(data[idx + consumed]));
        consumed++;
      }
      entryRequirementType = {
        type: "extension",
        address: extensionAddress,
        config,
      };
      break;
    }
    default:
      entryRequirementType = { type: "unknown", variant: typeVariant };
  }

  return {
    value: {
      entry_limit: entryLimit,
      entry_requirement_type: entryRequirementType,
    },
    consumed,
  };
}

/**
 * Decode TokenTypeData enum from data starting at idx.
 *
 * TokenTypeData =
 *   erc20(ERC20Data { amount: u128, distribution: Option<Distribution>, distribution_count: Option<u32> }) |
 *   erc721(ERC721Data { id: u128 })
 */
function decodeTokenTypeData(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown>; consumed: number } {
  const variant = Number(hexToBigInt(data[idx]));
  let consumed = 1;

  if (variant === 0) {
    // erc20(ERC20Data)
    // amount: u128
    const amount = hexToBigInt(data[idx + consumed]).toString();
    consumed++;

    // distribution: Option<Distribution>
    const distVariant = Number(hexToBigInt(data[idx + consumed]));
    consumed++;
    let distribution: Record<string, unknown> | null = null;
    if (distVariant === 1) {
      const dist = decodeDistribution(data, idx + consumed);
      distribution = dist.value;
      consumed += dist.consumed;
    }

    // distribution_count: Option<u32>
    const dcVariant = Number(hexToBigInt(data[idx + consumed]));
    consumed++;
    let distributionCount: number | null = null;
    if (dcVariant === 1) {
      distributionCount = Number(hexToBigInt(data[idx + consumed]));
      consumed++;
    }

    return {
      value: {
        type: "erc20",
        amount,
        distribution,
        distribution_count: distributionCount,
      },
      consumed,
    };
  } else {
    // erc721(ERC721Data { id: u128 })
    const id = hexToBigInt(data[idx + consumed]).toString();
    consumed++;
    return { value: { type: "erc721", id }, consumed };
  }
}

/**
 * Decode RewardType enum from data starting at idx.
 *
 * RewardType =
 *   Prize(PrizeType) |
 *   EntryFee(EntryFeeRewardType)
 *
 * PrizeType =
 *   Single(u64) |
 *   Distributed((u64, u32))
 *
 * EntryFeeRewardType =
 *   Position(u32) |
 *   TournamentCreator |
 *   GameCreator |
 *   Refund(u64)
 */
function decodeRewardType(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown>; consumed: number } {
  const variant = Number(hexToBigInt(data[idx]));
  let consumed = 1;

  if (variant === 0) {
    // Prize(PrizeType)
    const prizeTypeVariant = Number(hexToBigInt(data[idx + consumed]));
    consumed++;

    if (prizeTypeVariant === 0) {
      // Single(u64)
      const prizeId = hexToBigInt(data[idx + consumed]).toString();
      consumed++;
      return {
        value: {
          type: "Prize",
          prize_type: { type: "Single", prize_id: prizeId },
        },
        consumed,
      };
    } else {
      // Distributed((u64, u32))
      const prizeId = hexToBigInt(data[idx + consumed]).toString();
      consumed++;
      const payoutIndex = Number(hexToBigInt(data[idx + consumed]));
      consumed++;
      return {
        value: {
          type: "Prize",
          prize_type: {
            type: "Distributed",
            prize_id: prizeId,
            payout_index: payoutIndex,
          },
        },
        consumed,
      };
    }
  } else {
    // EntryFee(EntryFeeRewardType)
    const entryFeeVariant = Number(hexToBigInt(data[idx + consumed]));
    consumed++;

    switch (entryFeeVariant) {
      case 0: {
        // Position(u32)
        const position = Number(hexToBigInt(data[idx + consumed]));
        consumed++;
        return {
          value: {
            type: "EntryFee",
            entry_fee_type: { type: "Position", position },
          },
          consumed,
        };
      }
      case 1: {
        // TournamentCreator
        return {
          value: {
            type: "EntryFee",
            entry_fee_type: { type: "TournamentCreator" },
          },
          consumed,
        };
      }
      case 2: {
        // GameCreator
        return {
          value: {
            type: "EntryFee",
            entry_fee_type: { type: "GameCreator" },
          },
          consumed,
        };
      }
      case 3: {
        // Refund(u64)
        const tokenId = hexToBigInt(data[idx + consumed]).toString();
        consumed++;
        return {
          value: {
            type: "EntryFee",
            entry_fee_type: { type: "Refund", token_id: tokenId },
          },
          consumed,
        };
      }
      default:
        return {
          value: {
            type: "EntryFee",
            entry_fee_type: { type: "Unknown", variant: entryFeeVariant },
          },
          consumed,
        };
    }
  }
}

/**
 * Decode QualificationProof enum from data starting at idx.
 *
 * QualificationProof =
 *   NFT(NFTQualification { token_id: u256 }) |
 *   Address(ContractAddress) |
 *   Extension(Span<felt252>)
 */
function decodeQualificationProof(
  data: readonly string[],
  idx: number,
): { value: Record<string, unknown>; consumed: number } {
  const variant = Number(hexToBigInt(data[idx]));
  let consumed = 1;

  switch (variant) {
    case 0: {
      // NFT(NFTQualification { token_id: u256 })
      const low = hexToBigInt(data[idx + consumed]);
      consumed++;
      const high = hexToBigInt(data[idx + consumed]);
      consumed++;
      const tokenId = ((high << 128n) + low).toString();
      return { value: { type: "NFT", token_id: tokenId }, consumed };
    }
    case 1: {
      // Address(ContractAddress)
      const address = feltToHex(data[idx + consumed]);
      consumed++;
      return { value: { type: "Address", address }, consumed };
    }
    case 2: {
      // Extension(Span<felt252>)
      const spanLen = Number(hexToBigInt(data[idx + consumed]));
      consumed++;
      const proofData: string[] = [];
      for (let i = 0; i < spanLen; i++) {
        proofData.push(feltToHex(data[idx + consumed]));
        consumed++;
      }
      return { value: { type: "Extension", data: proofData }, consumed };
    }
    default:
      return { value: { type: "Unknown", variant }, consumed };
  }
}

// ---------------------------------------------------------------------------
// Event Decoders
// ---------------------------------------------------------------------------

/**
 * Decode a TournamentCreated event.
 *
 * Layout:
 *   keys:  [selector, tournament_id, game_address]
 *   data:  [created_at, created_by, creator_token_id,
 *           ...serde(Metadata { name: felt252, description: ByteArray }),
 *           ...serde(Schedule),
 *           ...serde(GameConfig),
 *           ...serde(Option<EntryFee>),
 *           ...serde(Option<EntryRequirement>)]
 */
export function decodeTournamentCreated(
  keys: readonly string[],
  data: readonly string[],
): DecodedTournamentCreated {
  const tournamentId = BigInt(keys[1]);
  const gameAddress = feltToHex(keys[2]);

  let idx = 0;

  // created_at: u64
  const createdAt = hexToBigInt(data[idx]);
  idx++;

  // created_by: ContractAddress
  const createdBy = feltToHex(data[idx]);
  idx++;

  // creator_token_id: u64
  const creatorTokenId = hexToBigInt(data[idx]);
  idx++;

  // Metadata { name: felt252, description: ByteArray }
  const name = decodeShortString(data[idx]);
  idx++;
  const description = decodeByteArray(data, idx);
  idx += description.consumed;

  // Schedule
  const schedule = decodeSchedule(data, idx);
  idx += schedule.consumed;

  // GameConfig
  const gameConfig = decodeGameConfig(data, idx);
  idx += gameConfig.consumed;

  // Option<EntryFee>
  const entryFee = decodeOptionEntryFee(data, idx);
  idx += entryFee.consumed;

  // Option<EntryRequirement>
  const entryRequirement = decodeOptionEntryRequirement(data, idx);

  return {
    tournamentId,
    gameAddress,
    createdAt,
    createdBy,
    creatorTokenId,
    name,
    description: description.value,
    schedule: schedule.value,
    gameConfig: gameConfig.value,
    entryFee: entryFee.value,
    entryRequirement: entryRequirement.value,
  };
}

/**
 * Decode a TournamentRegistration event.
 *
 * Layout:
 *   keys:  [selector, tournament_id, game_token_id]
 *   data:  [game_address, player_address, entry_number, has_submitted, is_banned]
 */
export function decodeTournamentRegistration(
  keys: readonly string[],
  data: readonly string[],
): DecodedTournamentRegistration {
  return {
    tournamentId: BigInt(keys[1]),
    gameTokenId: BigInt(keys[2]),
    gameAddress: feltToHex(data[0]),
    playerAddress: feltToHex(data[1]),
    entryNumber: Number(BigInt(data[2])),
    hasSubmitted: decodeBool(data[3]),
    isBanned: decodeBool(data[4]),
  };
}

/**
 * Decode a LeaderboardUpdated event.
 *
 * Layout:
 *   keys:  [selector, tournament_id]
 *   data:  [span_length, ...token_ids(u64)]
 *
 * Span<u64> is serialized as [length, ...elements].
 */
export function decodeLeaderboardUpdated(
  keys: readonly string[],
  data: readonly string[],
): DecodedLeaderboardUpdated {
  const tournamentId = BigInt(keys[1]);
  const spanLength = Number(BigInt(data[0]));
  const tokenIds: bigint[] = [];

  for (let i = 0; i < spanLength; i++) {
    tokenIds.push(BigInt(data[1 + i]));
  }

  return { tournamentId, tokenIds };
}

/**
 * Decode a PrizeAdded event.
 *
 * Layout:
 *   keys:  [selector, tournament_id, prize_id]
 *   data:  [payout_position, token_address, ...serde(TokenTypeData), sponsor_address]
 */
export function decodePrizeAdded(
  keys: readonly string[],
  data: readonly string[],
): DecodedPrizeAdded {
  const tournamentId = BigInt(keys[1]);
  const prizeId = BigInt(keys[2]);

  let idx = 0;

  // payout_position: u32
  const payoutPosition = Number(BigInt(data[idx]));
  idx++;

  // token_address: ContractAddress
  const tokenAddress = feltToHex(data[idx]);
  idx++;

  // TokenTypeData (enum)
  const tokenType = decodeTokenTypeData(data, idx);
  idx += tokenType.consumed;

  // sponsor_address: ContractAddress
  const sponsorAddress = feltToHex(data[idx]);

  return {
    tournamentId,
    prizeId,
    payoutPosition,
    tokenAddress,
    tokenType: tokenType.value,
    sponsorAddress,
  };
}

/**
 * Decode a RewardClaimed event.
 *
 * Layout:
 *   keys:  [selector, tournament_id]
 *   data:  [...serde(RewardType), claimed(bool)]
 */
export function decodeRewardClaimed(
  keys: readonly string[],
  data: readonly string[],
): DecodedRewardClaimed {
  const tournamentId = BigInt(keys[1]);

  let idx = 0;

  // RewardType (enum)
  const rewardType = decodeRewardType(data, idx);
  idx += rewardType.consumed;

  // claimed: bool
  const claimed = decodeBool(data[idx]);

  return {
    tournamentId,
    rewardType: rewardType.value,
    claimed,
  };
}

/**
 * Decode a QualificationEntriesUpdated event.
 *
 * Layout:
 *   keys:  [selector, tournament_id]
 *   data:  [...serde(QualificationProof), entry_count(u32)]
 */
export function decodeQualificationEntriesUpdated(
  keys: readonly string[],
  data: readonly string[],
): DecodedQualificationEntriesUpdated {
  const tournamentId = BigInt(keys[1]);

  let idx = 0;

  // QualificationProof (enum)
  const qualificationProof = decodeQualificationProof(data, idx);
  idx += qualificationProof.consumed;

  // entry_count: u32
  const entryCount = Number(BigInt(data[idx]));

  return {
    tournamentId,
    qualificationProof: qualificationProof.value,
    entryCount,
  };
}
