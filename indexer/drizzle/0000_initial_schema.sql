-- ---------------------------------------------------------------------------
-- Budokan Indexer — Complete Database Schema (fresh init)
--
-- This is the canonical schema for new deployments. The prior migration
-- chain (0000 initial schema → 0001 flatten tournament JSONB → 0002 prize
-- distribution shares → 0003 drop registrations.game_address → 0004 drop
-- leaderboards table) was collapsed into this single migration once the
-- changes in budokan #223 made an existing-data migration unnecessary —
-- the new contract is incompatible with the old one anyway and requires
-- a fresh deploy + fresh DB.
--
-- Tables optimized for:
-- - Efficient indexer writes (batch inserts per block)
-- - Fast client queries (indexed for common access patterns)
-- - Real-time updates via PostgreSQL NOTIFY triggers
--
-- Design notes:
-- - Composite PKs enforce domain uniqueness (e.g., one registration per token per tournament)
-- - SERIAL `id` columns on composite-PK tables serve as the Apibara drizzle storage
--   plugin's idColumn for cursor-based invalidation during chain reorgs.
-- - event_index discriminates multiple events within a single transaction (multicall safety)
-- - Live leaderboard data is sourced from denshokan-sdk's `useLiveLeaderboard`;
--   there is intentionally no `leaderboards` table here.
-- ---------------------------------------------------------------------------


-- =========================================================================
-- Tables
-- =========================================================================

CREATE TABLE IF NOT EXISTS tournaments (
  tournament_id BIGINT PRIMARY KEY,
  game_address TEXT NOT NULL,
  created_at BIGINT,
  created_by TEXT,
  creator_token_id TEXT,
  name TEXT,
  description TEXT,

  -- Flattened from Cairo `Schedule` (all u32 delays in seconds)
  schedule_registration_start_delay INTEGER NOT NULL DEFAULT 0,
  schedule_registration_end_delay   INTEGER NOT NULL DEFAULT 0,
  schedule_game_start_delay         INTEGER NOT NULL DEFAULT 0,
  schedule_game_end_delay           INTEGER NOT NULL DEFAULT 0,
  schedule_submission_duration      INTEGER NOT NULL DEFAULT 0,

  -- Flattened from Cairo `GameConfig` (game_address dedup'd into the column above)
  game_config_settings_id  INTEGER NOT NULL DEFAULT 0,
  game_config_soulbound    BOOLEAN NOT NULL DEFAULT FALSE,
  game_config_paymaster    BOOLEAN NOT NULL DEFAULT FALSE,
  game_config_client_url   TEXT,
  game_config_renderer     TEXT,

  -- Flattened from Cairo `Option<EntryFee>` — all NULL when entry fee absent
  entry_fee_token_address              TEXT,
  entry_fee_amount                     TEXT,
  entry_fee_tournament_creator_share   INTEGER,
  entry_fee_game_creator_share         INTEGER,
  entry_fee_refund_share               INTEGER,
  entry_fee_distribution_type          TEXT,
  entry_fee_distribution_weight        INTEGER,
  entry_fee_distribution_shares        JSONB,
  entry_fee_distribution_count         INTEGER,

  -- Flattened from Cairo `Option<EntryRequirement>` — all NULL when absent
  entry_requirement_entry_limit         INTEGER,
  entry_requirement_type                TEXT,
  entry_requirement_token_address       TEXT,
  entry_requirement_extension_address   TEXT,
  entry_requirement_extension_config    JSONB,

  -- Flattened from Cairo `LeaderboardConfig`
  leaderboard_ascending          BOOLEAN NOT NULL DEFAULT FALSE,
  leaderboard_game_must_be_over  BOOLEAN NOT NULL DEFAULT FALSE,

  entry_count INTEGER DEFAULT 0,
  prize_count INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  created_at_block BIGINT,
  tx_hash TEXT
);

CREATE INDEX IF NOT EXISTS tournaments_game_address_idx ON tournaments (game_address);
CREATE INDEX IF NOT EXISTS tournaments_created_by_idx ON tournaments (created_by);
CREATE INDEX IF NOT EXISTS tournaments_entry_requirement_extension_address_idx
  ON tournaments (entry_requirement_extension_address);

-- Registrations: domain key (tournament_id, game_token_id).
-- game_address is intentionally not denormalized here — JOIN against
-- tournaments.game_address when needed.
CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL NOT NULL,
  tournament_id BIGINT NOT NULL,
  game_token_id TEXT NOT NULL,
  player_address TEXT,
  entry_number INTEGER,
  has_submitted BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (tournament_id, game_token_id)
);

CREATE INDEX IF NOT EXISTS registrations_tournament_id_idx ON registrations (tournament_id);
CREATE INDEX IF NOT EXISTS registrations_player_address_idx ON registrations (player_address);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_id_unique ON registrations (id);

CREATE TABLE IF NOT EXISTS prizes (
  prize_id BIGINT PRIMARY KEY,
  tournament_id BIGINT NOT NULL,
  payout_position INTEGER,
  token_address TEXT,
  token_type_name TEXT NOT NULL,
  amount TEXT,
  token_id TEXT,
  distribution_type TEXT,
  distribution_weight INTEGER,
  -- Custom-distribution prizes only: u16 basis-point shares array summing to 10000.
  distribution_shares JSONB,
  distribution_count INTEGER,
  sponsor_address TEXT,
  created_at_block BIGINT,
  tx_hash TEXT
);

