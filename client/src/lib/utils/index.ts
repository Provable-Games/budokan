import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { BigNumberish, shortString } from "starknet";
import { Prize } from "@/generated/models.gen";
import { TOKEN_ADDRESSES } from "@/lib/constants";

// Import from SDK and re-export so all existing `from "@/lib/utils"` imports continue to work
import {
  indexAddress,
  padAddress,
  displayAddress,
  bigintToHex as sdkBigintToHex,
  formatNumber,
  formatPrizeAmount,
  formatUsdValue,
  formatScore,
  formatTime,
  getOrdinalSuffix,
  calculatePayouts,
  calculateDistribution,
  isBefore,
} from "@provable-games/metagame-sdk";

export {
  indexAddress,
  padAddress,
  displayAddress,
  formatNumber,
  formatPrizeAmount,
  formatUsdValue,
  formatScore,
  formatTime,
  getOrdinalSuffix,
  calculatePayouts,
  calculateDistribution,
  isBefore,
};
export type { DistributionType } from "@provable-games/metagame-sdk";

// Re-export new metagame-sdk prize/entry-fee utilities
export {
  aggregatePrizesByPosition,
  aggregatePrizesBySponsor,
  filterClaimablePrizes,
  filterZeroPrizes,
  calculateEntryFeeBreakdown,
  distributePool,
  parseNFTBulkInput,
} from "@provable-games/metagame-sdk";
export type {
  PositionPrizeGroup,
  SponsorContribution,
  EntryFeeBreakdown,
  EntryFeeShares,
  NftPrizeInput,
  NftParseResult,
} from "@provable-games/metagame-sdk";

// Re-export extension utilities and qualification evaluation
export {
  getExtensionAddresses,
  identifyExtensionType,
  parseTournamentValidatorConfig,
  parseERC20BalanceValidatorConfig,
  parseOpusTrovesValidatorConfig,
  parseSnapshotValidatorConfig,
  parseMerkleValidatorConfig,
  parseExtensionConfig,
  getQualifyingModeInfo,
  formatTokenAmount,
  formatCashToUSD,
  evaluateTokenQualification,
  evaluateExtensionQualification,
  evaluateQualification,
} from "@provable-games/metagame-sdk";
export type {
  EntryRequirementVariant,
  ExtensionType,
  TournamentValidatorConfig,
  ERC20BalanceValidatorConfig,
  OpusTrovesValidatorConfig,
  SnapshotValidatorConfig,
  MerkleValidatorConfig,
  MerkleTree,
  QualifyingModeInfo,
  QualificationResult,
  QualificationEntry,
  QualificationProof,
  TokenQualificationInput,
  ExtensionQualificationInput,
} from "@provable-games/metagame-sdk";
export { QualifyingMode } from "@provable-games/metagame-sdk";
export {
  buildQualificationProof,
  buildNFTProof,
  buildTournamentExtensionProof,
  buildExtensionProof,
  buildParticipationMap,
  buildWinMap,
  resolveTournamentQualifications,
} from "@provable-games/metagame-sdk";
export type {
  TournamentRegistration,
  TournamentLeaderboard,
  TournamentQualificationInput,
} from "@provable-games/metagame-sdk";
export {
  calculateOpusTrovesEntries,
  findBannableEntries,
  findAllBannableEntries,
} from "@provable-games/metagame-sdk";

// Wrap SDK's bigintToHex to preserve the `0x${string}` return type expected by consumers
export const bigintToHex = (v: BigNumberish): `0x${string}` =>
  sdkBigintToHex(v) as `0x${string}`;

// --- Client-specific utilities (not in SDK) ---

/**
 * Build an array of basis-point shares that sum to exactly 10000, spread as
 * evenly as possible across `count` positions. Any remainder from integer
 * division is absorbed by position 1 so the contract's strict-sum invariant
 * (sum == BASIS_POINTS) is always satisfied.
 */
export function buildUniformBasisPointShares(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(10000 / count);
  const shares = Array<number>(count).fill(base);
  const remainder = 10000 - base * count;
  if (remainder > 0) shares[0] += remainder;
  return shares;
}

