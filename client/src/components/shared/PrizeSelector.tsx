import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrizeInput } from "@/components/createTournament/inputs/PrizeInput";
import { PrizeDistributionVisual } from "@/components/createTournament/PrizeDistributionVisual";
import { FormToken } from "@/lib/types";
import {
  buildUniformBasisPointShares,
  calculateDistribution,
  indexAddress,
} from "@/lib/utils";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";

type DistributionKind = "exponential" | "linear" | "uniform" | "custom";

interface NewPrize {
  token: FormToken;
  tokenType: "ERC20" | "ERC721" | "";
  amount?: number;
  value?: number;
  tokenId?: number;
  position?: number;
}

export interface PrizeSelectorData {
  tokenType: "ERC20" | "ERC721";
  token: FormToken;

  // ERC20 specific
  amount?: number;
  value?: number;
  distribution?: DistributionKind;
  distribution_weight?: number;
  distribution_count?: number;
  distributions?: { position: number; percentage: number }[];
  // Only populated when distribution === "custom". Basis-point shares per
  // position, sum == 10000, length == distribution_count.
  custom_shares?: number[];

  // ERC721 specific
  tokenId?: number;
  position?: number;
}

interface PrizeSelectorProps {
  chainId: string;
  isSepolia: boolean;
  onAddPrize: (prizeData: PrizeSelectorData) => void;
  checkBalance?: boolean;
  existingPrizes?: any[]; // For price fetching of existing prizes
  onTokenSelect?: (
    token: FormToken | undefined,
    tokenType: "ERC20" | "ERC721" | ""
  ) => void;
}

