/**
 * Budokan Indexer Database Schema
 *
 * Tables optimized for:
 * - Efficient indexer writes (batch inserts per block)
 * - Fast client queries (indexed for common access patterns)
 * - Real-time updates via PostgreSQL NOTIFY triggers
 *
 * Tables:
 * 1. tournaments - Tournament definitions from TournamentCreated events
 * 2. registrations - Player registrations from TournamentRegistration events
 * 3. leaderboards - Ordered rankings from LeaderboardUpdated events
 * 4. prizes - Sponsored prizes from PrizeAdded events
 * 5. reward_claims - Reward claim records from RewardClaimed events
 * 6. qualification_entries - Entry requirement tracking from QualificationEntriesUpdated events
 * 7. platform_stats - Aggregated platform-wide statistics
 * 8. tournament_events - Raw event audit log for replay/debugging
 */

import {
  pgTable,
  uuid,
  bigint,
  integer,
  text,
  boolean,
  jsonb,
  index,
  unique,
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
    creatorTokenId: bigint("creator_token_id", { mode: "bigint" }),
    name: text("name"),
    description: text("description"),
    schedule: jsonb("schedule"),
    gameConfig: jsonb("game_config"),
    entryFee: jsonb("entry_fee"),
    entryRequirement: jsonb("entry_requirement"),
    entryCount: integer("entry_count").default(0),
    prizeCount: integer("prize_count").default(0),
    submissionCount: integer("submission_count").default(0),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash"),
  },
  (table) => ({
    gameAddressIdx: index("tournaments_game_address_idx").on(table.gameAddress),
    createdByIdx: index("tournaments_created_by_idx").on(table.createdBy),
  }),
);

// ---------------------------------------------------------------------------
// registrations
// ---------------------------------------------------------------------------
export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    gameTokenId: bigint("game_token_id", { mode: "bigint" }).notNull(),
    gameAddress: text("game_address"),
    playerAddress: text("player_address"),
    entryNumber: integer("entry_number"),
    hasSubmitted: boolean("has_submitted").default(false),
    isBanned: boolean("is_banned").default(false),
  },
  (table) => ({
    tournamentIdIdx: index("registrations_tournament_id_idx").on(
      table.tournamentId,
    ),
    playerAddressIdx: index("registrations_player_address_idx").on(
      table.playerAddress,
    ),
    uniqueRegistration: unique("registrations_unique").on(
      table.tournamentId,
      table.gameTokenId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// leaderboards
// ---------------------------------------------------------------------------
export const leaderboards = pgTable(
  "leaderboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    position: integer("position").notNull(),
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
  },
  (table) => ({
    tournamentIdIdx: index("leaderboards_tournament_id_idx").on(
      table.tournamentId,
    ),
    uniquePosition: unique("leaderboards_unique_position").on(
      table.tournamentId,
      table.position,
    ),
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
    tokenType: jsonb("token_type"),
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
// ---------------------------------------------------------------------------
export const rewardClaims = pgTable(
  "reward_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    rewardType: jsonb("reward_type"),
    claimed: boolean("claimed").default(false),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash"),
  },
  (table) => ({
    tournamentIdIdx: index("reward_claims_tournament_id_idx").on(
      table.tournamentId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// qualification_entries
// ---------------------------------------------------------------------------
export const qualificationEntries = pgTable(
  "qualification_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    qualificationProof: jsonb("qualification_proof"),
    entryCount: integer("entry_count"),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash"),
  },
  (table) => ({
    tournamentIdIdx: index("qualification_entries_tournament_id_idx").on(
      table.tournamentId,
    ),
    uniqueQualification: unique("qualification_entries_unique").on(
      table.tournamentId,
      table.qualificationProof,
    ),
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
// tournament_events  (raw event log for replay / debugging)
// ---------------------------------------------------------------------------
export const tournamentEvents = pgTable(
  "tournament_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }),
    playerAddress: text("player_address"),
    data: jsonb("data"),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    txHash: text("tx_hash"),
    eventIndex: integer("event_index"),
  },
  (table) => ({
    uniqueEvent: unique("tournament_events_unique").on(
      table.blockNumber,
      table.txHash,
      table.eventIndex,
    ),
  }),
);