/**
 * Parse a bulk custom-distribution paste into a length-`count` basis-point
 * array. Accepts two formats, auto-detected:
 *
 *   1. Positional list — percentages in order, separated by commas, newlines,
 *      semicolons, tabs, or arbitrary whitespace:
 *        "40, 20, 15, 10, 5, 5, 3, 2"
 *      Extra trailing values raise a warning; missing trailing values leave
 *      the corresponding positions at 0.
 *
 *   2. Position:percentage pairs — any token containing `:` switches the
 *      parser into pair mode for the whole input:
 *        "1:40, 2:20, 3:15"
 *      Positions not covered by a pair remain at 0.
 *
 * Percentages are rounded to the nearest basis point (2-decimal precision).
 * Values outside [0, 100], non-numeric tokens, and out-of-range positions
 * accumulate into `errors`; the share for that slot is left at 0.
 *
 * This does NOT enforce the strict sum == 10000 contract invariant — the
 * caller decides whether to auto-balance, warn, or refuse.
 */
export function parseCustomSharesBulkInput(
  input: string,
  count: number,
): { shares: number[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const shares = Array<number>(count).fill(0);

  const trimmed = input.trim();
  if (!trimmed) {
    errors.push("Paste is empty.");
    return { shares, errors, warnings };
  }
  if (count <= 0) {
    errors.push("No positions to fill — set a paid-places count first.");
    return { shares, errors, warnings };
  }

  const tokens = trimmed
    .split(/[,\n\r;\t]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const hasPairs = tokens.some((t) => t.includes(":"));

  if (hasPairs) {
    for (const token of tokens) {
      const [posRaw, pctRaw] = token.split(":").map((s) => s.trim());
      const pos = Number(posRaw);
      const pct = Number(pctRaw);
      if (!Number.isInteger(pos) || pos < 1 || pos > count) {
        errors.push(`Invalid position "${posRaw}" (must be 1..${count}).`);
        continue;
      }
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        errors.push(
          `Invalid percentage "${pctRaw}" for position ${pos} (must be 0..100).`,
        );
        continue;
      }
      shares[pos - 1] = Math.round(pct * 100);
    }
  } else {
    if (tokens.length > count) {
      warnings.push(
        `Got ${tokens.length} values for ${count} positions — trailing ${
          tokens.length - count
        } value(s) ignored.`,
      );
    } else if (tokens.length < count) {
      warnings.push(
        `Got ${tokens.length} values for ${count} positions — remaining positions set to 0.`,
      );
    }
    for (let i = 0; i < Math.min(tokens.length, count); i++) {
      const pct = Number(tokens[i]);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        errors.push(
          `Invalid percentage "${tokens[i]}" at position ${i + 1} (must be 0..100).`,
        );
        continue;
      }
      shares[i] = Math.round(pct * 100);
    }
  }

  return { shares, errors, warnings };
}

/**
 * Adjust a basis-point share array so its elements sum to exactly 10000.
 * The residual (10000 − current_sum) is applied to the first non-zero slot
 * (or position 1 if all slots are zero). Returns null if adjusting would
 * take any slot negative or above 10000 — callers should fall back to a
 * uniform reset in that case.
 *
 * This mirrors the dust roll-up convention in `buildUniformBasisPointShares`
 * and the Cairo `calculate_share_with_dust` helper: rounding residuals land
 * on position 1 so the sum invariant holds without perturbing the tail.
 */
