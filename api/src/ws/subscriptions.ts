import type { WSContext, WSEvents, WSMessageReceive } from "hono/ws";
import pg from "pg";
import { pool } from "../db/client.js";

// ─── Channel mapping ─────────────────────────────────────────────────────────
// Friendly names clients send  ->  actual PG NOTIFY channels

const CHANNEL_MAP: Record<string, string> = {
  tournaments: "tournament_updates",
  registrations: "registration_updates",
  leaderboards: "leaderboard_updates",
  prizes: "prize_updates",
  rewards: "reward_updates",
};

const VALID_CHANNELS = new Set(Object.values(CHANNEL_MAP));

// Reverse map: PG channel names back to friendly names
const REVERSE_CHANNEL_MAP: Record<string, string> = {};
for (const [friendly, pgCh] of Object.entries(CHANNEL_MAP)) {
  REVERSE_CHANNEL_MAP[pgCh] = friendly;
}

// ─── Subscription state ──────────────────────────────────────────────────────

interface Subscription {
  channels: Set<string>;
  tournamentIds: Set<string>;
}

const clients = new Map<WSContext, Subscription>();

// ─── PG LISTEN client ────────────────────────────────────────────────────────

let pgClient: pg.PoolClient | null = null;
let initialized = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

async function initPgListener(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    pgClient = await pool.connect();

    for (const channel of VALID_CHANNELS) {
      await pgClient.query(`LISTEN ${channel}`);
    }

    pgClient.on("notification", (msg: pg.Notification) => {
      if (!msg.channel || !msg.payload) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.payload);
      } catch {
        parsed = { raw: msg.payload };
      }
      broadcast(msg.channel, parsed);
    });

    pgClient.on("error", (err) => {
      console.error("[ws] PG listener error:", err.message);
      pgClient = null;
      initialized = false;
      scheduleReconnect();
    });

    console.log("[ws] PG LISTEN connected on channels:", [...VALID_CHANNELS].join(", "));
  } catch (err) {
    console.error("[ws] Failed to connect PG listener:", err);
    pgClient = null;
    initialized = false;
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await initPgListener();
  }, 5_000);
}

// ─── Broadcast to subscribed clients ─────────────────────────────────────────

function broadcast(channel: string, payload: unknown): void {
  const friendlyName = REVERSE_CHANNEL_MAP[channel] ?? channel;
  const message = JSON.stringify({
    type: "event",
    channel: friendlyName,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  for (const [ws, sub] of clients) {
    if (!sub.channels.has(channel)) continue;

    // Apply optional tournamentId filter if the payload carries one
    if (sub.tournamentIds.size > 0) {
      const tournamentId =
        (payload as Record<string, unknown>)?.tournamentId ??
        (payload as Record<string, unknown>)?.tournament_id;
      if (tournamentId && !sub.tournamentIds.has(String(tournamentId))) continue;
    }

    try {
      ws.send(message);
    } catch {
      clients.delete(ws);
    }
  }
}

// ─── WebSocket handler (returns WSEvents for Hono upgradeWebSocket) ─────────

export function createWSEvents(): WSEvents {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      initPgListener();

      const sub: Subscription = {
        channels: new Set(),
        tournamentIds: new Set(),
      };
      clients.set(ws, sub);

      ws.send(
        JSON.stringify({
          type: "connected",
          availableChannels: Object.keys(CHANNEL_MAP),
          message:
            "Send { type: 'subscribe', channels: ['tournaments'], tournamentIds?: ['1'] }",
        })
      );
    },

    onMessage(evt: MessageEvent<WSMessageReceive>, ws: WSContext) {
      try {
        const msg = JSON.parse(String(evt.data)) as {
          type: string;
          channels?: string[];
          tournamentIds?: string[];
          channel?: string; // legacy single-channel format
          action?: string; // legacy action format
          tournamentId?: string; // legacy single tournamentId
        };

        const sub = clients.get(ws);
        if (!sub) return;

        // Support both new format (type/channels) and legacy format (action/channel)
        const msgType = msg.type ?? msg.action;

        if (msgType === "subscribe") {
          // New batch format
          if (Array.isArray(msg.channels)) {
            for (const ch of msg.channels) {
              const pgChannel = CHANNEL_MAP[ch];
              if (pgChannel) sub.channels.add(pgChannel);
            }
          }
          // Legacy single channel format
          if (msg.channel) {
            const pgChannel = CHANNEL_MAP[msg.channel];
            if (pgChannel) sub.channels.add(pgChannel);
          }
          // Tournament ID filters
          if (Array.isArray(msg.tournamentIds)) {
            for (const tid of msg.tournamentIds) sub.tournamentIds.add(String(tid));
          }
          if (msg.tournamentId) {
            sub.tournamentIds.add(String(msg.tournamentId));
          }
          ws.send(
            JSON.stringify({ type: "subscribed", channels: [...sub.channels] })
          );
        } else if (msgType === "unsubscribe") {
          if (Array.isArray(msg.channels)) {
            for (const ch of msg.channels) {
              const pgChannel = CHANNEL_MAP[ch];
              if (pgChannel) sub.channels.delete(pgChannel);
            }
          }
          if (msg.channel) {
            const pgChannel = CHANNEL_MAP[msg.channel];
            if (pgChannel) sub.channels.delete(pgChannel);
          }
          ws.send(
            JSON.stringify({ type: "unsubscribed", channels: [...sub.channels] })
          );
        } else if (msgType === "ping") {
          ws.send(
            JSON.stringify({ type: "pong", timestamp: new Date().toISOString() })
          );
        } else {
          ws.send(
            JSON.stringify({
              type: "error",
              message: `Unknown type: ${msgType}. Valid: subscribe, unsubscribe, ping`,
            })
          );
        }
      } catch (e) {
        console.error("[ws] Error processing message:", e);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    },

    onClose(_evt: CloseEvent, ws: WSContext) {
      clients.delete(ws);
    },
  };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export async function initWebSocket(): Promise<void> {
  await initPgListener();
}

export async function shutdownWebSocket(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Close all client connections
  for (const [ws] of clients) {
    try {
      ws.close(1001, "Server shutting down");
    } catch {
      // ignore
    }
  }
  clients.clear();

  // Release PG listener client back to pool
  if (pgClient) {
    try {
      pgClient.release();
    } catch {
      // ignore
    }
    pgClient = null;
    initialized = false;
  }

  console.log("[ws] Shutdown complete");
}
