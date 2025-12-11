import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrizeInput } from "@/components/createTournament/inputs/PrizeInput";
import { PrizeDistributionVisual } from "@/components/createTournament/PrizeDistributionVisual";
import { FormToken } from "@/lib/types";
import { calculateDistribution } from "@/lib/utils";
import { getTokenSymbol, getTokenLogoUrl } from "@/lib/tokensMeta";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";

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
  distribution?: "exponential" | "linear" | "uniform";
  distribution_count?: number;
  distributions?: { position: number; percentage: number }[];

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
  onTokenSelect?: (token: FormToken | undefined, tokenType: "ERC20" | "ERC721" | "") => void;
}

export function PrizeSelector({
  chainId,
  isSepolia,
  onAddPrize,
  checkBalance = true,
  existingPrizes = [],
  onTokenSelect,
}: PrizeSelectorProps) {
  const [selectedToken, setSelectedToken] = useState<FormToken | undefined>(undefined);
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
  const [distributionType, setDistributionType] = useState<"exponential" | "linear" | "uniform">("exponential");
  const [leaderboardSize, setLeaderboardSize] = useState(10);
  const [prizeDistributions, setPrizeDistributions] = useState<{ position: number; percentage: number }[]>([]);
  const [hasInsufficientBalance, setHasInsufficientBalance] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>({});

  const { getBalanceGeneral, getTokenDecimals } = useSystemCalls();

  const isERC20 = newPrize.tokenType === "ERC20";

  // Get unique token symbols for price fetching
  const uniqueTokenSymbols = useMemo(() => {
    const symbols = existingPrizes
      .filter((prize) => prize.type === "ERC20" || prize.tokenType === "ERC20")
      .map((prize) => getTokenSymbol(chainId, prize.token?.address || prize.tokenAddress))
      .filter((symbol): symbol is string => typeof symbol === "string" && symbol !== "");

    return [...new Set([
      ...symbols,
      ...(newPrize.token?.address ? [getTokenSymbol(chainId, newPrize.token.address) ?? ""] : []),
    ])];
  }, [existingPrizes, newPrize.token?.address, chainId]);

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: uniqueTokenSymbols,
  });

  const totalDistributionPercentage = useMemo(() => {
    return prizeDistributions.reduce((sum, pos) => sum + (pos.percentage || 0), 0) || 0;
  }, [prizeDistributions]);

  const isValidPrize = () => {
    if (!newPrize.token?.address) return false;

    if (newPrize.tokenType === "ERC20") {
      const isPercentageValid = Math.abs(totalDistributionPercentage - 100) < 0.01;
      return !!newPrize.amount && isPercentageValid;
    }

    if (newPrize.tokenType === "ERC721") {
      return !!newPrize.tokenId && !!newPrize.position;
    }

    return false;
  };

  // Calculate distributions when params change
  useEffect(() => {
    if (isERC20) {
      const distributions = calculateDistribution(
        leaderboardSize,
        distributionWeight,
        0,
        0,
        0,
        distributionType
      );
      setPrizeDistributions(
        distributions.map((percentage, index) => ({
          position: index + 1,
          percentage,
        }))
      );
    }
  }, [leaderboardSize, distributionWeight, distributionType, isERC20]);

  // Update amount based on price
  useEffect(() => {
    if (newPrize.tokenType === "ERC20") {
      setNewPrize((prev) => ({
        ...prev,
        amount:
          (prev.value ?? 0) /
          (prices?.[getTokenSymbol(chainId, prev.token?.address ?? "") ?? ""] ?? 1),
      }));
    }
  }, [prices, newPrize.value, newPrize.tokenType, chainId]);

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
          const decimals = tokenDecimals[newPrize.token.address] || await getTokenDecimals(newPrize.token.address);
          const amount = (newPrize.amount ?? 0) * 10 ** decimals;

          setHasInsufficientBalance(balances < BigInt(Math.floor(amount)));
        } else if (newPrize.tokenType === "ERC721" && newPrize.tokenId !== undefined) {
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
  }, [newPrize.token?.address, newPrize.amount, newPrize.tokenId, newPrize.tokenType, checkBalance, tokenDecimals]);

  const handleAddPrize = () => {
    if (!isValidPrize()) return;

    if (newPrize.tokenType === "ERC20") {
      onAddPrize({
        tokenType: "ERC20",
        token: newPrize.token,
        amount: newPrize.amount,
        value: newPrize.value,
        distribution: distributionType,
        distribution_count: leaderboardSize,
        distributions: prizeDistributions,
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
        onTokenIdChange={(tokenId) => setNewPrize((prev) => ({ ...prev, tokenId }))}
        position={newPrize.position}
        onPositionChange={(position) => setNewPrize((prev) => ({ ...prev, position }))}
        tokenEverSelected={tokenEverSelected}
        isSepolia={isSepolia}
        showTypeSelector={true}
      />

      {/* Distribution Visual for ERC20 */}
      {isERC20 && tokenEverSelected && newPrize.amount && (
        <>
          <div className="w-full h-0.5 bg-brand/25" />
          <PrizeDistributionVisual
            distributions={prizeDistributions}
            weight={distributionWeight}
            onWeightChange={setDistributionWeight}
            onLeaderboardSizeChange={setLeaderboardSize}
            distributionType={distributionType}
            onDistributionTypeChange={setDistributionType}
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
              disabled={!isValidPrize() || (checkBalance && hasInsufficientBalance)}
              onClick={handleAddPrize}
            >
              {checkBalance && hasInsufficientBalance ? "Insufficient Balance" : "Add Prize"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
