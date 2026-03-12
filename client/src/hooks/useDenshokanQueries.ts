/**
 * React hooks wrapping denshokan-sdk methods.
 *
 * These hooks replace the metagame-sdk hooks (useMiniGames, useGameTokens,
 * useSettings, etc.) used throughout the client.
 */
import { useState, useEffect, useCallback } from "react";
import { useDenshokanClient } from "@/context/denshokan";
import type { GameTokenData } from "@/lib/types";

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
  const requestIdRef = { current: 0 };

  const depsKey = JSON.stringify(deps);

  const fetch = useCallback(() => {
    if (!fetcher) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const id = ++requestIdRef.current;
    fetcher()
      .then((result) => {
        if (id === requestIdRef.current) setData(result);
      })
      .catch((err: unknown) => {
        if (id === requestIdRef.current) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setData(null);
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

// ─── Games ─────────────────────────────────────────────────────────────────

/**
 * Replaces useMiniGames from metagame-sdk.
 * Returns a list of registered games.
 */
export function useGames(params?: { limit?: number; offset?: number }) {
  const client = useDenshokanClient();
  const { data, loading, error, refetch } = useAsyncQuery(
    async () => {
      const result = await client.getGames(params);
      // Map SDK camelCase shape to legacy snake_case shape expected by consumers
      return result.data.map((game) => ({
        ...game,
        contract_address: game.contractAddress,
        image: game.imageUrl ?? "",
      }));
    },
    [JSON.stringify(params)],
  );
  return { games: data, loading, error, refetch };
}

// ─── Game Tokens ───────────────────────────────────────────────────────────

/**
 * Replaces useGameTokens from metagame-sdk.
 * Returns tokens for a given owner and optionally filtered by game.
 */
export function useGameTokens({
  owner,
  gameAddress,
  gameId,
  limit = 100,
  offset = 0,
  active = true,
}: {
  owner?: string;
  gameAddress?: string;
  gameId?: number;
  limit?: number;
  offset?: number;
  active?: boolean;
}) {
  const client = useDenshokanClient();
  return useAsyncQuery<GameTokenData[]>(
    active && owner
      ? async () => {
          const result = await client.getPlayerTokens(owner, { gameId, limit, offset });
          // Map SDK Token shape (camelCase) to GameTokenData shape (snake_case)
          return result.data.map((token) => ({
            token_id: token.tokenId,
            game_id: token.gameId,
            owner: token.owner,
            player_name: token.playerName,
            score: token.score,
            game_over: token.gameOver,
            lifecycle: {
              start: BigInt(token.startDelay),
              end: BigInt(token.endDelay),
            },
            metadata: {} as Record<string, unknown>,
          }));
        }
      : null,
    [active, owner, gameAddress, gameId, limit, offset],
  );
}

/**
 * Replaces useGetAccountTokenIds.
 * Returns token IDs owned by an address.
 */
export function useAccountTokenIds({
  owner,
  gameAddress,
  active = true,
}: {
  owner?: string;
  gameAddress?: string;
  active?: boolean;
}) {
  const client = useDenshokanClient();
  return useAsyncQuery(
    active && owner
      ? async () => {
          const result = await client.getPlayerTokens(owner, { limit: 1000 });
          return result.data.map((token: { tokenId: string }) => token.tokenId);
        }
      : null,
    [active, owner, gameAddress],
  );
}

// ─── Game Settings ─────────────────────────────────────────────────────────

/**
 * Replaces useGetGameSettings from metagame-sdk/sql.
 */
export function useGameSettings({
  gameAddress,
  limit = 100,
  offset = 0,
  active = true,
}: {
  gameAddress?: string;
  limit?: number;
  offset?: number;
  active?: boolean;
}) {
  const client = useDenshokanClient();
  return useAsyncQuery(
    active
      ? async () => {
          const result = await client.getSettings({ gameAddress, limit, offset });
          return result.data;
        }
      : null,
    [active, gameAddress, limit, offset],
  );
}

/**
 * Replaces useGetGameSetting from metagame-sdk/sql.
 */
export function useGameSetting({
  settingsId,
  gameAddress,
  active = true,
}: {
  settingsId?: number;
  gameAddress?: string;
  active?: boolean;
}) {
  const client = useDenshokanClient();
  return useAsyncQuery(
    active && settingsId !== undefined && gameAddress
      ? () => client.getSetting(settingsId, gameAddress)
      : null,
    [active, settingsId, gameAddress],
  );
}

/**
 * Replaces useGetGameSettingsCount.
 */
export function useGameSettingsCount({
  gameAddress,
  active = true,
}: {
  gameAddress?: string;
  active?: boolean;
}) {
  const client = useDenshokanClient();
  return useAsyncQuery(
    active
      ? async () => {
          const result = await client.getSettings({ gameAddress, limit: 1 });
          return result.total;
        }
      : null,
    [active, gameAddress],
  );
}

// ─── Scores ────────────────────────────────────────────────────────────────

/**
 * Get the score for a specific token.
 */
export function useTokenScore({
  tokenId,
  gameAddress,
  active = true,
}: {
  tokenId?: string;
  gameAddress?: string;
  active?: boolean;
}) {
  const client = useDenshokanClient();
  return useAsyncQuery(
    active && tokenId && gameAddress
      ? async () => {
          const score = await client.score(tokenId, gameAddress);
          return Number(score);
        }
      : null,
    [active, tokenId, gameAddress],
  );
}
