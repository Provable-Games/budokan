-- Drop the denormalized `game_address` column from the registrations table.
-- The contract no longer emits `game_address` on TournamentRegistration or
-- TournamentEntryStateChanged events — it is derivable from `tournament_id`
-- via `tournaments.game_address`. Queries that previously read
-- `registrations.game_address` should JOIN to the `tournaments` table.

-- The notify_registration_update trigger function previously read
-- NEW.game_address; recreate it without that field so the trigger stays valid
-- after the column is dropped.
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

ALTER TABLE "registrations" DROP COLUMN IF EXISTS "game_address";
