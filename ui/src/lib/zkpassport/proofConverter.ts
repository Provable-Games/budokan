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
  uniqueIdentifier: string
): Promise<string[]> {
  // Extract nullifier as [low, high]
  const [nullifierLow, nullifierHigh] = extractNullifier(uniqueIdentifier);

  // Find the outer proof (the one verified on-chain)
  const outerProof = findOuterProof(proofs);
  if (!outerProof || !outerProof.proof) {
    throw new Error("No valid outer proof found in ZKPassport result");
  }

  // Lazy-load ZKPassport utils for proof parsing
  const { getProofData, getNumberOfPublicInputs } = await import(
    "@zkpassport/utils"
  );

  const numPublicInputs = getNumberOfPublicInputs(outerProof.name);
  const proofData = getProofData(outerProof.proof, numPublicInputs);

  // Lazy-load registry client to fetch the verification key
  const { RegistryClient } = await import("@zkpassport/registry");
  const registryClient = new RegistryClient({ chainId: 11155111 }); // Sepolia
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

  // Convert proof hex to bytes
  const proofHex = proofData.proof.join("");
  const proofBytes = new Uint8Array(
    proofHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)),
  );

  // Convert public inputs to bytes (each is a 32-byte field element)
  const publicInputsHex = proofData.publicInputs
    .map((pi: string) => {
      const hex = pi.startsWith("0x") ? pi.slice(2) : pi;
      return hex.padStart(64, "0");
    })
    .join("");
  const publicInputsBytes = new Uint8Array(
    publicInputsHex
      .match(/.{1,2}/g)!
      .map((byte: string) => parseInt(byte, 16)),
  );

  // Lazy-load Garaga WASM module for calldata generation
  const garaga = await import("garaga");
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
