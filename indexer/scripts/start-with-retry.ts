/**
 * Start the indexer with retry logic for trigger conflicts and transient errors.
 *
 * During rolling deploys the old instance may still hold reorg triggers when
 * the new instance starts.  The sequence:
 *   1. Run db:cleanup (drop stale triggers)
 *   2. Run `apibara start`
 *   3. If it fails with a retryable error (trigger conflict or gRPC disconnect),
 *      re-run cleanup and retry with backoff.
 *
 * Connection drops (gRPC UNAVAILABLE) retry indefinitely — the indexer is a
 * long-running service and transient network failures are expected.
 * Trigger conflicts retry up to MAX_TRIGGER_RETRIES times (rolling deploy).
 * Consecutive failures cap the backoff at MAX_DELAY_MS.
 * If the indexer runs for STABLE_RUN_MS before failing, the backoff resets.
 */

import { execSync, spawn } from "node:child_process";

const MAX_TRIGGER_RETRIES = 5;
const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;
const EARLY_FAILURE_WINDOW_MS = 30_000; // treat crash within 30s as trigger-related
const STABLE_RUN_MS = 5 * 60_000; // 5 minutes = "was running fine, reset backoff"

const RETRYABLE_ERRORS = [
  "already exists",         // trigger conflict during rolling deploy
  "UNAVAILABLE",            // gRPC connection dropped
  "Connection dropped",     // gRPC connection dropped (message variant)
  "DEADLINE_EXCEEDED",      // gRPC timeout
  "INTERNAL",               // transient gRPC server error
  "RESOURCE_EXHAUSTED",     // gRPC rate limiting / overload
];

function runCleanup(): void {
  console.log("[start] Running trigger cleanup...");
  try {
    execSync("npx tsx scripts/cleanup-triggers.ts", {
      stdio: "inherit",
      env: process.env,
    });
  } catch (err) {
    console.warn("[start] Trigger cleanup failed (non-fatal):", err);
  }
}

interface IndexerResult {
  code: number;
  elapsed: number;
  isTriggerConflict: boolean;
  isConnectionDrop: boolean;
}

function startIndexer(): Promise<IndexerResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const passthroughArgs = process.argv.slice(2);
    const child = spawn("npx", ["apibara", "start", ...passthroughArgs], {
      stdio: ["inherit", "inherit", "pipe"],
      env: process.env,
    });

    let stderrBuffer = "";

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      // Cap buffer to avoid unbounded memory growth on long runs
      if (stderrBuffer.length > 100_000) {
        stderrBuffer = stderrBuffer.slice(-50_000);
      }
      process.stderr.write(data);
    });

    child.on("close", (code) => {
      const elapsed = Date.now() - startTime;

      if (code === 0) {
        process.exit(0);
      }

      const isRetryable = RETRYABLE_ERRORS.some((err) =>
        stderrBuffer.includes(err)
      );

      const isTriggerConflict =
        elapsed < EARLY_FAILURE_WINDOW_MS &&
        stderrBuffer.includes("already exists");
      const isConnectionDrop = isRetryable && !stderrBuffer.includes("already exists");

      if (isTriggerConflict || isConnectionDrop) {
        resolve({ code: code ?? 1, elapsed, isTriggerConflict, isConnectionDrop });
      } else {
        // Non-retryable error — exit immediately
        console.error(`[start] Non-retryable error (exit ${code ?? 1}), shutting down.`);
        process.exit(code ?? 1);
      }
    });
  });
}

async function main(): Promise<void> {
  let consecutiveFailures = 0;
  let triggerRetries = 0;

  while (true) {
    runCleanup();

    console.log(
      `[start] Starting indexer (consecutive failures: ${consecutiveFailures})...`
    );
    const result = await startIndexer();

    // If the indexer ran for a while before failing, reset backoff —
    // it was working fine, this is a fresh transient error.
    if (result.elapsed >= STABLE_RUN_MS) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }

    // Trigger conflicts have a hard cap
    if (result.isTriggerConflict) {
      triggerRetries++;
      if (triggerRetries >= MAX_TRIGGER_RETRIES) {
        console.error(
          `[start] Trigger conflict persists after ${MAX_TRIGGER_RETRIES} attempts, giving up.`
        );
        process.exit(result.code);
      }
    }

    const delay = Math.min(INITIAL_DELAY_MS * 2 ** consecutiveFailures, MAX_DELAY_MS);
    console.log(
      `[start] Retryable failure (exit ${result.code}, ran ${Math.round(result.elapsed / 1000)}s), ` +
      `restarting in ${Math.round(delay / 1000)}s...`
    );
    await new Promise((r) => setTimeout(r, delay));
  }
}

main();
