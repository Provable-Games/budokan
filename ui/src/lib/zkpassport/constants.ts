import { ChainId } from "@/dojo/setup/networks";

/**
 * ZKPassport Constants
 *
 * Pre-computed values for the ZKPassport verification system.
 * These constants are shared between tournament creation and player entry flows.
 */

// Pre-computed service scope hash: SHA256("budokan.gg") truncated to 31 bytes
export const ZKPASSPORT_SERVICE_SCOPE =
  "0xfd0da854551dce0be291b43380e6e6ceb1338fccf04c84f048a2d311bb0e50";

// Pre-computed service subscope hash: SHA256("bigproof") truncated to 31 bytes
export const ZKPASSPORT_SERVICE_SUBSCOPE =
  "0xf54fbb0f658e7013ec2114ef095a29bb3e2f95b96dbd93e46f12f67863111a";

// Nullifier type: NON_SALTED = 0
export const ZKPASSPORT_NULLIFIER_TYPE = "0";

// Default max proof age in seconds (1 hour)
export const ZKPASSPORT_DEFAULT_MAX_PROOF_AGE = 3600;

// ZKPassport SDK domain — override via ?zkpassport_domain=<domain> URL param for testing
export const ZKPASSPORT_SDK_DOMAIN = (() => {
  if (typeof window !== "undefined") {
    const param = new URLSearchParams(window.location.search).get(
      "zkpassport_domain",
    );
    if (param) return param;
  }
  return "budokan.gg";
})();

/**
 * Garaga Honk verifier addresses by chain
 */
export const ZKPASSPORT_VERIFIER_ADDRESSES: Record<string, string> = {
  [ChainId.SN_SEPOLIA]:
    "0x06ad2f4c866eabb03443098ecc798af1791952bc138bd32904dd215d8585c655",
  [ChainId.SN_MAIN]:
    "0x06ea7206289f1787b5521544b6281cc4f3e9779a69786dc7661fc8524fe3d32f",
};

/**
 * ZKPassport validator contract addresses by chain
 */
export const ZKPASSPORT_VALIDATOR_ADDRESSES: Record<string, string> = {
  [ChainId.SN_SEPOLIA]:
    "0x046af2c4fe14ddf0f6a3bf91a3981e71c1b150e85701d387a05a201b1c530c7f",
  [ChainId.SN_MAIN]:
    "0x01a25f04d151c1295ba3223f7e63b89ec89762fe29d68c5f1896f86cadf62f4c",
};

/**
 * Get the ZKPassport validator address for a given chain
 */
export const getZkPassportValidatorAddress = (chainId: string): string => {
  return ZKPASSPORT_VALIDATOR_ADDRESSES[chainId] || "";
};

/**
 * Get the Garaga verifier address for a given chain
 */
export const getZkPassportVerifierAddress = (chainId: string): string => {
  return ZKPASSPORT_VERIFIER_ADDRESSES[chainId] || "";
};
