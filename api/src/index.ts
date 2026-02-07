import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createNodeWebSocket } from "@hono/node-ws";
import { serve } from "@hono/node-server";

import { healthCheck, shutdown as dbShutdown } from "./db/client.js";
import { rateLimit, cleanupTimer } from "./middleware/rateLimit.js";
import { createWSEvents, initWebSocket, shutdownWebSocket } from "./ws/subscriptions.js";

import tournamentRoutes from "./routes/tournaments.js";
import playerRoutes from "./routes/players.js";
import gameRoutes from "./routes/games.js";
import activityRoutes from "./routes/activity.js";

// ─── App setup ───────────────────────────────────────────────────────────────

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// ─── Global middleware ───────────────────────────────────────────────────────

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// Default rate limit: 100 req/min for most endpoints
app.use("/tournaments/*", rateLimit(100));
app.use("/players/*", rateLimit(100));
app.use("/activity/*", rateLimit(100));

// Tighter rate limit for stats endpoints (30 req/min)
app.use("/games/*/stats", rateLimit(30));
app.use("/players/*/stats", rateLimit(30));
app.use("/games/*/tournaments", rateLimit(100));

// ─── Health check ────────────────────────────────────────────────────────────

app.get("/health", async (c) => {
  const dbOk = await healthCheck();
  const status = dbOk ? 200 : 503;
  return c.json(
    {
      status: dbOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? "connected" : "disconnected",
      },
    },
    status
  );
});

// ─── API routes ──────────────────────────────────────────────────────────────

app.route("/tournaments", tournamentRoutes);
app.route("/players", playerRoutes);
app.route("/games", gameRoutes);
app.route("/activity", activityRoutes);

// ─── WebSocket ───────────────────────────────────────────────────────────────

app.get("/ws", upgradeWebSocket(() => createWSEvents()));

// ─── 404 fallback ────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// ─── Global error handler ────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("[server] Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Server startup ──────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3003;

// Optional TLS support (matches denshokan/quests-api reference pattern)
const TLS_CERT = process.env.TLS_CERT ?? process.env.TLS_CERT_PATH;
const TLS_KEY = process.env.TLS_KEY ?? process.env.TLS_KEY_PATH;

let serverOptions: Parameters<typeof serve>[0] = {
  fetch: app.fetch,
  port: PORT,
};

try {
  if (TLS_CERT && TLS_KEY) {
    const cert = readFileSync(TLS_CERT);
    const key = readFileSync(TLS_KEY);
    serverOptions = { ...serverOptions, createServer, serverOptions: { cert, key } };
    console.log(`[server] TLS certs loaded from ${TLS_CERT}`);
  }
} catch {
  console.log("[server] TLS certs not found, falling back to HTTP");
}

const server = serve(serverOptions, (info) => {
  const protocol = (serverOptions as Record<string, unknown>).createServer ? "https" : "http";
  console.log(`[server] Budokan API listening on ${protocol}://0.0.0.0:${info.port}`);
});

injectWebSocket(server);

// Initialize WebSocket PG listener
initWebSocket().catch((err) => {
  console.error("[server] Failed to initialize WebSocket listener:", err);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[server] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  server.close();

  // Clear rate-limit cleanup timer
  clearInterval(cleanupTimer);

  // Shut down WebSocket connections and PG listener
  await shutdownWebSocket();

  // Drain the database pool
  await dbShutdown();

  console.log("[server] Shutdown complete.");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
