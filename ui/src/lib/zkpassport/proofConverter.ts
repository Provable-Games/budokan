/**
 * ZKPassport Proof Converter
 *
 * Converts ZKPassport SDK proofs into Garaga Starknet calldata format.
 * Uses dynamic imports for Garaga WASM and ZKPassport registry to keep
 * initial bundle size small.
 */

/**
 * Proof data collected from the ZKPassport SDK's onProofGenerated callback.
 * We only store the fields we need for conversion.
 */
export interface CollectedProof {
  proof: string; // hex-encoded proof
  name: string; // circuit name (e.g., "outer_6")
  version?: string; // circuit version
}

/**
 * ZKPassport deploys circuit manifests and vkeys only to the Ethereum Sepolia
 * registry, regardless of which Starknet chain is in use.
 */
const ZKPASSPORT_REGISTRY_CHAIN_ID = 11155111; // Ethereum Sepolia

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

interface HonkVkHeader {
  logCircuitSize: number;
  publicInputsSize: number;
}

// Garaga Rust parser layout before sumcheck:
// pairing_point_object (16) + 9 G1 points (18) + libra_sum (1) = 35 fields
const LEGACY_PREFIX_FIELDS = 35;
// Garaga Rust parser layout after sumcheck for log_n = variable:
// 41 evals + 1 + 6 + 1 + 2*(log_n-1) + log_n + 4 + 4 = 121 fields when log_n terms are excluded
const LEGACY_SUFFIX_FIELDS = 121;
const LEGACY_UNIVARIATE_FIELDS = 9;
const NEW_UNIVARIATE_FIELDS = 16;

function parseHonkVkHeader(vkeyBytes: Uint8Array): HonkVkHeader | undefined {
  if (vkeyBytes.length < 96) {
    return undefined;
  }

  const readWordAsNumber = (offset: number): number | undefined => {
    const hex = Array.from(vkeyBytes.slice(offset, offset + 32))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const value = BigInt("0x" + hex);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return undefined;
    }
    return Number(value);
  };

  const logCircuitSize = readWordAsNumber(0);
  const publicInputsSize = readWordAsNumber(32);

  if (
    logCircuitSize === undefined ||
    publicInputsSize === undefined ||
    logCircuitSize <= 0 ||
    publicInputsSize <= 0
  ) {
    return undefined;
  }

  return { logCircuitSize, publicInputsSize };
}

/**
 * Compatibility fallback for newer outer_count_4 proofs whose sumcheck block
 * contains 16 values per round instead of the legacy 9 expected by Garaga 1.0.1.
 *
 * This keeps the verifier-critical layout intact and only truncates the extra
 * 7 values per round before retrying calldata generation.
 */
function tryRecoverLegacyProofLayout(
  proofBytes: Uint8Array,
  logCircuitSize: number,
): Uint8Array | undefined {
  if (proofBytes.length % 32 !== 0 || logCircuitSize <= 0) {
    return undefined;
  }

  const expectedNewFields =
    LEGACY_PREFIX_FIELDS +
    logCircuitSize * NEW_UNIVARIATE_FIELDS +
    LEGACY_SUFFIX_FIELDS;

  const currentFields = proofBytes.length / 32;
  if (currentFields !== expectedNewFields) {
    return undefined;
  }

  const expectedLegacyFields =
    LEGACY_PREFIX_FIELDS +
    logCircuitSize * LEGACY_UNIVARIATE_FIELDS +
    LEGACY_SUFFIX_FIELDS;

  const recovered = new Uint8Array(expectedLegacyFields * 32);
  let outOffset = 0;

  const copyFieldRange = (startField: number, count: number) => {
    const start = startField * 32;
    const end = (startField + count) * 32;
    recovered.set(proofBytes.slice(start, end), outOffset);
    outOffset += count * 32;
  };

  // Prefix (commitments and fixed header section)
  copyFieldRange(0, LEGACY_PREFIX_FIELDS);

  // Sumcheck univariates: keep the first 9 values per round
  const sumcheckStart = LEGACY_PREFIX_FIELDS;
  for (let i = 0; i < logCircuitSize; i++) {
    const roundStart = sumcheckStart + i * NEW_UNIVARIATE_FIELDS;
    copyFieldRange(roundStart, LEGACY_UNIVARIATE_FIELDS);
  }

  // Suffix (sumcheck evaluations + Gemini + KZG section)
  const suffixStart = sumcheckStart + logCircuitSize * NEW_UNIVARIATE_FIELDS;
  copyFieldRange(suffixStart, LEGACY_SUFFIX_FIELDS);

  return recovered;
}

