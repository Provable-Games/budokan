/**
 * API Database Schema
 *
 * This schema MUST match the indexer's canonical schema (indexer/src/lib/schema.ts).
 * The indexer creates and populates all tables; the API is a read-only layer.
 */

import {
  pgTable,
  bigint,
  integer,
  text,
  boolean,
  jsonb,
  index,
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
    schedule: jsonb("schedule"),
    gameConfig: jsonb("game_config"),
    entryFee: jsonb("entry_fee"),
    entryRequirement: jsonb("entry_requirement"),
    leaderboardConfig: jsonb("leaderboard_config"),
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
// registrations  (PK: tournament_id + game_token_id)
// ---------------------------------------------------------------------------
export const registrations = pgTable(
  "registrations",
  {
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    gameTokenId: bigint("game_token_id", { mode: "bigint" }).notNull(),
    gameAddress: text("game_address"),
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
  }),
);

// ---------------------------------------------------------------------------
// leaderboards  (PK: tournament_id + position)
// ---------------------------------------------------------------------------
export const leaderboards = pgTable(
  "leaderboards",
  {
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    position: integer("position").notNull(),
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tournamentId, table.position] }),
    tournamentIdIdx: index("leaderboards_tournament_id_idx").on(
      table.tournamentId,
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
// reward_claims  (PK: tournament_id + tx_hash)
// ---------------------------------------------------------------------------
export const rewardClaims = pgTable(
  "reward_claims",
  {
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    rewardType: jsonb("reward_type"),
    claimed: boolean("claimed").default(false),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tournamentId, table.txHash] }),
    tournamentIdIdx: index("reward_claims_tournament_id_idx").on(
      table.tournamentId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// qualification_entries  (PK: tournament_id + tx_hash)
// ---------------------------------------------------------------------------
export const qualificationEntries = pgTable(
  "qualification_entries",
  {
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    qualificationProof: jsonb("qualification_proof"),
    entryCount: integer("entry_count"),
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }),
    txHash: text("tx_hash").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tournamentId, table.txHash] }),
    tournamentIdIdx: index("qualification_entries_tournament_id_idx").on(
      table.tournamentId,
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
// tournament_events  (PK: block_number + tx_hash + event_index)
// ---------------------------------------------------------------------------
export const tournamentEvents = pgTable(
  "tournament_events",
  {
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
  }),
);
