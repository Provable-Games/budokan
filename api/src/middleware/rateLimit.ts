import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 60_000; // purge expired entries every minute

/**
 * Periodically remove expired entries from the in-memory store.
 * Export the timer so it can be cleared during graceful shutdown.
 */
export const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Allow the process to exit even if the timer is still active.
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * Create a rate-limiting middleware that allows at most `maxRequests` requests
 * per IP address within a sliding 1-minute window.
 *
 * When the limit is exceeded the middleware responds with 429 Too Many Requests.
 */
export function rateLimit(maxRequests: number) {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const key = `${ip}:${maxRequests}`;
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate-limit headers for every response
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "Too many requests", retryAfter },
        429
      );
    }

    await next();
  };
}