function inferLogCircuitSizeFromLengths(
  proofLengthBytes: number,
  expectedLengthBytes: number,
): number | undefined {
  if (
    proofLengthBytes <= 0 ||
    expectedLengthBytes <= 0 ||
    proofLengthBytes % 32 !== 0 ||
    expectedLengthBytes % 32 !== 0 ||
    proofLengthBytes <= expectedLengthBytes
  ) {
    return undefined;
  }

  const proofFields = proofLengthBytes / 32;
  const expectedFields = expectedLengthBytes / 32;
  const extraPerRound = NEW_UNIVARIATE_FIELDS - LEGACY_UNIVARIATE_FIELDS;
  const deltaFields = proofFields - expectedFields;

  if (deltaFields % extraPerRound !== 0) {
    return undefined;
  }

  const logCircuitSize = deltaFields / extraPerRound;
  if (logCircuitSize <= 0) {
    return undefined;
  }

  const reconstructedLegacyFields =
    LEGACY_PREFIX_FIELDS +
    logCircuitSize * LEGACY_UNIVARIATE_FIELDS +
    LEGACY_SUFFIX_FIELDS;
  const reconstructedNewFields =
    LEGACY_PREFIX_FIELDS +
    logCircuitSize * NEW_UNIVARIATE_FIELDS +
    LEGACY_SUFFIX_FIELDS;

  if (
    reconstructedLegacyFields !== expectedFields ||
    reconstructedNewFields !== proofFields
  ) {
    return undefined;
  }

  return logCircuitSize;
}

function parseExpectedProofLength(error: unknown): number | undefined {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : undefined;
  if (!message) return undefined;

  const match = message.match(/expected\s+(\d+)\)?/i);
  if (!match) {
    return undefined;
  }
  const expected = Number(match[1]);
  return Number.isFinite(expected) ? expected : undefined;
}

/**
 * Strips the length prefix that `garaga.getZKHonkCallData()` prepends.
 *
 * Garaga returns `[N, elem0, elem1, ..., elemN-1]` where `N` is the count
 * of remaining elements. Starknet's `CallData.compile()` adds its own
 * serialization prefix, so we must strip the garaga one first.
 */
export function stripGaragaLengthPrefix(calldata: bigint[]): bigint[] {
  if (calldata.length > 0 && calldata[0] === BigInt(calldata.length - 1)) {
    return calldata.slice(1);
  }
  return calldata;
}

/**
 * Extracts a nullifier from a 256-bit unique identifier string.
 * Splits into [low_128, high_128] for Starknet u256 representation.
 */
export function extractNullifier(
  uniqueIdentifier: string
): [string, string] {
  if (!uniqueIdentifier) {
    return ["0", "0"];
  }

  // Remove 0x prefix if present
  const hex = uniqueIdentifier.startsWith("0x")
    ? uniqueIdentifier.slice(2)
    : uniqueIdentifier;

  const fullBigInt = BigInt("0x" + hex);

  // Split into low 128 bits and high 128 bits
  const mask128 = (1n << 128n) - 1n;
  const low = fullBigInt & mask128;
  const high = fullBigInt >> 128n;

  return [low.toString(), high.toString()];
}

/**
 * Finds the outer (recursive) proof from the collected proofs.
 * The outer proof wraps all inner proofs and is what gets verified on-chain.
 */
