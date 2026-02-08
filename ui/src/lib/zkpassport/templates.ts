/**
 * ZKPassport Requirement Templates
 *
 * Pre-defined sets of ZKPassport requirements with known param_commitments.
 * When entering a tournament, the UI matches the stored param_commitment
 * against known templates to reconstruct the SDK query.
 */

export interface ZKPassportTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * Builds the SDK query by chaining methods on the query builder.
   * Returns the modified query builder.
   */
  buildQuery: (qb: any) => any;
  /**
   * The pre-computed param_commitment for this template.
   * This is a Poseidon2 hash of the requirement parameters stored on-chain.
   * Computed lazily via computeParamCommitment() if needed.
   */
  paramCommitment: string;
}

/**
 * EU member state country codes (ISO 3166-1 alpha-3)
 */
export const EU_COUNTRIES = [
  "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
  "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
  "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
];

/**
 * Pre-defined requirement templates
 */
export const ZKPASSPORT_TEMPLATES: ZKPassportTemplate[] = [
  {
    id: "age_18_plus",
    name: "Age 18+",
    description: "Must be 18 years or older",
    buildQuery: (qb: any) => qb.gte("age", 18),
    // Pre-computed: getAgeParameterCommitment(18, 0)
    paramCommitment: "0x0", // TODO: Compute and fill in actual commitment
  },
  {
    id: "age_21_plus",
    name: "Age 21+",
    description: "Must be 21 years or older",
    buildQuery: (qb: any) => qb.gte("age", 21),
    // Pre-computed: getAgeParameterCommitment(21, 0)
    paramCommitment: "0x0", // TODO: Compute and fill in actual commitment
  },
  {
    id: "custom",
    name: "Custom",
    description: "Custom ZKPassport requirement with raw param_commitment",
    buildQuery: (qb: any) => qb, // No-op for custom
    paramCommitment: "", // User provides
  },
];

/**
 * Find a template by its param_commitment value.
 * Returns undefined if no matching template is found.
 */
export const findTemplateByCommitment = (
  commitment: string
): ZKPassportTemplate | undefined => {
  if (!commitment || commitment === "0x0") return undefined;
  return ZKPASSPORT_TEMPLATES.find(
    (t) => t.paramCommitment === commitment && t.id !== "custom"
  );
};

/**
 * Get a template by its ID.
 */
export const getTemplateById = (
  id: string
): ZKPassportTemplate | undefined => {
  return ZKPASSPORT_TEMPLATES.find((t) => t.id === id);
};

// Re-export composable query config utilities
export {
  buildTemplateFromConfig,
  queryConfigToDescription,
  queryConfigToQueryBuilder,
  serializeQueryConfig,
  deserializeQueryConfig,
} from "./queryConfig";
export type { ZKPassportQueryConfig } from "./queryConfig";
