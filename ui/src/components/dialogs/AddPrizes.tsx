import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import TokenDialog from "@/components/dialogs/Token";
import AmountInput from "@/components/createTournament/inputs/Amount";
import {
  bigintToHex,
  calculateDistribution,
  formatNumber,
  getOrdinalSuffix,
} from "@/lib/utils";
import { NewPrize, FormToken } from "@/lib/types";
import { Prize } from "@/generated/models.gen";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { addAddressPadding, BigNumberish } from "starknet";
import { CairoCustomEnum } from "starknet";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { ALERT, CHECK, QUESTION, X } from "@/components/Icons";
import { useAccount } from "@starknet-react/core";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useDojo } from "@/context/dojo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useGetPrizeMetrics } from "@/dojo/hooks/useSqlQueries";

export function AddPrizesDialog({
  open,
  onOpenChange,
  tournamentId,
  tournamentName,
  leaderboardSize,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: BigNumberish;
  tournamentName: string;
  leaderboardSize: number;
}) {
  const { address, account } = useAccount();
  const { namespace, selectedChainConfig } = useDojo();
  const { connect } = useConnectToSelectedChain();
  const {
    approveAndAddPrizes,
    approveAndAddPrizesBatched,
    getBalanceGeneral,
    getTokenDecimals,
  } = useSystemCalls();
  const [selectedToken, setSelectedToken] = useState<FormToken | undefined>(
    undefined
  );
  const [newPrize, setNewPrize] = useState<NewPrize>({
    tokenAddress: "",
    tokenType: "",
    hasPrice: false,
  });
  const [currentPrizes, setCurrentPrizes] = useState<NewPrize[]>([]);
  const [distributionWeight, setDistributionWeight] = useState(1);
  const [prizeDistributions, setPrizeDistributions] = useState<
    { position: number; percentage: number }[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [onConfirmation, setOnConfirmation] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [_tokenBalances, setTokenBalances] = useState<Record<string, bigint>>(
    {}
  );
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [hasInsufficientBalance, setHasInsufficientBalance] = useState(false);
  const [missingTokenIds, setMissingTokenIds] = useState<
    Array<{ tokenAddress: string; tokenId: number }>
  >([]);
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {}
  );
  const [percentageArrayInput, setPercentageArrayInput] = useState<string>("");
  const [tokenIdsInput, setTokenIdsInput] = useState<string>("");

  const chainId = selectedChainConfig?.chainId ?? "";

  const { data: prizeMetricsModel } = useGetPrizeMetrics({
    namespace,
    active: open,
  });

  const totalDistributionPercentage = useMemo(() => {
    return (
      prizeDistributions.reduce((sum, pos) => sum + (pos.percentage || 0), 0) ||
      0
    );
  }, [prizeDistributions]);

  const isValidPrize = () => {
    if (!newPrize.tokenAddress) return false;

    if (newPrize.tokenType === "ERC20") {
      return !!newPrize.amount && totalDistributionPercentage === 100;
    }

    if (newPrize.tokenType === "ERC721") {
      return !!newPrize.tokenId && !!newPrize.position;
    }

    return false;
  };

  const isERC20 = newPrize.tokenType === "ERC20";

  const handlePercentageArrayPaste = () => {
    try {
      // Parse the input - support both array format [50,30,20] and comma-separated 50,30,20
      let percentages: number[];
      const trimmedInput = percentageArrayInput.trim();

      if (trimmedInput.startsWith("[") && trimmedInput.endsWith("]")) {
        // Parse as JSON array
        percentages = JSON.parse(trimmedInput);
      } else {
        // Parse as comma-separated values
        percentages = trimmedInput.split(",").map((p) => parseFloat(p.trim()));
      }

      // Validate the array
      if (!Array.isArray(percentages)) {
        alert("Please provide a valid array of percentages");
        return;
      }

      if (percentages.length !== leaderboardSize) {
        alert(
          `Please provide exactly ${leaderboardSize} percentages (you provided ${percentages.length})`
        );
        return;
      }

      // Check all values are numbers and positive
      if (!percentages.every((p) => typeof p === "number" && p >= 0)) {
        alert("All values must be positive numbers");
        return;
      }

      // Check total equals 100
      const total = percentages.reduce((sum, p) => sum + p, 0);
      if (Math.abs(total - 100) > 0.01) {
        alert(`Percentages must sum to 100% (current sum: ${total}%)`);
        return;
      }

      // Apply the percentages
      setPrizeDistributions(
        percentages.map((percentage, index) => ({
          position: index + 1,
          percentage,
        }))
      );

      // Clear the input
      setPercentageArrayInput("");
    } catch (error) {
      alert("Invalid format. Please use format like [50,30,20] or 50,30,20");
    }
  };

  const handleTokenIdsArrayPaste = () => {
    try {
      const trimmedInput = tokenIdsInput.trim();
      let newNFTPrizes: Array<{
        tokenType: "ERC721";
        tokenAddress: string;
        tokenId: number;
        position: number;
      }> = [];

      // Try to detect format
      if (trimmedInput.startsWith("[") && trimmedInput.endsWith("]")) {
        // JSON array format - array of objects only
        const parsed = JSON.parse(trimmedInput);

        if (Array.isArray(parsed) && parsed.length > 0) {
          if (
            typeof parsed[0] === "object" &&
            parsed[0].tokenId !== undefined
          ) {
            // Array of objects: [{ tokenId: 1, position: 1 }, ...]
            newNFTPrizes = parsed.map((item) => {
              if (
                typeof item.tokenId !== "number" ||
                typeof item.position !== "number"
              ) {
                throw new Error(
                  "Invalid object format - each object must have tokenId and position as numbers"
                );
              }
              if (item.position < 1 || item.position > leaderboardSize) {
                throw new Error(
                  `Position ${item.position} is out of range (1-${leaderboardSize})`
                );
              }
              return {
                tokenType: "ERC721" as const,
                tokenAddress: newPrize.tokenAddress,
                tokenId: item.tokenId,
                position: item.position,
              };
            });
          } else {
            throw new Error(
              "JSON array must contain objects with tokenId and position fields"
            );
          }
        }
      } else if (trimmedInput.includes(":")) {
        // Key-value format: tokenId:position (one per line or comma separated)
        // Example: "1:1, 2:2, 3:3" or "1:1\n2:2\n3:3"
        const lines = trimmedInput.split(/[\n,]+/);

        newNFTPrizes = lines
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => {
            const [tokenIdStr, positionStr] = line
              .split(":")
              .map((s) => s.trim());
            const tokenId = parseInt(tokenIdStr);
            const position = parseInt(positionStr);

            if (isNaN(tokenId) || isNaN(position)) {
              throw new Error(`Invalid format in line: ${line}`);
            }

            if (position < 1 || position > leaderboardSize) {
              throw new Error(
                `Position ${position} is out of range (1-${leaderboardSize})`
              );
            }

            return {
              tokenType: "ERC721" as const,
              tokenAddress: newPrize.tokenAddress,
              tokenId,
              position,
            };
          });
      } else {
        throw new Error(
          "Position information is required. Please use tokenId:position format or JSON object array format"
        );
      }

      // Validate we have prizes to add
      if (newNFTPrizes.length === 0) {
        alert("No valid NFT prizes to add");
        return;
      }

      // Add all NFT prizes
      setCurrentPrizes([...currentPrizes, ...newNFTPrizes]);

      // Clear the input
      setTokenIdsInput("");
    } catch (error) {
      alert(
        `Invalid format. Supported formats:\n\n` +
          `1. Token:Position pairs (one per line or comma-separated):\n` +
          `   1:1, 2:2, 3:3\n\n` +
          `2. JSON array of objects:\n` +
          `   [{ "tokenId": 1, "position": 1 }, { "tokenId": 2, "position": 2 }]\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  useEffect(() => {
    if (open && leaderboardSize) {
      // Initialize distributions when dialog opens
      const distributions = calculateDistribution(
        leaderboardSize,
        distributionWeight
      );
      setPrizeDistributions(
        distributions.map((percentage, index) => ({
          position: index + 1,
          percentage,
        }))
      );
    }
  }, [open, leaderboardSize]);

  useEffect(() => {
    if (!open) {
      setOnConfirmation(false);
      setBatchProgress(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen) {
      setOnConfirmation(false);
      onOpenChange(false);
    } else {
      onOpenChange(true);
    }
  };

  const prizeCount = Number(prizeMetricsModel?.total_prizes ?? 0);

  const handleAddPrizes = async () => {
    if (
      newPrize.tokenType === "ERC20" &&
      newPrize.amount &&
      totalDistributionPercentage === 100
    ) {
      setCurrentPrizes([
        ...currentPrizes,
        ...prizeDistributions.map((prize) => ({
          tokenType: "ERC20" as const,
          tokenAddress: newPrize.tokenAddress,
          amount: ((newPrize.amount ?? 0) * prize.percentage) / 100,
          position: prize.position,
          value: ((newPrize.value ?? 0) * prize.percentage) / 100,
          hasPrice: newPrize.hasPrice,
        })),
      ]);
    } else if (
      newPrize.tokenType === "ERC721" &&
      newPrize.tokenId &&
      newPrize.position
    ) {
      setCurrentPrizes([
        ...currentPrizes,
        {
          tokenType: "ERC721",
          tokenAddress: newPrize.tokenAddress,
          tokenId: newPrize.tokenId,
          position: newPrize.position,
        },
      ]);
    }
    setNewPrize({ tokenAddress: "", tokenType: "" });
    setSelectedToken(undefined);
  };

  const submitPrizes = async () => {
    setIsSubmitting(true);
    try {
      let prizesToAdd: Prize[] = [];

      // Filter out prizes with 0 amounts to avoid transaction errors
      const validPrizes = currentPrizes.filter((prize) => {
        if (prize.tokenType === "ERC20") {
          return prize.amount && prize.amount > 0;
        }
        return true; // ERC721 prizes are always valid if they have a tokenId
      });

      // Fetch decimals for all unique ERC20 token addresses
      const uniqueERC20Addresses = Array.from(
        new Set(
          validPrizes
            .filter((prize) => prize.tokenType === "ERC20")
            .map((prize) => prize.tokenAddress)
        )
      );

      const decimalsPromises = uniqueERC20Addresses.map(async (address) => {
        if (!tokenDecimals[address]) {
          const decimals = await getTokenDecimals(address);
          return { address, decimals };
        }
        return { address, decimals: tokenDecimals[address] };
      });

      const decimalsResults = await Promise.all(decimalsPromises);
      const newDecimals = decimalsResults.reduce(
        (acc, { address, decimals }) => {
          acc[address] = decimals;
          return acc;
        },
        {} as Record<string, number>
      );

      // Update decimals state
      setTokenDecimals((prev) => ({ ...prev, ...newDecimals }));

      prizesToAdd = validPrizes.map((prize, index) => ({
        id: Number(prizeCount) + index + 1,
        tournament_id: tournamentId,
        token_address: prize.tokenAddress,
        token_type:
          prize.tokenType === "ERC20"
            ? new CairoCustomEnum({
                erc20: {
                  amount: addAddressPadding(
                    bigintToHex(
                      BigInt(
                        Math.floor(
                          prize.amount! *
                            10 ** (newDecimals[prize.tokenAddress] || 18)
                        )
                      )
                    )
                  ),
                },
                erc721: undefined,
              })
            : new CairoCustomEnum({
                erc20: undefined,
                erc721: {
                  id: addAddressPadding(bigintToHex(prize.tokenId!)),
                },
              }),
        payout_position: prize.position ?? 0n,
        claimed: false,
      }));

      // Use batched version if there are many prizes
      if (prizesToAdd.length > 30) {
        await approveAndAddPrizesBatched(
          tournamentName,
          prizesToAdd,
          true,
          totalValue,
          Number(prizeCount),
          30, // batch size
          (current, total) => setBatchProgress({ current, total })
        );
      } else {
        await approveAndAddPrizes(
          tournamentName,
          prizesToAdd,
          true,
          totalValue,
          Number(prizeCount)
        );
      }

      setCurrentPrizes([]);
      setSelectedToken(undefined);
      setOnConfirmation(false);
      onOpenChange(false);
      setIsSubmitting(false);
    } catch (error) {
      console.error("Failed to add prizes:", error);
      setIsSubmitting(false);
    }
  };

  const aggregatedPrizes = currentPrizes.reduce((acc, prize) => {
    const key = `${prize.position}-${prize.tokenAddress}-${prize.tokenType}`;

    if (!acc[key]) {
      acc[key] = {
        ...prize,
        amount: prize.tokenType === "ERC20" ? prize.amount : undefined,
        tokenIds: prize.tokenType === "ERC721" ? [prize.tokenId] : [],
        count: 1,
      };
    } else {
      if (prize.tokenType === "ERC20") {
        acc[key].amount = (acc[key].amount || 0) + (prize.amount || 0);
      } else if (prize.tokenType === "ERC721") {
        acc[key].tokenIds = [...(acc[key].tokenIds || []), prize.tokenId];
      }
      acc[key].count += 1;
    }

    return acc;
  }, {} as Record<string, any>);

  // Convert to array for rendering
  const aggregatedPrizesArray = Object.values(aggregatedPrizes);

  // Calculate total value in USD for ERC20 tokens
  const totalValue = aggregatedPrizesArray.reduce((sum, prize: any) => {
    if (prize.tokenType === "ERC20" && prize.value) {
      if (!prize.hasPrice) return sum;
      return sum + prize.value;
    }
    return sum;
  }, 0);

  // Count total NFTs
  const totalNFTs = aggregatedPrizesArray.reduce((sum, prize: any) => {
    if (prize.tokenType === "ERC721" && prize.tokenIds) {
      return sum + prize.tokenIds.length;
    }
    return sum;
  }, 0);

  const uniqueTokenAddresses = useMemo(() => {
    // Filter to only include ERC20 tokens, then get unique addresses
    const addresses = currentPrizes
      .filter((prize) => prize.tokenType === "ERC20")
      .map((prize) => prize.tokenAddress)
      .filter(
        (address): address is string =>
          typeof address === "string" && address !== ""
      );

    // Create a Set from the filtered array to get unique values
    return [...new Set(addresses)];
  }, [currentPrizes]);

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: [
      ...uniqueTokenAddresses,
      // Only include new prize if it's ERC20
      ...(newPrize.tokenAddress && newPrize.tokenType === "ERC20"
        ? [newPrize.tokenAddress]
        : []),
    ],
  });

  useEffect(() => {
    // Only calculate amount from price for ERC20 tokens
    if (newPrize.tokenType === "ERC20") {
      setNewPrize((prev) => ({
        ...prev,
        amount:
          (prev.value ?? 0) /
          (prices?.[prev.tokenAddress] ?? 1),
        hasPrice: !!prices?.[prev.tokenAddress],
      }));
    }
  }, [prices, newPrize.value, newPrize.tokenType]);

  const checkAllBalances = useCallback(async () => {
    if (!address) return;

    setIsLoadingBalances(true);

    try {
      // Get unique ERC20 token addresses only
      const uniqueERC20Tokens = Array.from(
        new Set(
          currentPrizes
            .filter((prize) => prize.tokenType === "ERC20")
            .map((prize) => prize.tokenAddress)
        )
      );

      // Fetch balances for each ERC20 token
      const balances: Record<string, bigint> = {};

      for (const tokenAddress of uniqueERC20Tokens) {
        const balance = await getBalanceGeneral(tokenAddress);
        balances[tokenAddress] = balance;
      }

      setTokenBalances(balances);

      // Check if any token has insufficient balance
      let insufficient = false;
      const missing: Array<{ tokenAddress: string; tokenId: number }> = [];

      // Get decimals for balance checking
      const erc20Addresses = aggregatedPrizesArray
        .filter((prize: any) => prize.tokenType === "ERC20")
        .map((prize: any) => prize.tokenAddress);

      const decimalsForBalance: Record<string, number> = {};
      for (const address of erc20Addresses) {
        if (!tokenDecimals[address]) {
          decimalsForBalance[address] = await getTokenDecimals(address);
        } else {
          decimalsForBalance[address] = tokenDecimals[address];
        }
      }

      for (const prize of aggregatedPrizesArray) {
        if (prize.tokenType === "ERC20") {
          // For ERC20, check if balance >= amount using correct decimals
          const tokenBalance = BigInt(balances[prize.tokenAddress] || "0");
          const decimals = decimalsForBalance[prize.tokenAddress] || 18;
          const requiredAmount = BigInt(
            Math.floor(prize.amount * 10 ** decimals)
          );

          if (tokenBalance < requiredAmount) {
            insufficient = true;
            break;
          }
        } else if (prize.tokenType === "ERC721") {
          // For ERC721, check ownership of each token ID
          const tokenIds = prize.tokenIds || [];
          for (const tokenId of tokenIds) {
            try {
              // owner_of expects token_id as u256 (low, high)
              const ownerResult = await account?.callContract({
                contractAddress: prize.tokenAddress,
                entrypoint: "owner_of",
                calldata: [tokenId.toString(), "0"], // u256: low, high
              });

              // owner_of returns the owner address
              const owner = ownerResult?.[0];

              // Compare owner address with user's address
              if (BigInt(owner || "0") !== BigInt(address || "0")) {
                insufficient = true;
                missing.push({
                  tokenAddress: prize.tokenAddress,
                  tokenId: tokenId,
                });
                console.error(
                  `User does not own token ID ${tokenId} of ${prize.tokenAddress}`
                );
              }
            } catch (error) {
              console.error(
                `Error checking ownership of token ID ${tokenId}:`,
                error
              );
              insufficient = true;
              missing.push({
                tokenAddress: prize.tokenAddress,
                tokenId: tokenId,
              });
            }
          }
        }
      }

      setHasInsufficientBalance(insufficient);
      setMissingTokenIds(missing);
    } catch (error) {
      console.error("Error checking balances:", error);
      setHasInsufficientBalance(true);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [
    address,
    account,
    currentPrizes,
    aggregatedPrizesArray,
    tokenDecimals,
    getTokenDecimals,
  ]);

  useEffect(() => {
    if (onConfirmation && address) {
      checkAllBalances();
    }
  }, [onConfirmation, address]);

  if (onConfirmation) {
    return (
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Confirm Prizes</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4 overflow-y-auto">
            {batchProgress && (
              <div className="bg-brand/10 border border-brand p-4 rounded-lg">
                <div className="flex items-center gap-3">
                  <LoadingSpinner />
                  <div>
                    <p className="font-semibold">Processing Transactions</p>
                    <p className="text-sm text-muted-foreground">
                      Batch {batchProgress.current} of {batchProgress.total} -
                      Please do not close this window
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Prize Summary</h3>
                <div className="flex flex-col items-end">
                  {totalValue > 0 && (
                    <span className="font-bold text-lg font-brand">
                      Total: ${totalValue.toFixed(2)}
                    </span>
                  )}
                  {totalNFTs > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {totalNFTs} NFT{totalNFTs !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              {/* Balance status */}
              {isLoadingBalances ? (
                <div className="mt-2 text-sm">Checking balances...</div>
              ) : hasInsufficientBalance ? (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="font-medium flex flex-row items-center gap-2 text-destructive">
                    <span className="w-6">
                      <ALERT />
                    </span>
                    <span>Insufficient balance for some tokens</span>
                  </div>
                  {missingTokenIds.length > 0 && (
                    <div className="ml-8 text-sm space-y-1">
                      <p className="font-semibold">Missing ERC721 Token IDs:</p>
                      <div className="max-h-32 overflow-y-auto bg-black/30 p-2 rounded border border-destructive/30">
                        {missingTokenIds.map(
                          ({ tokenAddress, tokenId }, idx) => (
                            <div key={idx} className="font-mono text-xs">
                              Token #{tokenId}
                              <span className="text-muted-foreground ml-2">
                                ({tokenAddress.slice(0, 6)}...
                                {tokenAddress.slice(-4)})
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 font-medium flex flex-row items-center gap-2">
                  <span className="w-6">
                    <CHECK />
                  </span>
                  <span>Sufficient balance for all tokens</span>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {aggregatedPrizesArray.map((prize: any, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border border-brand-muted rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-brand w-10">
                      {`${prize.position}${getOrdinalSuffix(prize.position)}`}
                    </span>
                    <span className="font-medium">
                      {prize.tokenType === "ERC721"
                        ? selectedToken?.symbol || "NFT"
                        : selectedToken?.symbol}
                    </span>
                    {prize.count > 1 && (
                      <span className="text-sm text-muted-foreground">
                        ({prize.count}{" "}
                        {prize.tokenType === "ERC721" ? "NFTs" : "prizes"})
                      </span>
                    )}
                  </div>
                  <div>
                    {prize.tokenType === "ERC20" ? (
                      <div className="flex flex-row items-center gap-2">
                        <span className="font-semibold">
                          {formatNumber(prize.amount)}
                        </span>
                        <img
                          src={getTokenLogoUrl(chainId, prize.tokenAddress)}
                          className="w-6 h-6 rounded-full"
                          alt="Token logo"
                        />
                        {prize.hasPrice ? (
                          <span className="text-sm text-neutral">
                            ~${prize.value.toFixed(2)}
                          </span>
                        ) : (
                          <Tooltip delayDuration={50}>
                            <TooltipTrigger asChild>
                              <span className="w-6 h-6 text-neutral cursor-pointer">
                                <QUESTION />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-brand text-neutral">
                              <span>No price data available</span>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-end">
                        {prize.tokenIds.length <= 5 ? (
                          // Show all token IDs if 5 or fewer
                          prize.tokenIds.map((id: number, idx: number) => (
                            <span key={idx} className="font-semibold text-sm">
                              #{id}
                            </span>
                          ))
                        ) : (
                          // Show compact summary for more than 5
                          <Tooltip delayDuration={50}>
                            <TooltipTrigger asChild>
                              <div className="text-right cursor-pointer">
                                <span className="font-semibold text-sm block">
                                  {prize.tokenIds.length} NFTs
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  #{prize.tokenIds[0]} - #
                                  {prize.tokenIds[prize.tokenIds.length - 1]}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-brand max-h-64 overflow-y-auto">
                              <div className="grid grid-cols-5 gap-2 text-xs max-w-md">
                                {prize.tokenIds.map(
                                  (id: number, idx: number) => (
                                    <span key={idx}>#{id}</span>
                                  )
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                onClick={() => setOnConfirmation(false)}
              >
                Back to Edit
              </Button>
              <Button
                onClick={submitPrizes}
                disabled={isSubmitting || hasInsufficientBalance}
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <LoadingSpinner />
                    {batchProgress ? (
                      <span>
                        Processing batch {batchProgress.current} of{" "}
                        {batchProgress.total}...
                      </span>
                    ) : (
                      <span>Adding...</span>
                    )}
                  </div>
                ) : (
                  "Confirm & Submit"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Prizes to Tournament</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 overflow-y-auto pr-2">
          {/* Token Selection */}
          <div className="flex flex-row items-center gap-4">
            <div className="pt-6">
              <TokenDialog
                selectedToken={selectedToken}
                onSelect={(token) => {
                  setSelectedToken(token);
                  setNewPrize((prev) => ({
                    ...prev,
                    tokenAddress: token.address,
                    tokenType:
                      token.token_type === "erc20" ? "ERC20" : "ERC721",
                    // Reset other values when token changes
                    amount: undefined,
                    tokenId: undefined,
                    position: undefined,
                  }));
                }}
              />
            </div>
            {/* Amount/Token ID Input */}
            {newPrize.tokenAddress && (
              <div className="flex flex-col gap-1">
                <div className="flex flex-row justify-between">
                  <span className="min-w-[100px] font-brand">
                    {isERC20 ? "Amount ($)" : "Token ID"}
                  </span>
                  {isERC20 && !pricesLoading ? (
                    <div className="flex flex-row items-center gap-2">
                      <p>~{formatNumber(newPrize.amount ?? 0)}</p>
                      <img
                        src={getTokenLogoUrl(chainId, newPrize.tokenAddress)}
                        className="w-6 h-6 rounded-full"
                      />
                    </div>
                  ) : isERC20 && pricesLoading ? (
                    <p>Loading...</p>
                  ) : null}
                </div>
                {isERC20 ? (
                  <AmountInput
                    value={newPrize.value || 0}
                    onChange={(value) =>
                      setNewPrize((prev) => ({
                        ...prev,
                        value: value,
                      }))
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center gap-4">
                      <Input
                        type="number"
                        placeholder="Token ID"
                        value={newPrize.tokenId || ""}
                        onChange={(e) =>
                          setNewPrize((prev) => ({
                            ...prev,
                            tokenId: Number(e.target.value),
                          }))
                        }
                        className="w-[150px]"
                      />
                      <Input
                        type="number"
                        placeholder="Position"
                        min={1}
                        max={leaderboardSize}
                        value={newPrize.position || ""}
                        onChange={(e) =>
                          setNewPrize((prev) => ({
                            ...prev,
                            position: Number(e.target.value),
                          }))
                        }
                        className="w-[100px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {newPrize.tokenAddress && (
            <>
              {/* Bulk Token IDs Input (for ERC721 only) */}
              {!isERC20 && (
                <div className="space-y-2 border border-brand-muted p-4 rounded-lg">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">Bulk Add NFTs</span>
                    <span className="text-sm text-neutral">
                      Add multiple token IDs with position mapping
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm">
                        Token IDs with Positions
                      </Label>
                      <textarea
                        placeholder={`Supported formats:

1. Token:Position pairs (one per line or comma-separated):
   1:1
   2:2
   3:2

2. JSON array of objects:
   [{ "tokenId": 1, "position": 1 }, { "tokenId": 2, "position": 2 }]

Examples:
- Award 3 NFTs to first place: 1:1, 2:1, 3:1
- Distribute across positions: 1:1, 2:2, 3:2, 4:3`}
                        value={tokenIdsInput}
                        onChange={(e) => setTokenIdsInput(e.target.value)}
                        className="flex min-h-[120px] w-full rounded-md border border-brand-muted bg-black px-3 py-2 text-sm text-brand placeholder:text-neutral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
                        rows={6}
                      />
                    </div>
                    <div className="flex justify-end items-center">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTokenIdsArrayPaste}
                        disabled={!tokenIdsInput.trim()}
                      >
                        Add All NFTs
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Distribution Settings (for ERC20 only) */}
              {isERC20 && (
                <>
                  {/* Percentage Array Input */}
                  <div className="space-y-2">
                    <div className="flex flex-row items-center gap-2">
                      <span className="min-w-[100px]">Quick Entry</span>
                      <span className="text-sm text-neutral">
                        Paste an array of {leaderboardSize} percentages
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder={`e.g., [50, 30, 20] or 50,30,20 (${leaderboardSize} values)`}
                        value={percentageArrayInput}
                        onChange={(e) =>
                          setPercentageArrayInput(e.target.value)
                        }
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePercentageArrayPaste}
                        disabled={!percentageArrayInput.trim()}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-row items-center gap-2">
                      <span className="min-w-[100px]">Distribution</span>
                      <span className="text-sm text-neutral">
                        Adjust the spread of the distribution
                      </span>
                    </div>
                    <div className="flex flex-row items-center gap-4">
                      <Slider
                        min={0}
                        max={5}
                        step={0.1}
                        value={[distributionWeight]}
                        onValueChange={([value]) => {
                          setDistributionWeight(value);
                          const distributions = calculateDistribution(
                            leaderboardSize,
                            value
                          );
                          setPrizeDistributions(
                            distributions.map((percentage, index) => ({
                              position: index + 1,
                              percentage,
                            }))
                          );
                        }}
                        className="w-[200px] h-10"
                      />
                      <span className="w-12 text-center">
                        {distributionWeight.toFixed(1)}
                      </span>
                      <div className="flex flex-row gap-2 items-center justify-between text-sm text-muted-foreground">
                        <span>Total: {totalDistributionPercentage}%</span>
                        {totalDistributionPercentage !== 100 && (
                          <span className="text-destructive">
                            Total must equal 100%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-full overflow-hidden">
                    <div className="flex flex-row gap-4 overflow-x-auto pb-2">
                      {Array.from({
                        length: leaderboardSize,
                      }).map((_, index) => (
                        <div
                          key={index}
                          className="w-[175px] min-w-[175px] flex flex-row items-center justify-between flex-shrink-0 border border-neutral rounded-md p-2"
                        >
                          <span className="font-brand text-lg">
                            {index + 1}
                            {getOrdinalSuffix(index + 1)}
                          </span>

                          <div className="relative w-[50px]">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="pr-4 px-1"
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setPrizeDistributions((prev) =>
                                  prev.map((item) =>
                                    item.position === index + 1
                                      ? { ...item, percentage: value }
                                      : item
                                  )
                                );
                              }}
                              value={
                                prizeDistributions[index]?.percentage || ""
                              }
                            />
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                              %
                            </span>
                          </div>

                          <div className="flex flex-col">
                            <div className="flex flex-row items-center gap-1">
                              <span className="text-xs">
                                {formatNumber(
                                  ((prizeDistributions[index]?.percentage ??
                                    0) *
                                    (newPrize.amount ?? 0)) /
                                    100
                                )}
                              </span>
                              <img
                                src={getTokenLogoUrl(
                                  chainId,
                                  newPrize.tokenAddress
                                )}
                                className="w-4 h-4 rounded-full"
                              />
                            </div>
                            {prices?.[newPrize.tokenAddress] && (
                              <span className="text-xs text-neutral">
                                ~$
                                {(
                                  ((prizeDistributions[index]?.percentage ??
                                    0) *
                                    (newPrize.value ?? 0)) /
                                  100
                                ).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex flex-row justify-between w-full overflow-hidden">
          <div className="w-1/2 overflow-hidden">
            <div className="flex flex-row gap-2 overflow-x-auto pb-2">
              {currentPrizes.map((prize, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-background/50 border border-brand-muted/50 rounded flex-shrink-0"
                >
                  <span className="font-brand">
                    {prize.position}
                    {getOrdinalSuffix(prize.position ?? 0)}
                  </span>

                  <div className="flex flex-row items-center gap-2">
                    {prize.tokenType === "ERC20" ? (
                      <div className="flex flex-row items-center gap-1">
                        <div className="flex flex-row gap-1 items-center">
                          <span>{formatNumber(prize.amount ?? 0)}</span>
                          <img
                            src={getTokenLogoUrl(chainId, prize.tokenAddress)}
                            className="w-6 h-6 rounded-full flex-shrink-0"
                            alt="Token logo"
                          />
                        </div>

                        <span className="text-sm text-neutral">
                          {pricesLoading
                            ? "Loading..."
                            : prices?.[prize.tokenAddress] &&
                              `~$${(
                                (prize.amount ?? 0) *
                                (prices?.[prize.tokenAddress] ?? 0)
                              ).toFixed(2)}`}
                        </span>
                      </div>
                    ) : (
                      <span className="whitespace-nowrap">
                        #{prize.tokenId}
                      </span>
                    )}

                    {/* Delete button */}
                    <span
                      className="w-6 h-6 text-brand-muted cursor-pointer flex-shrink-0"
                      onClick={() => {
                        const newPrizes = [...currentPrizes];
                        newPrizes.splice(index, 1);
                        setCurrentPrizes(newPrizes);
                      }}
                    >
                      <X />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="w-1/2 flex justify-end items-center gap-2">
            <Button
              type="button"
              disabled={!isValidPrize()}
              onClick={handleAddPrizes}
            >
              Add Prize
            </Button>
            {currentPrizes.length > 0 &&
              (address ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOnConfirmation(true)}
                >
                  Review & Submit
                </Button>
              ) : (
                <Button onClick={() => connect()}>Connect Wallet</Button>
              ))}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
