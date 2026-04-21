import { Hono } from "hono";
import { eq, sql, and, desc, asc, notInArray, inArray, SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  tournaments,
  registrations,
  leaderboards,
  prizes,
  rewardClaims,
  qualificationEntries,
} from "../db/schema.js";
import {
  isValidAddress,
  parseLimit,
  parseOffset,
  parseTournamentId,
} from "../utils/validation.js";

const app = new Hono();

// SQL helpers for computing absolute timestamps from created_at + cumulative delays.
// Each phase delay is relative to the previous phase, not to created_at.
// Registration delays of 0 mean "no registration period" — treat as NULL.
const gameStartTime = sql`(${tournaments.createdAt} + ${tournaments.scheduleGameStartDelay})`;
const gameEndTime = sql`(${tournaments.createdAt} + ${tournaments.scheduleGameStartDelay} + ${tournaments.scheduleGameEndDelay})`;
const regStartTime = sql`CASE WHEN ${tournaments.scheduleRegStartDelay} > 0 THEN (${tournaments.createdAt} + ${tournaments.scheduleRegStartDelay}) ELSE NULL END`;
const regEndTime = sql`CASE WHEN ${tournaments.scheduleRegEndDelay} > 0 THEN (${tournaments.createdAt} + ${tournaments.scheduleRegStartDelay} + ${tournaments.scheduleRegEndDelay}) ELSE NULL END`;
const submissionEndTime = sql`(${tournaments.createdAt} + ${tournaments.scheduleGameStartDelay} + ${tournaments.scheduleGameEndDelay} + ${tournaments.scheduleSubmissionDuration})`;

