import { Hono } from "hono";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { tournamentEvents, platformStats } from "../db/schema.js";
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
        .orderBy(desc(tournamentEvents.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tournamentEvents)
        .where(where),
    ]);

    return c.json({
      data: rows.map((ev) => ({
        id: ev.id,
        eventType: ev.eventType,
        tournamentId: ev.tournamentId?.toString() ?? null,
        playerAddress: ev.playerAddress,
        gameAddress: ev.gameAddress,
        txHash: ev.txHash,
        blockNumber: ev.blockNumber?.toString() ?? null,
        data: ev.data,
        createdAt: ev.createdAt.toISOString(),
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
          totalRewardsClaimed: 0,
          uniquePlayers: 0,
          uniqueGames: 0,
          updatedAt: null,
        },
      });
    }

    const s = rows[0];
    return c.json({
      data: {
        totalTournaments: s.totalTournaments,
        totalRegistrations: s.totalRegistrations,
        totalPrizes: s.totalPrizes,
        totalRewardsClaimed: s.totalRewardsClaimed,
        uniquePlayers: s.uniquePlayers,
        uniqueGames: s.uniqueGames,
        updatedAt: s.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[activity] stats error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
