/**
 * Cleanup Apibara reorg triggers
 *
 * The @apibara/plugin-drizzle creates triggers for handling chain reorganizations.
 * When the indexer restarts, it tries to create them again, causing an error.
 * This script drops existing triggers before the indexer starts.
 *
 * Usage: npm run db:cleanup (before starting indexer)
 */

import pg from "pg";

const { Client } = pg;

const INDEXER_NAME = "budokan-indexer";

async function cleanupTriggers() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/budokan";

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("[Cleanup] Connected to database");

    // Find all reorg triggers for this indexer (across all schemas)
    const result = await client.query(`
      SELECT trigger_name, event_object_schema, event_object_table
      FROM information_schema.triggers
      WHERE trigger_name LIKE '%_reorg_indexer_${INDEXER_NAME}_%'
         OR trigger_name LIKE '%_reorg_%${INDEXER_NAME}%'
      GROUP BY trigger_name, event_object_schema, event_object_table
    `);

    if (result.rows.length === 0) {
      console.log("[Cleanup] No existing reorg triggers found");
      return;
    }

    console.log(`[Cleanup] Found ${result.rows.length} triggers to drop`);

    for (const row of result.rows) {
      const { trigger_name, event_object_schema, event_object_table } = row;
      const qualifiedTable =
        event_object_schema === "public"
          ? `"${event_object_table}"`
          : `"${event_object_schema}"."${event_object_table}"`;
      console.log(
        `[Cleanup] Dropping trigger ${trigger_name} on ${qualifiedTable}`,
      );
      await client.query(
        `DROP TRIGGER IF EXISTS "${trigger_name}" ON ${qualifiedTable}`,
      );
    }

    console.log("[Cleanup] All triggers dropped successfully");
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

cleanupTriggers();
