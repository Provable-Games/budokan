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
  return proofs.find((p) => p.name?.startsWith("outer"));
}

/**
 * Extracts the scoped nullifier directly from the outer proof's public inputs.
 * Used as a fallback when the SDK's verify() fails (e.g. registry unavailable)
 * and doesn't return a uniqueIdentifier via onResult.
 */
export async function extractNullifierFromProof(proofs: CollectedProof[]): Promise<string | undefined> {
  const outerProof = findOuterProof(proofs);
  if (!outerProof?.proof) {
    console.warn("[ZKPassport] No outer proof found in collected proofs");
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

  // Lazy-load ZKPassport utils for proof parsing
  const { getNumberOfPublicInputs } = await import("@zkpassport/utils");

  const numPublicInputs = getNumberOfPublicInputs(outerProof.name);

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
    publicInputsLength: publicInputsBytes.length,
    proofLength: proofBytes.length,
  });

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

  // Lazy-load Garaga WASM module and initialize before use
  const garaga = await import("garaga");
  await garaga.init();
  const garagaCalldata = garaga.getZKHonkCallData(
    proofBytes,
    publicInputsBytes,
    vkeyBytes,
  );

  // Build final qualification: [nullifier_low, nullifier_high, ...garaga_calldata]
  return [
    nullifierLow,
    nullifierHigh,
    ...garagaCalldata.map((v: bigint) => v.toString()),
  ];
}
