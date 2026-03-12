/**
 * Mapper utilities for converting API/SDK response shapes (camelCase JSON)
 * to the existing client TypeScript interfaces (BigNumberish, CairoOption wrappers).
 *
 * These mappers allow consuming components to remain unchanged during the
 * Dojo → SDK migration.
 */
import {
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
} from "starknet";
import type {
  Tournament as ApiTournament,
  Registration as ApiRegistration,
  LeaderboardEntry as ApiLeaderboardEntry,
  Prize as ApiPrize,
  PlatformStats as ApiPlatformStats,
} from "@provable-games/budokan-sdk";
import type {
  Tournament,
  Registration,
  Leaderboard,
  Prize,
  EntryFee,
  GameConfig,
  Schedule,
  LeaderboardConfig,
  Metadata,
  PlatformMetrics,
  EntryRequirement,
} from "@/generated/models.gen";

/**
 * Build a CairoOption from an API value.
 * Returns Some(value) if value is not null/undefined, otherwise None.
 */
function toCairoOption<T>(value: T | null | undefined): CairoOption<T> {
  if (value === null || value === undefined) {
    return new CairoOption(CairoOptionVariant.None);
  }
  return new CairoOption(CairoOptionVariant.Some, value);
}

/**
 * Convert API tournament to Dojo-compatible Tournament model shape.
 * This preserves the snake_case field names and CairoOption wrappers
 * that existing components expect.
 */
export function mapApiTournamentToModel(t: ApiTournament): Tournament & {
  entry_count: number;
  prize_count: number;
  submission_count: number;
} {
  const schedule: Schedule = {
    registration_start_delay: t.schedule?.registrationStartDelay ?? 0,
    registration_end_delay: t.schedule?.registrationEndDelay ?? 0,
    game_start_delay: t.schedule?.gameStartDelay ?? 0,
    game_end_delay: t.schedule?.gameEndDelay ?? 0,
    submission_duration: t.schedule?.submissionDuration ?? 0,
  };

  const gameConfig: GameConfig = {
    game_address: t.gameConfig?.gameAddress ?? t.gameAddress ?? "",
    settings_id: t.gameConfig?.settingsId ?? t.settingsId ?? 0,
    soulbound: t.gameConfig?.soulbound ?? t.soulbound ?? false,
    paymaster: t.gameConfig?.paymaster ?? t.paymaster ?? false,
    client_url: toCairoOption(t.gameConfig?.clientUrl ?? t.clientUrl ?? null),
    renderer: toCairoOption(t.gameConfig?.renderer ?? t.renderer ?? null),
  };

  const metadata: Metadata = {
    name: t.name ?? 0,
    description: t.description ?? "",
  };

  const leaderboardConfig: LeaderboardConfig = {
    ascending: t.leaderboardConfig?.ascending ?? t.leaderboardAscending ?? false,
    game_must_be_over: t.leaderboardConfig?.gameMustBeOver ?? t.leaderboardGameMustBeOver ?? false,
  };

  // Map entry fee
  let entryFee: CairoOption<EntryFee>;
  if (t.entryFee && t.entryFee.tokenAddress && t.entryFee.tokenAddress !== "0x0") {
    entryFee = new CairoOption(CairoOptionVariant.Some, {
      token_address: t.entryFee.tokenAddress,
      amount: t.entryFee.amount ?? "0",
      tournament_creator_share: t.entryFee.tournamentCreatorShare ?? 0,
      game_creator_share: t.entryFee.gameCreatorShare ?? 0,
      refund_share: t.entryFee.refundShare ?? 0,
      distribution: new CairoCustomEnum({
        Linear: undefined,
        Exponential: undefined,
        Uniform: undefined,
        Custom: undefined,
      }),
      distribution_count: t.entryFee.distributionCount ?? 0,
    } as EntryFee);
  } else {
    entryFee = new CairoOption(CairoOptionVariant.None);
  }

  // Map entry requirement from JSONB
  let entryRequirement: CairoOption<EntryRequirement>;
  if (t.entryRequirement && typeof t.entryRequirement === "object") {
    entryRequirement = new CairoOption(
      CairoOptionVariant.Some,
      t.entryRequirement as unknown as EntryRequirement,
    );
  } else {
    entryRequirement = new CairoOption(CairoOptionVariant.None);
  }

  return {
    id: BigInt(t.tournamentId),
    created_at: BigInt(t.createdAt ?? "0"),
    created_by: t.createdBy ?? "",
    creator_token_id: BigInt(t.creatorTokenId ?? "0"),
    metadata,
    schedule,
    game_config: gameConfig,
    entry_fee: entryFee,
    entry_requirement: entryRequirement,
    leaderboard_config: leaderboardConfig,
    entry_count: t.entryCount ?? 0,
    prize_count: t.prizeCount ?? 0,
    submission_count: t.submissionCount ?? 0,
  };
}

/**
 * Convert API registration to Dojo-compatible Registration model shape.
 */
export function mapApiRegistrationToModel(r: ApiRegistration): Registration {
  return {
    tournament_id: BigInt(r.tournamentId),
    game_token_id: BigInt(r.gameTokenId),
    entry_number: r.entryNumber,
    has_submitted: r.hasSubmitted,
    is_banned: r.isBanned,
  };
}

/**
 * Convert API leaderboard entries to Dojo-compatible Leaderboard model.
 * The Dojo model has token_ids as an array; API returns individual entries.
 */
export function mapApiLeaderboardToModel(
  tournamentId: string,
  entries: ApiLeaderboardEntry[],
): Leaderboard {
  return {
    tournament_id: BigInt(tournamentId),
    token_ids: entries.map((e) => BigInt(e.tokenId)),
  };
}

/**
 * Convert API prize to Dojo-compatible Prize model shape.
 */
export function mapApiPrizeToModel(p: ApiPrize): Prize {
  // Build token_type as CairoCustomEnum
  const tokenType = p.tokenType as Record<string, unknown> | null;
  let tokenTypeEnum: CairoCustomEnum;

  if (tokenType && "erc20" in tokenType) {
    tokenTypeEnum = new CairoCustomEnum({
      erc20: tokenType.erc20,
      erc721: undefined,
    });
  } else if (tokenType && "erc721" in tokenType) {
    tokenTypeEnum = new CairoCustomEnum({
      erc20: undefined,
      erc721: tokenType.erc721,
    });
  } else {
    tokenTypeEnum = new CairoCustomEnum({
      erc20: undefined,
      erc721: undefined,
    });
  }

  return {
    id: BigInt(p.prizeId),
    context_id: BigInt(p.tournamentId),
    token_address: p.tokenAddress ?? "",
    token_type: tokenTypeEnum,
    sponsor_address: p.sponsorAddress ?? "",
  };
}

/**
 * Convert API platform stats to Dojo-compatible PlatformMetrics model.
 */
export function mapApiPlatformStatsToModel(stats: ApiPlatformStats): PlatformMetrics {
  return {
    key: 0,
    total_tournaments: stats.totalTournaments ?? 0,
  };
}
