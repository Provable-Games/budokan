import { Hono } from "hono";
import { eq, sql, and, desc, asc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  tournaments,
  registrations,
  leaderboards,
  prizes,
} from "../db/schema.js";
import {
  isValidAddress,
  parseLimit,
  parseOffset,
  parseTournamentId,
} from "../utils/validation.js";

const app = new Hono();

// SQL helpers for computing absolute timestamps from created_at + schedule delays
const gameStartTime = sql`(${tournaments.createdAt} + (${tournaments.schedule}->>'game_start_delay')::bigint)`;
const gameEndTime = sql`(${tournaments.createdAt} + (${tournaments.schedule}->>'game_end_delay')::bigint)`;
const regStartTime = sql`(${tournaments.createdAt} + (${tournaments.schedule}->>'registration_start_delay')::bigint)`;
const regEndTime = sql`(${tournaments.createdAt} + (${tournaments.schedule}->>'registration_end_delay')::bigint)`;
const submissionEndTime = sql`(${tournaments.createdAt} + (${tournaments.schedule}->>'game_end_delay')::bigint + (${tournaments.schedule}->>'submission_duration')::bigint)`;

// ─── GET / ── List tournaments ──────────────────────────────────────────────
// Query params: game_address, creator, phase, limit, offset
app.get("/", async (c) => {
  try {
    const gameAddress = isValidAddress(c.req.query("game_address"));
    const creator = isValidAddress(c.req.query("creator"));
    const phase = c.req.query("phase") || null;
    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const conditions = [];
    if (gameAddress) conditions.push(eq(tournaments.gameAddress, gameAddress));
    if (creator) conditions.push(eq(tournaments.createdBy, creator));

    // Phase filtering based on Unix-second timestamps computed from created_at + delays
    if (phase) {
      const now = sql`EXTRACT(EPOCH FROM NOW())::bigint`;
      switch (phase) {
        case "scheduled":
          conditions.push(
            sql`COALESCE(${regStartTime}, ${gameStartTime}) > ${now}`
          );
          break;
        case "registration":
          conditions.push(
            sql`${regStartTime} IS NOT NULL
              AND ${regStartTime} <= ${now}
              AND ${regEndTime} > ${now}`
          );
          break;
        case "staging":
          conditions.push(
            sql`${regEndTime} IS NOT NULL
              AND ${regEndTime} <= ${now}
              AND ${gameStartTime} > ${now}`
          );
          break;
        case "live":
          conditions.push(
            sql`${gameStartTime} <= ${now}
              AND ${gameEndTime} > ${now}`
          );
          break;
        case "submission":
          conditions.push(
            sql`${gameEndTime} <= ${now}
              AND ${submissionEndTime} > ${now}`
          );
          break;
        case "finalized":
          conditions.push(
            sql`${submissionEndTime} <= ${now}`
          );
          break;
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
    console.error("[tournaments] list error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:id ── Tournament detail with embedded stats ─────────────────────
app.get("/:id", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const [tournamentRows, registrationCount, prizeCount, leaderboardRows] =
      await Promise.all([
        db
          .select()
          .from(tournaments)
          .where(eq(tournaments.tournamentId, tournamentId))
          .limit(1),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(registrations)
          .where(eq(registrations.tournamentId, tournamentId)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(prizes)
          .where(eq(prizes.tournamentId, tournamentId)),
        db
          .select()
          .from(leaderboards)
          .where(eq(leaderboards.tournamentId, tournamentId))
          .orderBy(asc(leaderboards.position))
          .limit(50),
      ]);

    if (tournamentRows.length === 0) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    return c.json({
      data: {
        ...serializeTournament(tournamentRows[0]),
        registrationCount: registrationCount[0]?.count ?? 0,
        prizeCount: prizeCount[0]?.count ?? 0,
        leaderboard: leaderboardRows.map(serializeLeaderboardEntry),
      },
    });
  } catch (err) {
    console.error("[tournaments] detail error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:id/leaderboard ── Leaderboard for tournament ────────────────────
app.get("/:id/leaderboard", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(leaderboards)
        .where(eq(leaderboards.tournamentId, tournamentId))
        .orderBy(asc(leaderboards.position))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leaderboards)
        .where(eq(leaderboards.tournamentId, tournamentId)),
    ]);

    return c.json({
      data: rows.map(serializeLeaderboardEntry),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[tournaments] leaderboard error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:id/registrations ── Registrations for tournament ────────────────
// Query params: player_address, has_submitted, is_banned, limit, offset
app.get("/:id/registrations", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const playerAddress = isValidAddress(c.req.query("player_address"));
    const hasSubmitted = c.req.query("has_submitted");
    const isBanned = c.req.query("is_banned");
    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const conditions = [eq(registrations.tournamentId, tournamentId)];
    if (playerAddress) conditions.push(eq(registrations.playerAddress, playerAddress));
    if (hasSubmitted !== undefined && hasSubmitted !== null) {
      conditions.push(eq(registrations.hasSubmitted, hasSubmitted === "true"));
    }
    if (isBanned !== undefined && isBanned !== null) {
      conditions.push(eq(registrations.isBanned, isBanned === "true"));
    }

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(registrations)
        .where(where)
        .orderBy(asc(registrations.entryNumber))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(where),
    ]);

    return c.json({
      data: rows.map(serializeRegistration),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[tournaments] registrations error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:id/prizes ── Prizes for tournament ─────────────────────────────
app.get("/:id/prizes", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(prizes)
        .where(eq(prizes.tournamentId, tournamentId))
        .orderBy(asc(prizes.payoutPosition))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(prizes)
        .where(eq(prizes.tournamentId, tournamentId)),
    ]);

    return c.json({
      data: rows.map(serializePrize),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[tournaments] prizes error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Serialization helpers ───────────────────────────────────────────────────

function serializeTournament(t: typeof tournaments.$inferSelect) {
  return {
    id: t.tournamentId.toString(),
    gameAddress: t.gameAddress,
    createdBy: t.createdBy,
    creatorTokenId: t.creatorTokenId ?? null,
    name: t.name,
    description: t.description,
    schedule: t.schedule,
    gameConfig: t.gameConfig,
    entryFee: t.entryFee,
    entryRequirement: t.entryRequirement,
    leaderboardConfig: t.leaderboardConfig,
    entryCount: t.entryCount,
    prizeCount: t.prizeCount,
    submissionCount: t.submissionCount,
    createdAt: t.createdAt?.toString() ?? null,
    createdAtBlock: t.createdAtBlock?.toString() ?? null,
    txHash: t.txHash,
  };
}

function serializeLeaderboardEntry(entry: typeof leaderboards.$inferSelect) {
  return {
    tournamentId: entry.tournamentId.toString(),
    tokenId: entry.tokenId.toString(),
    position: entry.position,
  };
}

function serializeRegistration(r: typeof registrations.$inferSelect) {
  return {
    tournamentId: r.tournamentId.toString(),
    gameTokenId: r.gameTokenId.toString(),
    gameAddress: r.gameAddress,
    playerAddress: r.playerAddress,
    entryNumber: r.entryNumber,
    hasSubmitted: r.hasSubmitted,
    isBanned: r.isBanned,
  };
}

function serializePrize(p: typeof prizes.$inferSelect) {
  return {
    prizeId: p.prizeId.toString(),
    tournamentId: p.tournamentId.toString(),
    payoutPosition: p.payoutPosition,
    tokenAddress: p.tokenAddress,
    tokenType: p.tokenType,
    sponsorAddress: p.sponsorAddress,
    createdAtBlock: p.createdAtBlock?.toString() ?? null,
    txHash: p.txHash,
  };
}

export default app;
