import { useState, useEffect, useMemo, useRef } from "react";
import { useSystemCalls } from "./useSystemCalls";

/**
 * Represents a single qualification method for an extension
 */
export interface ExtensionQualification {
  // Unique identifier for this qualification
  id: string;
  // The proof data to pass to the contract
  proof: string[];
  // Number of entries left for this qualification
  entriesLeft: number;
  // Human-readable label for display
  label?: string;
  // Additional metadata for display/tracking
  metadata?: {
    tournamentId?: string;
    tournamentName?: string;
    tokenId?: string;
    position?: number;
    [key: string]: any;
  };
}

/**
 * Result from extension qualification check
 */
export interface ExtensionQualificationResult {
  // Array of all valid qualifications with entries left
  qualifications: ExtensionQualification[];
  // Total entries left across all qualifications
  totalEntriesLeft: number;
  // Best qualification to use (most entries left)
  bestQualification: ExtensionQualification | null;
  // Whether the check is still loading
  loading: boolean;
  // Any error that occurred
  error: Error | null;
}

/**
 * Input for building qualifications - tournament validator specific
 */
export interface TournamentValidatorInput {
  tournamentId: string;
  tokenId: string;
  position: number;
  tournamentName?: string;
}

/**
 * Hook to check extension qualification and entries left for multiple proofs
 *
 * This hook handles extensions that require checking multiple proofs
 * (e.g., tournament validators with multiple qualifying tournaments/tokens)
 *
 * @param extensionAddress - The extension contract address
 * @param tournamentId - The tournament ID to check for
 * @param playerAddress - The player's address
 * @param qualificationInputs - Array of potential qualifications to check
 * @param enabled - Whether to run the check (default: true)
 */
export const useExtensionQualification = (
  extensionAddress: string | undefined,
  tournamentId: string | undefined,
  playerAddress: string | undefined,
  qualificationInputs: TournamentValidatorInput[],
  enabled: boolean = true
): ExtensionQualificationResult => {
  const { getExtensionEntriesLeft } = useSystemCalls();

  const [qualifications, setQualifications] = useState<
    ExtensionQualification[]
  >([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Create a stable key from the inputs to prevent infinite rerenders
  const inputsKey = useMemo(() => {
    if (!enabled || !extensionAddress || !tournamentId || !playerAddress) {
      return "";
    }
    return JSON.stringify({
      extensionAddress,
      tournamentId,
      playerAddress,
      inputs: qualificationInputs.map((i) => ({
        tid: i.tournamentId,
        token: i.tokenId,
        pos: i.position,
      })),
    });
  }, [
    enabled,
    extensionAddress,
    tournamentId,
    playerAddress,
    qualificationInputs,
  ]);

  // Track the last fetched key to prevent duplicate fetches
  const lastFetchedKey = useRef<string>("");

  // Reset state when disabled (e.g., dialog closes)
  useEffect(() => {
    if (!enabled) {
      lastFetchedKey.current = "";
      setQualifications([]);
      setLoading(false);
      setError(null);
    }
  }, [enabled]);

  useEffect(() => {
    // Early return if not enabled - don't do anything
    if (!inputsKey) {
      return;
    }

    // Skip if we've already fetched for these inputs
    if (inputsKey === lastFetchedKey.current) {
      return;
    }

    const checkQualifications = async () => {
      lastFetchedKey.current = inputsKey;
      setLoading(true);
      setError(null);

      try {
        // Check entries left for each qualification in parallel
        const results = await Promise.all(
          qualificationInputs.map(async (input) => {
            try {
              const proof = [
                input.tournamentId,
                input.tokenId,
                input.position.toString(),
              ];

              const entriesLeft = await getExtensionEntriesLeft(
                extensionAddress!,
                tournamentId!,
                playerAddress!,
                proof
              );

              console.log(proof, entriesLeft);

              // Only include qualifications with entries left
              if (entriesLeft! > 0) {
                return {
                  id: `${input.tournamentId}-${input.tokenId}-${input.position}`,
                  proof,
                  entriesLeft,
                  label: input.tournamentName,
                  metadata: {
                    tournamentId: input.tournamentId,
                    tournamentName: input.tournamentName,
                    tokenId: input.tokenId,
                    position: input.position,
                  },
                } as ExtensionQualification;
              }
              return null;
            } catch (err) {
              console.error(
                `Error checking qualification for ${input.tournamentId}:`,
                err
              );
              return null;
            }
          })
        );

        // Filter out null results (failed checks or no entries left)
        const validQualifications = results.filter(
          (q): q is ExtensionQualification => q !== null
        );

        setQualifications(validQualifications);
      } catch (err) {
        console.error("Error checking extension qualifications:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setQualifications([]);
      } finally {
        setLoading(false);
      }
    };

    checkQualifications();
  }, [
    inputsKey,
    extensionAddress,
    tournamentId,
    playerAddress,
    qualificationInputs,
    getExtensionEntriesLeft,
  ]);

  // Calculate derived values
  const totalEntriesLeft = qualifications.reduce(
    (sum, q) => sum + q.entriesLeft,
    0
  );

  const bestQualification =
    qualifications.length > 0
      ? qualifications.reduce((best, current) =>
          current.entriesLeft > best.entriesLeft ? current : best
        )
      : null;

  return {
    qualifications,
    totalEntriesLeft,
    bestQualification,
    loading,
    error,
  };
};
