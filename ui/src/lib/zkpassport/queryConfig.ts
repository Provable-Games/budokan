/**
 * ZKPassport Query Config
 *
 * A JSON-serializable mirror of the ZKPassport SDK's Query type, covering
 * all qualifier types. Supports encoding/decoding to felt252 chunks for
 * on-chain storage, and reconstruction back to SDK QueryBuilder at entry time.
 */

import type { ZKPassportTemplate } from "./templates";

// ─── Qualifier Types ───────────────────────────────────────────────────────

export interface AgeQualifier {
  gte?: number;
  lte?: number;
  gt?: number;
  lt?: number;
  eq?: number;
  range?: [number, number];
}

export interface DateQualifier {
  gte?: string; // ISO date string
  lte?: string;
  gt?: string;
  lt?: string;
  eq?: string;
  range?: [string, string];
}

export interface CountryQualifier {
  in?: string[];  // alpha-3 codes
  out?: string[]; // alpha-3 codes
  eq?: string;
}

export interface StringQualifier {
  eq?: string;
  disclose?: boolean;
}

export interface GenderQualifier {
  eq?: "male" | "female";
  disclose?: boolean;
}

export interface DocumentTypeQualifier {
  eq?: "passport" | "id_card" | "residence_permit" | "other";
  disclose?: boolean;
}

export interface SanctionsQualifier {
  enabled: boolean;
  countries?: string[];  // e.g. ["US", "EU"]
  lists?: string[];
  strict?: boolean;
}

export interface FacematchQualifier {
  enabled: boolean;
  mode?: "strict" | "regular";
}

// ─── Main Config Type ──────────────────────────────────────────────────────

export interface ZKPassportQueryConfig {
  age?: AgeQualifier;
  birthdate?: DateQualifier;
  expiry_date?: DateQualifier;
  nationality?: CountryQualifier;
  issuing_country?: CountryQualifier;
  gender?: GenderQualifier;
  document_type?: DocumentTypeQualifier;
  firstname?: StringQualifier;
  lastname?: StringQualifier;
  fullname?: StringQualifier;
  document_number?: StringQualifier;
  sanctions?: SanctionsQualifier;
  facematch?: FacematchQualifier;
}

// ─── QueryBuilder Replay ───────────────────────────────────────────────────

/**
 * Replay a ZKPassportQueryConfig onto an SDK QueryBuilder instance.
 * Returns the modified query builder for chaining.
 */
