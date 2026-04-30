import { Hono } from "hono";
import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { tournaments, prizes, rewardClaims } from "../db/schema.js";
import { isValidAddress } from "../utils/validation.js";
import {
  serializeTournament,
  serializePrize,
  serializeRewardClaim,
} from "./tournaments.js";

const app = new Hono();

// Both required for /players/:address/rewards. The endpoint resolves player
// ownership via denshokan's HTTP API (not the indexed registrations table —
// PR #243 dropped attribution-by-address since it goes stale on transfers)
// and bulk-ranks the player's tokens within each finalized tournament's
// leaderboard. Without these we can't talk to denshokan or scope the query
// to Budokan's minted tokens.
const DENSHOKAN_API_URL = process.env.DENSHOKAN_API_URL;
const BUDOKAN_ADDRESS = process.env.BUDOKAN_ADDRESS;

if (!DENSHOKAN_API_URL || !BUDOKAN_ADDRESS) {
  console.warn(
    "[players] DENSHOKAN_API_URL or BUDOKAN_ADDRESS not set; /players/:address/rewards will 503",
  );
}

interface DenshokanToken {
  tokenId: string;
  contextId: number | null;
}

interface DenshokanRank {
  tokenId: string;
  rank: number;
  total: number;
  score: string;
}