export function autoBalanceBasisPointShares(
  shares: number[],
): number[] | null {
  if (shares.length === 0) return null;
  const sum = shares.reduce((a, b) => a + (b || 0), 0);
  const residual = 10000 - sum;
  if (residual === 0) return [...shares];
  // Find the first non-zero slot to absorb the residual, preferring slot 0
  // when everything is zero (or when slot 0 is non-zero).
  const target =
    shares[0] > 0 ? 0 : shares.findIndex((v) => v > 0);
  const absorbIndex = target === -1 ? 0 : target;
  const next = shares[absorbIndex] + residual;
  if (next < 0 || next > 10000) return null;
  const out = [...shares];
  out[absorbIndex] = next;
  return out;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function displayPrice(num: number): string {
  if (Math.abs(num) >= 1) {
    return num.toFixed(0);
  } else if (Math.abs(num) > 0) {
    return num.toFixed(2);
  } else {
    return "0";
  }
}

export function roundUSDPrice(price: number): string {
  // Handle negative numbers by applying the same logic to the absolute value
  const isNegative = price < 0;
  const absPrice = Math.abs(price);

  // Get the integer part
  const integerPart = Math.floor(absPrice);

  // Get the decimal part
  const decimalPart = absPrice - integerPart;

  let result: number;

  if (decimalPart <= 0.25) {
    // Round down to the integer
    result = integerPart;
  } else if (decimalPart <= 0.75) {
    // Round to x.50
    result = integerPart + 0.5;
  } else {
    // Round up to the next integer
    result = integerPart + 1;
  }

  // Apply the sign back
  result = isNegative ? -result : result;

  // Format the result
  if (result % 1 === 0) {
    return result.toFixed(0);
  } else {
    return result.toFixed(2);
  }
}

export function formatEth(num: number): string {
  if (Math.abs(num) >= 0.01) {
    return num.toFixed(2);
  } else if (Math.abs(num) >= 0.0001) {
    return num.toFixed(4);
  } else {
    return "0";
  }
}

export function padU32(num: number): string {
  if (num < 0 || num > 0xffffffff) {
    throw new Error("Value out of range for u32");
  }
  const hex = num.toString(16);
  return "0x" + hex.padStart(8, "0");
}

export function padU64(num: bigint): string {
  if (num < 0n || num > 0xffffffffffffffffn) {
    throw new Error("Value out of range for u64");
  }
  const hex = num.toString(16);
  return "0x" + hex.padStart(16, "0");
}

export const stringToFelt = (v: string): BigNumberish =>
  v ? shortString.encodeShortString(v) : "0x0";

export const feltToString = (v: BigNumberish): string => {
  return BigInt(v) > 0n ? shortString.decodeShortString(bigintToHex(v)) : "";
};

export const isPositiveBigint = (v: BigNumberish | null): boolean => {
  try {
    return v != null && BigInt(v) > 0n;
  } catch {
    return false;
  }
};

export function formatBalance(num: BigNumberish): number {
  return Number(num) / 10 ** 18;
}

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("Failed to copy text: ", err);
  }
};

export const removeFieldOrder = <T extends Record<string, any>>(
  obj: T
): Omit<T, "fieldOrder"> => {
  const newObj = { ...obj } as Record<string, any>; // Cast to a non-generic type
  delete newObj.fieldOrder;

  Object.keys(newObj).forEach((key) => {
    if (typeof newObj[key] === "object" && newObj[key] !== null) {
      newObj[key] = removeFieldOrder(newObj[key]);
    }
  });

  return newObj as Omit<T, "fieldOrder">;
};

export const cleanObject = (obj: any): any =>
  Object.keys(obj).reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {} as { [key: string]: any });

export const getRandomInt = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export function getTokenKeyFromValue(searchValue: string): string | null {
  const entry = Object.entries(TOKEN_ADDRESSES).find(
    ([_key, value]) => value === searchValue
  );
  return entry ? entry[0] : null;
}

export const getPrizesByToken = (prizes: Prize[]) => {
  return Object.entries(
    prizes.reduce((acc, prize) => {
      const key = prize.token_address;
      if (!acc[key]) acc[key] = [];
      acc[key].push(prize);
      return acc;
    }, {} as Record<string, typeof prizes>)
  );
};

// pixel borders

type Point = {
  x: number;
  y: number;
};
// from  https://pixelcorners.lukeb.co.uk/
export function generatePixelBorderPath(radius = 4, pixelSize = 4) {
  const points = generatePoints(radius, pixelSize);
  const flipped = flipCoords(points);

  return generatePath(flipped);
}

