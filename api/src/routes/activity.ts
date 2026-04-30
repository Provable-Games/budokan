import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformStats } from "../db/schema.js";

const app = new Hono();

// ─── GET /stats ── Platform-level aggregate stats ────────────────────────────
app.get("/stats", async (c) => {
  try {
    const rows = await db
      .select()
      .from(platformStats)
      .where(eq(platformStats.key, "global"))
      .limit(1);

    if (rows.length === 0) {
      return c.json({
        data: {
          totalTournaments: 0,
          totalRegistrations: 0,
          totalPrizes: 0,
          totalSubmissions: 0,
        },
      });
    }

    const s = rows[0];
    return c.json({
      data: {
        totalTournaments: s.totalTournaments,
        totalRegistrations: s.totalRegistrations,
        totalPrizes: s.totalPrizes,
        totalSubmissions: s.totalSubmissions,
      },
    });
  } catch (err) {
    console.error("[activity] stats error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /prize-stats ── Prize amounts aggregated by token address ──────────
app.get("/prize-stats", async (c) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        token_address,
        token_type_name,
        COUNT(*)::int AS prize_count,
        COALESCE(SUM(amount::numeric), 0)::text AS total_amount
      FROM prizes
      GROUP BY token_address, token_type_name
      ORDER BY COALESCE(SUM(amount::numeric), 0) DESC
    `);

    return c.json({
      data: (rows.rows as Array<{
        token_address: string;
        token_type_name: string;
        prize_count: number;
        total_amount: string;
      }>).map((row) => ({
        tokenAddress: row.token_address,
        tokenType: row.token_type_name,
        prizeCount: row.prize_count,
        totalAmount: row.total_amount,
      })),
    });
  } catch (err) {
    console.error("[activity] prize-stats error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
