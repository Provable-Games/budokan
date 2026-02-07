/**
 * Parse and clamp a "limit" query parameter.
 * Returns the parsed value clamped to [1, max], or `defaultVal` when invalid.
 */
export function parseLimit(raw?: string, defaultVal = 50, max = 100): number {
  if (!raw) return defaultVal;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

/**
 * Parse an "offset" query parameter.
 * Returns the parsed non-negative integer, or 0 when invalid.
 */
export function parseOffset(raw?: string): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

/**
 * Basic hex address validation for Starknet addresses.
 * Returns the lower-cased, 0x-prefixed address or null when invalid.
 */
export function isValidAddress(addr?: string): string | null {
  if (!addr) return null;
  const trimmed = addr.trim().toLowerCase();
  // Accept 0x-prefixed hex strings of 1-64 hex digits
  if (/^0x[0-9a-f]{1,64}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Parse a tournament ID from a string.
 * Tournament IDs are u64 values stored as bigint in the database.
 * Returns null when the value cannot be parsed.
 */
export function parseTournamentId(val?: string): bigint | null {
  if (!val) return null;
  try {
    if (val.startsWith("0x") || val.startsWith("0X")) {
      return BigInt(val);
    }
    const n = BigInt(val);
    if (n < 0n) return null;
    return n;
  } catch {
    return null;
  }
}
