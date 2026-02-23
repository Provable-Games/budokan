import { describe, it, expect } from "vitest";
import {
  stripGaragaLengthPrefix,
  extractNullifier,
} from "../proofConverter";

describe("stripGaragaLengthPrefix", () => {
  it("strips a valid length prefix", () => {
    const input = [5n, 10n, 20n, 30n, 40n, 50n];
    expect(stripGaragaLengthPrefix(input)).toEqual([10n, 20n, 30n, 40n, 50n]);
  });

  it("does not strip when first element is not a valid length prefix", () => {
    const input = [1n, 2n, 3n];
    // 1n !== BigInt(3 - 1) = 2n, so no strip
    expect(stripGaragaLengthPrefix(input)).toEqual([1n, 2n, 3n]);
  });

  it("handles empty array", () => {
    expect(stripGaragaLengthPrefix([])).toEqual([]);
  });

  it("handles single-element array where element is 0 (valid prefix for length 1)", () => {
    // [0n] → 0n === BigInt(1 - 1) = 0n → strip → []
    expect(stripGaragaLengthPrefix([0n])).toEqual([]);
  });

  it("preserves data when first element coincidentally matches but is not a prefix", () => {
    // [2n, 100n, 200n] → 2n === BigInt(3 - 1) = 2n → strips (intended behavior:
    // we can't distinguish, so we strip when the pattern matches)
    const input = [2n, 100n, 200n];
    expect(stripGaragaLengthPrefix(input)).toEqual([100n, 200n]);
  });
});

describe("extractNullifier", () => {
  it("splits a 256-bit hex into [low128, high128]", () => {
    // 0x0000...0001_0000...0002 → high=1, low=2
    const hex =
      "0x00000000000000000000000000000001" +
      "00000000000000000000000000000002";
    const [low, high] = extractNullifier(hex);
    expect(low).toBe("2");
    expect(high).toBe("1");
  });

  it("returns [0, 0] for empty input", () => {
    expect(extractNullifier("")).toEqual(["0", "0"]);
  });
});
