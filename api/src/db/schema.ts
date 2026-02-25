import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── tournaments ──────────────────────────────────────────────────────────────
// Core tournament definitions indexed from on-chain TournamentCreated events.

export const tournaments = pgTable(
  "tournaments",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey(),
    gameAddress: text("game_address").notNull(),
    creator: text("creator").notNull(),
    creatorTokenId: bigint("creator_token_id", { mode: "bigint" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    registrationStartTime: timestamp("registration_start_time"),
    registrationEndTime: timestamp("registration_end_time"),
    gameStartTime: timestamp("game_start_time").notNull(),
    gameEndTime: timestamp("game_end_time").notNull(),
    submissionDuration: integer("submission_duration").notNull().default(0),
    settingsId: integer("settings_id"),
    soulbound: boolean("soulbound").notNull().default(false),
    playUrl: text("play_url"),
    entryFeeToken: text("entry_fee_token"),
    entryFeeAmount: bigint("entry_fee_amount", { mode: "bigint" }),
    hasEntryRequirement: boolean("has_entry_requirement").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    gameAddressIdx: index("tournaments_game_address_idx").on(table.gameAddress),
    creatorIdx: index("tournaments_creator_idx").on(table.creator),
    gameStartTimeIdx: index("tournaments_game_start_time_idx").on(table.gameStartTime),
    gameEndTimeIdx: index("tournaments_game_end_time_idx").on(table.gameEndTime),
    createdAtIdx: index("tournaments_created_at_idx").on(table.createdAt),
  })
);

// ─── registrations ────────────────────────────────────────────────────────────
// One row per player per tournament, written on TournamentRegistration event.

export const registrations = pgTable(
  "registrations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    gameTokenId: bigint("game_token_id", { mode: "bigint" }).notNull(),
    gameAddress: text("game_address").notNull(),
    playerAddress: text("player_address").notNull(),
    entryNumber: integer("entry_number").notNull(),
    hasSubmitted: boolean("has_submitted").notNull().default(false),
    isBanned: boolean("is_banned").notNull().default(false),
    registeredAt: timestamp("registered_at").notNull().defaultNow(),
  },
  (table) => ({
    tournamentPlayerUniqueIdx: uniqueIndex("registrations_tournament_player_idx").on(
      table.tournamentId,
      table.gameTokenId
    ),
    tournamentIdIdx: index("registrations_tournament_id_idx").on(table.tournamentId),
    playerAddressIdx: index("registrations_player_address_idx").on(table.playerAddress),
    gameAddressIdx: index("registrations_game_address_idx").on(table.gameAddress),
  })
);

// ─── leaderboards ─────────────────────────────────────────────────────────────
// Leaderboard entries updated on LeaderboardUpdated event.

export const leaderboards = pgTable(
  "leaderboards",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
    rank: integer("rank").notNull(),
    score: bigint("score", { mode: "bigint" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tournamentRankUniqueIdx: uniqueIndex("leaderboards_tournament_token_idx").on(
      table.tournamentId,
      table.tokenId
    ),
    tournamentIdIdx: index("leaderboards_tournament_id_idx").on(table.tournamentId),
    rankIdx: index("leaderboards_rank_idx").on(table.rank),
  })
);

// ─── prizes ───────────────────────────────────────────────────────────────────
// Prize metadata from PrizeAdded events.

export const prizes = pgTable(
  "prizes",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    payoutPosition: integer("payout_position").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenType: text("token_type").notNull(), // "erc20" | "erc721"
    tokenAmount: bigint("token_amount", { mode: "bigint" }),
    tokenId: bigint("token_id", { mode: "bigint" }),
    sponsorAddress: text("sponsor_address").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tournamentIdIdx: index("prizes_tournament_id_idx").on(table.tournamentId),
    sponsorIdx: index("prizes_sponsor_address_idx").on(table.sponsorAddress),
  })
);

// ─── rewards ──────────────────────────────────────────────────────────────────
// Reward claims from RewardClaimed events.

export const rewards = pgTable(
  "rewards",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }).notNull(),
    rewardType: text("reward_type").notNull(),
    claimed: boolean("claimed").notNull().default(false),
    claimedAt: timestamp("claimed_at"),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    tournamentIdIdx: index("rewards_tournament_id_idx").on(table.tournamentId),
    rewardTypeIdx: index("rewards_reward_type_idx").on(table.rewardType),
  })
);

// ─── tournament_events ──────────────────────────────────────────────────────
// Raw event log from all indexed tournament-related events.

export const tournamentEvents = pgTable(
  "tournament_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    eventType: text("event_type").notNull(),
    tournamentId: bigint("tournament_id", { mode: "bigint" }),
    playerAddress: text("player_address"),
    gameAddress: text("game_address"),
    txHash: text("tx_hash"),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    data: jsonb("data"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    eventTypeIdx: index("tournament_events_event_type_idx").on(table.eventType),
    tournamentIdIdx: index("tournament_events_tournament_id_idx").on(table.tournamentId),
    playerAddressIdx: index("tournament_events_player_address_idx").on(table.playerAddress),
    gameAddressIdx: index("tournament_events_game_address_idx").on(table.gameAddress),
    createdAtIdx: index("tournament_events_created_at_idx").on(table.createdAt),
  })
);

// ─── platform_stats ─────────────────────────────────────────────────────────
// Aggregate platform-level statistics, updated by the indexer.

export const platformStats = pgTable("platform_stats", {
  key: text("key").primaryKey(), // e.g. "global"
  totalTournaments: integer("total_tournaments").notNull().default(0),
  totalRegistrations: integer("total_registrations").notNull().default(0),
  totalPrizes: integer("total_prizes").notNull().default(0),
  totalRewardsClaimed: integer("total_rewards_claimed").notNull().default(0),
  uniquePlayers: integer("unique_players").notNull().default(0),
  uniqueGames: integer("unique_games").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── game_stats ─────────────────────────────────────────────────────────────
// Aggregate statistics per game address, updated by the indexer.

export const gameStats = pgTable("game_stats", {
  gameAddress: text("game_address").primaryKey(),
  totalTournaments: integer("total_tournaments").notNull().default(0),
  totalRegistrations: integer("total_registrations").notNull().default(0),
  totalPrizes: integer("total_prizes").notNull().default(0),
  uniquePlayers: integer("unique_players").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
