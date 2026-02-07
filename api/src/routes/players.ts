import { Hono } from "hono";
import { eq, sql, desc } from "drizzle-orm";
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

const app = new Hono();

// ─── GET /:address/tournaments ── Tournaments a player registered for ──────
app.get("/:address/tournaments", async (c) => {
  try {
    const address = isValidAddress(c.req.param("address"));
    if (!address) {
      return c.json({ error: "Invalid player address" }, 400);
    }

    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const [rows, countResult] = await Promise.all([
      db
        .select({
          registration: registrations,
          tournament: tournaments,
        })
        .from(registrations)
        .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
        .where(eq(registrations.playerAddress, address))
        .orderBy(desc(tournaments.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(eq(registrations.playerAddress, address)),
    ]);

    return c.json({
      data: rows.map((row) => ({
        registration: {
          id: row.registration.id,
          tournamentId: row.registration.tournamentId.toString(),
          gameTokenId: row.registration.gameTokenId.toString(),
          gameAddress: row.registration.gameAddress,
          entryNumber: row.registration.entryNumber,
          hasSubmitted: row.registration.hasSubmitted,
          isBanned: row.registration.isBanned,
          registeredAt: row.registration.registeredAt.toISOString(),
        },
        tournament: {
          id: row.tournament.id.toString(),
          name: row.tournament.name,
          gameAddress: row.tournament.gameAddress,
          gameStartTime: row.tournament.gameStartTime.toISOString(),
          gameEndTime: row.tournament.gameEndTime.toISOString(),
          createdAt: row.tournament.createdAt.toISOString(),
        },
      })),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[players] tournaments error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:address/stats ── Player aggregate stats ─────────────────────────
app.get("/:address/stats", async (c) => {
  try {
    const address = isValidAddress(c.req.param("address"));
    if (!address) {
      return c.json({ error: "Invalid player address" }, 400);
    }

    // Aggregate stats from registrations and prize claims
    const [tournamentStats, submissionStats, prizeStats] = await Promise.all([
      // Total tournaments entered
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(eq(registrations.playerAddress, address)),
      // Total submissions
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(
          sql`${registrations.playerAddress} = ${address} AND ${registrations.hasSubmitted} = true`
        ),
      // Total prizes won (prizes linked to tournaments where player placed)
      db.execute(sql`
        SELECT count(*)::int AS count
        FROM prizes p
        INNER JOIN leaderboards lb ON lb.tournament_id = p.tournament_id
        INNER JOIN registrations r ON r.tournament_id = lb.tournament_id
          AND r.game_token_id = lb.token_id
        WHERE r.player_address = ${address}
          AND lb.rank <= p.payout_position
      `),
    ]);

    return c.json({
      data: {
        player: address,
        totalTournamentsEntered: tournamentStats[0]?.count ?? 0,
        totalSubmissions: submissionStats[0]?.count ?? 0,
        totalPrizesWon: (prizeStats.rows as Array<{ count: number }>)[0]?.count ?? 0,
      },
    });
  } catch (err) {
    console.error("[players] stats error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
