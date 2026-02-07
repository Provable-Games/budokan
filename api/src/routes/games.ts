import { Hono } from "hono";
import { eq, sql, and, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  tournaments,
  registrations,
  prizes,
  gameStats,
} from "../db/schema.js";
import {
  isValidAddress,
  parseLimit,
  parseOffset,
} from "../utils/validation.js";

const app = new Hono();

// ─── GET /:address/tournaments ── Tournaments for a game address ───────────
// Query params: creator, limit, offset
app.get("/:address/tournaments", async (c) => {
  try {
    const gameAddress = isValidAddress(c.req.param("address"));
    if (!gameAddress) {
      return c.json({ error: "Invalid game address" }, 400);
    }

    const creator = isValidAddress(c.req.query("creator"));
    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const conditions = [eq(tournaments.gameAddress, gameAddress)];
    if (creator) conditions.push(eq(tournaments.creator, creator));

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(tournaments)
        .where(where)
        .orderBy(desc(tournaments.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tournaments)
        .where(where),
    ]);

    return c.json({
      data: rows.map((t) => ({
        id: t.id.toString(),
        gameAddress: t.gameAddress,
        creator: t.creator,
        creatorTokenId: t.creatorTokenId?.toString() ?? null,
        name: t.name,
        description: t.description,
        registrationStartTime: t.registrationStartTime?.toISOString() ?? null,
        registrationEndTime: t.registrationEndTime?.toISOString() ?? null,
        gameStartTime: t.gameStartTime.toISOString(),
        gameEndTime: t.gameEndTime.toISOString(),
        submissionDuration: t.submissionDuration,
        settingsId: t.settingsId,
        soulbound: t.soulbound,
        playUrl: t.playUrl,
        entryFeeToken: t.entryFeeToken,
        entryFeeAmount: t.entryFeeAmount?.toString() ?? null,
        hasEntryRequirement: t.hasEntryRequirement,
        createdAt: t.createdAt.toISOString(),
        metadata: t.metadata,
      })),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[games] tournaments error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:address/stats ── Game aggregate stats ───────────────────────────
app.get("/:address/stats", async (c) => {
  try {
    const gameAddress = isValidAddress(c.req.param("address"));
    if (!gameAddress) {
      return c.json({ error: "Invalid game address" }, 400);
    }

    // First try the materialized stats table
    const statsRows = await db
      .select()
      .from(gameStats)
      .where(eq(gameStats.gameAddress, gameAddress))
      .limit(1);

    if (statsRows.length > 0) {
      const s = statsRows[0];
      return c.json({
        data: {
          gameAddress: s.gameAddress,
          totalTournaments: s.totalTournaments,
          totalRegistrations: s.totalRegistrations,
          totalPrizes: s.totalPrizes,
          uniquePlayers: s.uniquePlayers,
          updatedAt: s.updatedAt.toISOString(),
        },
      });
    }

    // Fallback: compute stats on the fly
    const [tournamentCount, registrationCount, prizeCount, playerCount] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tournaments)
          .where(eq(tournaments.gameAddress, gameAddress)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(registrations)
          .where(eq(registrations.gameAddress, gameAddress)),
        db.execute(sql`
          SELECT count(*)::int AS count
          FROM prizes p
          INNER JOIN tournaments t ON t.id = p.tournament_id
          WHERE t.game_address = ${gameAddress}
        `),
        db
          .select({ count: sql<number>`count(DISTINCT ${registrations.playerAddress})::int` })
          .from(registrations)
          .where(eq(registrations.gameAddress, gameAddress)),
      ]);

    return c.json({
      data: {
        gameAddress,
        totalTournaments: tournamentCount[0]?.count ?? 0,
        totalRegistrations: registrationCount[0]?.count ?? 0,
        totalPrizes: (prizeCount.rows as Array<{ count: number }>)[0]?.count ?? 0,
        uniquePlayers: playerCount[0]?.count ?? 0,
        updatedAt: null,
      },
    });
  } catch (err) {
    console.error("[games] stats error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