CREATE INDEX IF NOT EXISTS prizes_tournament_id_idx ON prizes (tournament_id);

CREATE TABLE IF NOT EXISTS reward_claims (
  id SERIAL NOT NULL,
  tournament_id BIGINT NOT NULL,
  reward_type JSONB,
  claimed BOOLEAN DEFAULT FALSE,
  created_at_block BIGINT,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, tx_hash, event_index)
);

CREATE INDEX IF NOT EXISTS reward_claims_tournament_id_idx ON reward_claims (tournament_id);
CREATE UNIQUE INDEX IF NOT EXISTS reward_claims_id_unique ON reward_claims (id);

CREATE TABLE IF NOT EXISTS qualification_entries (
  id SERIAL NOT NULL,
  tournament_id BIGINT NOT NULL,
  qualification_proof JSONB,
  entry_count INTEGER,
  created_at_block BIGINT,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, tx_hash, event_index)
);

CREATE INDEX IF NOT EXISTS qualification_entries_tournament_id_idx ON qualification_entries (tournament_id);
CREATE UNIQUE INDEX IF NOT EXISTS qualification_entries_id_unique ON qualification_entries (id);

CREATE TABLE IF NOT EXISTS platform_stats (
  key TEXT PRIMARY KEY,
  total_tournaments INTEGER DEFAULT 0,
  total_prizes INTEGER DEFAULT 0,
  total_registrations INTEGER DEFAULT 0,
  total_submissions INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tournament_events (
  id SERIAL NOT NULL,
  event_type TEXT NOT NULL,
  tournament_id BIGINT,
  player_address TEXT,
  data JSONB,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  PRIMARY KEY (block_number, tx_hash, event_index)
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_events_id_unique ON tournament_events (id);


-- =========================================================================
-- Real-time NOTIFY triggers
--
-- Downstream WebSocket servers (or any pg LISTEN client) subscribe to:
--   tournament_updates       - new tournaments created
--   registration_updates     - registrations + ban/submit state changes
--   prize_updates            - new prizes added
--   reward_claim_updates     - reward claims
-- =========================================================================

-- tournament_updates
CREATE OR REPLACE FUNCTION notify_tournament_created()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'tournament_id',    NEW.tournament_id,
    'game_address',     NEW.game_address,
    'created_at',       NEW.created_at,
    'created_by',       NEW.created_by,
    'creator_token_id', NEW.creator_token_id,
    'name',             NEW.name,
    'description',      NEW.description,
    'created_at_block', NEW.created_at_block,
    'tx_hash',          NEW.tx_hash
  );
  PERFORM pg_notify('tournament_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tournament_created ON tournaments;
CREATE TRIGGER trg_tournament_created
  AFTER INSERT ON tournaments
  FOR EACH ROW
  EXECUTE FUNCTION notify_tournament_created();

-- registration_updates
-- Fired on both INSERT (TournamentRegistration) and UPDATE
-- (TournamentEntryStateChanged → has_submitted / is_banned flips).
-- The client's `waitForSubmitScores` filters this stream for
-- `has_submitted === true`.
CREATE OR REPLACE FUNCTION notify_registration_update()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'tournament_id',   NEW.tournament_id,
    'game_token_id',   NEW.game_token_id,
    'player_address',  NEW.player_address,
    'entry_number',    NEW.entry_number,
    'has_submitted',   NEW.has_submitted,
    'is_banned',       NEW.is_banned
  );
  PERFORM pg_notify('registration_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registration_insert ON registrations;
CREATE TRIGGER trg_registration_insert
  AFTER INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION notify_registration_update();

DROP TRIGGER IF EXISTS trg_registration_update ON registrations;
CREATE TRIGGER trg_registration_update
  AFTER UPDATE ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION notify_registration_update();

-- prize_updates
CREATE OR REPLACE FUNCTION notify_prize_added()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'prize_id',          NEW.prize_id,
    'tournament_id',     NEW.tournament_id,
    'payout_position',   NEW.payout_position,
    'token_address',     NEW.token_address,
    'token_type_name',   NEW.token_type_name,
    'amount',            NEW.amount,
    'token_id',          NEW.token_id,
    'distribution_type', NEW.distribution_type,
    'distribution_count', NEW.distribution_count,
    'sponsor_address',   NEW.sponsor_address,
    'created_at_block',  NEW.created_at_block,
    'tx_hash',           NEW.tx_hash
  );
  PERFORM pg_notify('prize_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prize_added ON prizes;
CREATE TRIGGER trg_prize_added
  AFTER INSERT ON prizes
  FOR EACH ROW
  EXECUTE FUNCTION notify_prize_added();

-- reward_claim_updates
CREATE OR REPLACE FUNCTION notify_reward_claimed()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'tournament_id',   NEW.tournament_id,
    'reward_type',     NEW.reward_type,
    'claimed',         NEW.claimed,
    'created_at_block', NEW.created_at_block,
    'tx_hash',         NEW.tx_hash,
    'event_index',     NEW.event_index
  );
  PERFORM pg_notify('reward_claim_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reward_claimed ON reward_claims;
CREATE TRIGGER trg_reward_claimed
  AFTER INSERT ON reward_claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_reward_claimed();
