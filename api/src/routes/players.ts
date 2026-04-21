import { Hono } from "hono";
import { eq, sql, desc, and, inArray, SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  tournaments,
  registrations,
} from "../db/schema.js";
import {
  isValidAddress,
  parseLimit,
  parseOffset,
} from "../utils/validation.js";
import { applyPhaseCondition } from "./tournaments.js";

const app = new Hono();

// ─── GET /:address/tournaments ── Tournaments a player registered for ──────
app.get("/:address/tournaments", async (c) => {
  try {
    const address = isValidAddress(c.req.param("address"));
    if (!address) {
      return c.json({ error: "Invalid player address" }, 400);
    }

    const phase = c.req.query("phase") || null;
    const gameTokenIdsRaw = c.req.query("game_token_ids") || null;
    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const conditions: SQL[] = [eq(registrations.playerAddress, address)];

    // Phase filtering (reuses tournament phase SQL logic)
    if (phase) {
      applyPhaseCondition(phase, conditions);
    }

    // Filter by specific game token IDs
    if (gameTokenIdsRaw) {
      const tokenIds = gameTokenIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (tokenIds.length > 0) {
        conditions.push(inArray(registrations.gameTokenId, tokenIds));
      }
    }

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          registration: registrations,
          tournament: tournaments,
        })
        .from(registrations)
        .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.tournamentId))
        .where(where)
        .orderBy(desc(tournaments.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.tournamentId))
        .where(where),
    ]);

    return c.json({
      data: rows.map((row) => ({
        registration: {
          tournamentId: row.registration.tournamentId.toString(),
          gameTokenId: row.registration.gameTokenId.toString(),
          gameAddress: row.registration.gameAddress,
          entryNumber: row.registration.entryNumber,
          hasSubmitted: row.registration.hasSubmitted,
          isBanned: row.registration.isBanned,
        },
        tournament: {
          id: row.tournament.tournamentId.toString(),
          name: row.tournament.name,
          gameAddress: row.tournament.gameAddress,
          createdAt: row.tournament.createdAt?.toString() ?? null,
          schedule: {
            registration_start_delay: row.tournament.scheduleRegStartDelay,
            registration_end_delay: row.tournament.scheduleRegEndDelay,
            game_start_delay: row.tournament.scheduleGameStartDelay,
            game_end_delay: row.tournament.scheduleGameEndDelay,
            submission_duration: row.tournament.scheduleSubmissionDuration,
          },
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
          AND lb.position <= p.payout_position
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
