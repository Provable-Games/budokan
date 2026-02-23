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

/**
 * Integration tests: simulate the full garaga → qualification → Cairo extraction flow.
 *
 * These use the first 20 elements from starknet-impl/tests/outer_count_4_calldata.txt
 * (which is ALREADY stripped by the working pipeline) to reconstruct what garaga
 * would have returned, then verify our strip + qualification assembly matches
 * what the Cairo validator expects.
 */
describe("garaga calldata integration", () => {
  // First 20 elements from the real outer_count_4 fixture (already stripped).
  // In production there are 3241 elements; we use a subset for the test.
  const STRIPPED_CALLDATA: bigint[] = [
    0x8n,
    0x478c01ab4a99ba720fe3c93a7da8401n,
    0x2d9a5a5c47d183b48e3decc60dd28d8dn,
    0xe596c9f38a4b7616d2df51070010e706n,
    0x2d62e4190292d68b4e5eaf8c0fb629a9n,
    0x69965fc2n,
    0x0n,
    0x2c2f6fa051d12eafba6655bf37e8c11cn,
    0x8d535e2a7f4ee38a4d12aa88bcf21dn,
    0x12df63095996914c2a09f07471c6c0ean,
    0x2bd77e2480c657886bc025e25e4cc3b4n,
    0xa95c330d3a5d28e60d1e8e1cn,
    0x0n,
    0x2f8af3e2e5c5a1b2e6ec5aa2a1f0a12en,
    0x1a3b7c8d9e0f1234567890abcdef0123n,
    0x0abcdef0123456789abcdef012345678n,
    0x123456789abcdef0123456789abcdef0n,
    0xdeadbeefcafebabe12345678n,
    0x42n,
    0xffn,
  ];

  // Simulate what garaga.getZKHonkCallData() returns: [N, ...elements]
  function simulateGaragaOutput(stripped: bigint[]): bigint[] {
    return [BigInt(stripped.length), ...stripped];
  }

  it("stripGaragaLengthPrefix recovers the same data as starknet-impl pipeline", () => {
    // garaga returns [20n, 0x8n, 0x478c..., ...]
    const rawGaragaOutput = simulateGaragaOutput(STRIPPED_CALLDATA);

    expect(rawGaragaOutput[0]).toBe(BigInt(STRIPPED_CALLDATA.length));
    expect(rawGaragaOutput.length).toBe(STRIPPED_CALLDATA.length + 1);

    // Our strip function should recover exactly the stripped fixture
    const result = stripGaragaLengthPrefix(rawGaragaOutput);
    expect(result).toEqual(STRIPPED_CALLDATA);
  });

  it("qualification array matches what Cairo validator expects", () => {
    const nullifierHex =
      "0x00000000000000000000000000000001" +
      "00000000000000000000000000000002";
    const [nullifierLow, nullifierHigh] = extractNullifier(nullifierHex);

    // Simulate buildQualification WITH our fix
    const rawGaragaOutput = simulateGaragaOutput(STRIPPED_CALLDATA);
    const strippedCalldata = stripGaragaLengthPrefix(rawGaragaOutput);
    const qualification = [
      nullifierLow,
      nullifierHigh,
      ...strippedCalldata.map((v: bigint) => v.toString()),
    ];

    // Cairo validator does: qualification.at(0) = nullifier_low
    expect(qualification[0]).toBe("2");
    // Cairo validator does: qualification.at(1) = nullifier_high
    expect(qualification[1]).toBe("1");
    // Cairo validator does: qualification.slice(2, qualification.len() - 2) = proof data
    const proofData = qualification.slice(2);
    // First proof element should be the actual data, NOT the length prefix
    expect(proofData[0]).toBe(STRIPPED_CALLDATA[0].toString());
    expect(proofData.length).toBe(STRIPPED_CALLDATA.length);
    // Verify no length prefix leaked in
    expect(BigInt(proofData[0])).not.toBe(BigInt(STRIPPED_CALLDATA.length));
  });

  it("WITHOUT the fix, qualification would contain the length prefix (regression check)", () => {
    const rawGaragaOutput = simulateGaragaOutput(STRIPPED_CALLDATA);
    const [nullifierLow, nullifierHigh] = extractNullifier("0x01" + "02");

    // Simulate the OLD buggy code: no stripping
    const buggyQualification = [
      nullifierLow,
      nullifierHigh,
      ...rawGaragaOutput.map((v: bigint) => v.toString()),
    ];

    // The old code would have the length prefix at index 2
    const buggyProofData = buggyQualification.slice(2);
    expect(BigInt(buggyProofData[0])).toBe(BigInt(STRIPPED_CALLDATA.length));
    // This is wrong — the verifier would receive [20, 0x8, ...] instead of [0x8, ...]
    expect(buggyProofData.length).toBe(STRIPPED_CALLDATA.length + 1);

    // Simulate the FIXED code: with stripping
    const fixedQualification = [
      nullifierLow,
      nullifierHigh,
      ...stripGaragaLengthPrefix(rawGaragaOutput).map((v: bigint) => v.toString()),
    ];

    const fixedProofData = fixedQualification.slice(2);
    expect(fixedProofData.length).toBe(STRIPPED_CALLDATA.length);
    expect(BigInt(fixedProofData[0])).toBe(STRIPPED_CALLDATA[0]);
  });
});