// GET /players/:address/rewards
//
// Returns aggregate placement/earnings data for a player based on their
// *current* Budokan-token ownership (not who originally registered). For each
// finalized tournament the player still holds tokens in, we look up their
// final ranks from denshokan and surface placements that landed on a paid
// position. The response includes tournament + prize + reward-claim records
// for those tournaments so the consumer (Profile page) can compute USD
// values and claim status without further round-trips.
//
// Why "currently held tokens" — registrations.player_address was dropped in
// PR #243 because it goes stale on transfer. Source-of-truth for ownership
// is denshokan; this endpoint composes that ownership with budokan's prize
// + reward_claims data.
app.get("/:address/rewards", async (c) => {
  if (!DENSHOKAN_API_URL || !BUDOKAN_ADDRESS) {
    return c.json(
      { error: "Player rewards not configured on this server" },
      503,
    );
  }

  const address = isValidAddress(c.req.param("address"));
  if (!address) {
    return c.json({ error: "Invalid address" }, 400);
  }

  // 1. Resolve Budokan-minted tokens currently owned by the address.
  //    Filter post-fetch by `contextId !== null` rather than passing
  //    `has_context=true`; the latter intersects with `tokens.hasContext`
  //    (the packed-bit flag), which can drop tokens whose flag is 0 even
  //    when they have a real contextId.
  let tokensJson: { data: DenshokanToken[] };
  try {
    const url =
      `${DENSHOKAN_API_URL}/tokens` +
      `?owner=${encodeURIComponent(address)}` +
      `&minter_address=${encodeURIComponent(BUDOKAN_ADDRESS)}` +
      `&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) {
      return c.json(
        { error: `denshokan tokens fetch failed: ${res.status}` },
        502,
      );
    }
    tokensJson = (await res.json()) as { data: DenshokanToken[] };
  } catch (err) {
    console.error("[players] denshokan tokens fetch error:", err);
    return c.json({ error: "denshokan unreachable" }, 502);
  }

  const tournamentTokens = tokensJson.data.filter(
    (t) => t.contextId !== null && t.tokenId,
  );

  // Group by tournament id (contextId).
  const tokensByTournament = new Map<string, string[]>();
  for (const t of tournamentTokens) {
    const tid = String(t.contextId);
    let list = tokensByTournament.get(tid);
    if (!list) {
      list = [];
      tokensByTournament.set(tid, list);
    }
    list.push(t.tokenId);
  }

  if (tokensByTournament.size === 0) {
    return c.json(emptyResponse());
  }

  const tournamentIdsBigInt = Array.from(tokensByTournament.keys()).map(BigInt);

  // 2. Fetch tournament metadata, prizes, and reward claims in parallel.
  const [tournamentRows, prizeRows, claimRows] = await Promise.all([
    db
      .select()
      .from(tournaments)
      .where(inArray(tournaments.tournamentId, tournamentIdsBigInt)),
    db
      .select()
      .from(prizes)
      .where(inArray(prizes.tournamentId, tournamentIdsBigInt)),
    db
      .select()
      .from(rewardClaims)
      .where(inArray(rewardClaims.tournamentId, tournamentIdsBigInt)),
  ]);

  // 3. Restrict to tournaments whose submission window has closed — earlier
  //    phases don't have a final leaderboard and aren't claimable.
  const now = Math.floor(Date.now() / 1000);
  const finalized = tournamentRows.filter((t) => {
    const created = Number(t.createdAt ?? 0);
    if (created === 0) return false;
    const submissionEnd =
      created +
      (t.scheduleGameEndDelay ?? 0) +
      (t.scheduleSubmissionDuration ?? 0);
    return submissionEnd > 0 && submissionEnd <= now;
  });

  if (finalized.length === 0) {
    return c.json(emptyResponse());
  }

  // 4. Determine the highest-paid position per tournament. Used to filter
  //    placements to only those that map to a real prize.
  const prizesByTournament = new Map<
    string,
    Array<typeof prizeRows[number]>
  >();
  for (const p of prizeRows) {
    const tid = p.tournamentId.toString();
    let list = prizesByTournament.get(tid);
    if (!list) {
      list = [];
      prizesByTournament.set(tid, list);
    }
    list.push(p);
  }

  const maxPaidPositionByTournament = new Map<string, number>();
  for (const t of finalized) {
    const tid = t.tournamentId.toString();
    let max = 0;
    for (const p of prizesByTournament.get(tid) ?? []) {
      if ((p.payoutPosition ?? 0) > 0) {
        max = Math.max(max, p.payoutPosition!);
      }
      if ((p.distributionCount ?? 0) > 0) {
        max = Math.max(max, p.distributionCount!);
      }
    }
    if ((t.entryFeeDistributionCount ?? 0) > 0) {
      max = Math.max(max, t.entryFeeDistributionCount!);
    }
    if (max > 0) maxPaidPositionByTournament.set(tid, max);
  }

  // 5. Bulk-rank the player's tokens for each finalized tournament that has
  //    at least one paid position. Parallel fan-out — N tournaments × 1 call.
  const placements: Array<{
    tournamentId: string;
    tokenId: string;
    position: number;
    score: string;
  }> = [];

  await Promise.all(
    finalized.map(async (t) => {
      const tid = t.tournamentId.toString();
      const maxPaid = maxPaidPositionByTournament.get(tid);
      if (!maxPaid) return;

      const tokenIds = tokensByTournament.get(tid);
      if (!tokenIds || tokenIds.length === 0) return;

      let ranksJson: { data: DenshokanRank[] };
      try {
        const res = await fetch(`${DENSHOKAN_API_URL}/tokens/rank`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenIds,
            contextId: Number(tid),
            minterAddress: BUDOKAN_ADDRESS,
          }),
        });
        if (!res.ok) {
          console.error(
            `[players] denshokan bulk-rank failed for tournament ${tid}: ${res.status}`,
          );
          return;
        }
        ranksJson = (await res.json()) as { data: DenshokanRank[] };
      } catch (err) {
        console.error(
          `[players] denshokan bulk-rank error for tournament ${tid}:`,
          err,
        );
        return;
      }

      for (const r of ranksJson.data ?? []) {
        if (r.rank > 0 && r.rank <= maxPaid) {
          placements.push({
            tournamentId: tid,
            tokenId: r.tokenId,
            position: r.rank,
            score: r.score,
          });
        }
      }
    }),
  );

  // 6. Aggregate. Surface only the tournament/prize/claim subsets that map
  //    to placements so consumers don't have to filter again.
  const wins = placements.length;
  const bestPlacement =
    wins > 0 ? Math.min(...placements.map((p) => p.position)) : null;

  const placedTournamentIds = new Set(placements.map((p) => p.tournamentId));
  const placedTournaments = finalized.filter((t) =>
    placedTournamentIds.has(t.tournamentId.toString()),
  );
  const placedPrizes = prizeRows.filter((p) =>
    placedTournamentIds.has(p.tournamentId.toString()),
  );
  const placedClaims = claimRows.filter((c) =>
    placedTournamentIds.has(c.tournamentId.toString()),
  );

  return c.json({
    wins,
    bestPlacement,
    placements,
    tournaments: placedTournaments.map(serializeTournament),
    prizes: placedPrizes.map(serializePrize),
    rewardClaims: placedClaims.map(serializeRewardClaim),
  });
});

function emptyResponse() {
  return {
    wins: 0,
    bestPlacement: null,
    placements: [],
    tournaments: [],
    prizes: [],
    rewardClaims: [],
  };
}

export default app;
