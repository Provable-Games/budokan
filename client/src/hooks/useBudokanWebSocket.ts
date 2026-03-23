/**
 * WebSocket subscription hooks wrapping budokan-sdk.
 *
 * These replace the old subscription hooks (useSubscribeTournamentsQuery,
 * useSubscribeTournamentQuery, useSubscribePrizesQuery, useSubscribeMetricsQuery).
 */
import { useEffect, useState } from "react";
import { useBudokanClient } from "@/context/budokan";
import type { WSChannel, WSEventMessage } from "@provable-games/budokan-sdk";

interface SubscriptionResult {
  lastMessage: WSEventMessage | null;
  isConnected: boolean;
}

/**
 * Generic subscription hook. Connects to WebSocket and subscribes to channels.
 */
function useBudokanSubscription(
  channels: WSChannel[],
  tournamentIds?: string[],
): SubscriptionResult {
  const client = useBudokanClient();
  const [lastMessage, setLastMessage] = useState<WSEventMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (channels.length === 0) return;

    client.connect();

    const unsubscribe = client.subscribe(
      channels,
      (message) => setLastMessage(message),
      tournamentIds,
    );

    const unsubConnection = client.onWsConnectionChange(setIsConnected);

    return () => {
      unsubscribe();
      unsubConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, JSON.stringify(channels), JSON.stringify(tournamentIds)]);

  return { lastMessage, isConnected };
}

/**
 * Replaces useSubscribeTournamentsQuery.
 * Subscribes to tournament, registration, and prize updates globally.
 */
export function useSubscribeTournaments() {
  return useBudokanSubscription(["tournaments", "registrations", "prizes"]);
}

/**
 * Replaces useSubscribeTournamentQuery.
 * Subscribes to updates for a specific tournament.
 */
export function useSubscribeTournament(tournamentId?: string) {
  const ids = tournamentId ? [tournamentId] : undefined;
  return useBudokanSubscription(
    ["tournaments", "registrations", "leaderboards", "prizes", "rewards"],
    ids,
  );
}

/**
 * Replaces useSubscribePrizesQuery.
 * Subscribes to prize updates globally.
 */
export function useSubscribePrizes() {
  return useBudokanSubscription(["prizes"]);
}

/**
 * Replaces useSubscribeMetricsQuery.
 * Subscribes to platform metrics updates.
 * Falls back to polling if metrics channel is not available.
 */
export function useSubscribeMetrics() {
  return useBudokanSubscription(["metrics" as WSChannel]);
}
