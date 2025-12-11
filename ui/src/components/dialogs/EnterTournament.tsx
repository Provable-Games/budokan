import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { useAccount, useConnect, useProvider } from "@starknet-react/core";
import { Tournament, Token } from "@/generated/models.gen";
import {
  feltToString,
  indexAddress,
  bigintToHex,
  formatNumber,
  displayAddress,
  stringToFelt,
  padU64,
} from "@/lib/utils";
import { addAddressPadding, BigNumberish } from "starknet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import { useGetUsernames, isControllerAccount } from "@/hooks/useController";
import { lookupUsernames } from "@cartridge/controller";
import { CHECK, X, COIN, USER, FAT_ARROW_RIGHT } from "@/components/Icons";
import {
  useGetTournamentRegistrants,
  useGetTournamentLeaderboards,
  useGetTournamentQualificationEntries,
  useGetTokenByAddress,
} from "@/dojo/hooks/useSqlQueries";
import { useGameTokens } from "metagame-sdk";
import { useDojo } from "@/context/dojo";
import { processQualificationProof } from "@/lib/utils/formatting";
import { getTokenLogoUrl, getTokenDecimals } from "@/lib/tokensMeta";
import { LoadingSpinner } from "@/components/ui/spinner";
import { getExtensionProof } from "@/lib/extensionConfig";
import { useVoyagerNfts } from "@/hooks/useVoyagerNfts";

interface EnterTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasEntryFee?: boolean;
  entryFeePrice?: number;
  tournamentModel: Tournament;
  entryCount: number;
  // gameCount: BigNumberish;
  tokens: Token[];
  tournamentsData: Tournament[];
  duration: number;
  totalPrizesValueUSD: number;
}

// Update the proof type to make tournamentId and position optional
type Proof = {
  tournamentId?: string;
  tokenId?: string;
  position?: number;
};

// Update the entriesLeftByTournament type to include either tournamentId or token
type EntriesLeftCount = {
  tournamentId?: string;
  token?: string;
  address?: string;
  entriesLeft: number;
};

