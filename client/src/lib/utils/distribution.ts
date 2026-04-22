/**
 * Robust parser for the Cairo `Distribution` enum as returned by the
 * Budokan API / SDK.
 *
 * The on-chain enum stores `Linear(weight)`, `Exponential(weight)`,
 * `Uniform`, or `Custom(weights[])`. Depending on whether it comes back via
 * starknet.js's CairoCustomEnum, the JSON indexer, or a plain lower-cased
 * API payload, it can show up in a few different shapes:
 *
 *   - starknet.js v9: `{ variant: { Exponential: 100 } }`
 *   - SDK type (PascalCase keys): `{ Exponential: 100 }`
 *   - Lowercased JSON: `{ exponential: 100 }`
 *   - Explicit shape: `{ type: "exponential", weight: 100 }`
 *
 * We normalize them all down to `{ type, weight }` so downstream math
 * doesn't have to guess.
 */

export type DistributionKind =
  | "linear"
  | "exponential"
  | "uniform"
  | "custom"
  | "unknown";

export interface ParsedDistribution {
  type: DistributionKind;
  /** Raw weight as stored on-chain (for Linear/Exponential). For Uniform/Custom this is 0. */
  weight: number;
  /** For Custom distributions, the raw weights array. */
  customWeights?: number[];
}

const KNOWN_KEYS: Record<string, DistributionKind> = {
  linear: "linear",
  exponential: "exponential",
  uniform: "uniform",
  custom: "custom",
};

export function parseDistribution(dist: unknown): ParsedDistribution {
  if (!dist || typeof dist !== "object") {
    return { type: "unknown", weight: 0 };
  }

  // `{ type, weight }` explicit shape
  const explicit = dist as { type?: string; weight?: number | string };
  if (explicit.type) {
    const kind = KNOWN_KEYS[explicit.type.toLowerCase()] ?? "unknown";
    return {
      type: kind,
      weight: Number(explicit.weight ?? 0),
    };
  }

  // Unwrap the CairoCustomEnum `.variant` layer if present
  const bag =
    ((dist as { variant?: Record<string, unknown> }).variant ??
      (dist as Record<string, unknown>)) as Record<string, unknown>;

  // Find the first key whose value is not undefined (Cairo enums mark the
  // active variant by setting that key's value to a non-undefined value).
  for (const [rawKey, value] of Object.entries(bag)) {
    if (value === undefined || value === null) continue;
    const kind = KNOWN_KEYS[rawKey.toLowerCase()];
    if (!kind) continue;

    if (kind === "uniform") {
      return { type: "uniform", weight: 0 };
    }

    if (kind === "custom") {
      const arr = Array.isArray(value) ? value.map((v) => Number(v)) : [];
      return { type: "custom", weight: 0, customWeights: arr };
    }

    // Linear / Exponential carry a numeric weight
    if (typeof value === "number" || typeof value === "string") {
      return { type: kind, weight: Number(value) };
    }
    if (typeof value === "bigint") {
      return { type: kind, weight: Number(value) };
    }
    // nested { Some: n } (Cairo Option wrapping)
    if (typeof value === "object" && value !== null && "Some" in value) {
      return { type: kind, weight: Number((value as { Some: unknown }).Some) };
    }
    // Fallback — truthy value but non-numeric. Treat as weight 0.
    return { type: kind, weight: 0 };
  }

  return { type: "unknown", weight: 0 };
}
