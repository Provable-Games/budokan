import { Hono } from "hono";
import { eq, sql, and, desc, SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  tournaments,
  registrations,
  prizes,
} from "../db/schema.js";
import {
  isValidAddress,
  parseLimit,
  parseOffset,
} from "../utils/validation.js";
import { applyPhaseCondition, serializeTournament } from "./tournaments.js";

const app = new Hono();

// ─── GET /:address/tournaments ── Tournaments for a game address ───────────
// Query params: creator, phase, limit, offset
app.get("/:address/tournaments", async (c) => {
  try {
    const gameAddress = isValidAddress(c.req.param("address"));
    if (!gameAddress) {
      return c.json({ error: "Invalid game address" }, 400);
    }

    const creator = isValidAddress(c.req.query("creator"));
    const phase = c.req.query("phase") || null;
    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const conditions: SQL[] = [eq(tournaments.gameAddress, gameAddress)];
    if (creator) conditions.push(eq(tournaments.createdBy, creator));
    if (phase) applyPhaseCondition(phase, conditions);

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
      data: rows.map(serializeTournament),
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

    // Compute stats on the fly from source tables.
    // Registrations no longer carry game_address — JOIN against tournaments.
    const [tournamentCount, registrationCount, prizeCount, playerCount] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tournaments)
          .where(eq(tournaments.gameAddress, gameAddress)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(registrations)
          .innerJoin(
            tournaments,
            eq(registrations.tournamentId, tournaments.tournamentId),
          )
          .where(eq(tournaments.gameAddress, gameAddress)),
        db.execute(sql`
          SELECT count(*)::int AS count
          FROM prizes p
          INNER JOIN tournaments t ON t.tournament_id = p.tournament_id
          WHERE t.game_address = ${gameAddress}
        `),
        db
          .select({ count: sql<number>`count(DISTINCT ${registrations.playerAddress})::int` })
          .from(registrations)
          .innerJoin(
            tournaments,
            eq(registrations.tournamentId, tournaments.tournamentId),
          )
          .where(eq(tournaments.gameAddress, gameAddress)),
      ]);

    return c.json({
      data: {
        gameAddress,
        totalTournaments: tournamentCount[0]?.count ?? 0,
        totalRegistrations: registrationCount[0]?.count ?? 0,
        totalPrizes: (prizeCount.rows as Array<{ count: number }>)[0]?.count ?? 0,
        uniquePlayers: playerCount[0]?.count ?? 0,
      },
    });
  } catch (err) {
    console.error("[games] stats error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