function generatePath(coords: Point[], reverse = false) {
  const mirroredCoords = mirrorCoords(coords);

  return (reverse ? mirroredCoords : mirroredCoords.reverse())
    .map((point) => {
      return `${point.x} ${point.y}`;
    })
    .join(",\n    ");
}

function generatePoints(radius: number, pixelSize: number, offset = 0) {
  const coords = [];

  const lastCoords = {
    x: -1,
    y: -1,
  };

  for (let i = 270; i > 225; i--) {
    const x =
      Math.floor(radius * Math.sin((2 * Math.PI * i) / 360) + radius + 0.5) *
      pixelSize;
    const y =
      Math.floor(radius * Math.cos((2 * Math.PI * i) / 360) + radius + 0.5) *
      pixelSize;

    if (x !== lastCoords.x || y !== lastCoords.y) {
      lastCoords.x = x;
      lastCoords.y = y;

      coords.push({
        x: x + offset * pixelSize,
        y: y + offset * pixelSize,
      });
    }
  }

  const mergedCoords = mergeCoords(coords);
  const corners = addCorners(mergedCoords);

  return corners;
}

function flipCoords(coords: Point[]) {
  return [
    ...coords,
    ...coords.map(({ x, y }) => ({ x: y, y: x })).reverse(),
  ].filter(({ x, y }, i, arr) => {
    return !i || arr[i - 1].x !== x || arr[i - 1].y !== y;
  });
}

function mergeCoords(coords: Point[]) {
  return coords.reduce((result: Point[], point: Point, index: number) => {
    if (
      index !== coords.length - 1 &&
      point.x === 0 &&
      coords[index + 1].x === 0
    ) {
      return result;
    }

    if (index !== 0 && point.y === 0 && coords[index - 1].y === 0) {
      return result;
    }

    if (
      index !== 0 &&
      index !== coords.length - 1 &&
      point.x === coords[index - 1].x &&
      point.x === coords[index + 1].x
    ) {
      return result;
    }

    result.push(point);
    return result;
  }, []);
}

function addCorners(coords: Point[]) {
  return coords.reduce((result: Point[], point: Point, i: number) => {
    result.push(point);

    if (
      coords.length > 1 &&
      i < coords.length - 1 &&
      coords[i + 1].x !== point.x &&
      coords[i + 1].y !== point.y
    ) {
      result.push({
        x: coords[i + 1].x,
        y: point.y,
      });
    }

    return result;
  }, []);
}

function mirrorCoords(coords: Point[], offset = 0) {
  return [
    ...coords.map(({ x, y }) => ({
      x: offset ? `${x + offset}px` : `${x}px`,
      y: offset ? `${y + offset}px` : `${y}px`,
    })),
    ...coords.map(({ x, y }) => ({
      x: edgeCoord(y, offset),
      y: offset ? `${x + offset}px` : `${x}px`,
    })),
    ...coords.map(({ x, y }) => ({
      x: edgeCoord(x, offset),
      y: edgeCoord(y, offset),
    })),
    ...coords.map(({ x, y }) => ({
      x: offset ? `${y + offset}px` : `${y}px`,
      y: edgeCoord(x, offset),
    })),
  ];
}

function edgeCoord(n: number, offset: number) {
  if (offset) {
    return n === 0
      ? `calc(100% - ${offset}px)`
      : `calc(100% - ${offset + n}px)`;
  }

  return n === 0 ? "100%" : `calc(100% - ${n}px)`;
}

// Helper function to adjust color opacity
export const adjustColorOpacity = (color: string, opacity: number): string => {
  // Handle RGB/RGBA format
  if (color.startsWith("rgb")) {
    const rgbValues = color.match(/\d+/g);
    if (rgbValues && rgbValues.length >= 3) {
      const [r, g, b] = rgbValues;
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }

  // Handle HEX format
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // If the format isn't recognized, return the original color
  console.warn(`Color format not recognized for: ${color}`);
  return color;
};