// ─── GET / ── List tournaments ──────────────────────────────────────────────
// Query params: game_address, creator, phase, sort, include_prizes,
//               exclude_ids, whitelisted_extensions, limit, offset
app.get("/", async (c) => {
  try {
    const gameAddress = isValidAddress(c.req.query("game_address"));
    const creator = isValidAddress(c.req.query("creator"));
    const phase = c.req.query("phase") || null;
    const sort = c.req.query("sort") || "created_at";
    const includePrizes = c.req.query("include_prizes") || null;
    const excludeIdsRaw = c.req.query("exclude_ids") || null;
    const whitelistedExtensionsRaw = c.req.query("whitelisted_extensions") || null;
    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const conditions: SQL[] = [];
    if (gameAddress) conditions.push(eq(tournaments.gameAddress, gameAddress));
    if (creator) conditions.push(eq(tournaments.createdBy, creator));

    // Exclude specific tournament IDs
    if (excludeIdsRaw) {
      const excludeIds = excludeIdsRaw
        .split(",")
        .map((id) => parseTournamentId(id.trim()))
        .filter((id): id is bigint => id !== null);
      if (excludeIds.length > 0) {
        conditions.push(notInArray(tournaments.tournamentId, excludeIds));
      }
    }

    // Whitelist filter for entry_requirement extension addresses
    if (whitelistedExtensionsRaw) {
      const whitelist = whitelistedExtensionsRaw
        .split(",")
        .map((addr) => isValidAddress(addr.trim()))
        .filter((addr): addr is string => addr !== null);
      if (whitelist.length > 0) {
        // Exclude tournaments that have an extension-type entry_requirement
        // whose address is NOT in the provided whitelist
        const addressList = sql.join(whitelist.map(a => sql`${a}`), sql`, `);
        conditions.push(
          sql`NOT (
            ${tournaments.entryRequirementType} = 'extension'
            AND lower(${tournaments.entryRequirementExtensionAddress}) NOT IN (${addressList})
          )`
        );
      }
    }

    // Phase filtering based on Unix-second timestamps computed from created_at + delays
    if (phase) {
      applyPhaseCondition(phase, conditions);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Sort direction
    let orderByClause;
    switch (sort) {
      case "start_time":
        orderByClause = desc(gameStartTime);
        break;
      case "end_time":
        orderByClause = desc(gameEndTime);
        break;
      case "players":
        orderByClause = desc(tournaments.entryCount);
        break;
      case "created_at":
      default:
        orderByClause = desc(tournaments.createdAt);
        break;
    }

    // For finalized phase, put submission-phase tournaments first (still accepting scores)
    const now = sql`EXTRACT(EPOCH FROM NOW())::bigint`;
    const submissionFirst = phase === "finalized"
      ? desc(sql`CASE WHEN ${submissionEndTime} > ${now} THEN 1 ELSE 0 END`)
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(tournaments)
        .where(where)
        .orderBy(...(submissionFirst ? [submissionFirst, orderByClause] : [orderByClause]))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tournaments)
        .where(where),
    ]);

    // Prize aggregation when requested
    let prizeAggregationMap: Map<string, PrizeAggregation[]> | null = null;
    let paidPlacesMap: Map<string, number> | null = null;
    if (includePrizes === "summary" && rows.length > 0) {
      const tournamentIds = rows.map((r) => r.tournamentId);
      [prizeAggregationMap, paidPlacesMap] = await Promise.all([
        fetchPrizeAggregation(tournamentIds),
        fetchPaidPlaces(tournamentIds),
      ]);
    }

    return c.json({
      data: rows.map((r) => {
        const serialized = serializeTournament(r);
        if (prizeAggregationMap) {
          return {
            ...serialized,
            prizeAggregation: prizeAggregationMap.get(serialized.id) ?? [],
            paidPlaces: paidPlacesMap?.get(serialized.id) ?? 0,
          };
        }
        return serialized;
      }),
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

    const [tournamentRows, registrationCount, prizeCount, leaderboardRows, prizeAggMap, paidPlacesMap] =
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
        fetchPrizeAggregation([tournamentId]),
        fetchPaidPlaces([tournamentId]),
      ]);

    if (tournamentRows.length === 0) {
      return c.json({ error: "Tournament not found" }, 404);
    }

    const tid = tournamentId.toString();
    const paidPlacesFromPrizes = paidPlacesMap.get(tid) ?? 0;
    const entryFeeDistCount = Number(
      tournamentRows[0].entryFeeDistributionCount ?? 0,
    );
    const paidPlaces = Math.max(paidPlacesFromPrizes, entryFeeDistCount);

    return c.json({
      data: {
        ...serializeTournament(tournamentRows[0]),
        registrationCount: registrationCount[0]?.count ?? 0,
        prizeCount: prizeCount[0]?.count ?? 0,
        leaderboard: leaderboardRows.map(serializeLeaderboardEntry),
        prizeAggregation: prizeAggMap.get(tid) ?? [],
        paidPlaces,
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
// Query params: player_address, game_token_ids, has_submitted, is_banned, limit, offset
app.get("/:id/registrations", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const playerAddress = isValidAddress(c.req.query("player_address"));
    const gameTokenIdsRaw = c.req.query("game_token_ids");
    const hasSubmitted = c.req.query("has_submitted");
    const isBanned = c.req.query("is_banned");
    const limit = parseLimit(c.req.query("limit"), 50, 1000);
    const offset = parseOffset(c.req.query("offset"));

    const conditions: SQL[] = [eq(registrations.tournamentId, tournamentId)];
    if (playerAddress) conditions.push(eq(registrations.playerAddress, playerAddress));
    if (gameTokenIdsRaw) {
      const raw = [...new Set(gameTokenIdsRaw.split(",").map((id) => id.trim()).filter(Boolean))];
      if (raw.length > 1000) {
        return c.json({ error: "Too many game_token_ids (max 1000)" }, 400);
      }
      const ids: string[] = [];
      for (const id of raw) {
        try {
          ids.push(BigInt(id).toString());
        } catch {
          return c.json({ error: `Invalid game_token_id: ${id}` }, 400);
        }
      }
      if (ids.length > 0) conditions.push(inArray(registrations.gameTokenId, ids));
    }
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

// ─── GET /:id/reward-claims ── Reward claims for tournament ─────────────────
app.get("/:id/reward-claims", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const where = eq(rewardClaims.tournamentId, tournamentId);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(rewardClaims)
        .where(where)
        .orderBy(desc(rewardClaims.createdAtBlock), asc(rewardClaims.eventIndex))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(rewardClaims)
        .where(where),
    ]);

    return c.json({
      data: rows.map(serializeRewardClaim),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[tournaments] reward-claims error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:id/reward-claims/summary ── Reward claims summary ────────────────
//
// Computes total claimable rewards from tournament entry fees + sponsored
// prizes, then subtracts actual claims from the reward_claims table.
app.get("/:id/reward-claims/summary", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const tid = eq(tournaments.tournamentId, tournamentId);

    const [tournamentRows, prizeRows, claimedResult] = await Promise.all([
      db
        .select({
          entryCount: tournaments.entryCount,
          entryFeeAmount: tournaments.entryFeeAmount,
          entryFeeTournamentCreatorShare:
            tournaments.entryFeeTournamentCreatorShare,
          entryFeeGameCreatorShare: tournaments.entryFeeGameCreatorShare,
          entryFeeRefundShare: tournaments.entryFeeRefundShare,
          entryFeeDistributionCount: tournaments.entryFeeDistributionCount,
        })
        .from(tournaments)
        .where(tid)
        .limit(1),
      db
        .select({
          distributionCount: prizes.distributionCount,
        })
        .from(prizes)
        .where(eq(prizes.tournamentId, tournamentId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(rewardClaims)
        .where(eq(rewardClaims.tournamentId, tournamentId)),
    ]);

    // Count entry fee prize slots
    let entryFeePrizeCount = 0;
    const t = tournamentRows[0];
    if (t) {
      const entryCount = t.entryCount ?? 0;
      const amount = BigInt(t.entryFeeAmount ?? "0");
      if (amount > 0n && entryCount > 0) {
        const distCount = Number(t.entryFeeDistributionCount ?? 0);
        if (distCount > 0) entryFeePrizeCount += distCount;
        if (Number(t.entryFeeTournamentCreatorShare ?? 0) > 0)
          entryFeePrizeCount++;
        if (Number(t.entryFeeGameCreatorShare ?? 0) > 0) entryFeePrizeCount++;
        // Per-token refund: one slot per entry when refund share is set.
        if (Number(t.entryFeeRefundShare ?? 0) > 0)
          entryFeePrizeCount += entryCount;
      }
    }

    // Count sponsored prize slots (distributed prizes expand to N positions)
    let sponsoredPrizeCount = 0;
    for (const p of prizeRows) {
      const dc = p.distributionCount ?? 0;
      sponsoredPrizeCount += dc > 0 ? dc : 1;
    }

    const totalPrizes = entryFeePrizeCount + sponsoredPrizeCount;
    const totalClaimed = claimedResult[0]?.count ?? 0;

    return c.json({
      data: {
        totalPrizes,
        totalClaimed,
        totalUnclaimed: Math.max(0, totalPrizes - totalClaimed),
      },
    });
  } catch (err) {
    console.error("[tournaments] reward-claims summary error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── GET /:id/qualifications ── Qualification entries for tournament ────────
app.get("/:id/qualifications", async (c) => {
  try {
    const tournamentId = parseTournamentId(c.req.param("id"));
    if (tournamentId === null) {
      return c.json({ error: "Invalid tournament ID" }, 400);
    }

    const limit = parseLimit(c.req.query("limit"), 50, 100);
    const offset = parseOffset(c.req.query("offset"));

    const where = eq(qualificationEntries.tournamentId, tournamentId);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(qualificationEntries)
        .where(where)
        .orderBy(desc(qualificationEntries.createdAtBlock), asc(qualificationEntries.eventIndex))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(qualificationEntries)
        .where(where),
    ]);

    return c.json({
      data: rows.map(serializeQualificationEntry),
      pagination: {
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[tournaments] qualifications error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Phase condition helper (shared with players route) ─────────────────────

export function applyPhaseCondition(phase: string, conditions: SQL[]): void {
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
      // Includes both submission phase and fully finalized tournaments
      // Submission-phase tournaments appear first (still accepting scores)
      conditions.push(
        sql`${gameEndTime} <= ${now}`
      );
      break;
  }
}

// ─── Prize aggregation helper ───────────────────────────────────────────────

interface PrizeAggregation {
  tokenAddress: string;
  tokenType: string;
  totalAmount: string;
  nftCount: number;
}

async function fetchPrizeAggregation(
  tournamentIds: bigint[],
): Promise<Map<string, PrizeAggregation[]>> {
  if (tournamentIds.length === 0) return new Map();

  const idList = sql.join(tournamentIds.map(id => sql`${id}`), sql`, `);
  const rows = await db.execute(sql`
    SELECT
      tournament_id,
      token_address,
      token_type_name,
      COALESCE(SUM(amount::numeric), 0)::text AS total_amount,
      COUNT(*)::int AS nft_count
    FROM prizes
    WHERE tournament_id IN (${idList})
    GROUP BY tournament_id, token_address, token_type_name
    ORDER BY tournament_id, token_address
  `);

  const map = new Map<string, PrizeAggregation[]>();
  for (const row of rows.rows as Array<{
    tournament_id: string;
    token_address: string;
    token_type_name: string;
    total_amount: string;
    nft_count: number;
  }>) {
    const tid = row.tournament_id.toString();
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid)!.push({
      tokenAddress: row.token_address,
      tokenType: row.token_type_name,
      totalAmount: row.total_amount,
      nftCount: row.nft_count,
    });
  }
  return map;
}

// ─── Paid places helper ─────────────────────────────────────────────────────

async function fetchPaidPlaces(
  tournamentIds: bigint[],
): Promise<Map<string, number>> {
  if (tournamentIds.length === 0) return new Map();

  const idList = sql.join(tournamentIds.map(id => sql`${id}`), sql`, `);
  const rows = await db.execute(sql`
    SELECT tournament_id, COUNT(DISTINCT pos)::int AS paid_places
    FROM (
      SELECT tournament_id, payout_position AS pos FROM prizes
      WHERE tournament_id IN (${idList}) AND payout_position > 0
      UNION
      SELECT tournament_id, generate_series(1, distribution_count) AS pos FROM prizes
      WHERE tournament_id IN (${idList}) AND payout_position = 0 AND distribution_count > 0
    ) t
    GROUP BY tournament_id
  `);

  const map = new Map<string, number>();
  for (const row of rows.rows as Array<{ tournament_id: string; paid_places: number }>) {
    map.set(row.tournament_id.toString(), row.paid_places);
  }
  return map;
}

// ─── Serialization helpers ───────────────────────────────────────────────────

export function serializeTournament(t: typeof tournaments.$inferSelect) {
  // Compute absolute timestamps from created_at + schedule delays.
  // Delays are cumulative: each phase offset is relative to the previous phase.
  const base = Number(t.createdAt ?? 0);
  const regStartDelay = t.scheduleRegStartDelay ?? 0;
  const regEndDelay = t.scheduleRegEndDelay ?? 0;
  const gameStartDelay = t.scheduleGameStartDelay ?? 0;
  const gameEndDelay = t.scheduleGameEndDelay ?? 0;
  const submissionDuration = t.scheduleSubmissionDuration ?? 0;

  const schedule = {
    registration_start_delay: regStartDelay,
    registration_end_delay: regEndDelay,
    game_start_delay: gameStartDelay,
    game_end_delay: gameEndDelay,
    submission_duration: submissionDuration,
  };

  const gameConfig = {
    // Mirror the Cairo `GameConfig` field order for SDK consumers.
    game_address: t.gameAddress,
    settings_id: t.gameConfigSettingsId ?? 0,
    soulbound: t.gameConfigSoulbound ?? false,
    paymaster: t.gameConfigPaymaster ?? false,
    client_url: t.gameConfigClientUrl,
    renderer: t.gameConfigRenderer,
  };

  const entryFee = t.entryFeeTokenAddress
    ? {
        token_address: t.entryFeeTokenAddress,
        amount: t.entryFeeAmount,
        tournament_creator_share: t.entryFeeTournamentCreatorShare ?? 0,
        game_creator_share: t.entryFeeGameCreatorShare ?? 0,
        refund_share: t.entryFeeRefundShare ?? 0,
        distribution: buildDistribution(
          t.entryFeeDistributionType,
          t.entryFeeDistributionWeight,
          t.entryFeeDistributionShares,
        ),
        distribution_count: t.entryFeeDistributionCount ?? 0,
      }
    : null;

  const entryRequirement =
    t.entryRequirementType !== null && t.entryRequirementType !== undefined
      ? {
          entry_limit: t.entryRequirementEntryLimit ?? 0,
          entry_requirement_type: buildEntryRequirementType(
            t.entryRequirementType,
            t.entryRequirementTokenAddress,
            t.entryRequirementExtensionAddress,
            t.entryRequirementExtensionConfig,
          ),
        }
      : null;

  const leaderboardConfig = {
    ascending: t.leaderboardAscending ?? false,
    game_must_be_over: t.leaderboardGameMustBeOver ?? false,
  };

  return {
    id: t.tournamentId.toString(),
    gameAddress: t.gameAddress,
    createdBy: t.createdBy,
    creatorTokenId: t.creatorTokenId ?? null,
    name: t.name,
    description: t.description,
    schedule,
    gameConfig,
    entryFee,
    entryRequirement,
    leaderboardConfig,
    entryCount: t.entryCount,
    prizeCount: t.prizeCount,
    submissionCount: t.submissionCount,
    createdAt: t.createdAt?.toString() ?? null,
    createdAtBlock: t.createdAtBlock?.toString() ?? null,
    txHash: t.txHash,
    // Computed absolute timestamps (Unix seconds)
    registrationStartTime: regStartDelay > 0 ? String(base + regStartDelay) : null,
    registrationEndTime: regEndDelay > 0 ? String(base + regStartDelay + regEndDelay) : null,
    gameStartTime: String(base + gameStartDelay),
    gameEndTime: String(base + gameStartDelay + gameEndDelay),
    submissionEndTime: String(base + gameStartDelay + gameEndDelay + submissionDuration),
  };
}

function buildDistribution(
  type: string | null,
  weight: number | null,
  shares: unknown,
): Record<string, unknown> | null {
  if (!type) return null;
  if (type === "Linear" || type === "Exponential") {
    return { type, weight: weight ?? 0 };
  }
  if (type === "Uniform") {
    return { type };
  }
  if (type === "Custom") {
    return { type, shares: Array.isArray(shares) ? shares : [] };
  }
  return { type };
}

function buildEntryRequirementType(
  type: string,
  tokenAddress: string | null,
  extensionAddress: string | null,
  extensionConfig: unknown,
): Record<string, unknown> {
  if (type === "token") {
    return { type, token_address: tokenAddress };
  }
  if (type === "extension") {
    return {
      type,
      address: extensionAddress,
      config: Array.isArray(extensionConfig) ? extensionConfig : [],
    };
  }
  return { type };
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
    tokenType: p.tokenTypeName,
    amount: p.amount,
    tokenId: p.tokenId,
    distributionType: p.distributionType,
    distributionWeight: p.distributionWeight,
    distributionCount: p.distributionCount,
    sponsorAddress: p.sponsorAddress,
    createdAtBlock: p.createdAtBlock?.toString() ?? null,
    txHash: p.txHash,
  };
}

function serializeRewardClaim(r: typeof rewardClaims.$inferSelect) {
  return {
    tournamentId: r.tournamentId.toString(),
    rewardType: r.rewardType,
    claimed: r.claimed,
    createdAtBlock: r.createdAtBlock?.toString() ?? null,
    txHash: r.txHash,
    eventIndex: r.eventIndex,
  };
}

function serializeQualificationEntry(q: typeof qualificationEntries.$inferSelect) {
  return {
    tournamentId: q.tournamentId.toString(),
    qualificationProof: q.qualificationProof,
    entryCount: q.entryCount,
    createdAtBlock: q.createdAtBlock?.toString() ?? null,
    txHash: q.txHash,
    eventIndex: q.eventIndex,
  };
}

export default app;