export function queryConfigToQueryBuilder(
  config: ZKPassportQueryConfig,
  qb: any,
): any {
  // Age
  if (config.age) {
    const a = config.age;
    if (a.range) qb = qb.range("age", a.range[0], a.range[1]);
    else if (a.eq !== undefined) qb = qb.eq("age", a.eq);
    else {
      if (a.gte !== undefined) qb = qb.gte("age", a.gte);
      if (a.gt !== undefined) qb = qb.gt("age", a.gt);
      if (a.lte !== undefined) qb = qb.lte("age", a.lte);
      if (a.lt !== undefined) qb = qb.lt("age", a.lt);
    }
  }

  // Birthdate
  if (config.birthdate) {
    const b = config.birthdate;
    if (b.range) qb = qb.range("birthdate", new Date(b.range[0]), new Date(b.range[1]));
    else if (b.eq) qb = qb.eq("birthdate", new Date(b.eq));
    else {
      if (b.gte) qb = qb.gte("birthdate", new Date(b.gte));
      if (b.gt) qb = qb.gt("birthdate", new Date(b.gt));
      if (b.lte) qb = qb.lte("birthdate", new Date(b.lte));
      if (b.lt) qb = qb.lt("birthdate", new Date(b.lt));
    }
  }

  // Expiry date
  if (config.expiry_date) {
    const e = config.expiry_date;
    if (e.range) qb = qb.range("expiry_date", new Date(e.range[0]), new Date(e.range[1]));
    else if (e.eq) qb = qb.eq("expiry_date", new Date(e.eq));
    else {
      if (e.gte) qb = qb.gte("expiry_date", new Date(e.gte));
      if (e.gt) qb = qb.gt("expiry_date", new Date(e.gt));
      if (e.lte) qb = qb.lte("expiry_date", new Date(e.lte));
      if (e.lt) qb = qb.lt("expiry_date", new Date(e.lt));
    }
  }

  // Nationality (in/out/eq)
  if (config.nationality) {
    const n = config.nationality;
    if (n.in && n.in.length > 0) qb = qb.in("nationality", n.in);
    if (n.out && n.out.length > 0) qb = qb.out("nationality", n.out);
    if (n.eq) qb = qb.eq("nationality", n.eq);
  }

  // Issuing country (in/out/eq)
  if (config.issuing_country) {
    const ic = config.issuing_country;
    if (ic.in && ic.in.length > 0) qb = qb.in("issuing_country", ic.in);
    if (ic.out && ic.out.length > 0) qb = qb.out("issuing_country", ic.out);
    if (ic.eq) qb = qb.eq("issuing_country", ic.eq);
  }

  // Gender
  if (config.gender) {
    if (config.gender.eq) qb = qb.eq("gender", config.gender.eq);
    if (config.gender.disclose) qb = qb.disclose("gender");
  }

  // Document type
  if (config.document_type) {
    if (config.document_type.eq) qb = qb.eq("document_type", config.document_type.eq);
    if (config.document_type.disclose) qb = qb.disclose("document_type");
  }

  // String fields
  for (const field of ["firstname", "lastname", "fullname", "document_number"] as const) {
    const q = config[field];
    if (q) {
      if (q.eq) qb = qb.eq(field, q.eq);
      if (q.disclose) qb = qb.disclose(field);
    }
  }

  // Sanctions
  if (config.sanctions?.enabled) {
    const s = config.sanctions;
    const countries = s.countries && s.countries.length > 0 ? s.countries : undefined;
    const lists = s.lists && s.lists.length > 0 ? s.lists : undefined;
    qb = qb.sanctions(
      countries ?? "all",
      lists ?? "all",
      s.strict !== undefined ? { strict: s.strict } : undefined,
    );
  }

  // Facematch
  if (config.facematch?.enabled) {
    qb = qb.facematch(config.facematch.mode ?? "regular");
  }

  return qb;
}

// ─── Human-Readable Description ────────────────────────────────────────────

/**
 * Generate a human-readable summary of a ZKPassportQueryConfig.
 */
export function queryConfigToDescription(config: ZKPassportQueryConfig): string {
  const parts: string[] = [];

  if (config.age) {
    const a = config.age;
    if (a.range) parts.push(`Age ${a.range[0]}-${a.range[1]}`);
    else if (a.eq !== undefined) parts.push(`Age exactly ${a.eq}`);
    else {
      if (a.gte !== undefined) parts.push(`Age ${a.gte}+`);
      if (a.gt !== undefined) parts.push(`Age > ${a.gt}`);
      if (a.lte !== undefined) parts.push(`Age <= ${a.lte}`);
      if (a.lt !== undefined) parts.push(`Age < ${a.lt}`);
    }
  }

  if (config.nationality) {
    const n = config.nationality;
    if (n.in && n.in.length > 0) parts.push(`Nationality: ${n.in.join(", ")}`);
    if (n.out && n.out.length > 0) parts.push(`Not from: ${n.out.join(", ")}`);
    if (n.eq) parts.push(`Nationality: ${n.eq}`);
  }

  if (config.issuing_country) {
    const ic = config.issuing_country;
    if (ic.in && ic.in.length > 0) parts.push(`Issued by: ${ic.in.join(", ")}`);
    if (ic.out && ic.out.length > 0) parts.push(`Not issued by: ${ic.out.join(", ")}`);
    if (ic.eq) parts.push(`Issued by: ${ic.eq}`);
  }

  if (config.gender?.eq) parts.push(`Gender: ${config.gender.eq}`);
  if (config.document_type?.eq) parts.push(`Document: ${config.document_type.eq}`);

  if (config.birthdate) {
    const b = config.birthdate;
    if (b.range) parts.push(`Born ${b.range[0]} to ${b.range[1]}`);
    else if (b.gte) parts.push(`Born after ${b.gte}`);
    else if (b.lte) parts.push(`Born before ${b.lte}`);
  }

  if (config.expiry_date) {
    const e = config.expiry_date;
    if (e.gte) parts.push(`Passport valid until at least ${e.gte}`);
  }

  if (config.sanctions?.enabled) parts.push("Sanctions check");
  if (config.facematch?.enabled) parts.push("Face match required");

  if (config.firstname?.eq) parts.push(`First name: ${config.firstname.eq}`);
  if (config.lastname?.eq) parts.push(`Last name: ${config.lastname.eq}`);
  if (config.fullname?.eq) parts.push(`Full name: ${config.fullname.eq}`);

  return parts.length > 0 ? parts.join("; ") : "ZK Passport verification";
}

