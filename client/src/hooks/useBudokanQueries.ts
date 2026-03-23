/**
 * React hooks wrapping budokan-sdk methods.
 *
 * These hooks provide the same { data, loading, error, refetch } interface
 * that the old useSqlQueries hooks used, making consumer migration seamless.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useBudokanClient } from "@/context/budokan";
import type {
  Tournament,
  TournamentListParams,
  Phase,
} from "@provable-games/budokan-sdk";
// apiMappers removed — hooks now return SDK types directly

// ─── Tab-to-phase mapping ─────────────────────────────────────────────────

export const TAB_TO_PHASE = {
  upcoming: "scheduled",
  live: "live",
  ended: "finalized",
} as const;

// ─── Generic fetch hook ────────────────────────────────────────────────────

interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useAsyncQuery<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[],
): QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const depsKey = JSON.stringify(deps);

  const fetch = useCallback(() => {
    const currentFetcher = fetcherRef.current;
    if (!currentFetcher) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const id = ++requestIdRef.current;
    currentFetcher()
      .then((result) => {
        if (id === requestIdRef.current) setData(result);
      })
      .catch((err) => {
        if (id === requestIdRef.current) {
          setError(err instanceof Error ? err.message : "Unknown error");
          // Preserve last successful data on refetch errors
        }
      })
      .finally(() => {
        if (id === requestIdRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Tournament Count Hooks ────────────────────────────────────────────────

export function useGetTournamentsCount({ active = false }: { active?: boolean }) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active ? () => client.getTournaments({ limit: 1 }).then((r) => r.total ?? 0) : null,
    [active],
  );
}

export function useGetUpcomingTournamentsCount({ active = false }: { active?: boolean }) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active
      ? () => client.getTournaments({ phase: "scheduled", limit: 1 }).then((r) => r.total ?? 0)
      : null,
    [active],
  );
}

export function useGetLiveTournamentsCount({ active = false }: { active?: boolean }) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active
      ? () => client.getTournaments({ phase: "live", limit: 1 }).then((r) => r.total ?? 0)
      : null,
    [active],
  );
}

export function useGetEndedTournamentsCount({ active = false }: { active?: boolean }) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active
      ? () => client.getTournaments({ phase: "finalized", limit: 1 }).then((r) => r.total ?? 0)
      : null,
    [active],
  );
}

export function useGetMyTournamentsCount({
  playerAddress,
  active = false,
}: {
  playerAddress?: string;
  active?: boolean;
}) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active && playerAddress
      ? () => client.getPlayerTournaments(playerAddress, { limit: 1 }).then((r) => r.total ?? 0)
      : null,
    [active, playerAddress],
  );
}

export function useGetMyLiveTournamentsCount({
  playerAddress,
  active = false,
}: {
  playerAddress?: string;
  active?: boolean;
}) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active && playerAddress
      ? () =>
          client
            .getPlayerTournaments(playerAddress, { phase: "live" as Phase, limit: 1 })
            .then((r) => r.total ?? 0)
      : null,
    [active, playerAddress],
  );
}

// ─── Tournament Listing Hooks ──────────────────────────────────────────────

type MappedTournament = Tournament;

interface TournamentListResult {
  data: MappedTournament[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGetTournaments({
  phase,
  gameAddress,
  sort,
  limit = 50,
  offset = 0,
  excludeIds,
  whitelistedExtensions,
  active = false,
}: {
  phase?: Phase;
  gameAddress?: string;
  sort?: "start_time" | "end_time" | "players" | "created_at";
  limit?: number;
  offset?: number;
  excludeIds?: string[];
  whitelistedExtensions?: string[];
  active?: boolean;
}): TournamentListResult {
  const client = useBudokanClient();
  const [data, setData] = useState<MappedTournament[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params: TournamentListParams = useMemo(
    () => ({
      phase,
      gameAddress,
      sort,
      limit,
      offset,
      excludeIds,
      whitelistedExtensions,
      includePrizeSummary: "summary" as const,
    }),
    [phase, gameAddress, sort, limit, offset, JSON.stringify(excludeIds), JSON.stringify(whitelistedExtensions)],
  );

  const paramsKey = JSON.stringify(params);

  const fetch = useCallback(() => {
    if (!active) return;
    setLoading(true);
    setError(null);
    client
      .getTournaments(params)
      .then((result) => {
        setData(result.data);
        setTotal(result.total ?? result.data.length);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setData([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paramsKey, client]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, total, loading, error, refetch: fetch };
}

export function useGetMyTournaments({
  playerAddress,
  gameTokenIds,
  phase,
  limit = 50,
  offset = 0,
  active = false,
}: {
  playerAddress?: string;
  gameTokenIds?: string[];
  phase?: Phase;
  limit?: number;
  offset?: number;
  active?: boolean;
}): TournamentListResult {
  const client = useBudokanClient();
  const [data, setData] = useState<MappedTournament[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    if (!active || !playerAddress) return;
    setLoading(true);
    setError(null);
    client
      .getPlayerTournaments(playerAddress, { phase, gameTokenIds, limit, offset })
      .then((result) => {
        // PlayerTournament includes both registration and tournament data
        const tournaments = result.data;
        setData(tournaments);
        setTotal(result.total ?? result.data.length);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setData([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playerAddress, phase, JSON.stringify(gameTokenIds), limit, offset, client]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, total, loading, error, refetch: fetch };
}

// ─── Tournament Detail Hooks ───────────────────────────────────────────────

export function useGetTournament(tournamentId?: string) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () => client.getTournament(tournamentId)
      : null,
    [tournamentId],
  );
}

export function useGetTournamentLeaderboard(tournamentId?: string) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () =>
          client.getTournamentLeaderboard(tournamentId).then((entries) =>
            entries,
          )
      : null,
    [tournamentId],
  );
}

export function useGetTournamentRegistrations(
  tournamentId?: string,
  params?: { playerAddress?: string; limit?: number; offset?: number },
) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () =>
          client
            .getTournamentRegistrations(tournamentId, params)
            .then((result) => result.data)
      : null,
    [tournamentId, JSON.stringify(params)],
  );
}

export function useGetTournamentPrizes(tournamentId?: string) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () => client.getTournamentPrizes(tournamentId)
      : null,
    [tournamentId],
  );
}

// ─── Reward Claims ─────────────────────────────────────────────────────────

export function useGetTournamentRewardClaims(tournamentId?: string) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () =>
          client
            .getTournamentRewardClaims(tournamentId, { limit: 100 })
            .then((result) => result.data)
      : null,
    [tournamentId],
  );
}

export function useGetTournamentRewardClaimsSummary(tournamentId?: string) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () => client.getTournamentRewardClaimsSummary(tournamentId)
      : null,
    [tournamentId],
  );
}

// ─── Prize Aggregation ─────────────────────────────────────────────────────

export function useGetTournamentPrizeAggregation(tournamentId?: string) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () =>
          client
            .getTournamentPrizes(tournamentId)
            .then((prizes) => {
              // Aggregate prizes by token_address + token_type client-side
              const aggregation = new Map<string, { tokenAddress: string; tokenType: string; totalAmount: bigint; nftCount: number }>();
              for (const p of prizes) {
                const key = `${p.tokenAddress}_${p.tokenType}`;
                const existing = aggregation.get(key);
                const isErc20 = p.tokenType === "erc20";
                const amount = isErc20 ? BigInt(p.amount ?? "0") : 0n;

                if (existing) {
                  existing.totalAmount += amount;
                  if (!isErc20) existing.nftCount++;
                } else {
                  aggregation.set(key, {
                    tokenAddress: p.tokenAddress,
                    tokenType: p.tokenType,
                    totalAmount: amount,
                    nftCount: isErc20 ? 0 : 1,
                  });
                }
              }
              return Array.from(aggregation.values()).map((a) => ({
                ...a,
                totalAmount: a.totalAmount.toString(),
              }));
            })
      : null,
    [tournamentId],
  );
}

// ─── Platform Stats ────────────────────────────────────────────────────────

export function useGetPlatformStats({ active = false }: { active?: boolean }) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active ? () => client.getActivityStats() : null,
    [active],
  );
}

export function useGetPlatformMetrics({ active = false }: { active?: boolean }) {
  const client = useBudokanClient();
  return useAsyncQuery(
    active ? () => client.getActivityStats() : null,
    [active],
  );
}

// ─── Qualifications ────────────────────────────────────────────────────────

export function useGetTournamentQualifications(tournamentId?: string) {
  const client = useBudokanClient();
  return useAsyncQuery(
    tournamentId
      ? () => client.getTournamentQualifications(tournamentId)
      : null,
    [tournamentId],
  );
}
