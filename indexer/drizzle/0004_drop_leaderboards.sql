-- Drop the leaderboards table along with its insert trigger and notify
-- function. The contract no longer emits LeaderboardUpdated, and live
-- leaderboard data is sourced from denshokan-sdk's useLiveLeaderboard.
-- The post-submit WS signal that consumers used to listen on the
-- "leaderboards" channel now fires on the "registrations" channel via
-- TournamentEntryStateChanged (has_submitted=true).

DROP TRIGGER IF EXISTS trg_leaderboard_insert ON "leaderboards";
DROP FUNCTION IF EXISTS notify_leaderboard_update() CASCADE;
DROP TABLE IF EXISTS "leaderboards" CASCADE;
