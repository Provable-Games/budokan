-- Drop the tournament_events audit log.
--
-- Background: tournament_events was an "every event ever indexed" JSONB log
-- intended for replay/debugging. The only consumer was budokan-api's
-- `GET /activity` route, which no client ever calls (`useActivityStats`
-- reads platform_stats directly, not this table). The indexer paid two
-- writes per event — once into the typed table, once into this log — for
-- a row that nothing reads.
--
-- This migration drops the table and its index. The matching client-side
-- handler removal lives in api/src/routes/activity.ts (the `GET /` events
-- list handler is gone; `/stats` and `/prize-stats` stay).

DROP INDEX IF EXISTS "tournament_events_id_unique";
DROP TABLE IF EXISTS "tournament_events";
