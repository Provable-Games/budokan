/**
 * Hooks for waiting on indexer confirmation via WebSocket subscriptions.
 * Each wait function subscribes to the relevant channel and resolves when
 * the expected update arrives, with a timeout fallback if the API is down.
 */

import { useBudokanClient } from "@provable-games/budokan-sdk/react";
import type { BudokanClient, WSChannel, WSEventMessage } from "@provable-games/budokan-sdk";
import type { BigNumberish } from "starknet";
import { indexAddress } from "@/lib/utils";

const CONFIRMATION_TIMEOUT_MS = 15000;

function waitForWsEvent(
  client: BudokanClient,
  channels: WSChannel[],
  predicate: (msg: WSEventMessage) => boolean,
  tournamentIds?: string[],
  timeoutMs: number = CONFIRMATION_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    let unsub: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (unsub) unsub();
      if (timer) clearTimeout(timer);
    };

    console.log(`[waitForWsEvent] Subscribing to ${channels.join(",")} (wsConnected=${client.wsConnected})`);

    unsub = client.subscribe(channels, (msg) => {
      console.log(`[waitForWsEvent] Received:`, msg.channel, msg.data);
      if (predicate(msg)) {
        console.log(`[waitForWsEvent] Predicate matched, resolving`);
        cleanup();
        resolve();
      }
    }, tournamentIds);

    timer = setTimeout(() => {
      console.log(`[waitForWsEvent] Timeout after ${timeoutMs}ms, resolving anyway`);
      cleanup();
      resolve();
    }, timeoutMs);
  });
}

export const useEntityUpdates = () => {
  const client = useBudokanClient();

  const waitForTournamentCreation = async (
    _totalTournaments: number,
    creatorAddress?: string,
  ) => {
    await waitForWsEvent(
      client,
      ["tournaments"],
      (msg) => {
        if (msg.channel !== "tournaments") return false;
        if (creatorAddress) {
          const created_by = (msg.data as any)?.created_by;
          return created_by && indexAddress(created_by) === indexAddress(creatorAddress);
        }
        return true;
      },
    );
  };

  const waitForTournamentEntry = async (
    tournamentId: BigNumberish,
    _entryCount: number,
    playerAddress?: string,
  ) => {
    await waitForWsEvent(
      client,
      ["registrations"],
      (msg) => {
        if (msg.channel !== "registrations") return false;
        if (playerAddress) {
          const addr = (msg.data as any)?.player_address;
          return addr && indexAddress(addr) === indexAddress(playerAddress);
        }
        return true;
      },
      [tournamentId.toString()],
    );
  };

  const waitForAddPrizes = async (
    _prizeCount: number,
    tournamentId?: BigNumberish,
  ) => {
    await waitForWsEvent(
      client,
      ["prizes"],
      (msg) => msg.channel === "prizes",
      tournamentId ? [tournamentId.toString()] : undefined,
    );
  };

  const waitForSubmitScores = async (tournamentId: BigNumberish) => {
    await waitForWsEvent(
      client,
      ["leaderboards"],
      (msg) => msg.channel === "leaderboards",
      [tournamentId.toString()],
    );
  };

  const waitForBannedEntry = async (
    tournamentId: BigNumberish,
    _gameTokenId: BigNumberish,
  ) => {
    await waitForWsEvent(
      client,
      ["registrations"],
      (msg) => {
        if (msg.channel !== "registrations") return false;
        return (msg.data as any)?.is_banned === true;
      },
      [tournamentId.toString()],
    );
  };

  return {
    waitForTournamentCreation,
    waitForTournamentEntry,
    waitForAddPrizes,
    waitForSubmitScores,
    waitForBannedEntry,
  };
};
