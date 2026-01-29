import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { useAccount, useConnect, useProvider } from "@starknet-react/core";
import { Tournament } from "@/generated/models.gen";
import { TokenMetadata } from "@/lib/types";
import { OPUS } from "@/components/Icons";
import {
  feltToString,
  indexAddress,
  bigintToHex,
  displayAddress,
  stringToFelt,
  padU64,
  formatPrizeAmount,
  formatUsdValue,
} from "@/lib/utils";
import { addAddressPadding } from "starknet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import { useGetUsernames, isControllerAccount } from "@/hooks/useController";
import { lookupUsernames } from "@cartridge/controller";
import {
  CHECK,
  X,
  COIN,
  USER,
  SPACE_INVADER_LINE,
  TROPHY,
  REFRESH,
} from "@/components/Icons";
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
import { useVoyagerTokenBalances } from "@/hooks/useVoyagerTokenBalances";
import {
  useEkuboQuotes,
  useEkuboClient,
} from "@provable-games/ekubo-sdk/react";
import { PaymentTokenSelector } from "./PaymentTokenSelector";

interface EnterTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasEntryFee?: boolean;
  entryFeePrice?: number;
  tournamentModel: Tournament;
  entryCount: number;
  // gameCount: BigNumberish;
  tokens: TokenMetadata[];
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
  const { provider } = useProvider();
  const { connect } = useConnectToSelectedChain();
  const { connector } = useConnect();
  const {
    approveAndEnterTournament,
    checkExtensionValidEntry,
    getExtensionEntriesLeft,
    getUserTroveIds,
    getTroveHealth,
  } = useSystemCalls();
  const [playerName, setPlayerName] = useState("");
  const [controllerUsername, setControllerUsername] = useState("");
  const [playerAddress, setPlayerAddress] = useState<string | undefined>(
    undefined,
  );
  const [isLookingUpUsername, setIsLookingUpUsername] = useState(false);
  const [balance, setBalance] = useState<string>("0");
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
  const [showManualTokenInput, setShowManualTokenInput] = useState(false);
  const [troveDebt, setTroveDebt] = useState<bigint | null>(null);
  const [loadingTroveDebt, setLoadingTroveDebt] = useState(false);
  const [selectedPaymentToken, setSelectedPaymentToken] = useState<
    string | null
  >(null);
  const [isEditingPlayerName, setIsEditingPlayerName] = useState(false);

  const chainId = selectedChainConfig?.chainId ?? "";
  const isController = connector ? isControllerAccount(connector) : false;

  // Get Ekubo client for generating swap calls
  const ekuboClient = useEkuboClient();

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
        {}, // Additional context if needed
      );

      // Generate swap calls if paying with a different token
      let swapCalls: {
        contractAddress: string;
        entrypoint: string;
        calldata: string[];
      }[] = [];
      if (isSwapPayment && selectedPaymentToken && entryToken && entryAmount) {
        // Get fresh quote for exact output (we need exactly entryAmount of entry token)
        const quote = await ekuboClient.getQuote({
          tokenFrom: selectedPaymentToken,
          tokenTo: entryToken,
          amount: -BigInt(entryAmount), // Negative for exact output
        });

        // Generate swap calls (allCalls includes transfer, swap, and clear)
        const swapResult = ekuboClient.generateSwapCalls({
          quote,
          sellToken: selectedPaymentToken,
          buyToken: entryToken,
          minimumReceived: BigInt(entryAmount), // We need at least this much
          slippagePercent: 5n, // 5% slippage
        });

        // Convert to call format expected by the system
        swapCalls = swapResult.allCalls.map((call) => ({
          contractAddress: call.contractAddress,
          entrypoint: call.entrypoint,
          calldata: call.calldata,
        }));
      }

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
        totalPrizesValueUSD,
        swapCalls, // Pass swap calls to be prepended
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
        const usernameMap = await lookupUsernames([controllerUsername.trim()]);
        const foundAddress = usernameMap.get(controllerUsername.trim());
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
  const entryTokenDecimals = entryToken
    ? getTokenDecimals(chainId, entryToken)
    : 18;
  const entryFeeUsdCost = entryToken
    ? (Number(tournamentModel?.entry_fee.Some?.amount ?? 0) /
        10 ** entryTokenDecimals) *
      Number(entryFeePrice)
    : 0;

  // Check if selected payment token is a swap (not direct payment with entry fee token)
  const isSwapPayment = useMemo(() => {
    if (!selectedPaymentToken || !entryToken) return false;
    return (
      indexAddress(selectedPaymentToken).toLowerCase() !==
      indexAddress(entryToken).toLowerCase()
    );
  }, [selectedPaymentToken, entryToken]);

  // Fetch user's token balances for payment options
  const { balances: tokenBalances, loading: balancesLoading } =
    useVoyagerTokenBalances({
      ownerAddress: address ?? "",
      active: open && !!address && hasEntryFee && !!entryToken,
    });

  // Build sell tokens array for Ekubo quotes (exclude the entry fee token)
  // Only include tokens with meaningful USD value to avoid fetching quotes for dust
  const sellTokensForQuotesRaw = useMemo(() => {
    if (!entryToken || balancesLoading || tokenBalances.length === 0) return [];
    const entryFeeNormalized = indexAddress(entryToken).toLowerCase();

    return tokenBalances
      .filter(
        (b) =>
          indexAddress(b.tokenAddress).toLowerCase() !== entryFeeNormalized &&
          BigInt(b.balance) > 0n &&
          (b.usdBalance ?? 0) > 0.01,
      )
      .map((b) => b.tokenAddress)
      .sort();
  }, [tokenBalances, entryToken, balancesLoading]);

  // Debounce sell tokens to prevent multiple quote fetches as balances load
  const [sellTokensForQuotes, setSellTokensForQuotes] = useState<string[]>([]);
  const sellTokensKeyRaw = useMemo(
    () => JSON.stringify(sellTokensForQuotesRaw),
    [sellTokensForQuotesRaw],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSellTokensForQuotes(sellTokensForQuotesRaw);
    }, 300); // 300ms debounce
    return () => clearTimeout(timeoutId);
  }, [sellTokensKeyRaw, sellTokensForQuotesRaw]);

  // Memoize the amount to prevent new BigInt on every render
  const quoteAmount = useMemo(() => BigInt(entryAmount ?? 0), [entryAmount]);

  // Memoize enabled to prevent toggling
  const quotesEnabled = useMemo(() => {
    return (
      open && !balancesLoading && sellTokensForQuotes.length > 0 && !!entryToken
    );
  }, [open, balancesLoading, sellTokensForQuotes.length, entryToken]);

  // Fetch Ekubo quotes for swap payments - only when dialog is open and we have tokens
  const { quotes: ekuboQuotes, isLoading: quotesLoading } = useEkuboQuotes({
    sellTokens: sellTokensForQuotes,
    buyToken: entryToken ?? null,
    amount: quoteAmount,
    enabled: quotesEnabled,
  });

  // Auto-select payment token when balances load
  useEffect(() => {
    if (!open || balancesLoading || !entryToken || !entryAmount) return;
    // Only auto-select if no token is selected yet
    if (selectedPaymentToken) return;

    const entryFeeNormalized = indexAddress(entryToken).toLowerCase();
    const entryFeeAmountBigInt = BigInt(entryAmount);

    // First, check if user has enough of the entry fee token directly (from Voyager)
    const entryFeeBalance = tokenBalances.find(
      (b) => indexAddress(b.tokenAddress).toLowerCase() === entryFeeNormalized,
    );

    if (
      entryFeeBalance &&
      BigInt(entryFeeBalance.balance) >= entryFeeAmountBigInt
    ) {
      setSelectedPaymentToken(entryFeeBalance.tokenAddress);
      return;
    }

    // Also check on-chain balance (fallback for tokens not in Voyager)
    const onChainBalance = BigInt(balance);
    if (onChainBalance >= entryFeeAmountBigInt) {
      setSelectedPaymentToken(entryToken);
      return;
    }

    // Otherwise, find the token with highest USD value that has a balance
    const tokensWithBalance = tokenBalances
      .filter((b) => BigInt(b.balance) > 0n && (b.usdBalance ?? 0) > 1)
      .sort((a, b) => (b.usdBalance ?? 0) - (a.usdBalance ?? 0));

    if (tokensWithBalance.length > 0) {
      setSelectedPaymentToken(tokensWithBalance[0].tokenAddress);
    }
  }, [
    open,
    balancesLoading,
    tokenBalances,
    entryToken,
    entryAmount,
    selectedPaymentToken,
    balance,
  ]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setIsEntering(false);
      setSelectedPaymentToken(null);
      setIsEditingPlayerName(false);
    }
  }, [open]);

  // Fetch raw balance of entry fee token (without normalization)
  useEffect(() => {
    const fetchRawBalance = async () => {
      if (!entryToken || !address || !provider) return;
      try {
        const result = await provider.callContract({
          contractAddress: entryToken,
          entrypoint: "balance_of",
          calldata: [address],
        });
        // result[0] is the low part of u256, result[1] is the high part
        // For most balances, the low part is sufficient
        const rawBalance = BigInt(result[0]);
        setBalance(rawBalance.toString());
      } catch (err) {
        console.error("Failed to fetch entry token balance:", err);
        setBalance("0");
      }
    };
    fetchRawBalance();
  }, [entryToken, address, provider]);

  const hasBalance = BigInt(balance) >= BigInt(entryAmount ?? 0n);

  // Check if user can pay (either directly or via swap)
  const canPay = useMemo(() => {
    if (!selectedPaymentToken || !entryToken) return false;

    const isDirectPayment =
      indexAddress(selectedPaymentToken).toLowerCase() ===
      indexAddress(entryToken).toLowerCase();

    if (isDirectPayment) {
      // For direct payment, check entry fee token balance
      return hasBalance;
    } else {
      // For swap payment, check if user has enough of the selected token
      const quote = ekuboQuotes[selectedPaymentToken];
      if (!quote?.quote) return false;

      const selectedTokenBalance = tokenBalances.find(
        (b) =>
          indexAddress(b.tokenAddress).toLowerCase() ===
          indexAddress(selectedPaymentToken).toLowerCase(),
      );
      if (!selectedTokenBalance) return false;

      return BigInt(selectedTokenBalance.balance) >= BigInt(quote.quote.total);
    }
  }, [
    selectedPaymentToken,
    entryToken,
    hasBalance,
    ekuboQuotes,
    tokenBalances,
  ]);

  const hasEntryRequirement = tournamentModel?.entry_requirement.isSome();

  const hasEntryLimit =
    Number(tournamentModel?.entry_requirement.Some?.entry_limit) > 0;
  const entryLimit = tournamentModel?.entry_requirement.Some?.entry_limit;

  const requirementVariant =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.activeVariant();

  const requiredTokenAddress =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.token;

  // Get token data from static tokens - same approach as EntryRequirements.tsx
  const token = useMemo(() => {
    if (requirementVariant !== "token" || !requiredTokenAddress)
      return undefined;
    return getTokenByAddress(
      requiredTokenAddress,
      selectedChainConfig?.chainId ?? "",
    );
  }, [requiredTokenAddress, requirementVariant, selectedChainConfig]);

  // Get CASH token for display
  const cashToken = useMemo(() => {
    const tokens = getTokenByAddress(
      "0x0498edfaf50ca5855666a700c25dd629d577eb9afccdf3b5977aec79aee55ada",
      selectedChainConfig?.chainId ?? "",
    );
    return tokens;
  }, [selectedChainConfig?.chainId]);

  const requiredTokenAddresses = requiredTokenAddress
    ? [indexAddress(requiredTokenAddress ?? "")]
    : [];

  const allowlistAddresses =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.allowlist;

  const extensionConfig =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.extension;

  // Get extension addresses for the current chain
  const extensionAddresses = useMemo(
    () => getExtensionAddresses(selectedChainConfig?.chainId ?? ""),
    [selectedChainConfig?.chainId],
  );

  // Register tournament validator when config loads
  useEffect(() => {
    if (extensionAddresses.tournamentValidator) {
      registerTournamentValidator(extensionAddresses.tournamentValidator);
    }
  }, [extensionAddresses.tournamentValidator]);

  // Check if this extension is a tournament validator
  const isTournamentValidatorExtension = useMemo(() => {
    if (!extensionConfig?.address || !extensionAddresses.tournamentValidator)
      return false;
    // Normalize both addresses for comparison
    const normalizedExtensionAddress = indexAddress(extensionConfig.address);
    const normalizedValidatorAddress = indexAddress(
      extensionAddresses.tournamentValidator,
    );
    return normalizedExtensionAddress === normalizedValidatorAddress;
  }, [extensionConfig?.address, extensionAddresses.tournamentValidator]);

  // Parse tournament validator config: [qualifier_type, qualifying_mode, top_positions, ...tournament_ids]
  const tournamentValidatorConfig = useMemo(() => {
    if (!isTournamentValidatorExtension || !extensionConfig?.config) {
      return null;
    }

    const config = extensionConfig.config;
    if (!config || config.length < 3) return null;

    const qualifierType = config[0]; // "0" = participated, "1" = won
    const qualifyingMode = config[1]; // "0" = AT_LEAST_ONE, "1" = CUMULATIVE_PER_TOURNAMENT, "2" = ALL, "3" = CUMULATIVE_PER_ENTRY, "4" = ALL_PARTICIPATE_ANY_WIN, "5" = ALL_WITH_CUMULATIVE
    const topPositions = config[2]; // "0" = all positions, or number of top positions
    const tournamentIds = config.slice(3); // Rest are tournament IDs

    return {
      requirementType: qualifierType === "1" ? "won" : "participated",
      qualifyingMode: Number(qualifyingMode),
      topPositions: Number(topPositions),
      tournamentIds: tournamentIds.map((id: any) => BigInt(id)),
    };
  }, [isTournamentValidatorExtension, extensionConfig?.config]);

  // Check if this extension is an Opus Troves validator
  const isOpusTrovesValidatorExtension = useMemo(() => {
    if (!extensionConfig?.address || !extensionAddresses.opusTrovesValidator)
      return false;
    const normalizedExtensionAddress = indexAddress(extensionConfig.address);
    const normalizedValidatorAddress = indexAddress(
      extensionAddresses.opusTrovesValidator,
    );
    return normalizedExtensionAddress === normalizedValidatorAddress;
  }, [extensionConfig?.address, extensionAddresses.opusTrovesValidator]);

  // Parse Opus Troves validator config: [asset_count, ...asset_addresses, threshold, value_per_entry, max_entries]
  const opusTrovesValidatorConfig = useMemo(() => {
    if (!isOpusTrovesValidatorExtension || !extensionConfig?.config) {
      return null;
    }

    const config = extensionConfig.config;
    if (!config || config.length < 4) return null;

    const assetCount = Number(config[0]);
    const assetAddresses = config.slice(1, assetCount + 1);
    const threshold = BigInt(config[assetCount + 1] || "0");
    const valuePerEntry = BigInt(config[assetCount + 2] || "0");
    const maxEntriesFromConfig = Number(config[assetCount + 3] || "0");

    // Format CASH to USD (18 decimals, 1:1 parity)
    const divisor = 10n ** 18n;
    const formatCashToUSD = (value: bigint) => {
      if (value === 0n) return "0";
      const integerPart = value / divisor;
      const remainder = value % divisor;

      // Format with 2 decimal places
      const decimalPart = (remainder * 100n) / divisor;
      if (decimalPart === 0n) {
        return integerPart.toString();
      }
      return `${integerPart}.${decimalPart.toString().padStart(2, "0")}`;
    };

    return {
      assetCount,
      assetAddresses,
      threshold,
      valuePerEntry,
      maxEntries: maxEntriesFromConfig,
      thresholdUSD: formatCashToUSD(threshold),
      valuePerEntryUSD: formatCashToUSD(valuePerEntry),
      isWildcard: assetCount === 0,
    };
  }, [isOpusTrovesValidatorExtension, extensionConfig?.config]);

  // Get tournament data for validator extensions
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

          // For tournament validators, we'll handle validation differently
          // They need specific proof per tournament token, so we skip the generic check
          if (isTournamentValidatorExtension) {
            // Tournament validator entries are checked per-qualification in qualificationMethods
            // Set to true to allow the UI to proceed - actual validation happens per token
            setExtensionValidEntry(true);
            setExtensionEntriesLeft(null); // Will be calculated per tournament token
            return;
          }

          // Generic extension - use simple proof
          const qualification = getExtensionProof(
            extensionAddress,
            address,
            {}, // Additional context if needed
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

  // Fetch trove debt for Opus Troves validator
  useEffect(() => {
    const fetchTroveDebt = async () => {
      if (isOpusTrovesValidatorExtension && address && open) {
        try {
          setLoadingTroveDebt(true);

          // First, get all trove IDs for this user
          const troveIds = await getUserTroveIds(address);

          if (troveIds.length === 0) {
            setTroveDebt(0n);
            return;
          }

          // Get health for each trove and sum up the debt
          // TODO: If config specifies specific assets (not wildcard), filter troves by asset type
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpusTrovesValidatorExtension, address, open]);

  // Fetch NFTs using Voyager API with pagination
  const {
    nfts,
    loading: nftsLoading,
    hasMore,
  } = useVoyagerNfts({
    contractAddress: requiredTokenAddress ?? "0x0",
    owner: address,
    // owner: "0x03c0f67740e3fe298a52fe75dd24b4981217406f133e0835331379731b67dc92",
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

    // TODO: Implement token ownership verification
    // const timeoutId = setTimeout(async () => {
    //   await verifyTokenOwnership(manualTokenId.trim());
    // }, 500);

    // return () => {
    //   clearTimeout(timeoutId);
    // };
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

    // Create a Set of tournament IDs from tournamentsData for faster lookups
    const tournamentIdSet = new Set(
      tournamentsData.map((tournament) => tournament.id),
    );

    // Filter registrations that have a tournament ID in the set
    return registrations.filter((registration) =>
      tournamentIdSet.has(registration.tournament_id.toString()),
    );
  }, [registrations, tournamentsData]);

  const hasParticipatedInTournamentMap = useMemo(() => {
    if (!requiredTournamentRegistrations) return {};

    return requiredTournamentRegistrations.reduce(
      (acc, registration) => {
        // For participation, we don't care if tournament is finalized
        // Just track that they participated
        // Initialize array if it doesn't exist
        if (!acc[registration.tournament_id]) {
          acc[registration.tournament_id] = [];
        }

        // Add this token ID to the array
        acc[registration.tournament_id].push(registration.game_token_id);

        return acc;
      },
      {} as Record<string, string[]>,
    );
  }, [requiredTournamentRegistrations, tournamentsData]);

  const parseTokenIds = (tokenIdsString: string): string[] => {
    try {
      // Parse the JSON string into a JavaScript array
      const parsedArray = JSON.parse(tokenIdsString);

      // Ensure the result is an array
      if (Array.isArray(parsedArray)) {
        return parsedArray.map((tokenId) =>
          addAddressPadding(bigintToHex(BigInt(tokenId))),
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
      },
      {} as Record<string, Array<{ tokenId: string; position: number }>>,
    );
  }, [leaderboards, ownedGameIds, tournamentsData, currentTime]);

  // need to get the number of entries for each of the qualification methods of the qualifying type

  // Build tournament validator qualification inputs for the hook
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
      // participated
      for (const tournament of validatorTournaments) {
        const tournamentId = tournament.id.toString();
        const gameIds = hasParticipatedInTournamentMap[tournamentId];

        if (gameIds && gameIds.length > 0) {
          for (const gameId of gameIds) {
            inputs.push({
              tournamentId: tournamentId,
              tokenId: gameId,
              position: 1, // Participation = position 1
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

  // Use the extension qualification hook to check entries left for tournament validators
  const {
    qualifications: extensionQualifications,
    totalEntriesLeft: extensionTotalEntriesLeft,
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
      // Check if this is a tournament validator
      if (isTournamentValidatorExtension && tournamentValidatorConfig) {
        // For tournament validators, add qualification methods for each qualifying tournament token
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
          // participated
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
        // Generic extension
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
              addAddressPadding(tokenId),
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
          allowedAddress.toLowerCase() === address.toLowerCase(),
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

      // Handle tournament validators - use the hook's results
      if (isTournamentValidatorExtension && tournamentValidatorConfig) {
        const qualifyingMode = tournamentValidatorConfig.qualifyingMode;

        // Group qualifications by tournament ID to show per-tournament entries
        const entriesPerTournament = new Map<string, number>();

        extensionQualifications.forEach((qual) => {
          const tId = qual.metadata?.tournamentId;
          if (tId) {
            const current = entriesPerTournament.get(tId) || 0;
            entriesPerTournament.set(tId, current + qual.entriesLeft);
          }
        });

        // Build entriesLeftByTournament array
        const entriesLeftByTournament = Array.from(
          entriesPerTournament.entries(),
        ).map(([tournamentId, entriesLeft]) => ({
          tournamentId,
          entriesLeft,
        }));

        // Determine if can enter based on qualifying mode
        let canEnter = false;

        if (qualifyingMode === 0) {
          // AT_LEAST_ONE: Need at least one qualification
          canEnter = extensionQualifications.length > 0;
        } else if (qualifyingMode === 1) {
          // CUMULATIVE_PER_TOURNAMENT: Need at least one qualification (track limits per tournament)
          canEnter = extensionQualifications.length > 0;
        } else if (qualifyingMode === 2) {
          // ALL: Need qualifications for ALL required tournaments
          const requiredTournamentCount =
            tournamentValidatorConfig.tournamentIds.length;
          const qualifiedTournamentCount = entriesPerTournament.size;
          canEnter = qualifiedTournamentCount === requiredTournamentCount;
        } else if (qualifyingMode === 3) {
          // CUMULATIVE_PER_ENTRY: Need at least one qualification (track entries per token)
          canEnter = extensionQualifications.length > 0;
        } else if (qualifyingMode === 4) {
          // ALL_PARTICIPATE_ANY_WIN: Must participate in all, but only need to win in any one
          const requiredTournamentCount =
            tournamentValidatorConfig.tournamentIds.length;
          const qualifiedTournamentCount = entriesPerTournament.size;
          canEnter = qualifiedTournamentCount === requiredTournamentCount;
        } else if (qualifyingMode === 5) {
          // ALL_WITH_CUMULATIVE: Must participate in all, entries multiply by count
          const requiredTournamentCount =
            tournamentValidatorConfig.tournamentIds.length;
          const qualifiedTournamentCount = entriesPerTournament.size;
          canEnter = qualifiedTournamentCount === requiredTournamentCount;
        }

        // Use best qualification from the hook
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

      // Generic extension validation
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

  // display the entry fee distribution
  // Shares are now in basis points (10000 = 100%) to allow 2 decimal precision

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Enter Tournament</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {/* Entry Fee Summary */}
          {hasEntryFee && entryToken && (
            <div className="p-3 bg-brand/10 rounded-lg border border-brand/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-brand-muted text-sm">Entry Fee</span>
                  <img
                    src={getTokenLogoUrl(chainId, entryToken ?? "")}
                    alt=""
                    className="w-4 h-4 rounded-full"
                  />
                  <span className="text-sm">
                    {formatPrizeAmount(
                      Number(entryAmount ?? 0) /
                        Math.pow(
                          10,
                          getTokenDecimals(chainId, entryToken ?? ""),
                        ),
                    )}{" "}
                    {
                      tokens.find(
                        (token) =>
                          indexAddress(token.token_address) ===
                          indexAddress(entryToken),
                      )?.symbol
                    }
                  </span>
                  {!isNaN(entryFeeUsdCost) && entryFeeUsdCost > 0 ? (
                    <span className="text-lg font-bold text-brand">
                      ${entryFeeUsdCost.toFixed(2)}
                    </span>
                  ) : (
                    <Skeleton className="h-6 w-16" />
                  )}
                </div>

                {/* Fee distribution inline */}
                {!isNaN(entryFeeUsdCost) && entryFeeUsdCost > 0 ? (
                  <TooltipProvider>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-brand-muted text-base">→</span>
                      {prizePoolShare > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-brand/20 rounded cursor-help">
                              <span className="w-4 h-4">
                                <TROPHY />
                              </span>
                              <span>
                                $
                                {(
                                  (entryFeeUsdCost * prizePoolShare) /
                                  10000
                                ).toFixed(2)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              Prize Pool ({(prizePoolShare / 100).toFixed(0)}%)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {creatorShare > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-neutral/20 rounded cursor-help">
                              <span className="w-4 h-4">
                                <USER />
                              </span>
                              <span>
                                $
                                {formatUsdValue(
                                  (entryFeeUsdCost * creatorShare) / 10000,
                                )}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              Tournament Creator (
                              {(creatorShare / 100).toFixed(0)}%)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {gameShare > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-neutral/20 rounded cursor-help">
                              <span className="w-4 h-4">
                                <SPACE_INVADER_LINE />
                              </span>
                              <span>
                                $
                                {formatUsdValue(
                                  (entryFeeUsdCost * gameShare) / 10000,
                                )}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              Game Developer ({(gameShare / 100).toFixed(0)}%)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {refundShare > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-neutral/20 rounded cursor-help">
                              <span className="w-4 h-4">
                                <REFRESH />
                              </span>
                              <span>
                                $
                                {formatUsdValue(
                                  (entryFeeUsdCost * refundShare) / 10000,
                                )}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              Refundable on Exit (
                              {(refundShare / 100).toFixed(0)}
                              %)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                ) : (
                  <Skeleton className="h-4 w-32" />
                )}
              </div>
            </div>
          )}

          {/* Payment Token Selector */}
          {hasEntryFee && entryToken && (
            <PaymentTokenSelector
              entryFeeToken={entryToken}
              entryFeeAmount={entryAmount?.toString() ?? "0"}
              entryFeeUsd={entryFeeUsdCost}
              entryFeeDecimals={getTokenDecimals(chainId, entryToken ?? "")}
              entryFeeSymbol={
                tokens.find(
                  (token) =>
                    indexAddress(token.token_address) ===
                    indexAddress(entryToken),
                )?.symbol
              }
              entryFeeLogo={getTokenLogoUrl(chainId, entryToken ?? "")}
              entryFeeUserBalance={balance}
              balances={tokenBalances}
              selectedToken={selectedPaymentToken}
              onTokenSelect={setSelectedPaymentToken}
              quotes={ekuboQuotes}
              quotesLoading={quotesLoading || balancesLoading}
              creatorShare={creatorShare}
              gameShare={gameShare}
              prizePoolShare={prizePoolShare}
            />
          )}

          {hasEntryRequirement && (
            <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg bg-neutral/5">
              <span className="text-sm font-medium text-brand-muted">
                Entry Requirements
              </span>
              <span className="px-2">
                {requirementVariant === "token" ? (
                  "You must hold the NFT"
                ) : requirementVariant === "extension" ? (
                  isTournamentValidatorExtension &&
                  tournamentValidatorConfig ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-row items-center gap-2">
                        {`You must have ${
                          tournamentValidatorConfig.requirementType === "won"
                            ? "won"
                            : "participated in"
                        }:`}
                      </div>
                      <div className="text-xs text-brand-muted">
                        Mode:{" "}
                        {tournamentValidatorConfig.qualifyingMode === 0
                          ? "At Least One"
                          : tournamentValidatorConfig.qualifyingMode === 1
                            ? "Cumulative per Tournament"
                            : tournamentValidatorConfig.qualifyingMode === 2
                              ? "All"
                              : tournamentValidatorConfig.qualifyingMode === 3
                                ? "Cumulative per Entry"
                                : tournamentValidatorConfig.qualifyingMode === 4
                                  ? "All Participated, Any Top Positions"
                                  : tournamentValidatorConfig.qualifyingMode ===
                                      5
                                    ? "All Participated, Cumulative Top Positions"
                                    : "Unknown"}
                      </div>
                    </div>
                  ) : (
                    "Entry validated by extension contract"
                  )
                ) : (
                  "Must be part of the allowlist"
                )}
              </span>
              {requirementVariant === "token" ? (
                <>
                  <div className="flex flex-col gap-2 px-4">
                    <div className="flex flex-row items-center gap-2">
                      {token?.logo_url ? (
                        <img
                          src={token.logo_url}
                          alt={token.name || "Token"}
                          className="w-8 h-8 object-cover rounded"
                        />
                      ) : (
                        <span className="w-8">
                          <COIN />
                        </span>
                      )}
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
                                    entry.token === requiredTokenAddresses[0],
                                )?.entriesLeft
                              } ${
                                entriesLeftByTournament.find(
                                  (entry) =>
                                    entry.token === requiredTokenAddresses[0],
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
                                      !showManualTokenInput,
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
                              {false ? (
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
              ) : requirementVariant === "extension" ? (
                address ? (
                  isTournamentValidatorExtension &&
                  tournamentValidatorConfig ? (
                    // Tournament validator - show individual tournaments
                    <div className="flex flex-col gap-2 px-4">
                      {validatorTournaments.map((tournament) => {
                        const tournamentFinalizedTime =
                          BigInt(tournament?.schedule.game.end ?? 0n) +
                          BigInt(
                            tournament?.schedule.submission_duration ?? 0n,
                          );
                        const hasTournamentFinalized =
                          tournamentFinalizedTime < currentTime;
                        return (
                          <div
                            key={tournament.id}
                            className="flex flex-row items-center justify-between border border-brand-muted rounded-md p-2"
                          >
                            <span>
                              {feltToString(tournament.metadata.name)}
                            </span>
                            {tournamentValidatorConfig.requirementType ===
                            "won" ? (
                              !!hasWonTournamentMap[tournament.id.toString()] &&
                              hasWonTournamentMap[tournament.id.toString()]
                                .length > 0 ? (
                                <div className="flex flex-row items-center gap-2">
                                  <span className="w-5">
                                    <CHECK />
                                  </span>
                                  {(entriesLeftByTournament.find(
                                    (entry) =>
                                      entry.tournamentId ===
                                      tournament.id.toString(),
                                  )?.entriesLeft ?? 0 > 0) ? (
                                    <span>
                                      {`${
                                        entriesLeftByTournament.find(
                                          (entry) =>
                                            entry.tournamentId ===
                                            tournament.id.toString(),
                                        )?.entriesLeft
                                      } ${
                                        entriesLeftByTournament.find(
                                          (entry) =>
                                            entry.tournamentId ===
                                            tournament.id.toString(),
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
                                {(entriesLeftByTournament.find(
                                  (entry) =>
                                    entry.tournamentId ===
                                    tournament.id.toString(),
                                )?.entriesLeft ?? 0 > 0) ? (
                                  <span>
                                    {`${
                                      entriesLeftByTournament.find(
                                        (entry) =>
                                          entry.tournamentId ===
                                          tournament.id.toString(),
                                      )?.entriesLeft
                                    } ${
                                      entriesLeftByTournament.find(
                                        (entry) =>
                                          entry.tournamentId ===
                                          tournament.id.toString(),
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
                              <span className="w-5">
                                <X />
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {/* Show total entries left across all tournaments */}
                      {extensionTotalEntriesLeft > 0 && (
                        <div className="px-4 pt-2 text-sm text-brand-muted">
                          Total: {extensionTotalEntriesLeft}{" "}
                          {extensionTotalEntriesLeft === 1
                            ? "entry"
                            : "entries"}{" "}
                          left across all qualifying tournaments
                        </div>
                      )}
                    </div>
                  ) : isOpusTrovesValidatorExtension &&
                    opusTrovesValidatorConfig ? (
                    // Opus Troves validator
                    <div className="flex flex-col gap-2 px-4">
                      <div className="flex flex-col gap-3 border border-brand-muted rounded-md p-3">
                        <div className="flex flex-row items-center gap-2">
                          <span className="w-6">
                            <OPUS />
                          </span>
                          <span className="font-medium">Opus Troves</span>
                        </div>
                        {loadingTroveDebt ? (
                          <div className="flex flex-row items-center gap-2">
                            <LoadingSpinner />
                            <span className="text-brand-muted text-sm">
                              Checking trove debt...
                            </span>
                          </div>
                        ) : troveDebt !== null && troveDebt > 0n ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col gap-1 text-sm">
                              <div className="flex flex-row items-center gap-2">
                                <span className="text-brand-muted">
                                  Borrowed:
                                </span>
                                {cashToken?.logo_url && (
                                  <img
                                    src={cashToken.logo_url}
                                    alt="CASH"
                                    className="w-4 h-4"
                                  />
                                )}
                                <span className="font-medium">
                                  $
                                  {opusTrovesValidatorConfig.thresholdUSD &&
                                    (() => {
                                      const divisor = 10n ** 18n;
                                      const integerPart = troveDebt / divisor;
                                      const remainder = troveDebt % divisor;
                                      const decimalPart =
                                        (remainder * 100n) / divisor;
                                      return decimalPart === 0n
                                        ? integerPart.toString()
                                        : `${integerPart}.${decimalPart
                                            .toString()
                                            .padStart(2, "0")}`;
                                    })()}
                                </span>
                              </div>
                              {opusTrovesValidatorConfig.threshold > 0n && (
                                <div className="flex flex-row items-center gap-2">
                                  <span className="text-brand-muted">
                                    Threshold:
                                  </span>
                                  <span className="font-medium">
                                    ${opusTrovesValidatorConfig.thresholdUSD}
                                  </span>
                                </div>
                              )}
                              <div className="flex flex-row items-center gap-2">
                                <span className="text-brand-muted">
                                  Entry calculation:
                                </span>
                                {cashToken?.logo_url && (
                                  <img
                                    src={cashToken.logo_url}
                                    alt="CASH"
                                    className="w-4 h-4"
                                  />
                                )}
                                <span className="font-medium">
                                  1 entry per $
                                  {opusTrovesValidatorConfig.valuePerEntryUSD}{" "}
                                  CASH borrowed
                                </span>
                              </div>
                            </div>
                            {meetsEntryRequirements ? (
                              <div className="flex flex-col gap-1 mt-1">
                                <div className="flex flex-row items-center gap-2">
                                  <span className="w-5">
                                    <CHECK />
                                  </span>
                                  <span className="text-success">
                                    {(() => {
                                      const entriesLeft =
                                        entriesLeftByTournament.find(
                                          (entry) => entry.address === address,
                                        )?.entriesLeft;

                                      if (
                                        entriesLeft !== undefined &&
                                        entriesLeft !== Infinity
                                      ) {
                                        // Calculate total entries from debt
                                        const debt = troveDebt || 0n;
                                        const threshold =
                                          opusTrovesValidatorConfig.threshold;
                                        const valuePerEntry =
                                          opusTrovesValidatorConfig.valuePerEntry;

                                        let totalEntries = 0;
                                        if (
                                          debt > threshold &&
                                          valuePerEntry > 0n
                                        ) {
                                          totalEntries = Number(
                                            (debt - threshold) / valuePerEntry,
                                          );
                                          // Cap at max entries if specified
                                          if (
                                            opusTrovesValidatorConfig.maxEntries >
                                            0
                                          ) {
                                            totalEntries = Math.min(
                                              totalEntries,
                                              opusTrovesValidatorConfig.maxEntries,
                                            );
                                          }
                                        }

                                        const entriesUsed =
                                          totalEntries - entriesLeft;

                                        return `${entriesLeft} ${
                                          entriesLeft === 1
                                            ? "entry"
                                            : "entries"
                                        } remaining (${totalEntries} total, ${entriesUsed} used)`;
                                      }
                                      return "Can enter";
                                    })()}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-row items-center gap-2 mt-1">
                                <span className="w-5">
                                  <X />
                                </span>
                                <span className="text-warning">
                                  Insufficient debt for entry
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-row items-center gap-2">
                            <span className="w-5">
                              <X />
                            </span>
                            <span className="text-warning">
                              No trove debt found
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Note: Final validation will be performed by the
                        extension contract on-chain
                      </span>
                    </div>
                  ) : (
                    // Generic extension
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
                                const entriesLeft =
                                  entriesLeftByTournament.find(
                                    (entry) => entry.address === address,
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
                        Note: Final validation will be performed by the
                        extension contract on-chain
                      </span>
                    </div>
                  )
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
                            (entry) => entry.address === address,
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
            // Controller wallet - player name is set via bottom left edit
            // Just show a reminder if no name is set
            !playerName && (
              <div className="text-sm text-brand-muted text-center py-2">
                Set your player name below to continue
              </div>
            )
          ) : (
            // Non-controller wallet - controller username (required) + player name (optional)
            <>
              <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg bg-neutral/5">
                <div className="flex flex-row items-center justify-between">
                  <Label
                    htmlFor="controllerUsername"
                    className="text-sm font-medium text-brand-muted"
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
              <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg bg-neutral/5">
                <Label
                  htmlFor="playerName"
                  className="text-sm font-medium text-brand-muted"
                >
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
        <div className="flex justify-between items-center gap-2 mt-6">
          {/* Player name edit in bottom left */}
          <div className="flex items-center gap-2">
            {isController &&
              address &&
              (isEditingPlayerName ? (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 text-brand-muted">
                    <USER />
                  </span>
                  <Input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Player name"
                    className="w-32 h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        setIsEditingPlayerName(false);
                      }
                    }}
                    onBlur={() => setIsEditingPlayerName(false)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingPlayerName(false)}
                    className="h-8 px-3"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingPlayerName(true)}
                  className="flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand transition-colors"
                >
                  <span className="w-4 h-4">
                    <USER />
                  </span>
                  <span className="truncate max-w-[120px]">
                    {playerName || "Set name"}
                  </span>
                </button>
              ))}
          </div>

          {/* Action buttons on right */}
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            {address ? (
              <Button
                disabled={
                  !canPay ||
                  !meetsEntryRequirements ||
                  (isController && playerName.length === 0) ||
                  (!isController &&
                    (controllerUsername.length === 0 ||
                      !playerAddress ||
                      isLookingUpUsername)) ||
                  isEntering ||
                  extensionQualificationsLoading
                }
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
                    <span>Checking qualifications...</span>
                  </div>
                ) : (
                  "Enter Tournament"
                )}
              </Button>
            ) : (
              <Button onClick={() => connect()}>Connect Wallet</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
