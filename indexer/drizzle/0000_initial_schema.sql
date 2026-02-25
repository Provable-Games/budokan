-- ---------------------------------------------------------------------------
-- Initial schema for Budokan indexer
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tournaments (
  tournament_id BIGINT PRIMARY KEY,
  game_address TEXT NOT NULL,
  created_at BIGINT,
  created_by TEXT,
  creator_token_id TEXT,
  name TEXT,
  description TEXT,
  schedule JSONB,
  game_config JSONB,
  entry_fee JSONB,
  entry_requirement JSONB,
  leaderboard_config JSONB,
  entry_count INTEGER DEFAULT 0,
  prize_count INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  created_at_block BIGINT,
  tx_hash TEXT
);

CREATE INDEX IF NOT EXISTS tournaments_game_address_idx ON tournaments (game_address);
CREATE INDEX IF NOT EXISTS tournaments_created_by_idx ON tournaments (created_by);

CREATE TABLE IF NOT EXISTS registrations (
  tournament_id BIGINT NOT NULL,
  game_token_id BIGINT NOT NULL,
  game_address TEXT,
  player_address TEXT,
  entry_number INTEGER,
  has_submitted BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (tournament_id, game_token_id)
);

CREATE INDEX IF NOT EXISTS registrations_tournament_id_idx ON registrations (tournament_id);
CREATE INDEX IF NOT EXISTS registrations_player_address_idx ON registrations (player_address);

CREATE TABLE IF NOT EXISTS leaderboards (
  tournament_id BIGINT NOT NULL,
  position INTEGER NOT NULL,
  token_id BIGINT NOT NULL,
  PRIMARY KEY (tournament_id, position)
);

CREATE INDEX IF NOT EXISTS leaderboards_tournament_id_idx ON leaderboards (tournament_id);

CREATE TABLE IF NOT EXISTS prizes (
  prize_id BIGINT PRIMARY KEY,
  tournament_id BIGINT NOT NULL,
  payout_position INTEGER,
  token_address TEXT,
  token_type JSONB,
  sponsor_address TEXT,
  created_at_block BIGINT,
  tx_hash TEXT
);

CREATE INDEX IF NOT EXISTS prizes_tournament_id_idx ON prizes (tournament_id);

CREATE TABLE IF NOT EXISTS reward_claims (
  tournament_id BIGINT NOT NULL,
  reward_type JSONB,
  claimed BOOLEAN DEFAULT FALSE,
  created_at_block BIGINT,
  tx_hash TEXT NOT NULL,
  PRIMARY KEY (tournament_id, tx_hash)
);

CREATE INDEX IF NOT EXISTS reward_claims_tournament_id_idx ON reward_claims (tournament_id);

CREATE TABLE IF NOT EXISTS qualification_entries (
  tournament_id BIGINT NOT NULL,
  qualification_proof JSONB,
  entry_count INTEGER,
  created_at_block BIGINT,
  tx_hash TEXT NOT NULL,
  PRIMARY KEY (tournament_id, tx_hash)
);

CREATE INDEX IF NOT EXISTS qualification_entries_tournament_id_idx ON qualification_entries (tournament_id);

CREATE TABLE IF NOT EXISTS platform_stats (
  key TEXT PRIMARY KEY,
  total_tournaments INTEGER DEFAULT 0,
  total_prizes INTEGER DEFAULT 0,
  total_registrations INTEGER DEFAULT 0,
  total_submissions INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tournament_events (
  event_type TEXT NOT NULL,
  tournament_id BIGINT,
  player_address TEXT,
  data JSONB,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  PRIMARY KEY (block_number, tx_hash, event_index)
);
