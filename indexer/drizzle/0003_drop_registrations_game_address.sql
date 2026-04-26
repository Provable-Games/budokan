-- Drop the denormalized `game_address` column from the registrations table.
-- The contract no longer emits `game_address` on TournamentRegistration or
-- TournamentEntryStateChanged events — it is derivable from `tournament_id`
-- via `tournaments.game_address`. Queries that previously read
-- `registrations.game_address` should JOIN to the `tournaments` table.
ALTER TABLE "registrations" DROP COLUMN IF EXISTS "game_address";
