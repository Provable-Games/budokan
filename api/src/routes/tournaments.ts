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
    if (creator) conditions.push(eq(tournaments.creator, creator));

    // Phase filtering based on calculated schedule times
    if (phase) {
      const now = sql`NOW()`;
      switch (phase) {
        case "scheduled":
          // Before registration starts (or before game starts if no registration)
          conditions.push(
            sql`COALESCE(${tournaments.registrationStartTime}, ${tournaments.gameStartTime}) > ${now}`
          );
          break;
        case "registration":
          conditions.push(
            sql`${tournaments.registrationStartTime} IS NOT NULL
              AND ${tournaments.registrationStartTime} <= ${now}
              AND ${tournaments.registrationEndTime} > ${now}`
          );
          break;
        case "staging":
          // Between registration end and game start
          conditions.push(
            sql`${tournaments.registrationEndTime} IS NOT NULL
              AND ${tournaments.registrationEndTime} <= ${now}
              AND ${tournaments.gameStartTime} > ${now}`
          );
          break;
        case "live":
          conditions.push(
            sql`${tournaments.gameStartTime} <= ${now}
              AND ${tournaments.gameEndTime} > ${now}`
          );
          break;
        case "submission":
          conditions.push(
            sql`${tournaments.gameEndTime} <= ${now}
              AND ${tournaments.gameEndTime} + (${tournaments.submissionDuration} * INTERVAL '1 second') > ${now}`
          );
          break;
        case "finalized":
          conditions.push(
            sql`${tournaments.gameEndTime} + (${tournaments.submissionDuration} * INTERVAL '1 second') <= ${now}`
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
          .where(eq(tournaments.id, tournamentId))
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
          .orderBy(asc(leaderboards.rank))
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
        .orderBy(asc(leaderboards.rank))
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
  };
}

function serializeLeaderboardEntry(entry: typeof leaderboards.$inferSelect) {
  return {
    id: entry.id,
    tournamentId: entry.tournamentId.toString(),
    tokenId: entry.tokenId.toString(),
    rank: entry.rank,
    score: entry.score?.toString() ?? null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function serializeRegistration(r: typeof registrations.$inferSelect) {
  return {
    id: r.id,
    tournamentId: r.tournamentId.toString(),
    gameTokenId: r.gameTokenId.toString(),
    gameAddress: r.gameAddress,
    playerAddress: r.playerAddress,
    entryNumber: r.entryNumber,
    hasSubmitted: r.hasSubmitted,
    isBanned: r.isBanned,
    registeredAt: r.registeredAt.toISOString(),
  };
}

function serializePrize(p: typeof prizes.$inferSelect) {
  return {
    id: p.id.toString(),
    tournamentId: p.tournamentId.toString(),
    payoutPosition: p.payoutPosition,
    tokenAddress: p.tokenAddress,
    tokenType: p.tokenType,
    tokenAmount: p.tokenAmount?.toString() ?? null,
    tokenId: p.tokenId?.toString() ?? null,
    sponsorAddress: p.sponsorAddress,
    createdAt: p.createdAt.toISOString(),
  };
}

export default app;