function findOuterProof(proofs: CollectedProof[]): CollectedProof | undefined {
  const startsWithOuter = proofs.find((p) =>
    p.name?.toLowerCase().startsWith("outer"),
  );
  if (startsWithOuter) {
    return startsWithOuter;
  }

  const containsOuter = proofs.find((p) =>
    p.name?.toLowerCase().includes("outer"),
  );
  if (containsOuter) {
    return containsOuter;
  }
  return undefined;
}

/**
 * Extracts the scoped nullifier directly from the outer proof's public inputs.
 * Used as a fallback when the SDK's verify() fails (e.g. registry unavailable)
 * and doesn't return a uniqueIdentifier via onResult.
 */
export async function extractNullifierFromProof(proofs: CollectedProof[]): Promise<string | undefined> {
  const outerProof = findOuterProof(proofs);
  if (!outerProof?.proof) {
    console.warn("[ZKPassport] No outer proof found in collected proofs", {
      proofCount: proofs.length,
      proofNames: proofs.map((p) => p.name),
    });
    return undefined;
  }

  console.log("[ZKPassport] Extracting nullifier from outer proof:", outerProof.name);

  const { getProofData, getNumberOfPublicInputs } = await import("@zkpassport/utils");
  const { getNullifierFromOuterProof } = await import("@zkpassport/utils/recursion");

  const numPublicInputs = getNumberOfPublicInputs(outerProof.name);
  const proofData = getProofData(outerProof.proof, numPublicInputs);
  const nullifier: bigint = getNullifierFromOuterProof(proofData);

  console.log("[ZKPassport] Extracted nullifier:", nullifier.toString(16).slice(0, 16) + "...");

  return "0x" + nullifier.toString(16);
}

/**
 * Validates a proof by calling the deployed Garaga verifier contract via RPC.
 * Replaces the broken client-side SDK verify() which fails due to CORS.
 *
 * @param proofCalldata - The Garaga calldata array
 * @param verifierAddress - On-chain Garaga Honk verifier contract address
 * @param provider - Starknet provider with callContract method
 * @returns Object with valid flag and optional public inputs
 */
export async function verifyProofViaRPC(
  proofCalldata: string[],
  verifierAddress: string,
  provider: { callContract: (call: { contractAddress: string; entrypoint: string; calldata: string[] }) => Promise<string[]> },
): Promise<{ valid: boolean; publicInputs?: bigint[] }> {
  const { CallData } = await import("starknet");

  const result = await provider.callContract({
    contractAddress: verifierAddress,
    entrypoint: "verify_ultra_keccak_zk_honk_proof",
    calldata: CallData.compile([proofCalldata]),
  });

  // Result<Span<u256>, felt252>: Ok=[0, count, ...values], Err=[1, error]
  if (BigInt(result[0]) === 0n) {
    const count = Number(BigInt(result[1]));
    const publicInputs: bigint[] = [];
    for (let i = 0; i < count; i++) {
      const low = BigInt(result[2 + i * 2]);
      const high = BigInt(result[3 + i * 2]);
      publicInputs.push((high << 128n) | low);
    }
    return { valid: true, publicInputs };
  }
  return { valid: false };
}

/**
 * Builds the complete qualification proof for the ZKPassport validator contract.
 *
 * The qualification format is: [nullifier_low, nullifier_high, ...garaga_calldata]
 *
 * @param proofs - Array of collected proof results from the ZKPassport SDK
 * @param uniqueIdentifier - The unique identifier (nullifier) from the SDK result
 * @returns Array of string values for the Extension qualification proof
 */
