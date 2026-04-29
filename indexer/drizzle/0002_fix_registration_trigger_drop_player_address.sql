-- Update notify_registration_update() to drop the player_address field.
--
-- Migration 0001 dropped registrations.player_address but left the
-- notify_registration_update() trigger function still referencing
-- NEW.player_address. The triggers fire on every INSERT/UPDATE to
-- registrations, so since 0001 ran, the indexer has been failing every
-- transform with `record "new" has no field "player_address"`.
--
-- This migration replaces the function body without that field. The
-- existing triggers (trg_registration_insert, trg_registration_update)
-- already point at this function and don't need to be recreated.

CREATE OR REPLACE FUNCTION notify_registration_update()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'tournament_id',   NEW.tournament_id,
    'game_token_id',   NEW.game_token_id,
    'entry_number',    NEW.entry_number,
    'has_submitted',   NEW.has_submitted,
    'is_banned',       NEW.is_banned
  );
  PERFORM pg_notify('registration_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
