import { Hono } from "hono";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { tournamentEvents, platformStats, prizes } from "../db/schema.js";
import {
  parseLimit,
  parseOffset,
  parseTournamentId,
} from "../utils/validation.js";

const app = new Hono();

// ─── GET / ── Event timeline ─────────────────────────────────────────────────
// Query params: event_type, tournament_id, limit, offset
app.get("/", async (c) => {
  try {
    const eventType = c.req.query("event_type") || null;
    const tournamentId = parseTournamentId(c.req.query("tournament_id"));
    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const conditions = [];
    if (eventType) conditions.push(eq(tournamentEvents.eventType, eventType));
    if (tournamentId !== null) conditions.push(eq(tournamentEvents.tournamentId, tournamentId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(tournamentEvents)
        .where(where)
        .orderBy(desc(tournamentEvents.blockNumber))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tournamentEvents)
        .where(where),
    ]);

    return c.json({
      data: rows.map((ev) => ({
        eventType: ev.eventType,
        tournamentId: ev.tournamentId?.toString() ?? null,
        playerAddress: ev.playerAddress,
        txHash: ev.txHash,
        blockNumber: ev.blockNumber.toString(),
        eventIndex: ev.eventIndex,
        data: ev.data,
      })),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[activity] list error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

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