export async function buildQualification(
  proofs: CollectedProof[],
  uniqueIdentifier: string,
): Promise<string[]> {
  // Extract nullifier as [low, high]
  const [nullifierLow, nullifierHigh] = extractNullifier(uniqueIdentifier);

  // Find the outer proof (the one verified on-chain)
  const outerProof = findOuterProof(proofs);
  if (!outerProof || !outerProof.proof) {
    throw new Error("No valid outer proof found in ZKPassport result");
  }

  // Lazy-load registry client to fetch the verification key
  const { RegistryClient } = await import("@zkpassport/registry");
  const registryClient = new RegistryClient({ chainId: ZKPASSPORT_REGISTRY_CHAIN_ID });
  const circuitManifest = await registryClient.getCircuitManifest(undefined, {
    version: outerProof.version,
  });
  const packagedCircuit = await registryClient.getPackagedCircuit(
    outerProof.name,
    circuitManifest,
    { validate: false },
  );

  // Decode vkey from base64
  const vkeyBytes = Uint8Array.from(atob(packagedCircuit.vkey), (c) =>
    c.charCodeAt(0),
  );

  const vkHeader = parseHonkVkHeader(vkeyBytes);

  // Lazy-load ZKPassport utils for proof parsing
  const { getNumberOfPublicInputs, getNumberOfPublicInputsFromVkey } =
    await import("@zkpassport/utils");
  const numPublicInputsFromName = getNumberOfPublicInputs(outerProof.name);
  const numPublicInputsFromVkey = getNumberOfPublicInputsFromVkey(vkeyBytes);
  const numPublicInputsFromVk =
    vkHeader && vkHeader.publicInputsSize >= 16
      ? vkHeader.publicInputsSize - 16
      : undefined;
  const numPublicInputs =
    numPublicInputsFromVkey ?? numPublicInputsFromVk ?? numPublicInputsFromName;

  // Parse raw proof hex into bytes. The format is:
  //   [publicInput0 (32 bytes)][publicInput1 (32 bytes)]...[raw proof bytes]
  // Garaga needs the raw proof bytes and public input bytes separately.
  const rawBytes = hexToBytes(outerProof.proof);
  const publicInputsByteLength = numPublicInputs * 32;
  const publicInputsBytes = rawBytes.slice(0, publicInputsByteLength);
  const proofBytes = rawBytes.slice(publicInputsByteLength);

  console.log("[ZKPassport] Proof split:", {
    rawLength: rawBytes.length,
    numPublicInputs,
    numPublicInputsFromName,
    numPublicInputsFromVkey,
    numPublicInputsFromVk,
    vkLength: vkeyBytes.length,
    vkLogCircuitSize: vkHeader?.logCircuitSize,
    publicInputsLength: publicInputsBytes.length,
    proofLength: proofBytes.length,
  });

  // Lazy-load Garaga WASM module and initialize before use
  const garaga = await import("garaga");
  await garaga.init();

  let garagaCalldata: bigint[];
  try {
    garagaCalldata = garaga.getZKHonkCallData(
      proofBytes,
      publicInputsBytes,
      vkeyBytes,
    );
  } catch (error) {
    const expectedProofLength = parseExpectedProofLength(error);
    const inferredLogCircuitSize =
      expectedProofLength !== undefined
        ? inferLogCircuitSizeFromLengths(proofBytes.length, expectedProofLength)
        : undefined;
    const logCircuitSizeForRecovery =
      vkHeader?.logCircuitSize ?? inferredLogCircuitSize;

    const recoveredProofBytes =
      expectedProofLength !== undefined &&
      proofBytes.length > expectedProofLength &&
      logCircuitSizeForRecovery !== undefined
        ? tryRecoverLegacyProofLayout(proofBytes, logCircuitSizeForRecovery)
        : undefined;

    if (
      recoveredProofBytes &&
      expectedProofLength !== undefined &&
      recoveredProofBytes.length === expectedProofLength
    ) {
      console.warn(
        "[ZKPassport] Retrying calldata generation with legacy-compatible proof layout",
        {
          originalProofLength: proofBytes.length,
          recoveredProofLength: recoveredProofBytes.length,
          expectedProofLength,
          logCircuitSizeForRecovery,
        },
      );

      garagaCalldata = garaga.getZKHonkCallData(
        recoveredProofBytes,
        publicInputsBytes,
        vkeyBytes,
      );
    } else {
      throw error;
    }
  }

  // Strip the length prefix that garaga prepends before building qualification
  const strippedCalldata = stripGaragaLengthPrefix(garagaCalldata);

  // Build final qualification: [nullifier_low, nullifier_high, ...garaga_calldata]
  return [
    nullifierLow,
    nullifierHigh,
    ...strippedCalldata.map((v: bigint) => v.toString()),
  ];
}
