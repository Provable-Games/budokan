-- Flatten the five JSONB columns on `tournaments` into dedicated typed columns.
-- Backfills from the existing JSONB payload, then drops the old columns.
-- The Distribution enum becomes three columns: type (text), weight (int),
-- shares (jsonb — only the Custom variant uses it).

-- ---------------------------------------------------------------------------
-- 1. Add new columns (all nullable initially so UPDATE can populate)
-- ---------------------------------------------------------------------------
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS schedule_registration_start_delay integer,
  ADD COLUMN IF NOT EXISTS schedule_registration_end_delay integer,
  ADD COLUMN IF NOT EXISTS schedule_game_start_delay integer,
  ADD COLUMN IF NOT EXISTS schedule_game_end_delay integer,
  ADD COLUMN IF NOT EXISTS schedule_submission_duration integer,

  ADD COLUMN IF NOT EXISTS game_config_settings_id integer,
  ADD COLUMN IF NOT EXISTS game_config_soulbound boolean,
  ADD COLUMN IF NOT EXISTS game_config_paymaster boolean,
  ADD COLUMN IF NOT EXISTS game_config_client_url text,
  ADD COLUMN IF NOT EXISTS game_config_renderer text,

  ADD COLUMN IF NOT EXISTS entry_fee_token_address text,
  ADD COLUMN IF NOT EXISTS entry_fee_amount text,
  ADD COLUMN IF NOT EXISTS entry_fee_tournament_creator_share integer,
  ADD COLUMN IF NOT EXISTS entry_fee_game_creator_share integer,
  ADD COLUMN IF NOT EXISTS entry_fee_refund_share integer,
  ADD COLUMN IF NOT EXISTS entry_fee_distribution_type text,
  ADD COLUMN IF NOT EXISTS entry_fee_distribution_weight integer,
  ADD COLUMN IF NOT EXISTS entry_fee_distribution_shares jsonb,
  ADD COLUMN IF NOT EXISTS entry_fee_distribution_count integer,

  ADD COLUMN IF NOT EXISTS entry_requirement_entry_limit integer,
  ADD COLUMN IF NOT EXISTS entry_requirement_type text,
  ADD COLUMN IF NOT EXISTS entry_requirement_token_address text,
  ADD COLUMN IF NOT EXISTS entry_requirement_extension_address text,
  ADD COLUMN IF NOT EXISTS entry_requirement_extension_config jsonb,

  ADD COLUMN IF NOT EXISTS leaderboard_ascending boolean,
  ADD COLUMN IF NOT EXISTS leaderboard_game_must_be_over boolean;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Backfill from existing JSONB
-- ---------------------------------------------------------------------------
UPDATE tournaments SET
  schedule_registration_start_delay = COALESCE((schedule->>'registration_start_delay')::int, 0),
  schedule_registration_end_delay   = COALESCE((schedule->>'registration_end_delay')::int, 0),
  schedule_game_start_delay         = COALESCE((schedule->>'game_start_delay')::int, 0),
  schedule_game_end_delay           = COALESCE((schedule->>'game_end_delay')::int, 0),
  schedule_submission_duration      = COALESCE((schedule->>'submission_duration')::int, 0),

  game_config_settings_id = COALESCE((game_config->>'settings_id')::int, 0),
  game_config_soulbound   = COALESCE((game_config->>'soulbound')::boolean, false),
  game_config_paymaster   = COALESCE((game_config->>'paymaster')::boolean, false),
  game_config_client_url  = game_config->>'client_url',
  game_config_renderer    = game_config->>'renderer',

  entry_fee_token_address            = entry_fee->>'token_address',
  entry_fee_amount                   = entry_fee->>'amount',
  entry_fee_tournament_creator_share = (entry_fee->>'tournament_creator_share')::int,
  entry_fee_game_creator_share       = (entry_fee->>'game_creator_share')::int,
  entry_fee_refund_share             = (entry_fee->>'refund_share')::int,
  entry_fee_distribution_type        = entry_fee->'distribution'->>'type',
  entry_fee_distribution_weight      = NULLIF(entry_fee->'distribution'->>'weight', '')::int,
  entry_fee_distribution_shares      = CASE
    WHEN entry_fee->'distribution'->>'type' = 'Custom'
      THEN entry_fee->'distribution'->'shares'
    ELSE NULL
  END,
  entry_fee_distribution_count       = (entry_fee->>'distribution_count')::int,

  entry_requirement_entry_limit         = (entry_requirement->>'entry_limit')::int,
  entry_requirement_type                = entry_requirement->'entry_requirement_type'->>'type',
  entry_requirement_token_address       = CASE
    WHEN entry_requirement->'entry_requirement_type'->>'type' = 'token'
      THEN entry_requirement->'entry_requirement_type'->>'token_address'
    ELSE NULL
  END,
  entry_requirement_extension_address   = CASE
    WHEN entry_requirement->'entry_requirement_type'->>'type' = 'extension'
      THEN entry_requirement->'entry_requirement_type'->>'address'
    ELSE NULL
  END,
  entry_requirement_extension_config    = CASE
    WHEN entry_requirement->'entry_requirement_type'->>'type' = 'extension'
      THEN entry_requirement->'entry_requirement_type'->'config'
    ELSE NULL
  END,

  leaderboard_ascending         = COALESCE((leaderboard_config->>'ascending')::boolean, false),
  leaderboard_game_must_be_over = COALESCE((leaderboard_config->>'game_must_be_over')::boolean, false);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Set defaults and NOT NULL on the always-present columns
-- ---------------------------------------------------------------------------
ALTER TABLE tournaments
  ALTER COLUMN schedule_registration_start_delay SET DEFAULT 0,
  ALTER COLUMN schedule_registration_start_delay SET NOT NULL,
  ALTER COLUMN schedule_registration_end_delay SET DEFAULT 0,
  ALTER COLUMN schedule_registration_end_delay SET NOT NULL,
  ALTER COLUMN schedule_game_start_delay SET DEFAULT 0,
  ALTER COLUMN schedule_game_start_delay SET NOT NULL,
  ALTER COLUMN schedule_game_end_delay SET DEFAULT 0,
  ALTER COLUMN schedule_game_end_delay SET NOT NULL,
  ALTER COLUMN schedule_submission_duration SET DEFAULT 0,
  ALTER COLUMN schedule_submission_duration SET NOT NULL,

  ALTER COLUMN game_config_settings_id SET DEFAULT 0,
  ALTER COLUMN game_config_settings_id SET NOT NULL,
  ALTER COLUMN game_config_soulbound SET DEFAULT false,
  ALTER COLUMN game_config_soulbound SET NOT NULL,
  ALTER COLUMN game_config_paymaster SET DEFAULT false,
  ALTER COLUMN game_config_paymaster SET NOT NULL,

  ALTER COLUMN leaderboard_ascending SET DEFAULT false,
  ALTER COLUMN leaderboard_ascending SET NOT NULL,
  ALTER COLUMN leaderboard_game_must_be_over SET DEFAULT false,
  ALTER COLUMN leaderboard_game_must_be_over SET NOT NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Drop the old JSONB columns
-- ---------------------------------------------------------------------------
ALTER TABLE tournaments
  DROP COLUMN IF EXISTS schedule,
  DROP COLUMN IF EXISTS game_config,
  DROP COLUMN IF EXISTS entry_fee,
  DROP COLUMN IF EXISTS entry_requirement,
  DROP COLUMN IF EXISTS leaderboard_config;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Index the extension address for whitelist filtering
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS tournaments_entry_requirement_extension_address_idx
  ON tournaments (entry_requirement_extension_address);
