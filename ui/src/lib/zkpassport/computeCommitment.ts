/**
 * Compute the combined param_commitment for a ZKPassportQueryConfig.
 *
 * The outer proof circuit combines individual per-proof param_commitments
 * into a single value in public_inputs[4]. For a single disclosure proof,
 * this is the commitment directly. For multiple proofs, they are combined
 * via Poseidon2 hashing.
 *
 * Uses dynamic imports to keep the WASM-heavy @zkpassport/utils out of
 * the main bundle.
 */

import type { ZKPassportQueryConfig } from "./queryConfig";

/**
 * Compute the param commitment for a given query config.
 * Returns the hex string (0x-prefixed) suitable for on-chain storage.
 * Returns "0x0" if the config is empty or computation fails.
 */
export async function computeParamCommitment(
  config: ZKPassportQueryConfig,
): Promise<string> {
  const commitments: bigint[] = [];

  try {
    const circuits = await import("@zkpassport/utils/circuits");

    // Age commitment
    if (config.age) {
      const a = config.age;
      let minAge = 0;
      let maxAge = 0;
      if (a.range) {
        minAge = a.range[0];
        maxAge = a.range[1];
      } else {
        if (a.gte !== undefined) minAge = a.gte;
        if (a.gt !== undefined) minAge = a.gt + 1;
        if (a.lte !== undefined) maxAge = a.lte;
        if (a.lt !== undefined) maxAge = a.lt - 1;
        if (a.eq !== undefined) {
          minAge = a.eq;
          maxAge = a.eq;
        }
      }
      const c = await circuits.getAgeParameterCommitment(minAge, maxAge);
      commitments.push(c);
    }

    // Nationality commitment
    if (config.nationality) {
      const n = config.nationality;
      if (n.in && n.in.length > 0) {
        const c = await circuits.getCountryParameterCommitment(
          circuits.ProofType.NATIONALITY_INCLUSION,
          n.in as Parameters<typeof circuits.getCountryParameterCommitment>[1],
        );
        commitments.push(c);
      }
      if (n.out && n.out.length > 0) {
        const c = await circuits.getCountryParameterCommitment(
          circuits.ProofType.NATIONALITY_EXCLUSION,
          n.out as Parameters<typeof circuits.getCountryParameterCommitment>[1],
        );
        commitments.push(c);
      }
    }

    // Issuing country commitment
    if (config.issuing_country) {
      const ic = config.issuing_country;
      if (ic.in && ic.in.length > 0) {
        const c = await circuits.getCountryParameterCommitment(
          circuits.ProofType.ISSUING_COUNTRY_INCLUSION,
          ic.in as Parameters<typeof circuits.getCountryParameterCommitment>[1],
        );
        commitments.push(c);
      }
      if (ic.out && ic.out.length > 0) {
        const c = await circuits.getCountryParameterCommitment(
          circuits.ProofType.ISSUING_COUNTRY_EXCLUSION,
          ic.out as Parameters<typeof circuits.getCountryParameterCommitment>[1],
        );
        commitments.push(c);
      }
    }

    // Birthdate commitment
    if (config.birthdate) {
      const b = config.birthdate;
      let minTs = 0;
      let maxTs = 0;
      if (b.range) {
        minTs = Math.floor(new Date(b.range[0]).getTime() / 1000);
        maxTs = Math.floor(new Date(b.range[1]).getTime() / 1000);
      } else {
        if (b.gte) minTs = Math.floor(new Date(b.gte).getTime() / 1000);
        if (b.gt) minTs = Math.floor(new Date(b.gt).getTime() / 1000) + 1;
        if (b.lte) maxTs = Math.floor(new Date(b.lte).getTime() / 1000);
        if (b.lt) maxTs = Math.floor(new Date(b.lt).getTime() / 1000) - 1;
        if (b.eq) {
          minTs = Math.floor(new Date(b.eq).getTime() / 1000);
          maxTs = minTs;
        }
      }
      const c = await circuits.getDateParameterCommitment(
        circuits.ProofType.BIRTHDATE,
        minTs,
        maxTs,
      );
      commitments.push(c);
    }

    // Expiry date commitment
    if (config.expiry_date) {
      const e = config.expiry_date;
      let minTs = 0;
      let maxTs = 0;
      if (e.range) {
        minTs = Math.floor(new Date(e.range[0]).getTime() / 1000);
        maxTs = Math.floor(new Date(e.range[1]).getTime() / 1000);
      } else {
        if (e.gte) minTs = Math.floor(new Date(e.gte).getTime() / 1000);
        if (e.gt) minTs = Math.floor(new Date(e.gt).getTime() / 1000) + 1;
        if (e.lte) maxTs = Math.floor(new Date(e.lte).getTime() / 1000);
        if (e.lt) maxTs = Math.floor(new Date(e.lt).getTime() / 1000) - 1;
        if (e.eq) {
          minTs = Math.floor(new Date(e.eq).getTime() / 1000);
          maxTs = minTs;
        }
      }
      const c = await circuits.getDateParameterCommitment(
        circuits.ProofType.EXPIRY_DATE,
        minTs,
        maxTs,
      );
      commitments.push(c);
    }

    // Disclose commitment (gender, document_type, etc.)
    // These require MRZ mask computation which is more complex.
    // For now, skip — the disclose commitment is only needed if
    // the tournament checks specific disclosed fields.

    if (commitments.length === 0) {
      return "0x0";
    }

    // For a single commitment, use it directly
    if (commitments.length === 1) {
      return "0x" + commitments[0].toString(16);
    }

    // For multiple commitments, combine with Poseidon2
    const { poseidon2 } = await import("@zkpassport/utils");
    const combined = await poseidon2(commitments.map((c) => c.toString()));
    return "0x" + combined.toString(16);
  } catch (err) {
    console.error("[ZKPassport] Failed to compute param commitment:", err);
    return "0x0";
  }
}
