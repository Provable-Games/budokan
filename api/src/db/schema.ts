/**
 * API Database Schema
 *
 * This schema MUST match the indexer's canonical schema (indexer/src/lib/schema.ts).
 * The indexer creates and populates all tables; the API is a read-only layer.
 *
 * Design notes:
 * - Composite PKs enforce domain uniqueness (e.g., one registration per token per tournament)
 * - Auto-increment `id` columns on composite-PK tables serve as the Apibara drizzle storage
 *   plugin's idColumn for cursor-based invalidation during chain reorgs.
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
// registrations
// Domain key: (tournament_id, game_token_id)
// Surrogate id for Apibara cursor invalidation
// ---------------------------------------------------------------------------
export const registrations = pgTable(
  "registrations",
  {
    id: serial("id").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    gameTokenId: text("game_token_id").notNull(),
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
    idIdx: unique("registrations_id_unique").on(table.id),
  }),
);

// ---------------------------------------------------------------------------
// leaderboards
// Domain key: (tournament_id, position)
// Surrogate id for Apibara cursor invalidation
// ---------------------------------------------------------------------------
export const leaderboards = pgTable(
  "leaderboards",
  {
    id: serial("id").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    position: integer("position").notNull(),
    tokenId: text("token_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tournamentId, table.position] }),
    tournamentIdIdx: index("leaderboards_tournament_id_idx").on(
      table.tournamentId,
    ),
    idIdx: unique("leaderboards_id_unique").on(table.id),
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
// Surrogate id for Apibara cursor invalidation
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
