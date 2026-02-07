-- ---------------------------------------------------------------------------
-- Real-time NOTIFY triggers for Budokan tournament tables.
--
-- Downstream WebSocket servers (or any pg LISTEN client) subscribe to:
--   tournament_updates       - new tournaments created
--   registration_updates     - player registrations, bans, submissions
--   leaderboard_updates      - leaderboard changes
--   prize_updates            - new prizes added
--   reward_claim_updates     - reward claims
-- ---------------------------------------------------------------------------

-- =========================================================================
-- tournament_updates
-- =========================================================================
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

-- =========================================================================
-- registration_updates
-- =========================================================================
CREATE OR REPLACE FUNCTION notify_registration_update()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'id',              NEW.id,
    'tournament_id',   NEW.tournament_id,
    'game_token_id',   NEW.game_token_id,
    'game_address',    NEW.game_address,
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

-- =========================================================================
-- leaderboard_updates
-- =========================================================================
CREATE OR REPLACE FUNCTION notify_leaderboard_update()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'id',            NEW.id,
    'tournament_id', NEW.tournament_id,
    'position',      NEW.position,
    'token_id',      NEW.token_id
  );
  PERFORM pg_notify('leaderboard_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leaderboard_insert ON leaderboards;
CREATE TRIGGER trg_leaderboard_insert
  AFTER INSERT ON leaderboards
  FOR EACH ROW
  EXECUTE FUNCTION notify_leaderboard_update();

-- =========================================================================
-- prize_updates
-- =========================================================================
CREATE OR REPLACE FUNCTION notify_prize_added()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'prize_id',        NEW.prize_id,
    'tournament_id',   NEW.tournament_id,
    'payout_position', NEW.payout_position,
    'token_address',   NEW.token_address,
    'token_type',      NEW.token_type,
    'sponsor_address', NEW.sponsor_address,
    'created_at_block', NEW.created_at_block,
    'tx_hash',         NEW.tx_hash
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

-- =========================================================================
-- reward_claim_updates
-- =========================================================================
CREATE OR REPLACE FUNCTION notify_reward_claimed()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'id',              NEW.id,
    'tournament_id',   NEW.tournament_id,
    'reward_type',     NEW.reward_type,
    'claimed',         NEW.claimed,
    'created_at_block', NEW.created_at_block,
    'tx_hash',         NEW.tx_hash
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
