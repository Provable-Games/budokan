/**
 * Budokan Indexer Database Schema
 *
 * Tables optimized for:
 * - Efficient indexer writes (batch inserts per block)
 * - Fast client queries (indexed for common access patterns)
 * - Real-time updates via PostgreSQL NOTIFY triggers
 *
 * Design notes:
 * - Composite PKs enforce domain uniqueness (e.g., one registration per token per tournament)
 * - Auto-increment `id` columns on composite-PK tables serve as the Apibara drizzle storage
 *   plugin's idColumn for cursor-based invalidation during chain reorgs. Without a unique
 *   per-row identifier, the plugin cannot target individual rows for deletion.
 *
 * Tables:
 * 1. tournaments - Tournament definitions from TournamentCreated events
 * 2. registrations - Player registrations from TournamentRegistration events
 * 3. prizes - Sponsored prizes from PrizeAdded events
 * 4. reward_claims - Reward claim records from RewardClaimed events
 * 5. qualification_entries - Entry requirement tracking from QualificationEntriesUpdated events
 * 6. platform_stats - Aggregated platform-wide statistics
 * 7. tournament_events - Raw event audit log for replay/debugging
 *
 * Live leaderboard data is sourced from the denshokan SDK
 * (`useLiveLeaderboard`) — there is no leaderboard table here.
 */

import {
  pgTable,
  serial,
  bigint,
  integer,
  text,
  boolean,
  jsonb,
  index,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// tournaments
// ---------------------------------------------------------------------------
export const tournaments = pgTable(
  "tournaments",
  {
    tournamentId: bigint("tournament_id", { mode: "bigint" }).primaryKey(),
    gameAddress: text("game_address").notNull(),
    createdAt: bigint("created_at", { mode: "bigint" }),
    createdBy: text("created_by"),
    creatorTokenId: text("creator_token_id"),
    name: text("name"),
    description: text("description"),

    // Flattened from Cairo `Schedule` — all u32 delays in seconds.
    scheduleRegStartDelay: integer("schedule_registration_start_delay")
      .notNull()
      .default(0),
    scheduleRegEndDelay: integer("schedule_registration_end_delay")
      .notNull()
      .default(0),
    scheduleGameStartDelay: integer("schedule_game_start_delay")
      .notNull()
      .default(0),
    scheduleGameEndDelay: integer("schedule_game_end_delay")
      .notNull()
      .default(0),
    scheduleSubmissionDuration: integer("schedule_submission_duration")
      .notNull()
      .default(0),

    // Flattened from Cairo `GameConfig`. The game address field from the Cairo
    // struct is redundant with `tournaments.game_address` above and intentionally
    // not duplicated.
    gameConfigSettingsId: integer("game_config_settings_id").notNull().default(0),
    gameConfigSoulbound: boolean("game_config_soulbound")
      .notNull()
      .default(false),
    gameConfigPaymaster: boolean("game_config_paymaster")
      .notNull()
      .default(false),
    gameConfigClientUrl: text("game_config_client_url"),
    gameConfigRenderer: text("game_config_renderer"),

    // Flattened from Cairo `Option<EntryFee>` — all null when entry fee absent.
    entryFeeTokenAddress: text("entry_fee_token_address"),
    entryFeeAmount: text("entry_fee_amount"),
    entryFeeTournamentCreatorShare: integer(
      "entry_fee_tournament_creator_share",
    ),
    entryFeeGameCreatorShare: integer("entry_fee_game_creator_share"),
    entryFeeRefundShare: integer("entry_fee_refund_share"),
    entryFeeDistributionType: text("entry_fee_distribution_type"),
    entryFeeDistributionWeight: integer("entry_fee_distribution_weight"),
    // Variable-length list for Custom distribution variant only.
    entryFeeDistributionShares: jsonb("entry_fee_distribution_shares"),
    entryFeeDistributionCount: integer("entry_fee_distribution_count"),

    // Flattened from Cairo `Option<EntryRequirement>` — all null when absent.
    entryRequirementEntryLimit: integer("entry_requirement_entry_limit"),
    // Discriminator: "token" | "extension"
    entryRequirementType: text("entry_requirement_type"),
    // Populated only when entryRequirementType = "token"
    entryRequirementTokenAddress: text("entry_requirement_token_address"),
    // Populated only when entryRequirementType = "extension"
    entryRequirementExtensionAddress: text(
      "entry_requirement_extension_address",
    ),
    // Variable-length felt252 array passed to the extension's add_config.
    entryRequirementExtensionConfig: jsonb("entry_requirement_extension_config"),

    // Flattened from Cairo `LeaderboardConfig`.
    leaderboardAscending: boolean("leaderboard_ascending")
      .notNull()
      .default(false),
    leaderboardGameMustBeOver: boolean("leaderboard_game_must_be_over")
      .notNull()
      .default(false),

    entryCount: integer("entry_count").default(0),
    prizeCount: integer("prize_count").default(0),
    submissionCount: integer("submission_count").default(0),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash"),
  },
  (table) => ({
    gameAddressIdx: index("tournaments_game_address_idx").on(table.gameAddress),
    createdByIdx: index("tournaments_created_by_idx").on(table.createdBy),
    entryRequirementExtensionAddressIdx: index(
      "tournaments_entry_requirement_extension_address_idx",
    ).on(table.entryRequirementExtensionAddress),
  }),
);

// ---------------------------------------------------------------------------
// registrations
// Domain key: (tournament_id, game_token_id)
// Surrogate id for Apibara cursor invalidation
// game_address is intentionally not denormalized here — JOIN against
// `tournaments.game_address` when needed.
// ---------------------------------------------------------------------------
export const registrations = pgTable(
  "registrations",
  {
    id: serial("id").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    gameTokenId: text("game_token_id").notNull(),
    playerAddress: text("player_address"),
    entryNumber: integer("entry_number"),
    hasSubmitted: boolean("has_submitted").default(false),
    isBanned: boolean("is_banned").default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tournamentId, table.gameTokenId] }),
    tournamentIdIdx: index("registrations_tournament_id_idx").on(
      table.tournamentId,
    ),
    playerAddressIdx: index("registrations_player_address_idx").on(
      table.playerAddress,
    ),
    idIdx: unique("registrations_id_unique").on(table.id),
  }),
);

