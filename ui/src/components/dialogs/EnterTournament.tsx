import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { useAccount, useConnect } from "@starknet-react/core";
import { Tournament } from "@/generated/models.gen";
import { TokenMetadata } from "@/lib/types";
import { ARROW_LEFT } from "@/components/Icons";
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
import { CHECK, X } from "@/components/Icons";
import {
  useGetTournamentRegistrants,
  useGetTournamentLeaderboards,
  useGetTournamentQualificationEntries,
} from "@/dojo/hooks/useSqlQueries";
import { useGameTokens } from "metagame-sdk";
import { useDojo } from "@/context/dojo";
import { processQualificationProof } from "@/lib/utils/formatting";
import { getTokenLogoUrl, getTokenDecimals } from "@/lib/tokensMeta";
import { LoadingSpinner } from "@/components/ui/spinner";
import {
  getExtensionProof,
  registerTournamentValidator,
  getExtensionAddresses,
} from "@/lib/extensionConfig";
import { getTokenByAddress } from "@/lib/tokenUtils";
import { useVoyagerNfts } from "@/hooks/useVoyagerNfts";
import {
  useExtensionQualification,
  TournamentValidatorInput,
} from "@/dojo/hooks/useExtensionQualification";
import { CrossChainPaymentDialog } from "@/components/dialogs/CrossChainPaymentDialog";
import {
  SwapTokensDialog,
  type SelectedSwapInfo,
} from "@/components/dialogs/SwapTokensDialog";
import {
  formatTokenAmount,
  getRequiredInput,
  generateSwapCalls,
} from "@/lib/ekuboSwap";

interface EnterTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasEntryFee?: boolean;
  entryFeePrice?: number;
  tournamentModel: Tournament;
  entryCount: number;
  tokens: TokenMetadata[];
  tournamentsData: Tournament[];
  duration: number;
  totalPrizesValueUSD: number;
}

type Proof = {
  tournamentId?: string;
  tokenId?: string;
  position?: number;
};

type EntriesLeftCount = {
  tournamentId?: string;
  token?: string;
  address?: string;
  entriesLeft: number;
};

type PaymentView = "main" | "swap" | "bridge" | "requirements";