export function EnterTournamentDialog({
  open,
  onOpenChange,
  hasEntryFee,
  entryFeePrice,
  tournamentModel,
  entryCount,
  // gameCount,
  tokens,
  tournamentsData,
  duration,
  totalPrizesValueUSD,
}: EnterTournamentDialogProps) {
  const { namespace, selectedChainConfig } = useDojo();
  const { address } = useAccount();
  const { connect } = useConnectToSelectedChain();
  const { connector } = useConnect();
  const { provider } = useProvider();
  const {
    approveAndEnterTournament,
    getBalanceGeneral,
    checkExtensionValidEntry,
    getExtensionEntriesLeft,
  } = useSystemCalls();
  const [playerName, setPlayerName] = useState("");
  const [controllerUsername, setControllerUsername] = useState("");
  const [playerAddress, setPlayerAddress] = useState<string | undefined>(
    undefined
  );
  const [isLookingUpUsername, setIsLookingUpUsername] = useState(false);
  const [balance, setBalance] = useState<BigNumberish>(0);
  const [isEntering, setIsEntering] = useState(false);
  const [extensionValidEntry, setExtensionValidEntry] =
    useState<boolean>(false);
  const [extensionEntriesLeft, setExtensionEntriesLeft] = useState<
    number | null
  >(null);
  const [manualTokenId, setManualTokenId] = useState("");
  const [isVerifyingTokenOwnership, setIsVerifyingTokenOwnership] =
    useState(false);
  const [manualTokenOwnershipVerified, setManualTokenOwnershipVerified] =
    useState(false);
  const [showManualTokenInput, setShowManualTokenInput] = useState(false);

  const chainId = selectedChainConfig?.chainId ?? "";
  const isController = connector ? isControllerAccount(connector) : false;

  const handleEnterTournament = async () => {
    setIsEntering(true);
    try {
      if (!address) return;

      let targetAddress: string;
      let finalPlayerName: string;

      if (isController) {
        // Controller wallet: use connected address and player name
        if (!playerName.trim()) return;
        targetAddress = address;
        finalPlayerName = playerName.trim();
      } else {
        // Non-controller wallet: must have controller username and looked-up address
        if (!controllerUsername.trim() || !playerAddress) return;
        targetAddress = playerAddress;
        // Use player name if provided, otherwise use controller username
        finalPlayerName = playerName.trim() || controllerUsername.trim();
      }

      const qualificationProof = processQualificationProof(
        requirementVariant ?? "",
        proof,
        address,
        extensionConfig?.address,
        {} // Additional context if needed
      );

      await approveAndEnterTournament(
        tournamentModel?.entry_fee,
        tournamentModel?.id,
        feltToString(tournamentModel?.metadata.name),
        tournamentModel,
        stringToFelt(finalPlayerName),
        addAddressPadding(targetAddress),
        qualificationProof,
        // gameCount
        duration,
        entryFeeUsdCost,
        entryCount,
        totalPrizesValueUSD
      );

      setPlayerName("");
      setControllerUsername("");
      setPlayerAddress(undefined);
      onOpenChange(false);
      setIsEntering(false);
    } catch (error) {
      console.error("Failed to enter tournament:", error);
      setIsEntering(false);
    }
  };

  const ownerAddresses = useMemo(() => {
    return [address ?? "0x0"];
  }, [address]);

  const { usernames } = useGetUsernames(ownerAddresses);

  const accountUsername = usernames?.get(indexAddress(address ?? ""));

  useEffect(() => {
    if (!open) {
      setPlayerName("");
      setControllerUsername("");
      setPlayerAddress(undefined);
    } else if (isController && accountUsername && address) {
      // Controller wallet connected - auto-fill player name and set address
      setPlayerName(accountUsername);
      setPlayerAddress(address);
    }
  }, [open, accountUsername, address, isController]);

  // Look up controller address from controller username (only for non-controller wallets)
  useEffect(() => {
    // Skip lookup if controller is connected
    if (isController) {
      return;
    }

    // Reset address if username is empty
    if (!controllerUsername.trim()) {
      setPlayerAddress(undefined);
      setIsLookingUpUsername(false);
      return;
    }

    // Debounce the lookup
    setIsLookingUpUsername(true);
    const timeoutId = setTimeout(async () => {
      try {
        console.log("Looking up username:", controllerUsername.trim());
        const usernameMap = await lookupUsernames([controllerUsername.trim()]);
        const foundAddress = usernameMap.get(controllerUsername.trim());
        console.log("Lookup result:", foundAddress);
        setPlayerAddress(foundAddress);
        setIsLookingUpUsername(false);
      } catch (error) {
        console.error("Error looking up username:", error);
        setPlayerAddress(undefined);
        setIsLookingUpUsername(false);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timeoutId);
    };
  }, [controllerUsername, isController]);

  const entryToken = tournamentModel?.entry_fee?.Some?.token_address;
  const entryAmount = tournamentModel?.entry_fee?.Some?.amount;
  const entryFeeUsdCost = entryToken
    ? Number(
        BigInt(tournamentModel?.entry_fee.Some?.amount ?? 0n) / 10n ** 18n
      ) * Number(entryFeePrice)
    : 0;

  const getBalance = async () => {
    const balance = await getBalanceGeneral(entryToken ?? "");
    setBalance(balance);
  };

  useEffect(() => {
    if (entryToken && address) {
      getBalance();
    }
  }, [entryToken, address, getBalance]);

  const hasBalance = BigInt(balance) >= BigInt(entryAmount ?? 0n);

  const hasEntryRequirement = tournamentModel?.entry_requirement.isSome();

  const hasEntryLimit =
    Number(tournamentModel?.entry_requirement.Some?.entry_limit) > 0;
  const entryLimit = tournamentModel?.entry_requirement.Some?.entry_limit;

  const requirementVariant =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.activeVariant();

  const requiredTokenAddress =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.token;

  // Verify manual token ownership via on-chain call
  const verifyTokenOwnership = useCallback(
    async (tokenId: string) => {
      if (!provider || !address || !requiredTokenAddress) return false;

      setIsVerifyingTokenOwnership(true);
      try {
        // Convert token ID to Uint256 format (low, high)
        const tokenIdBigInt = BigInt(tokenId);
        const low = tokenIdBigInt & ((1n << 128n) - 1n);
        const high = tokenIdBigInt >> 128n;

        // Call owner_of on the NFT contract
        const result = await provider.callContract({
          contractAddress: requiredTokenAddress,
          entrypoint: "owner_of",
          calldata: [low.toString(), high.toString()],
        });

        if (result && result.length > 0) {
          const owner = addAddressPadding(result[0]);
          const isOwner =
            owner.toLowerCase() === addAddressPadding(address).toLowerCase();
          setManualTokenOwnershipVerified(isOwner);
          return isOwner;
        }
        setManualTokenOwnershipVerified(false);
        return false;
      } catch (error) {
        setManualTokenOwnershipVerified(false);
        return false;
      } finally {
        setIsVerifyingTokenOwnership(false);
      }
    },
    [provider, address, requiredTokenAddress]
  );

  // Fetch token data using SQL query for entry requirement token
  const { data: tokenData } = useGetTokenByAddress({
    namespace: namespace ?? "",
    address: requiredTokenAddress || "",
    active: requirementVariant === "token" && !!requiredTokenAddress,
  });

  const token =
    (tokenData as Token) ||
    tokens.find((token) => token.address === requiredTokenAddress);

  const tournamentRequirementVariant =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant?.tournament?.activeVariant();

  const requiredTokenAddresses = requiredTokenAddress
    ? [indexAddress(requiredTokenAddress ?? "")]
    : [];

  const allowlistAddresses =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.allowlist;

  const extensionConfig =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.extension;

  useEffect(() => {
    const checkExtensionEntry = async () => {
      if (
        requirementVariant === "extension" &&
        address &&
        extensionConfig &&
        open
      ) {
        try {
          const extensionAddress = extensionConfig.address;
          // Get proof data from extension config
          const qualification = getExtensionProof(
            extensionAddress,
            address,
            {} // Additional context if needed
          );

          const [validEntry, entriesLeft] = await Promise.all([
            checkExtensionValidEntry(
              extensionAddress,
              tournamentModel?.id,
              address,
              qualification
            ),
            getExtensionEntriesLeft(
              extensionAddress,
              tournamentModel?.id,
              address,
              qualification
            ),
          ]);

          setExtensionValidEntry(validEntry);
          setExtensionEntriesLeft(entriesLeft);
        } catch (error) {
          console.error("Error checking extension entry:", error);
          setExtensionValidEntry(false);
          setExtensionEntriesLeft(null);
        }
      }
    };

    checkExtensionEntry();
  }, [
    requirementVariant,
    address,
    extensionConfig,
    open,
    tournamentModel?.id,
    checkExtensionValidEntry,
    getExtensionEntriesLeft,
  ]);

  // Fetch NFTs using Voyager API with pagination
  const {
    nfts,
    loading: nftsLoading,
    hasMore,
  } = useVoyagerNfts({
    contractAddress: requiredTokenAddress ?? "0x0",
    owner: address,
    limit: 100,
    fetchAll: true, // Fetch all pages
    maxPages: 20, // Allow up to 20 pages (2000 NFTs max)
    delayMs: 500, // 500ms delay between requests
    active:
      requirementVariant === "token" &&
      requiredTokenAddress !== undefined &&
      address !== undefined,
  });

  const ownedTokenIds = useMemo(() => {
    // Use Voyager NFT data - tokenId is already a string
    return nfts?.map((nft) => nft.tokenId).filter(Boolean);
  }, [nfts]);

  // Verify manual token ownership when user enters a token ID
  useEffect(() => {
    // Reset verification state when dialog closes or token changes
    if (!open || requirementVariant !== "token") {
      setManualTokenId("");
      setManualTokenOwnershipVerified(false);
      setShowManualTokenInput(false);
      return;
    }

    // Only verify if we have a manual token ID and no indexed tokens
    if (!manualTokenId.trim() || (ownedTokenIds && ownedTokenIds.length > 0)) {
      setManualTokenOwnershipVerified(false);
      return;
    }

    // Debounce the verification
    const timeoutId = setTimeout(async () => {
      await verifyTokenOwnership(manualTokenId.trim());
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    manualTokenId,
    open,
    requirementVariant,
    ownedTokenIds,
    verifyTokenOwnership,
  ]);

  const requiredTournamentGameAddresses = tournamentsData.map((tournament) =>
    indexAddress(tournament.game_config?.address ?? "")
  );

  const { games } = useGameTokens({
    owner: address,
    gameAddresses: requiredTournamentGameAddresses,
    includeMetadata: false,
  });

  const ownedGameIds = useMemo(() => {
    return games?.map((game) => game.token_id).filter(Boolean);
  }, [games]);

  const { data: registrations } = useGetTournamentRegistrants({
    namespace: namespace ?? "",
    gameIds: ownedGameIds ?? [],
    active: requirementVariant === "tournament",
  });

  const { data: leaderboards } = useGetTournamentLeaderboards({
    namespace: namespace ?? "",
    tournamentIds: tournamentsData.map((tournament) =>
      padU64(BigInt(tournament.id))
    ),
    active: requirementVariant === "tournament",
  });

  const currentTime = BigInt(new Date().getTime()) / 1000n;

  const requiredTournamentRegistrations = useMemo(() => {
    if (!registrations || !tournamentsData) {
      return [];
    }

    // Create a Set of tournament IDs from tournamentsData for faster lookups
    const tournamentIdSet = new Set(
      tournamentsData.map((tournament) => tournament.id)
    );

    // Filter registrations that have a tournament ID in the set
    return registrations.filter((registration) =>
      tournamentIdSet.has(registration.tournament_id.toString())
    );
  }, [registrations, tournamentsData]);

  const hasParticipatedInTournamentMap = useMemo(() => {
    if (!requiredTournamentRegistrations) return {};

    return requiredTournamentRegistrations.reduce((acc, registration) => {
      const registrationTournamentId = registration.tournament_id;
      const registeredTournament = tournamentsData.find(
        (tournament) => tournament.id === registrationTournamentId
      );
      const registeredTournamentFinalizedTime =
        BigInt(registeredTournament?.schedule.game.end ?? 0n) +
        BigInt(registeredTournament?.schedule.submission_duration ?? 0n);
      const hasRegisteredTournamentFinalized =
        registeredTournamentFinalizedTime < currentTime;

      // Only add token ID if tournament has finalized
      if (hasRegisteredTournamentFinalized) {
        // Initialize array if it doesn't exist
        if (!acc[registration.tournament_id]) {
          acc[registration.tournament_id] = [];
        }

        // Add this token ID to the array
        acc[registration.tournament_id].push(registration.game_token_id);
      }
      return acc;
    }, {} as Record<string, string[]>);
  }, [requiredTournamentRegistrations, tournamentsData, currentTime]);

  const parseTokenIds = (tokenIdsString: string): string[] => {
    try {
      // Parse the JSON string into a JavaScript array
      const parsedArray = JSON.parse(tokenIdsString);

      // Ensure the result is an array
      if (Array.isArray(parsedArray)) {
        return parsedArray.map((tokenId) =>
          addAddressPadding(bigintToHex(BigInt(tokenId)))
        );
      } else {
        console.warn("Token IDs not in expected array format:", tokenIdsString);
        return [];
      }
    } catch (error) {
      console.error("Error parsing token IDs:", error);
      return [];
    }
  };

  const hasWonTournamentMap = useMemo(() => {
    if (!leaderboards || !ownedGameIds) return {};

    return leaderboards.reduce((acc, leaderboard) => {
      const leaderboardTournamentId = leaderboard.tournament_id;
      const leaderboardTournament = tournamentsData.find(
        (tournament) => tournament.id === leaderboardTournamentId
      );
      const leaderboardTournamentFinalizedTime =
        BigInt(leaderboardTournament?.schedule.game.end ?? 0n) +
        BigInt(leaderboardTournament?.schedule.submission_duration ?? 0n);
      const hasLeaderboardTournamentFinalized =
        leaderboardTournamentFinalizedTime < currentTime;

      if (hasLeaderboardTournamentFinalized) {
        // Parse the token_ids string into an array
        const leaderboardTokenIds = parseTokenIds(leaderboard.token_ids);

        // Initialize array if it doesn't exist
        if (!acc[leaderboard.tournament_id]) {
          acc[leaderboard.tournament_id] = [];
        }

        // Find all owned token IDs that appear in the leaderboard and their positions
        for (let i = 0; i < leaderboardTokenIds.length; i++) {
          const leaderboardTokenId = leaderboardTokenIds[i];
          if (ownedGameIds.includes(Number(leaderboardTokenId))) {
            acc[leaderboard.tournament_id].push({
              tokenId: leaderboardTokenId,
              position: i + 1, // Convert to 1-based position for display
            });
          }
        }
      }

      return acc;
    }, {} as Record<string, Array<{ tokenId: string; position: number }>>);
  }, [leaderboards, ownedGameIds, tournamentsData, currentTime]);

  // need to get the number of entries for each of the qualification methods of the qualifying type

  const qualificationMethods = useMemo(() => {
    const methods = [];

    if (!hasEntryRequirement) return [];

    if (requirementVariant === "token") {
      for (const tokenId of ownedTokenIds) {
        methods.push({
          type: "token",
          tokenId: addAddressPadding(tokenId),
        });
      }
    }

    if (requirementVariant === "tournament") {
      if (tournamentRequirementVariant === "winners") {
        for (const tournament of tournamentsData) {
          const tournamentId = tournament.id.toString();
          const wonInfoArray = hasWonTournamentMap[tournamentId];

          if (wonInfoArray && wonInfoArray.length > 0) {
            // Add a qualification method for each winning token
            for (const wonInfo of wonInfoArray) {
              methods.push({
                type: "tournament",
                tournamentId: tournamentId,
                gameId: wonInfo.tokenId,
                position: wonInfo.position,
              });
            }
          }
        }
      } else {
        for (const tournament of tournamentsData) {
          const tournamentId = tournament.id.toString();
          const gameIds = hasParticipatedInTournamentMap[tournamentId];

          if (gameIds && gameIds.length > 0) {
            // Add a qualification method for each participated token
            for (const gameId of gameIds) {
              methods.push({
                type: "tournament",
                tournamentId: tournamentId,
                gameId: gameId,
                position: 1,
              });
            }
          }
        }
      }
    }

    if (requirementVariant === "allowlist") {
      methods.push({
        type: "allowlist",
        address: address,
      });
    }

    if (requirementVariant === "extension") {
      methods.push({
        type: "extension",
        address: address,
      });
    }

    return methods;
  }, [
    hasEntryRequirement,
    tournamentModel,
    tournamentRequirementVariant,
    hasWonTournamentMap,
    hasParticipatedInTournamentMap,
    ownedTokenIds,
    tournamentsData,
    entryCount,
  ]);

  const { data: qualificationEntries } = useGetTournamentQualificationEntries({
    namespace: namespace ?? "",
    tournamentId: padU64(BigInt(tournamentModel?.id ?? 0n)),
    qualifications: qualificationMethods,
    active: qualificationMethods.length > 0,
  });

  const { meetsEntryRequirements, proof, entriesLeftByTournament } = useMemo<{
    meetsEntryRequirements: boolean;
    proof: Proof;
    entriesLeftByTournament: EntriesLeftCount[];
  }>(() => {
    let canEnter = false;
    let proof: Proof = { tokenId: "" };
    let entriesLeftByTournament: EntriesLeftCount[] = [];

    // If no entry requirement, user can always enter
    if (!hasEntryRequirement) {
      return {
        meetsEntryRequirements: true,
        proof,
        entriesLeftByTournament: [{ entriesLeft: Infinity }],
      };
    }

    // Handle token-based entry requirements
    if (requirementVariant === "token") {
      // Check if we have manual token verification
      if (
        manualTokenOwnershipVerified &&
        manualTokenId &&
        (!ownedTokenIds || ownedTokenIds.length === 0)
      ) {
        // Use manually verified token
        const currentEntryCount =
          qualificationEntries?.find(
            (entry) =>
              entry["qualification_proof.NFT.token_id"] === manualTokenId
          )?.entry_count ?? 0;

        const remaining = hasEntryLimit
          ? Number(entryLimit) - currentEntryCount
          : Infinity;

        if (remaining > 0) {
          return {
            meetsEntryRequirements: true,
            proof: { tokenId: manualTokenId },
            entriesLeftByTournament: [
              {
                token: requiredTokenAddresses[0],
                entriesLeft: remaining,
              },
            ],
          };
        }
      }

      // If no owned tokens and no manual verification, can't enter
      if (!ownedTokenIds || ownedTokenIds.length === 0) {
        return {
          meetsEntryRequirements: false,
          proof,
          entriesLeftByTournament: [],
        };
      }

      // Track best token proof
      let bestTokenProof = { tokenId: "" };
      let maxTokenEntriesLeft = 0;
      let totalTokenEntriesLeft = 0;

      // Check each owned token
      for (const tokenId of ownedTokenIds) {
        // Get current entry count for this token
        const currentEntryCount =
          qualificationEntries?.find(
            (entry) =>
              entry["qualification_proof.NFT.token_id"] ===
              addAddressPadding(tokenId)
          )?.entry_count ?? 0;

        // Calculate remaining entries
        const remaining = hasEntryLimit
          ? Number(entryLimit) - currentEntryCount
          : Infinity;

        // If this token has entries left
        if (remaining > 0) {
          canEnter = true;
          totalTokenEntriesLeft += remaining;

          // If this is the best token so far
          if (remaining > maxTokenEntriesLeft) {
            bestTokenProof = {
              tokenId,
            };
            maxTokenEntriesLeft = remaining;
          }
        }
      }

      // If we found valid tokens with entries left
      if (canEnter) {
        proof = bestTokenProof;
        entriesLeftByTournament = [
          {
            token: requiredTokenAddresses[0],
            entriesLeft: totalTokenEntriesLeft,
          },
        ];
      }

      return {
        meetsEntryRequirements: canEnter,
        proof,
        entriesLeftByTournament,
      };
    }

    // Handle tournament-based entry requirements
    if (requirementVariant === "tournament") {
      if (!tournamentsData || tournamentsData.length === 0) {
        return {
          meetsEntryRequirements: false,
          proof,
          entriesLeftByTournament: [],
        };
      }

      // Track best proof across all tournaments
      let bestProof = { tournamentId: "", tokenId: "", position: 0 };
      let maxEntriesLeft = 0;

      // Check if the user meets at least one tournament requirement
      for (const tournament of tournamentsData) {
        const tournamentId = tournament.id.toString();
        let tournamentCanEnter = false;
        let tournamentTotalEntriesLeft = 0;
        let tournamentBestProof = {
          tournamentId: "",
          tokenId: "",
          position: 0,
        };
        let tournamentBestProofEntriesLeft = 0;

        // If requirement is for winners, check hasWonTournamentMap
        if (tournamentRequirementVariant === "winners") {
          const wonInfoArray = hasWonTournamentMap[tournamentId] || [];

          // Check each winning token
          for (const wonInfo of wonInfoArray) {
            // get the current entry count from the qualification data
            const currentEntryCount =
              qualificationEntries?.find(
                (entry) =>
                  entry["qualification_proof.Tournament.tournament_id"] ===
                    tournamentId &&
                  entry["qualification_proof.Tournament.position"] ===
                    wonInfo.position &&
                  entry["qualification_proof.Tournament.token_id"] ===
                    wonInfo.tokenId
              )?.entry_count ?? 0;

            const remaining = hasEntryLimit
              ? Number(entryLimit) - currentEntryCount
              : Infinity;

            // If this token has entries left
            if (remaining > 0) {
              tournamentCanEnter = true;
              // Add to total entries left for this tournament
              tournamentTotalEntriesLeft += remaining;

              // If this is the best proof for this tournament so far
              if (remaining > tournamentBestProofEntriesLeft) {
                tournamentBestProof = {
                  tournamentId,
                  tokenId: wonInfo.tokenId,
                  position: wonInfo.position,
                };
                tournamentBestProofEntriesLeft = remaining;
              }
            }
          }
        }
        // If requirement is for participants, check hasParticipatedInTournamentMap
        else if (tournamentRequirementVariant === "participants") {
          const gameIds = hasParticipatedInTournamentMap[tournamentId] || [];

          // Check each participated token
          for (const gameId of gameIds) {
            // get the current entry count from the qualification data
            const currentEntryCount =
              qualificationEntries?.find(
                (entry) =>
                  entry["qualification_proof.Tournament.tournament_id"] ===
                    tournamentId &&
                  entry["qualification_proof.Tournament.position"] === 1 &&
                  entry["qualification_proof.Tournament.token_id"] === gameId
              )?.entry_count ?? 0;

            const remaining = hasEntryLimit
              ? Number(entryLimit) - currentEntryCount
              : Infinity;

            // If this token has entries left
            if (remaining > 0) {
              tournamentCanEnter = true;
              // Add to total entries left for this tournament
              tournamentTotalEntriesLeft += remaining;

              // If this is the best proof for this tournament so far
              if (remaining > tournamentBestProofEntriesLeft) {
                tournamentBestProof = {
                  tournamentId,
                  tokenId: gameId,
                  position: 1,
                };
                tournamentBestProofEntriesLeft = remaining;
              }
            }
          }
        }

        // If this tournament has valid entries
        if (tournamentCanEnter) {
          // Add to our entries left array with the total entries left
          entriesLeftByTournament.push({
            tournamentId,
            entriesLeft: tournamentTotalEntriesLeft,
          });

          // Update overall can enter status
          canEnter = true;

          // Update best proof if this tournament has more entries left for a single token
          if (tournamentBestProofEntriesLeft > maxEntriesLeft) {
            bestProof = tournamentBestProof;
            maxEntriesLeft = tournamentBestProofEntriesLeft;
          }
        }
      }

      // Set the best proof we found
      if (canEnter) {
        proof = bestProof;
      }
    }

    // Handle allowlist-based entry requirements
    if (requirementVariant === "allowlist") {
      // If no address, can't enter
      if (!address) {
        return {
          meetsEntryRequirements: false,
          proof: {},
          entriesLeftByTournament: [],
        };
      }

      // Check if the user's address is in the allowlist
      const isInAllowlist = allowlistAddresses?.some(
        (allowedAddress: string) =>
          allowedAddress.toLowerCase() === address.toLowerCase()
      );

      if (!isInAllowlist) {
        return {
          meetsEntryRequirements: false,
          proof: { tokenId: "" },
          entriesLeftByTournament: [],
        };
      }

      // Get current entry count for this address from qualificationEntries
      const currentEntryCount = qualificationEntries[0]?.entry_count ?? 0;

      // Calculate remaining entries
      const remaining = hasEntryLimit
        ? Number(entryLimit) - currentEntryCount
        : Infinity;

      // If this address has entries left
      if (remaining > 0) {
        canEnter = true;
        entriesLeftByTournament = [
          {
            address,
            entriesLeft: remaining,
          },
        ];
      }

      return {
        meetsEntryRequirements: canEnter,
        proof: { tokenId: "" }, // Empty proof for allowlist
        entriesLeftByTournament,
      };
    }

    // Handle extension-based entry requirements
    if (requirementVariant === "extension") {
      // If no address, can't enter
      if (!address) {
        return {
          meetsEntryRequirements: false,
          proof: {},
          entriesLeftByTournament: [],
        };
      }

      // Use extension contract validation results
      const remaining =
        extensionEntriesLeft !== null ? extensionEntriesLeft : Infinity;

      // Check if extension validation passed and has entries left
      if (extensionValidEntry && remaining > 0) {
        canEnter = true;
        entriesLeftByTournament = [
          {
            address,
            entriesLeft: remaining,
          },
        ];
      }

      return {
        meetsEntryRequirements: canEnter,
        proof: { tokenId: "" }, // Empty proof for extension (actual validation happens on-chain)
        entriesLeftByTournament,
      };
    }

    return {
      meetsEntryRequirements: canEnter,
      proof,
      entriesLeftByTournament,
    };
  }, [
    tournamentsData,
    tournamentRequirementVariant,
    hasWonTournamentMap,
    hasParticipatedInTournamentMap,
    hasEntryRequirement,
    qualificationEntries,
    ownedTokenIds,
    entryLimit,
    requirementVariant,
    address,
    allowlistAddresses,
    entryCount,
    extensionValidEntry,
    extensionEntriesLeft,
    manualTokenOwnershipVerified,
    manualTokenId,
  ]);

  // display the entry fee distribution

  const creatorShare = Number(
    tournamentModel?.entry_fee.Some?.tournament_creator_share.Some ?? 0n
  );
  const gameShare = Number(
    tournamentModel?.entry_fee.Some?.game_creator_share.Some ?? 0n
  );
  const prizePoolShare = 100 - creatorShare - gameShare;
  const creatorAmount =
    (Number(BigInt(tournamentModel?.entry_fee.Some?.amount ?? 0)) *
      (creatorShare / 100)) /
    10 ** 18;

  const gameAmount =
    (Number(BigInt(tournamentModel?.entry_fee.Some?.amount ?? 0)) *
      (gameShare / 100)) /
    10 ** 18;

  const prizePoolAmount =
    (Number(BigInt(tournamentModel?.entry_fee.Some?.amount ?? 0)) *
      (prizePoolShare / 100)) /
    10 ** 18;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Enter Tournament</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {hasEntryFee && (
            <div className="flex flex-col gap-2">
              <span className="text-lg font-brand">Entry Fee</span>
              <div className="flex flex-col items-center">
                <div className="flex flex-row items-center justify-center gap-2 border border-brand-muted rounded-md p-2 px-4">
                  <div className="flex flex-row items-center gap-2">
                    <div className="flex flex-row items-center gap-2">
                      <span>
                        {formatNumber(
                          Number(entryAmount) /
                            10 ** getTokenDecimals(chainId, entryToken ?? "")
                        )}
                      </span>
                      <img
                        src={getTokenLogoUrl(chainId, entryToken ?? "")}
                        alt={entryToken ?? ""}
                        className="w-6 h-6"
                      />

                      <span>
                        {
                          tokens.find((token) => token.address === entryToken)
                            ?.symbol
                        }
                      </span>
                    </div>
                    <span className="text-neutral">
                      ~${entryFeeUsdCost.toFixed(2)}
                    </span>
                  </div>
                  {address &&
                    (hasBalance ? (
                      <div className="flex flex-row items-center gap-2">
                        <span className="w-6 h-6">
                          <CHECK />
                        </span>
                        <span className="text-sm">Enough Balance</span>
                      </div>
                    ) : (
                      <div className="flex flex-row items-center gap-2">
                        <span className="w-6 h-6">
                          <X />
                        </span>
                        <span className="text-sm">Not Enough Balance</span>
                      </div>
                    ))}
                </div>
                <span className="w-10 rotate-90">
                  <FAT_ARROW_RIGHT />
                </span>
                <div className="flex flex-row items-center gap-2 w-full">
                  <div
                    className={`flex flex-col items-center gap-1 border border-brand-muted rounded-md p-2 w-1/3 ${
                      creatorAmount > 0 ? "" : "opacity-50"
                    }`}
                  >
                    <span className="text-sm sm:text-base">
                      {creatorShare}%
                    </span>
                    <span className="text-sm sm:text-base">Creator Fee</span>
                    <div className="flex flex-row items-center gap-1">
                      <span className="text-xs sm:text-sm">
                        +{formatNumber(creatorAmount)}
                      </span>
                      <img
                        src={getTokenLogoUrl(chainId, entryToken ?? "")}
                        alt={entryToken ?? ""}
                        className="w-5"
                      />
                      <span className="hidden sm:block text-xs sm:text-sm text-neutral">
                        ~${formatNumber(creatorAmount * (entryFeePrice ?? 0))}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`flex flex-col items-center gap-1 border border-brand-muted rounded-md p-2 w-1/3 ${
                      gameAmount > 0 ? "" : "opacity-50"
                    }`}
                  >
                    <span className="text-sm sm:text-base">{gameShare}%</span>
                    <span className="text-sm sm:text-base">Game Fee</span>
                    <div className="flex flex-row items-center gap-1">
                      <span className="text-xs sm:text-sm">
                        +{formatNumber(gameAmount)}
                      </span>
                      <img
                        src={getTokenLogoUrl(chainId, entryToken ?? "")}
                        alt={entryToken ?? ""}
                        className="w-5"
                      />
                      <span className="hidden sm:block text-xs sm:text-sm text-neutral">
                        ~${formatNumber(gameAmount * (entryFeePrice ?? 0))}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`flex flex-col items-center gap-1 border border-brand-muted rounded-md p-2 w-1/3 ${
                      prizePoolAmount > 0 ? "" : "opacity-50"
                    }`}
                  >
                    <span className="text-sm sm:text-base">
                      {prizePoolShare}%
                    </span>
                    <span className="text-sm sm:text-base">Prize Pool</span>
                    <div className="flex flex-row items-center gap-1">
                      <span className="text-xs sm:text-sm">
                        +{formatNumber(prizePoolAmount)}
                      </span>
                      <img
                        src={getTokenLogoUrl(chainId, entryToken ?? "")}
                        alt={entryToken ?? ""}
                        className="w-5"
                      />
                      <span className="hidden sm:block text-xs sm:text-sm text-neutral">
                        ~${formatNumber(prizePoolAmount * (entryFeePrice ?? 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasEntryRequirement && (
            <div className="flex flex-col gap-2">
              <span className="text-lg font-brand">Entry Requirements</span>
              <span className="px-2">
                {requirementVariant === "token" ? (
                  "You must hold the NFT"
                ) : requirementVariant === "tournament" ? (
                  <div className="flex flex-row items-center gap-2">
                    {`You must have ${
                      tournamentRequirementVariant === "winners"
                        ? "won"
                        : "participated in"
                    }:`}
                  </div>
                ) : requirementVariant === "extension" ? (
                  "Entry validated by extension contract"
                ) : (
                  "Must be part of the allowlist"
                )}
              </span>
              {requirementVariant === "token" ? (
                <>
                  <div className="flex flex-col gap-2 px-4">
                    <div className="flex flex-row items-center gap-2">
                      <span className="w-8">
                        <COIN />
                      </span>
                      <span>{token?.name}</span>
                      <span className="text-neutral">{token?.symbol}</span>
                      {address ? (
                        nftsLoading ? (
                          <div className="flex flex-row items-center gap-2">
                            <LoadingSpinner />
                            <span className="text-brand-muted text-sm">
                              Checking NFTs...
                            </span>
                          </div>
                        ) : meetsEntryRequirements ? (
                          <div className="flex flex-row items-center gap-2">
                            <span className="w-5">
                              <CHECK />
                            </span>
                            <span>
                              {`${
                                entriesLeftByTournament.find(
                                  (entry) =>
                                    entry.token === requiredTokenAddresses[0]
                                )?.entriesLeft
                              } ${
                                entriesLeftByTournament.find(
                                  (entry) =>
                                    entry.token === requiredTokenAddresses[0]
                                )?.entriesLeft === 1
                                  ? "entry"
                                  : "entries"
                              } left`}
                            </span>
                            {ownedTokenIds && ownedTokenIds.length > 0 && (
                              <>
                                <span className="text-neutral">|</span>
                                <span className="text-brand-muted text-sm">
                                  {ownedTokenIds.length} NFT
                                  {ownedTokenIds.length === 1 ? "" : "s"} found
                                  {hasMore && "+"}
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          <>
                            <span className="w-5">
                              <X />
                            </span>
                            {/* Manual token ID trigger when no indexed tokens found */}
                            {(!ownedTokenIds || ownedTokenIds.length === 0) && (
                              <>
                                <span className="text-neutral">|</span>
                                <button
                                  onClick={() =>
                                    setShowManualTokenInput(
                                      !showManualTokenInput
                                    )
                                  }
                                  className="text-brand-muted hover:text-brand text-sm underline decoration-dotted underline-offset-2 transition-colors"
                                >
                                  {showManualTokenInput
                                    ? "Hide manual entry"
                                    : "Enter token ID manually"}
                                </button>
                              </>
                            )}
                          </>
                        )
                      ) : (
                        <span className="text-warning">Connect Account</span>
                      )}
                    </div>
                    {/* Manual token ID input section */}
                    {address &&
                      (!ownedTokenIds || ownedTokenIds.length === 0) &&
                      showManualTokenInput && (
                        <div className="flex flex-col gap-2 pl-10 mt-2">
                          <Label htmlFor="manualTokenId" className="text-sm">
                            Token ID
                          </Label>
                          <Input
                            id="manualTokenId"
                            placeholder="Enter token ID"
                            value={manualTokenId}
                            onChange={(e) => setManualTokenId(e.target.value)}
                            className="w-full"
                          />
                          {manualTokenId.trim() && (
                            <div className="flex flex-row items-center gap-2">
                              {isVerifyingTokenOwnership ? (
                                <>
                                  <LoadingSpinner />
                                  <span className="text-brand-muted text-sm">
                                    Verifying ownership...
                                  </span>
                                </>
                              ) : manualTokenOwnershipVerified ? (
                                <>
                                  <span className="w-5 text-success">
                                    <CHECK />
                                  </span>
                                  <span className="text-success text-sm">
                                    Token ownership verified
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="w-5 text-warning">
                                    <X />
                                  </span>
                                  <span className="text-warning text-sm">
                                    You don't own this token
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </>
              ) : requirementVariant === "tournament" ? (
                <div className="flex flex-col gap-2 px-4">
                  {tournamentsData.map((tournament) => {
                    const tournamentFinalizedTime =
                      BigInt(tournament?.schedule.game.end ?? 0n) +
                      BigInt(tournament?.schedule.submission_duration ?? 0n);
                    const hasTournamentFinalized =
                      tournamentFinalizedTime < currentTime;
                    return (
                      <div
                        key={tournament.id}
                        className="flex flex-row items-center justify-between border border-brand-muted rounded-md p-2"
                      >
                        <span>{feltToString(tournament.metadata.name)}</span>
                        {address ? (
                          tournamentRequirementVariant === "winners" ? (
                            !!hasWonTournamentMap[tournament.id.toString()] &&
                            hasWonTournamentMap[tournament.id.toString()]
                              .length > 0 ? (
                              <div className="flex flex-row items-center gap-2">
                                <span className="w-5">
                                  <CHECK />
                                </span>
                                {entriesLeftByTournament.find(
                                  (entry) =>
                                    entry.tournamentId ===
                                    tournament.id.toString()
                                )?.entriesLeft ?? 0 > 0 ? (
                                  <span>
                                    {`${
                                      entriesLeftByTournament.find(
                                        (entry) =>
                                          entry.tournamentId ===
                                          tournament.id.toString()
                                      )?.entriesLeft
                                    } ${
                                      entriesLeftByTournament.find(
                                        (entry) =>
                                          entry.tournamentId ===
                                          tournament.id.toString()
                                      )?.entriesLeft === 1
                                        ? "entry"
                                        : "entries"
                                    } left`}
                                  </span>
                                ) : (
                                  <span>No entries left</span>
                                )}
                              </div>
                            ) : !hasTournamentFinalized ? (
                              <span className="text-warning">
                                Not Finalized
                              </span>
                            ) : (
                              <div className="flex flex-row items-center gap-2">
                                <span className="w-5">
                                  <X />
                                </span>
                                <span>No qualified entries</span>
                              </div>
                            )
                          ) : !!hasParticipatedInTournamentMap[
                              tournament.id.toString()
                            ] ? (
                            <div className="flex flex-row items-center gap-2">
                              <span className="w-5">
                                <CHECK />
                              </span>
                              {entriesLeftByTournament.find(
                                (entry) =>
                                  entry.tournamentId ===
                                  tournament.id.toString()
                              )?.entriesLeft ?? 0 > 0 ? (
                                <span>
                                  {`${
                                    entriesLeftByTournament.find(
                                      (entry) =>
                                        entry.tournamentId ===
                                        tournament.id.toString()
                                    )?.entriesLeft
                                  } ${
                                    entriesLeftByTournament.find(
                                      (entry) =>
                                        entry.tournamentId ===
                                        tournament.id.toString()
                                    )?.entriesLeft === 1
                                      ? "entry"
                                      : "entries"
                                  } left`}
                                </span>
                              ) : (
                                <span>No entries left</span>
                              )}
                            </div>
                          ) : !hasTournamentFinalized ? (
                            <span className="text-warning">Not Finalized</span>
                          ) : (
                            <span className="w-5">
                              <X />
                            </span>
                          )
                        ) : (
                          <span className="text-neutral">Connect Account</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : requirementVariant === "extension" ? (
                address ? (
                  <div className="flex flex-col gap-2 px-4">
                    <div className="flex flex-row items-center justify-between border border-brand-muted rounded-md p-2">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs">
                          {displayAddress(extensionConfig?.address ?? "")}
                        </span>
                      </div>
                      {meetsEntryRequirements ? (
                        <div className="flex flex-row items-center gap-2">
                          <span className="w-5">
                            <CHECK />
                          </span>
                          <span>
                            {(() => {
                              const entriesLeft = entriesLeftByTournament.find(
                                (entry) => entry.address === address
                              )?.entriesLeft;

                              // Show entries count if there's a limit (not infinite)
                              if (
                                entriesLeft !== undefined &&
                                entriesLeft !== Infinity
                              ) {
                                return `${entriesLeft} ${
                                  entriesLeft === 1 ? "entry" : "entries"
                                } left`;
                              }
                              return "Can enter";
                            })()}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-row items-center gap-2">
                          <span className="w-5">
                            <X />
                          </span>
                          <span>No entries left</span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Note: Final validation will be performed by the extension
                      contract on-chain
                    </span>
                  </div>
                ) : (
                  <span className="text-neutral px-4">Connect Account</span>
                )
              ) : address ? (
                <div className="flex flex-row items-center gap-2 px-4">
                  <span className="w-8">
                    <USER />
                  </span>
                  <span>{displayAddress(address)}</span>
                  {meetsEntryRequirements ? (
                    <div className="flex flex-row items-center gap-2">
                      <span className="w-5">
                        <CHECK />
                      </span>
                      <span>
                        {(() => {
                          const entriesLeft = entriesLeftByTournament.find(
                            (entry) => entry.address === address
                          )?.entriesLeft;

                          // Show entries count if there's a limit (not infinite)
                          if (
                            entriesLeft !== undefined &&
                            entriesLeft !== Infinity
                          ) {
                            return `${entriesLeft} ${
                              entriesLeft === 1 ? "entry" : "entries"
                            } left`;
                          }
                          return "Can enter";
                        })()}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-row items-center gap-2">
                      <span className="w-5">
                        <X />
                      </span>
                      <span>No entries</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-neutral">Connect Account</span>
              )}
            </div>
          )}
          {isController ? (
            // Controller wallet - single player name field
            <div className="flex flex-col gap-2">
              <Label htmlFor="playerName" className="text-lg font-brand">
                Player Name
              </Label>
              <div className="flex flex-col gap-4">
                {accountUsername && (
                  <div className="flex flex-row justify-center gap-2">
                    <span className="text-brand-muted">Default:</span>
                    <span className="text-brand">{accountUsername}</span>
                  </div>
                )}
                <Input
                  id="playerName"
                  placeholder="Enter your player name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          ) : (
            // Non-controller wallet - controller username (required) + player name (optional)
            <>
              <div className="flex flex-col gap-2">
                <div className="flex flex-row items-center justify-between">
                  <Label
                    htmlFor="controllerUsername"
                    className="text-lg font-brand"
                  >
                    Controller Username
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      window.open("https://play.cartridge.gg", "_blank");
                    }}
                    className="text-brand hover:text-brand-muted text-sm underline underline-offset-2 transition-colors"
                  >
                    Create Account →
                  </button>
                </div>
                <div className="flex flex-col gap-4">
                  <Input
                    id="controllerUsername"
                    placeholder="Enter controller username"
                    value={controllerUsername}
                    onChange={(e) => setControllerUsername(e.target.value)}
                    className="w-full"
                  />
                  {controllerUsername.trim() && (
                    <div className="flex flex-row items-center gap-2 justify-center">
                      {isLookingUpUsername ? (
                        <>
                          <LoadingSpinner />
                          <span className="text-brand-muted text-sm">
                            Looking up controller...
                          </span>
                        </>
                      ) : playerAddress ? (
                        <>
                          <span className="w-5 text-success">
                            <CHECK />
                          </span>
                          <span className="text-success text-sm">
                            Controller found: {displayAddress(playerAddress)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="w-5 text-warning">
                            <X />
                          </span>
                          <span className="text-warning text-sm">
                            Controller username not found
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-warning text-sm">
                  Note: The game will be assigned to this controller username.
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="playerName" className="text-lg font-brand">
                  Player Name (Optional)
                </Label>
                <Input
                  id="playerName"
                  placeholder="Enter display name (defaults to controller username)"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {address ? (
            <Button
              disabled={
                !hasBalance ||
                !meetsEntryRequirements ||
                (isController && playerName.length === 0) ||
                (!isController &&
                  (controllerUsername.length === 0 ||
                    !playerAddress ||
                    isLookingUpUsername)) ||
                isEntering
              }
              onClick={handleEnterTournament}
            >
              {isEntering ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner />
                  <span>Entering...</span>
                </div>
              ) : (
                "Enter Tournament"
              )}
            </Button>
          ) : (
            <Button onClick={() => connect()}>Connect Wallet</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