// ---------------------------------------------------------------------------
// prizes
// ---------------------------------------------------------------------------
export const prizes = pgTable(
  "prizes",
  {
    prizeId: bigint("prize_id", { mode: "bigint" }).primaryKey(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    payoutPosition: integer("payout_position"),
    tokenAddress: text("token_address"),
    tokenTypeName: text("token_type_name").notNull(),
    amount: text("amount"),
    tokenId: text("token_id"),
    distributionType: text("distribution_type"),
    distributionWeight: integer("distribution_weight"),
    // Variable-length list for Custom prize distribution variant only.
    // Basis-point shares (u16) summing to 10000, one per paid position.
    distributionShares: jsonb("distribution_shares"),
    distributionCount: integer("distribution_count"),
    sponsorAddress: text("sponsor_address"),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash"),
  },
  (table) => ({
    tournamentIdIdx: index("prizes_tournament_id_idx").on(table.tournamentId),
  }),
);

// ---------------------------------------------------------------------------
// reward_claims
// Domain key: (tournament_id, tx_hash, event_index)
//   event_index discriminates multiple claims within one transaction
// Surrogate id for Apibara cursor invalidation
// ---------------------------------------------------------------------------
export const rewardClaims = pgTable(
  "reward_claims",
  {
    id: serial("id").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    rewardType: jsonb("reward_type"),
    claimed: boolean("claimed").default(false),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash").notNull(),
    eventIndex: integer("event_index").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.tournamentId, table.txHash, table.eventIndex],
    }),
    tournamentIdIdx: index("reward_claims_tournament_id_idx").on(
      table.tournamentId,
    ),
    idIdx: unique("reward_claims_id_unique").on(table.id),
  }),
);

// ---------------------------------------------------------------------------
// qualification_entries
// Domain key: (tournament_id, tx_hash, event_index)
//   event_index discriminates multiple updates within one transaction
// Surrogate id for Apibara cursor invalidation
// ---------------------------------------------------------------------------
export const qualificationEntries = pgTable(
  "qualification_entries",
  {
    id: serial("id").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    qualificationProof: jsonb("qualification_proof"),
    entryCount: integer("entry_count"),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash").notNull(),
    eventIndex: integer("event_index").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.tournamentId, table.txHash, table.eventIndex],
    }),
    tournamentIdIdx: index("qualification_entries_tournament_id_idx").on(
      table.tournamentId,
    ),
    idIdx: unique("qualification_entries_id_unique").on(table.id),
  }),
);

// ---------------------------------------------------------------------------
// platform_stats  (singleton-ish table keyed by a text key)
// ---------------------------------------------------------------------------
export const platformStats = pgTable("platform_stats", {
  key: text("key").primaryKey(),
  totalTournaments: integer("total_tournaments").default(0),
  totalPrizes: integer("total_prizes").default(0),
  totalRegistrations: integer("total_registrations").default(0),
  totalSubmissions: integer("total_submissions").default(0),
});

// ---------------------------------------------------------------------------
// tournament_events  (PK: block_number + tx_hash + event_index)
// The PK is already globally unique per event, so it doubles as idColumn.
// Surrogate id added for Apibara cursor invalidation (simpler than
// composite column tracking).
// ---------------------------------------------------------------------------
export const tournamentEvents = pgTable(
  "tournament_events",
  {
    id: serial("id").notNull(),
    eventType: text("event_type").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }),
    playerAddress: text("player_address"),
    data: jsonb("data"),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    eventIndex: integer("event_index").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.blockNumber, table.txHash, table.eventIndex],
    }),
    idIdx: unique("tournament_events_id_unique").on(table.id),
  }),
);