export function EnterTournamentDialog({
  open,
  onOpenChange,
  hasEntryFee,
  entryFeePrice,
  tournamentModel,
  entryCount,
  tokens,
  tournamentsData,
  duration,
  totalPrizesValueUSD,
}: EnterTournamentDialogProps) {
  const { namespace, selectedChainConfig } = useDojo();
  const { address } = useAccount();
  const { connect } = useConnectToSelectedChain();
  const { connector } = useConnect();
  const {
    approveAndEnterTournament,
    swapAndEnterTournament,
    checkExtensionValidEntry,
    getExtensionEntriesLeft,
    getBalanceGeneral,
    getUserTroveIds,
    getTroveHealth,
  } = useSystemCalls();

  // Payment state
  const [paymentView, setPaymentView] = useState<PaymentView>("main");
  const [selectedSwapInfo, setSelectedSwapInfo] =
    useState<SelectedSwapInfo | null>(null);
  const [crossChainDialogOpen, setCrossChainDialogOpen] = useState(false);

  // Controller/wallet state
  const [controllerUsername, setControllerUsername] = useState("");
  const [playerAddress, setPlayerAddress] = useState<string | undefined>(
    undefined,
  );
  const [isLookingUpUsername, setIsLookingUpUsername] = useState(false);

  // General state
  const [balance, setBalance] = useState<BigNumberish>(0);
  const [isEntering, setIsEntering] = useState(false);
  const [extensionValidEntry, setExtensionValidEntry] =
    useState<boolean>(false);
  const [extensionEntriesLeft, setExtensionEntriesLeft] = useState<
    number | null
  >(null);
  const [manualTokenId, setManualTokenId] = useState("");
  const [_isVerifyingTokenOwnership, _setIsVerifyingTokenOwnership] =
    useState(false);
  const [manualTokenOwnershipVerified, setManualTokenOwnershipVerified] =
    useState(false);
  const [_showManualTokenInput, setShowManualTokenInput] = useState(false);
  const [_troveDebt, setTroveDebt] = useState<bigint | null>(null);
  const [_loadingTroveDebt, setLoadingTroveDebt] = useState(false);

  const chainId = selectedChainConfig?.chainId ?? "";
  const isController = connector ? isControllerAccount(connector) : false;

  const ownerAddresses = useMemo(() => {
    return [address ?? "0x0"];
  }, [address]);

  const { usernames } = useGetUsernames(ownerAddresses);
  const accountUsername = usernames?.get(indexAddress(address ?? ""));

  // Entry fee details
  const entryToken = tournamentModel?.entry_fee?.Some?.token_address;
  const entryAmount = tournamentModel?.entry_fee?.Some?.amount;
  const entryTokenDecimals = entryToken
    ? getTokenDecimals(chainId, entryToken)
    : 18;
  const entryTokenSymbol = useMemo(() => {
    return (
      tokens.find((t) => t.token_address === entryToken)?.symbol ?? "TOKEN"
    );
  }, [tokens, entryToken]);
  const entryFeeUsdCost = entryToken
    ? (Number(tournamentModel?.entry_fee.Some?.amount ?? 0) /
        10 ** entryTokenDecimals) *
      Number(entryFeePrice)
    : 0;

  const hasBalance = BigInt(balance) >= BigInt(entryAmount ?? 0n);

  const handleEnterTournament = async () => {
    setIsEntering(true);
    try {
      if (!address) return;

      let targetAddress: string;
      let finalPlayerName: string;

      if (isController) {
        // Controller wallet: use connected address and username
        targetAddress = address;
        finalPlayerName = accountUsername || displayAddress(address);
      } else {
        // Non-controller wallet: must have controller username and looked-up address
        if (!controllerUsername.trim() || !playerAddress) return;
        targetAddress = playerAddress;
        finalPlayerName = controllerUsername.trim();
      }

      const qualificationProof = processQualificationProof(
        requirementVariant ?? "",
        proof,
        address,
        extensionConfig?.address,
        {},
      );

      if (selectedSwapInfo) {
        // Fetch fresh quote at execution time (prices may have changed)
        // Convert entryAmount to decimal string (it may be hex or bigint)
        const entryAmountDecimal = BigInt(entryAmount ?? 0).toString();

        const freshQuote = await getRequiredInput(
          entryAmountDecimal,
          selectedSwapInfo.token.address,
          entryToken ?? "",
        );

        if (!freshQuote) {
          console.error("Failed to get fresh quote for swap");
          setIsEntering(false);
          return;
        }

        // Generate fresh swap calls - require exact output amount (no slippage)
        // Input buffer (~1% extra) handles price movement
        const freshSwapCalls = generateSwapCalls(
          selectedSwapInfo.token.address,
          entryToken ?? "",
          freshQuote.input,
          entryAmountDecimal, // Exact amount required
          freshQuote.quote,
        );

        if (freshSwapCalls.length === 0) {
          console.error("Failed to generate swap calls");
          setIsEntering(false);
          return;
        }

        await swapAndEnterTournament(
          freshSwapCalls,
          tournamentModel?.entry_fee,
          tournamentModel?.id,
          feltToString(tournamentModel?.metadata.name),
          tournamentModel,
          stringToFelt(finalPlayerName),
          addAddressPadding(targetAddress),
          qualificationProof,
          duration,
          entryFeeUsdCost,
          entryCount,
          totalPrizesValueUSD,
        );
      } else {
        await approveAndEnterTournament(
          tournamentModel?.entry_fee,
          tournamentModel?.id,
          feltToString(tournamentModel?.metadata.name),
          tournamentModel,
          stringToFelt(finalPlayerName),
          addAddressPadding(targetAddress),
          qualificationProof,
          duration,
          entryFeeUsdCost,
          entryCount,
          totalPrizesValueUSD,
        );
      }

      // Reset state and close
      setControllerUsername("");
      setPlayerAddress(undefined);
      setSelectedSwapInfo(null);
      setPaymentView("main");
      onOpenChange(false);
      setIsEntering(false);
    } catch (error) {
      console.error("Failed to enter tournament:", error);
      setIsEntering(false);
    }
  };

  const handleSwapTokenSelected = (swapInfo: SelectedSwapInfo) => {
    setSelectedSwapInfo(swapInfo);
    setPaymentView("main");
  };

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setControllerUsername("");
      setPlayerAddress(undefined);
      setSelectedSwapInfo(null);
      setPaymentView("main");
    } else if (isController && address) {
      setPlayerAddress(address);
    }
  }, [open, address, isController]);

  // Look up controller address from username (non-controller wallets only)
  useEffect(() => {
    if (isController) return;

    if (!controllerUsername.trim()) {
      setPlayerAddress(undefined);
      setIsLookingUpUsername(false);
      return;
    }

    setIsLookingUpUsername(true);
    const timeoutId = setTimeout(async () => {
      try {
        const usernameMap = await lookupUsernames([controllerUsername.trim()]);
        const foundAddress = usernameMap.get(controllerUsername.trim());
        setPlayerAddress(foundAddress);
        setIsLookingUpUsername(false);
      } catch (error) {
        console.error("Error looking up username:", error);
        setPlayerAddress(undefined);
        setIsLookingUpUsername(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [controllerUsername, isController]);

  // Fetch balance
  const getBalance = async () => {
    const balance = await getBalanceGeneral(entryToken ?? "");
    setBalance(balance);
  };

  useEffect(() => {
    if (entryToken && address) {
      getBalance();
    }
  }, [entryToken, address]);

  // Entry requirement logic (keeping existing complex logic)
  const hasEntryRequirement = tournamentModel?.entry_requirement.isSome();
  const hasEntryLimit =
    Number(tournamentModel?.entry_requirement.Some?.entry_limit) > 0;
  const entryLimit = tournamentModel?.entry_requirement.Some?.entry_limit;
  const requirementVariant =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.activeVariant();
  const requiredTokenAddress =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.token;

  const token = useMemo(() => {
    if (requirementVariant !== "token" || !requiredTokenAddress)
      return undefined;
    return getTokenByAddress(
      requiredTokenAddress,
      selectedChainConfig?.chainId ?? "",
    );
  }, [requiredTokenAddress, requirementVariant, selectedChainConfig]);

  const requiredTokenAddresses = requiredTokenAddress
    ? [indexAddress(requiredTokenAddress ?? "")]
    : [];

  const allowlistAddresses =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.allowlist;

  const extensionConfig =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.extension;

  const extensionAddresses = useMemo(
    () => getExtensionAddresses(selectedChainConfig?.chainId ?? ""),
    [selectedChainConfig?.chainId],
  );

  useEffect(() => {
    if (extensionAddresses.tournamentValidator) {
      registerTournamentValidator(extensionAddresses.tournamentValidator);
    }
  }, [extensionAddresses.tournamentValidator]);

  const isTournamentValidatorExtension = useMemo(() => {
    if (!extensionConfig?.address || !extensionAddresses.tournamentValidator)
      return false;
    const normalizedExtensionAddress = indexAddress(extensionConfig.address);
    const normalizedValidatorAddress = indexAddress(
      extensionAddresses.tournamentValidator,
    );
    return normalizedExtensionAddress === normalizedValidatorAddress;
  }, [extensionConfig?.address, extensionAddresses.tournamentValidator]);

  const tournamentValidatorConfig = useMemo(() => {
    if (!isTournamentValidatorExtension || !extensionConfig?.config) {
      return null;
    }

    const config = extensionConfig.config;
    if (!config || config.length < 3) return null;

    const qualifierType = config[0];
    const qualifyingMode = config[1];
    const topPositions = config[2];
    const tournamentIds = config.slice(3);

    return {
      requirementType: qualifierType === "1" ? "won" : "participated",
      qualifyingMode: Number(qualifyingMode),
      topPositions: Number(topPositions),
      tournamentIds: tournamentIds.map((id: any) => BigInt(id)),
    };
  }, [isTournamentValidatorExtension, extensionConfig?.config]);

  const isOpusTrovesValidatorExtension = useMemo(() => {
    if (!extensionConfig?.address || !extensionAddresses.opusTrovesValidator)
      return false;
    const normalizedExtensionAddress = indexAddress(extensionConfig.address);
    const normalizedValidatorAddress = indexAddress(
      extensionAddresses.opusTrovesValidator,
    );
    return normalizedExtensionAddress === normalizedValidatorAddress;
  }, [extensionConfig?.address, extensionAddresses.opusTrovesValidator]);

  const validatorTournaments = useMemo(() => {
    if (!tournamentValidatorConfig) return [];
    return tournamentsData.filter((t) =>
      tournamentValidatorConfig.tournamentIds.some(
        (id: any) => BigInt(t.id) === id,
      ),
    );
  }, [tournamentValidatorConfig, tournamentsData]);

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

          if (isTournamentValidatorExtension) {
            setExtensionValidEntry(true);
            setExtensionEntriesLeft(null);
            return;
          }

          const qualification = getExtensionProof(
            extensionAddress,
            address,
            {},
          );

          const [validEntry, entriesLeft] = await Promise.all([
            checkExtensionValidEntry(
              extensionAddress,
              tournamentModel?.id,
              address,
              qualification,
            ),
            getExtensionEntriesLeft(
              extensionAddress,
              tournamentModel?.id,
              address,
              qualification,
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
    isTournamentValidatorExtension,
  ]);

  useEffect(() => {
    const fetchTroveDebt = async () => {
      if (isOpusTrovesValidatorExtension && address && open) {
        try {
          setLoadingTroveDebt(true);
          const troveIds = await getUserTroveIds(address);

          if (troveIds.length === 0) {
            setTroveDebt(0n);
            return;
          }

          let totalDebt = 0n;
          for (const troveId of troveIds) {
            const debt = await getTroveHealth(troveId);
            if (debt !== null) {
              totalDebt += debt;
            }
          }

          setTroveDebt(totalDebt);
        } catch (error) {
          console.error("Error fetching trove debt:", error);
          setTroveDebt(null);
        } finally {
          setLoadingTroveDebt(false);
        }
      } else {
        setTroveDebt(null);
      }
    };

    fetchTroveDebt();
  }, [isOpusTrovesValidatorExtension, address, open]);

  const {
    nfts,
    loading: _nftsLoading,
    hasMore: _hasMore,
  } = useVoyagerNfts({
    contractAddress: requiredTokenAddress ?? "0x0",
    owner: address,
    limit: 100,
    fetchAll: true,
    maxPages: 20,
    delayMs: 500,
    active:
      requirementVariant === "token" &&
      requiredTokenAddress !== undefined &&
      address !== undefined,
  });

  const ownedTokenIds = useMemo(() => {
    return nfts?.map((nft) => nft.tokenId).filter(Boolean);
  }, [nfts]);

  useEffect(() => {
    if (!open || requirementVariant !== "token") {
      setManualTokenId("");
      setManualTokenOwnershipVerified(false);
      setShowManualTokenInput(false);
      return;
    }

    if (!manualTokenId.trim() || (ownedTokenIds && ownedTokenIds.length > 0)) {
      setManualTokenOwnershipVerified(false);
      return;
    }
  }, [manualTokenId, open, requirementVariant, ownedTokenIds]);

  const requiredTournamentGameAddresses = tournamentsData.map((tournament) =>
    indexAddress(tournament.game_config?.address ?? ""),
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
    active: isTournamentValidatorExtension && !!tournamentValidatorConfig,
  });

  const { data: leaderboards } = useGetTournamentLeaderboards({
    namespace: namespace ?? "",
    tournamentIds: tournamentsData.map((tournament) =>
      padU64(BigInt(tournament.id)),
    ),
    active: isTournamentValidatorExtension && !!tournamentValidatorConfig,
  });

  const currentTime = BigInt(new Date().getTime()) / 1000n;

  const requiredTournamentRegistrations = useMemo(() => {
    if (!registrations || !tournamentsData) {
      return [];
    }
    const tournamentIdSet = new Set(
      tournamentsData.map((tournament) => tournament.id),
    );
    return registrations.filter((registration) =>
      tournamentIdSet.has(registration.tournament_id.toString()),
    );
  }, [registrations, tournamentsData]);

  const hasParticipatedInTournamentMap = useMemo(() => {
    if (!requiredTournamentRegistrations) return {};

    return requiredTournamentRegistrations.reduce(
      (acc, registration) => {
        if (!acc[registration.tournament_id]) {
          acc[registration.tournament_id] = [];
        }
        acc[registration.tournament_id].push(registration.game_token_id);
        return acc;
      },
      {} as Record<string, string[]>,
    );
  }, [requiredTournamentRegistrations]);

  const parseTokenIds = (tokenIdsString: string): string[] => {
    try {
      const parsedArray = JSON.parse(tokenIdsString);
      if (Array.isArray(parsedArray)) {
        return parsedArray.map((tokenId) =>
          addAddressPadding(bigintToHex(BigInt(tokenId))),
        );
      }
      return [];
    } catch (error) {
      console.error("Error parsing token IDs:", error);
      return [];
    }
  };

  const hasWonTournamentMap = useMemo(() => {
    if (!leaderboards || !ownedGameIds) return {};

    return leaderboards.reduce(
      (acc, leaderboard) => {
        const leaderboardTournamentId = leaderboard.tournament_id;
        const leaderboardTournament = tournamentsData.find(
          (tournament) => tournament.id === leaderboardTournamentId,
        );
        const leaderboardTournamentFinalizedTime =
          BigInt(leaderboardTournament?.schedule.game.end ?? 0n) +
          BigInt(leaderboardTournament?.schedule.submission_duration ?? 0n);
        const hasLeaderboardTournamentFinalized =
          leaderboardTournamentFinalizedTime < currentTime;

        if (hasLeaderboardTournamentFinalized) {
          const leaderboardTokenIds = parseTokenIds(leaderboard.token_ids);

          if (!acc[leaderboard.tournament_id]) {
            acc[leaderboard.tournament_id] = [];
          }

          for (let i = 0; i < leaderboardTokenIds.length; i++) {
            const leaderboardTokenId = leaderboardTokenIds[i];
            if (ownedGameIds.includes(Number(leaderboardTokenId))) {
              acc[leaderboard.tournament_id].push({
                tokenId: leaderboardTokenId,
                position: i + 1,
              });
            }
          }
        }

        return acc;
      },
      {} as Record<string, Array<{ tokenId: string; position: number }>>,
    );
  }, [leaderboards, ownedGameIds, tournamentsData, currentTime]);

  const tournamentValidatorQualificationInputs = useMemo<
    TournamentValidatorInput[]
  >(() => {
    if (!isTournamentValidatorExtension || !tournamentValidatorConfig) {
      return [];
    }

    const inputs: TournamentValidatorInput[] = [];

    if (tournamentValidatorConfig.requirementType === "won") {
      for (const tournament of validatorTournaments) {
        const tournamentId = tournament.id.toString();
        const wonInfoArray = hasWonTournamentMap[tournamentId];

        if (wonInfoArray && wonInfoArray.length > 0) {
          for (const wonInfo of wonInfoArray) {
            inputs.push({
              tournamentId: tournamentId,
              tokenId: wonInfo.tokenId,
              position: wonInfo.position,
              tournamentName: feltToString(tournament.metadata.name),
            });
          }
        }
      }
    } else {
      for (const tournament of validatorTournaments) {
        const tournamentId = tournament.id.toString();
        const gameIds = hasParticipatedInTournamentMap[tournamentId];

        if (gameIds && gameIds.length > 0) {
          for (const gameId of gameIds) {
            inputs.push({
              tournamentId: tournamentId,
              tokenId: gameId,
              position: 1,
              tournamentName: feltToString(tournament.metadata.name),
            });
          }
        }
      }
    }

    return inputs;
  }, [
    isTournamentValidatorExtension,
    tournamentValidatorConfig,
    validatorTournaments,
    hasWonTournamentMap,
    hasParticipatedInTournamentMap,
  ]);

  const {
    qualifications: extensionQualifications,
    totalEntriesLeft: _extensionTotalEntriesLeft,
    bestQualification: extensionBestQualification,
    loading: extensionQualificationsLoading,
  } = useExtensionQualification(
    extensionConfig?.address,
    tournamentModel?.id.toString(),
    address,
    tournamentValidatorQualificationInputs,
    isTournamentValidatorExtension && open,
  );

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

    if (requirementVariant === "allowlist") {
      methods.push({
        type: "allowlist",
        address: address,
      });
    }

    if (requirementVariant === "extension") {
      if (isTournamentValidatorExtension && tournamentValidatorConfig) {
        if (tournamentValidatorConfig.requirementType === "won") {
          for (const tournament of validatorTournaments) {
            const tournamentId = tournament.id.toString();
            const wonInfoArray = hasWonTournamentMap[tournamentId];

            if (wonInfoArray && wonInfoArray.length > 0) {
              for (const wonInfo of wonInfoArray) {
                methods.push({
                  type: "extension",
                  tournamentId: tournamentId,
                  gameId: wonInfo.tokenId,
                  position: wonInfo.position,
                  address: address,
                });
              }
            }
          }
        } else {
          for (const tournament of validatorTournaments) {
            const tournamentId = tournament.id.toString();
            const gameIds = hasParticipatedInTournamentMap[tournamentId];

            if (gameIds && gameIds.length > 0) {
              for (const gameId of gameIds) {
                methods.push({
                  type: "extension",
                  tournamentId: tournamentId,
                  gameId: gameId,
                  position: 1,
                  address: address,
                });
              }
            }
          }
        }
      } else {
        methods.push({
          type: "extension",
          address: address,
        });
      }
    }

    return methods;
  }, [
    hasEntryRequirement,
    hasWonTournamentMap,
    hasParticipatedInTournamentMap,
    ownedTokenIds,
    isTournamentValidatorExtension,
    tournamentValidatorConfig,
    validatorTournaments,
    address,
    requirementVariant,
  ]);

  const { data: qualificationEntries } = useGetTournamentQualificationEntries({
    namespace: namespace ?? "",
    tournamentId: padU64(BigInt(tournamentModel?.id ?? 0n)),
    qualifications: qualificationMethods,
    active: qualificationMethods.length > 0,
  });

  const {
    meetsEntryRequirements,
    proof,
    entriesLeftByTournament: _entriesLeftByTournament,
  } = useMemo<{
    meetsEntryRequirements: boolean;
    proof: Proof;
    entriesLeftByTournament: EntriesLeftCount[];
  }>(() => {
    let canEnter = false;
    let proof: Proof = { tokenId: "" };
    let entriesLeftByTournament: EntriesLeftCount[] = [];

    if (!hasEntryRequirement) {
      return {
        meetsEntryRequirements: true,
        proof,
        entriesLeftByTournament: [{ entriesLeft: Infinity }],
      };
    }

    if (requirementVariant === "token") {
      if (
        manualTokenOwnershipVerified &&
        manualTokenId &&
        (!ownedTokenIds || ownedTokenIds.length === 0)
      ) {
        const currentEntryCount =
          qualificationEntries?.find(
            (entry) =>
              entry["qualification_proof.NFT.token_id"] === manualTokenId,
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

      if (!ownedTokenIds || ownedTokenIds.length === 0) {
        return {
          meetsEntryRequirements: false,
          proof,
          entriesLeftByTournament: [],
        };
      }

      let bestTokenProof = { tokenId: "" };
      let maxTokenEntriesLeft = 0;
      let totalTokenEntriesLeft = 0;

      for (const tokenId of ownedTokenIds) {
        const currentEntryCount =
          qualificationEntries?.find(
            (entry) =>
              entry["qualification_proof.NFT.token_id"] ===
              addAddressPadding(tokenId),
          )?.entry_count ?? 0;

        const remaining = hasEntryLimit
          ? Number(entryLimit) - currentEntryCount
          : Infinity;

        if (remaining > 0) {
          canEnter = true;
          totalTokenEntriesLeft += remaining;

          if (remaining > maxTokenEntriesLeft) {
            bestTokenProof = { tokenId };
            maxTokenEntriesLeft = remaining;
          }
        }
      }

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

    if (requirementVariant === "allowlist") {
      if (!address) {
        return {
          meetsEntryRequirements: false,
          proof: {},
          entriesLeftByTournament: [],
        };
      }

      const isInAllowlist = allowlistAddresses?.some(
        (allowedAddress: string) =>
          allowedAddress.toLowerCase() === address.toLowerCase(),
      );

      if (!isInAllowlist) {
        return {
          meetsEntryRequirements: false,
          proof: { tokenId: "" },
          entriesLeftByTournament: [],
        };
      }

      const currentEntryCount = qualificationEntries[0]?.entry_count ?? 0;
      const remaining = hasEntryLimit
        ? Number(entryLimit) - currentEntryCount
        : Infinity;

      if (remaining > 0) {
        canEnter = true;
        entriesLeftByTournament = [{ address, entriesLeft: remaining }];
      }

      return {
        meetsEntryRequirements: canEnter,
        proof: { tokenId: "" },
        entriesLeftByTournament,
      };
    }

    if (requirementVariant === "extension") {
      if (!address) {
        return {
          meetsEntryRequirements: false,
          proof: {},
          entriesLeftByTournament: [],
        };
      }

      if (isTournamentValidatorExtension && tournamentValidatorConfig) {
        const qualifyingMode = tournamentValidatorConfig.qualifyingMode;
        const entriesPerTournament = new Map<string, number>();

        extensionQualifications.forEach((qual) => {
          const tId = qual.metadata?.tournamentId;
          if (tId) {
            const current = entriesPerTournament.get(tId) || 0;
            entriesPerTournament.set(tId, current + qual.entriesLeft);
          }
        });

        const entriesLeftByTournament = Array.from(
          entriesPerTournament.entries(),
        ).map(([tournamentId, entriesLeft]) => ({ tournamentId, entriesLeft }));

        let canEnter = false;

        if (
          qualifyingMode === 0 ||
          qualifyingMode === 1 ||
          qualifyingMode === 3
        ) {
          canEnter = extensionQualifications.length > 0;
        } else if (
          qualifyingMode === 2 ||
          qualifyingMode === 4 ||
          qualifyingMode === 5
        ) {
          const requiredTournamentCount =
            tournamentValidatorConfig.tournamentIds.length;
          const qualifiedTournamentCount = entriesPerTournament.size;
          canEnter = qualifiedTournamentCount === requiredTournamentCount;
        }

        const proof = extensionBestQualification
          ? {
              tournamentId: extensionBestQualification.metadata?.tournamentId,
              tokenId: extensionBestQualification.metadata?.tokenId,
              position: extensionBestQualification.metadata?.position,
            }
          : { tournamentId: "", tokenId: "", position: 0 };

        return {
          meetsEntryRequirements: canEnter,
          proof,
          entriesLeftByTournament,
        };
      }

      const remaining =
        extensionEntriesLeft !== null ? extensionEntriesLeft : Infinity;

      if (extensionValidEntry && remaining > 0) {
        canEnter = true;
        entriesLeftByTournament = [{ address, entriesLeft: remaining }];
      }

      return {
        meetsEntryRequirements: canEnter,
        proof: { tokenId: "" },
        entriesLeftByTournament,
      };
    }

    return { meetsEntryRequirements: canEnter, proof, entriesLeftByTournament };
  }, [
    hasEntryRequirement,
    qualificationEntries,
    ownedTokenIds,
    entryLimit,
    requirementVariant,
    address,
    allowlistAddresses,
    extensionValidEntry,
    extensionEntriesLeft,
    manualTokenOwnershipVerified,
    manualTokenId,
    isTournamentValidatorExtension,
    tournamentValidatorConfig,
    extensionQualifications,
    extensionBestQualification,
    hasEntryLimit,
    requiredTokenAddresses,
  ]);

  // Entry fee distribution shares
  const creatorShare = Number(
    tournamentModel?.entry_fee.Some?.tournament_creator_share.Some ?? 0n,
  );
  const gameShare = Number(
    tournamentModel?.entry_fee.Some?.game_creator_share.Some ?? 0n,
  );
  const refundShare = Number(
    tournamentModel?.entry_fee.Some?.refund_share.Some ?? 0n,
  );
  const prizePoolShare = 10000 - creatorShare - gameShare - refundShare;

  // Can enter check
  const canEnterTournament =
    (hasBalance || selectedSwapInfo) &&
    meetsEntryRequirements &&
    (isController ||
      (controllerUsername.trim() && playerAddress && !isLookingUpUsername)) &&
    !isEntering &&
    !extensionQualificationsLoading;

  // Render payment method selection
  const renderPaymentOptions = () => (
    <div className="flex flex-col gap-3">
      {/* Direct payment option */}
      <button
        onClick={() => setSelectedSwapInfo(null)}
        className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
          !selectedSwapInfo
            ? "border-brand bg-brand/10"
            : "border-brand/25 hover:border-brand/50"
        }`}
      >
        <div className="flex items-center gap-3">
          <img
            src={getTokenLogoUrl(chainId, entryToken ?? "")}
            alt={entryTokenSymbol}
            className="w-8 h-8 rounded-full"
          />
          <div className="text-left">
            <div className="font-medium">Pay with {entryTokenSymbol}</div>
            <div className="text-sm text-muted-foreground">Direct payment</div>
          </div>
        </div>
        <div className="text-right">
          {hasBalance ? (
            <div className="flex items-center gap-2 text-success">
              <span className="w-4 h-4">
                <CHECK />
              </span>
              <span className="text-sm">Balance OK</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive">
              <span className="w-4 h-4">
                <X />
              </span>
              <span className="text-sm">Insufficient</span>
            </div>
          )}
        </div>
      </button>

      {/* Swap option */}
      <button
        onClick={() => setPaymentView("swap")}
        className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
          selectedSwapInfo
            ? "border-brand bg-brand/10"
            : "border-brand/25 hover:border-brand/50"
        }`}
      >
        <div className="flex items-center gap-3">
          {selectedSwapInfo ? (
            <>
              <img
                src={getTokenLogoUrl(chainId, selectedSwapInfo.token.address)}
                alt={selectedSwapInfo.token.symbol}
                className="w-8 h-8 rounded-full"
              />
              <div className="text-left">
                <div className="font-medium">
                  Pay with {selectedSwapInfo.token.symbol}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatTokenAmount(
                    selectedSwapInfo.inputAmount,
                    selectedSwapInfo.token.decimals,
                  )}{" "}
                  {selectedSwapInfo.token.symbol} → {entryTokenSymbol}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center">
                <span className="text-lg">↔</span>
              </div>
              <div className="text-left">
                <div className="font-medium">Swap from another token</div>
                <div className="text-sm text-muted-foreground">
                  ETH, STRK, USDC, etc.
                </div>
              </div>
            </>
          )}
        </div>
        <div className="text-sm text-brand">
          {selectedSwapInfo ? "Change" : "Select"}
        </div>
      </button>

      {/* Bridge option */}
      {/* <button
        onClick={() => setCrossChainDialogOpen(true)}
        className="flex items-center justify-between p-4 rounded-lg border border-brand/25 hover:border-brand/50 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center">
            <span className="text-lg">🌉</span>
          </div>
          <div className="text-left">
            <div className="font-medium">Bridge from another chain</div>
            <div className="text-sm text-muted-foreground">
              Ethereum, Solana, Base, etc.
            </div>
          </div>
        </div>
        <div className="text-sm text-brand">Open</div>
      </button> */}
    </div>
  );

  // Render swap view
  const renderSwapView = () => (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => setPaymentView("main")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="w-4 h-4">
          <ARROW_LEFT />
        </span>
        Back
      </button>
      <SwapTokensDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) setPaymentView("main");
        }}
        entryFeeAmount={BigInt(entryAmount ?? 0)}
        entryFeeToken={entryToken ?? ""}
        entryFeeDecimals={entryTokenDecimals}
        entryFeeSymbol={entryTokenSymbol}
        onTokenSelected={handleSwapTokenSelected}
        embedded={true}
      />
    </div>
  );

  // Render entry requirements view
  const renderRequirementsView = () => (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => setPaymentView("main")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="w-4 h-4">
          <ARROW_LEFT />
        </span>
        Back
      </button>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">Entry Requirements</h3>

        {/* Requirement Type */}
        <div className="p-3 border border-brand/25 rounded-lg bg-neutral/5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Requirement</div>
              <div className="font-medium">
                {requirementVariant === "token"
                  ? `Hold ${token?.symbol || "NFT"}`
                  : requirementVariant === "allowlist"
                    ? "Allowlist Access"
                    : "Special Qualification"}
              </div>
            </div>
            {meetsEntryRequirements ? (
              <div className="flex items-center gap-2 text-success">
                <span className="w-5 h-5">
                  <CHECK />
                </span>
                <span className="font-medium">Qualified</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <span className="w-5 h-5">
                  <X />
                </span>
                <span className="font-medium">Not Qualified</span>
              </div>
            )}
          </div>
        </div>

        {/* Entry Limit if applicable */}
        {hasEntryLimit && (
          <div className="p-3 border border-brand/25 rounded-lg bg-neutral/5">
            <div className="text-sm text-muted-foreground">Entry Limit</div>
            <div className="font-medium">
              {Number(entryLimit)} entries per qualification
            </div>
          </div>
        )}

        {/* Token requirement details */}
        {requirementVariant === "token" && token && (
          <div className="p-3 border border-brand/25 rounded-lg bg-neutral/5">
            <div className="text-sm text-muted-foreground">Required Token</div>
            <div className="flex items-center gap-2 mt-1">
              <img
                src={getTokenLogoUrl(chainId, requiredTokenAddress ?? "")}
                alt={token.symbol}
                className="w-6 h-6 rounded-full"
              />
              <span className="font-medium">{token.symbol}</span>
              <span className="text-muted-foreground">({token.name})</span>
            </div>
            {ownedTokenIds && ownedTokenIds.length > 0 && (
              <div className="text-sm text-success mt-2">
                You own {ownedTokenIds.length} qualifying token(s)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Enter Tournament</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Entry Fee Display with Distribution */}
          {hasEntryFee && paymentView === "main" && (
            <div className="p-3 border border-brand/25 rounded-lg bg-neutral/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Entry Fee</span>
                <div className="flex items-center gap-2">
                  <img
                    src={getTokenLogoUrl(chainId, entryToken ?? "")}
                    alt={entryTokenSymbol}
                    className="w-5 h-5 rounded-full"
                  />
                  <span className="font-bold">
                    {formatNumber(
                      Number(entryAmount) / 10 ** entryTokenDecimals,
                    )}
                  </span>
                  <span>{entryTokenSymbol}</span>
                  <span className="text-muted-foreground text-sm">
                    ~${entryFeeUsdCost.toFixed(2)}
                  </span>
                </div>
              </div>
              {/* Distribution breakdown */}
              <div className="flex gap-2 text-xs">
                <div className="flex-1 p-2 rounded bg-success/10 text-center">
                  <div className="text-success font-medium">
                    {(prizePoolShare / 100).toFixed(0)}%
                  </div>
                  <div className="text-muted-foreground">Prize Pool</div>
                </div>
                {refundShare > 0 && (
                  <div className="flex-1 p-2 rounded bg-brand/10 text-center">
                    <div className="text-brand font-medium">
                      {(refundShare / 100).toFixed(0)}%
                    </div>
                    <div className="text-muted-foreground">Refund</div>
                  </div>
                )}
                {creatorShare > 0 && (
                  <div className="flex-1 p-2 rounded bg-muted/50 text-center">
                    <div className="font-medium">
                      {(creatorShare / 100).toFixed(0)}%
                    </div>
                    <div className="text-muted-foreground">Creator</div>
                  </div>
                )}
                {gameShare > 0 && (
                  <div className="flex-1 p-2 rounded bg-muted/50 text-center">
                    <div className="font-medium">
                      {(gameShare / 100).toFixed(0)}%
                    </div>
                    <div className="text-muted-foreground">Game</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Non-controller: Controller Username Input */}
          {!isController && paymentView === "main" && (
            <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg bg-neutral/5">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">
                  Controller Username
                </Label>
                <button
                  type="button"
                  onClick={() =>
                    window.open("https://play.cartridge.gg", "_blank")
                  }
                  className="text-brand hover:text-brand-muted text-xs underline"
                >
                  Create Account
                </button>
              </div>
              <Input
                placeholder="Enter controller username"
                value={controllerUsername}
                onChange={(e) => setControllerUsername(e.target.value)}
              />
              {controllerUsername.trim() && (
                <div className="flex items-center gap-2 text-sm">
                  {isLookingUpUsername ? (
                    <>
                      <LoadingSpinner />
                      <span className="text-muted-foreground">
                        Looking up...
                      </span>
                    </>
                  ) : playerAddress ? (
                    <>
                      <span className="w-4 h-4 text-success">
                        <CHECK />
                      </span>
                      <span className="text-success">
                        {displayAddress(playerAddress)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-4 h-4 text-destructive">
                        <X />
                      </span>
                      <span className="text-destructive">Not found</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment Options */}
          {hasEntryFee && address && paymentView === "main" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Payment Method
              </span>
              {renderPaymentOptions()}
            </div>
          )}

          {/* Swap View (embedded) */}
          {paymentView === "swap" && renderSwapView()}

          {/* Requirements View */}
          {paymentView === "requirements" && renderRequirementsView()}

          {/* Entry Requirements - clickable to view details */}
          {hasEntryRequirement && paymentView === "main" && (
            <button
              onClick={() => setPaymentView("requirements")}
              className="flex items-center justify-between p-3 border border-brand/25 rounded-lg bg-neutral/5 hover:border-brand/50 transition-colors w-full text-left"
            >
              <div>
                <div className="text-sm text-muted-foreground">
                  Entry Requirements
                </div>
                <div className="text-sm font-medium">
                  {requirementVariant === "token"
                    ? `Hold ${token?.symbol || "NFT"}`
                    : requirementVariant === "allowlist"
                      ? "Allowlist"
                      : "Special Qualification"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {meetsEntryRequirements ? (
                  <div className="flex items-center gap-1 text-success text-sm">
                    <span className="w-4 h-4">
                      <CHECK />
                    </span>
                    <span>Qualified</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-destructive text-sm">
                    <span className="w-4 h-4">
                      <X />
                    </span>
                    <span>Not qualified</span>
                  </div>
                )}
                <span className="text-muted-foreground">›</span>
              </div>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        {paymentView === "main" && (
          <div className="flex justify-end gap-2 mt-4">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            {address ? (
              <Button
                disabled={!canEnterTournament}
                onClick={handleEnterTournament}
              >
                {isEntering ? (
                  <div className="flex items-center gap-2">
                    <LoadingSpinner />
                    <span>Entering...</span>
                  </div>
                ) : extensionQualificationsLoading ? (
                  <div className="flex items-center gap-2">
                    <LoadingSpinner />
                    <span>Checking...</span>
                  </div>
                ) : (
                  "Enter Tournament"
                )}
              </Button>
            ) : (
              <Button onClick={() => connect()}>Connect Wallet</Button>
            )}
          </div>
        )}
      </DialogContent>

      {/* Cross-chain payment dialog */}
      <CrossChainPaymentDialog
        open={crossChainDialogOpen}
        onOpenChange={setCrossChainDialogOpen}
        entryFeeAmount={BigInt(entryAmount ?? 0)}
        entryFeeToken={entryToken ?? ""}
        entryFeeDecimals={entryTokenDecimals}
        entryFeeSymbol={entryTokenSymbol}
        recipientAddress={address ?? ""}
        onPaymentSuccess={async () => {
          await getBalance();
          setCrossChainDialogOpen(false);
        }}
      />
    </Dialog>
  );
}