// ─── Felt252 Serialization ─────────────────────────────────────────────────

const FELT_MAX_BYTES = 31;

/**
 * Serialize a ZKPassportQueryConfig into an array of felt252-safe hex strings.
 * Returns [byteLength, chunk0, chunk1, ...] where each chunk is a 0x-prefixed
 * hex string fitting in 31 bytes.
 */
export function serializeQueryConfig(config: ZKPassportQueryConfig): string[] {
  const json = JSON.stringify(config);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);

  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += FELT_MAX_BYTES) {
    const slice = bytes.slice(i, Math.min(i + FELT_MAX_BYTES, bytes.length));
    let hex = "0x";
    for (const b of slice) {
      hex += b.toString(16).padStart(2, "0");
    }
    chunks.push(hex);
  }

  return [bytes.length.toString(), ...chunks];
}

/**
 * Deserialize felt252 hex strings back into a ZKPassportQueryConfig.
 * Input: [byteLength, chunk0, chunk1, ...]
 */
export function deserializeQueryConfig(felts: (string | number | bigint)[]): ZKPassportQueryConfig {
  if (felts.length < 2) {
    throw new Error("Invalid query config felts: need at least byteLength + 1 chunk");
  }

  const byteLength = Number(felts[0]);
  const allBytes: number[] = [];

  for (let i = 1; i < felts.length; i++) {
    const chunkIndex = i - 1;
    // Each chunk holds up to FELT_MAX_BYTES (31). The last chunk holds the remainder.
    const isLastChunk = i === felts.length - 1;
    const expectedBytes = isLastChunk
      ? byteLength - chunkIndex * FELT_MAX_BYTES
      : FELT_MAX_BYTES;

    // Convert BigNumberish to hex string
    const raw = typeof felts[i] === "string" ? felts[i] as string : "0x" + BigInt(felts[i]).toString(16);
    let hex = raw.startsWith("0x") ? raw.slice(2) : raw;

    // felt252 values are right-aligned numbers, so the data bytes are at the
    // end of the hex representation. Extract exactly expectedBytes from the right.
    hex = hex.padStart(expectedBytes * 2, "0").slice(-(expectedBytes * 2));

    for (let j = 0; j < hex.length; j += 2) {
      allBytes.push(parseInt(hex.slice(j, j + 2), 16));
    }
  }

  const trimmed = new Uint8Array(allBytes.slice(0, byteLength));
  const decoder = new TextDecoder();
  const json = decoder.decode(trimmed);
  return JSON.parse(json);
}

// ─── Template from Config ──────────────────────────────────────────────────

/**
 * Build a ZKPassportTemplate from the extended config elements [6+].
 * Returns undefined if no extended config is present.
 *
 * @param configArray - The full config array from on-chain storage
 */
export function buildTemplateFromConfig(
  configArray: (string | number | bigint)[],
  headerSize = 6,
): ZKPassportTemplate | undefined {
  if (configArray.length <= headerSize) return undefined;

  try {
    const queryConfigFelts = configArray.slice(headerSize);
    const queryConfig = deserializeQueryConfig(queryConfigFelts);
    const description = queryConfigToDescription(queryConfig);

    return {
      id: "composable",
      name: "Custom Requirements",
      description,
      buildQuery: (qb: any) => queryConfigToQueryBuilder(queryConfig, qb),
      paramCommitment: String(configArray[headerSize - 3]),
    };
  } catch {
    return undefined;
  }
}