export function PrizeSelector({
  chainId,
  isSepolia,
  onAddPrize,
  checkBalance = true,
  existingPrizes = [],
  onTokenSelect,
}: PrizeSelectorProps) {
  const [selectedToken, setSelectedToken] = useState<FormToken | undefined>(
    undefined
  );
  const [tokenEverSelected, setTokenEverSelected] = useState(false);
  const [newPrize, setNewPrize] = useState<NewPrize>({
    token: {
      address: "",
      token_type: "erc20",
      name: "",
      symbol: "",
      is_registered: false,
    },
    tokenType: "ERC20", // Default to ERC20
  });
  const [distributionWeight, setDistributionWeight] = useState(1);
  const [distributionType, setDistributionType] =
    useState<DistributionKind>("exponential");
  const [leaderboardSize, setLeaderboardSize] = useState(10);
  const [prizeDistributions, setPrizeDistributions] = useState<
    { position: number; percentage: number }[]
  >([]);
  // Basis-point shares for Custom distribution. Reshaped whenever the paid-
  // places count or distribution type changes so length stays in sync.
  const [customShares, setCustomShares] = useState<number[]>([]);
  const [hasInsufficientBalance, setHasInsufficientBalance] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {}
  );

  const { getBalanceGeneral, getTokenDecimals } = useSystemCalls();

  const isERC20 = newPrize.tokenType === "ERC20";

  // Get unique token addresses for price fetching
  const uniqueTokenAddresses = useMemo(() => {
    const addresses = existingPrizes
      .filter((prize) => prize.type === "ERC20" || prize.tokenType === "ERC20")
      .map((prize) => prize.token?.address || prize.tokenAddress)
      .filter(
        (address): address is string =>
          typeof address === "string" && address !== ""
      );

    return [
      ...new Set([
        ...addresses,
        ...(newPrize.token?.address ? [newPrize.token.address] : []),
      ]),
    ];
  }, [existingPrizes, newPrize.token?.address]);

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: uniqueTokenAddresses,
  });

  const totalDistributionPercentage = useMemo(() => {
    return (
      prizeDistributions.reduce((sum, pos) => sum + (pos.percentage || 0), 0) ||
      0
    );
  }, [prizeDistributions]);

  const customSumBp = useMemo(
    () =>
      customShares
        .slice(0, leaderboardSize)
        .reduce((sum, bp) => sum + (bp || 0), 0),
    [customShares, leaderboardSize],
  );
  const customIsValid =
    distributionType === "custom" &&
    customShares.length === leaderboardSize &&
    customSumBp === 10000;

  const isValidPrize = () => {
    if (!newPrize.token?.address) return false;

    if (newPrize.tokenType === "ERC20") {
      const isPercentageValid =
        Math.abs(totalDistributionPercentage - 100) < 0.01;
      if (distributionType === "custom" && !customIsValid) return false;
      return !!newPrize.amount && isPercentageValid;
    }

    if (newPrize.tokenType === "ERC721") {
      return !!newPrize.tokenId && !!newPrize.position;
    }

    return false;
  };

  // Reshape customShares when paid-places count changes under Custom mode.
  // Initialize with a uniform split on the first switch so the user starts
  // from a valid (summing-to-100) state.
  useEffect(() => {
    if (distributionType !== "custom") return;
    if (customShares.length === leaderboardSize) return;
    if (customShares.length === 0) {
      setCustomShares(buildUniformBasisPointShares(leaderboardSize));
      return;
    }
    const next = Array<number>(leaderboardSize).fill(0);
    for (let i = 0; i < Math.min(customShares.length, leaderboardSize); i++) {
      next[i] = customShares[i] ?? 0;
    }
    setCustomShares(next);
  }, [distributionType, leaderboardSize, customShares.length]);

  // Calculate distributions when params change
  useEffect(() => {
    if (!isERC20) return;
    let percentages: number[];
    if (distributionType === "custom") {
      percentages = Array.from({ length: leaderboardSize }, (_, i) =>
        (customShares[i] ?? 0) / 100,
      );
    } else {
      percentages = calculateDistribution(
        leaderboardSize,
        distributionWeight,
        0,
        0,
        0,
        distributionType,
      );
    }
    setPrizeDistributions(
      percentages.map((percentage, index) => ({
        position: index + 1,
        percentage,
      })),
    );
  }, [
    leaderboardSize,
    distributionWeight,
    distributionType,
    isERC20,
    customShares.join(","),
  ]);

  // Update amount based on USD value when price is available
  useEffect(() => {
    if (newPrize.tokenType === "ERC20" && newPrize.value !== undefined && newPrize.value > 0 && newPrize.token?.address) {
      const price = prices?.[indexAddress(newPrize.token.address)] ?? 0;

      if (price > 0) {
        const calculatedAmount = newPrize.value / price;
        setNewPrize((prev) => ({
          ...prev,
          amount: calculatedAmount,
        }));
      }
    }
  }, [prices, newPrize.value, newPrize.tokenType, newPrize.token?.address]);

  // Track if token was ever selected
  useEffect(() => {
    if (selectedToken && !tokenEverSelected) {
      setTokenEverSelected(true);
    }
  }, [selectedToken, tokenEverSelected]);

  // Check balance for ERC20 and ERC721
  useEffect(() => {
    const checkBalances = async () => {
      if (!checkBalance || !newPrize.token?.address) {
        setHasInsufficientBalance(false);
        return;
      }

      try {
        if (newPrize.tokenType === "ERC20" && newPrize.amount) {
          // Check ERC20 balance
          const balances = await getBalanceGeneral(newPrize.token.address);
          const normalizedAddress = indexAddress(newPrize.token.address);
          const decimals =
            tokenDecimals[normalizedAddress] ||
            (await getTokenDecimals(newPrize.token.address));
          const amount = (newPrize.amount ?? 0) * 10 ** decimals;

          setHasInsufficientBalance(balances < BigInt(Math.floor(amount)));
        } else if (
          newPrize.tokenType === "ERC721" &&
          newPrize.tokenId !== undefined
        ) {
          // Check ERC721 ownership - would need account and contract call
          // For now, we'll skip this check as it requires contract interaction
          // TODO: Implement NFT ownership check using account.callContract
          setHasInsufficientBalance(false);
        } else {
          setHasInsufficientBalance(false);
        }
      } catch (error) {
        console.error("Error checking balance:", error);
        setHasInsufficientBalance(false);
      }
    };
    checkBalances();
  }, [
    newPrize.token?.address,
    newPrize.amount,
    newPrize.tokenId,
    newPrize.tokenType,
    checkBalance,
    tokenDecimals,
  ]);

  const handleAddPrize = () => {
    if (!isValidPrize()) return;

    if (newPrize.tokenType === "ERC20") {
      onAddPrize({
        tokenType: "ERC20",
        token: newPrize.token,
        amount: newPrize.amount,
        value: newPrize.value,
        distribution: distributionType,
        distribution_weight: distributionWeight,
        distribution_count: leaderboardSize,
        distributions: prizeDistributions,
        custom_shares:
          distributionType === "custom" ? customShares.slice(0, leaderboardSize) : undefined,
      });
    } else if (newPrize.tokenType === "ERC721") {
      onAddPrize({
        tokenType: "ERC721",
        token: newPrize.token,
        tokenId: newPrize.tokenId,
        position: newPrize.position,
      });
    }

    // Reset form
    setNewPrize({
      token: {
        address: "",
        token_type: "erc20",
        name: "",
        symbol: "",
        is_registered: false,
      },
      tokenType: "ERC20",
    });
    setSelectedToken(undefined);
    setTokenEverSelected(false);
    setCustomShares([]);
    setDistributionType("exponential");
    // Notify parent that token was cleared
    onTokenSelect?.(undefined, "");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Prize Input Component */}
      <PrizeInput
        selectedToken={selectedToken}
        onTokenSelect={(token) => {
          setSelectedToken(token);
          const tokenType = token.token_type === "erc20" ? "ERC20" : "ERC721";
          setNewPrize((prev) => ({
            ...prev,
            token: token,
            tokenType,
            amount: undefined,
            tokenId: undefined,
            position: undefined,
          }));
          // Notify parent of token selection
          onTokenSelect?.(token, tokenType);
        }}
        onTokenDecimalsChange={(decimals) => {
          if (newPrize.token?.address) {
            setTokenDecimals((prev) => ({
              ...prev,
              [newPrize.token.address]: decimals,
            }));
          }
        }}
        tokenType={newPrize.tokenType}
        onTokenTypeChange={(type) => {
          setNewPrize({
            token: {
              address: "",
              token_type: type === "ERC20" ? "erc20" : "erc721",
              name: "",
              symbol: "",
              is_registered: false,
            },
            tokenType: type,
          });
          setSelectedToken(undefined);
          setTokenEverSelected(false);
          onTokenSelect?.(undefined, "");
        }}
        value={newPrize.value}
        onValueChange={(value) => setNewPrize((prev) => ({ ...prev, value }))}
        tokenAmount={newPrize.amount}
        tokenAddress={newPrize.token?.address}
        usdValue={newPrize.value}
        pricesLoading={pricesLoading}
        tokenId={newPrize.tokenId}
        onTokenIdChange={(tokenId) =>
          setNewPrize((prev) => ({ ...prev, tokenId }))
        }
        position={newPrize.position}
        onPositionChange={(position) =>
          setNewPrize((prev) => ({ ...prev, position }))
        }
        tokenEverSelected={tokenEverSelected}
        isSepolia={isSepolia}
        showTypeSelector={true}
      />

      {/* Distribution Visual for ERC20 */}
      {isERC20 && tokenEverSelected && newPrize.amount! > 0 && (
        <>
          <div className="w-full h-0.5 bg-brand/25" />
          <PrizeDistributionVisual
            distributions={prizeDistributions}
            weight={distributionWeight}
            onWeightChange={setDistributionWeight}
            onLeaderboardSizeChange={setLeaderboardSize}
            distributionType={distributionType}
            onDistributionTypeChange={(type) => {
              setDistributionType(type);
              if (type === "custom") {
                if (
                  customShares.length !== leaderboardSize ||
                  customShares.reduce((a, b) => a + (b || 0), 0) !== 10000
                ) {
                  setCustomShares(buildUniformBasisPointShares(leaderboardSize));
                }
              }
            }}
            customShares={customShares}
            onCustomShareChange={(index, basisPoints) => {
              setCustomShares((prev) => {
                const next = [...prev];
                while (next.length < leaderboardSize) next.push(0);
                next[index] = basisPoints;
                return next;
              });
            }}
            onResetCustomShares={() => {
              setCustomShares(buildUniformBasisPointShares(leaderboardSize));
            }}
            disabled={false}
            amount={newPrize.amount ?? 0}
            tokenSymbol={newPrize.token.symbol}
            usdValue={newPrize.value ?? 0}
            tokenLogoUrl={getTokenLogoUrl(chainId, newPrize.token.address)}
            leaderboardSize={leaderboardSize}
          />
        </>
      )}

      {/* Add Prize Button */}
      {tokenEverSelected && (
        <>
          <div className="w-full h-0.5 bg-brand/25" />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={
                !isValidPrize() || (checkBalance && hasInsufficientBalance)
              }
              onClick={handleAddPrize}
            >
              {checkBalance && hasInsufficientBalance
                ? "Insufficient Balance"
                : "Add Prize"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
