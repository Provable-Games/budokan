/**
 * Dialog for swapping Starknet tokens to entry fee token using Ekubo DEX
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/spinner";
import { CHECK, ARROW_RIGHT } from "@/components/Icons";
import { useAccount } from "@starknet-react/core";
import { useEkuboSwap } from "@/hooks/useEkuboSwap";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { formatTokenAmount } from "@/lib/ekuboSwap";
import { useDojo } from "@/context/dojo";
import { getTokenLogoUrl } from "@/lib/tokensMeta";

// Common tokens on Starknet for swapping
const SWAP_TOKENS = [
  {
    symbol: "ETH",
    name: "Ethereum",
    address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    decimals: 18,
  },
  {
    symbol: "STRK",
    name: "Starknet Token",
    address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    decimals: 18,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    decimals: 6,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    decimals: 6,
  },
];

interface SwapTokensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryFeeAmount: bigint;
  entryFeeToken: string;
  entryFeeDecimals: number;
  entryFeeSymbol: string;
  onSwapSuccess: () => void;
}

type Step = "select-token" | "enter-amount" | "review" | "swapping" | "success";

export function SwapTokensDialog({
  open,
  onOpenChange,
  entryFeeAmount,
  entryFeeToken,
  entryFeeDecimals,
  entryFeeSymbol,
  onSwapSuccess,
}: SwapTokensDialogProps) {
  const { account } = useAccount();
  const { selectedChainConfig } = useDojo();
  const { getBalanceGeneral, executeSwap } = useSystemCalls();
  const chainId = selectedChainConfig?.chainId ?? "";

  const [step, setStep] = useState<Step>("select-token");
  const [selectedToken, setSelectedToken] = useState<typeof SWAP_TOKENS[0] | null>(null);
  const [inputAmount, setInputAmount] = useState("");
  const [tokenBalances, setTokenBalances] = useState<Record<string, bigint>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  const {
    swapState,
    error: quoteError,
    quoteResult,
    getQuoteForExactOutput,
    generateCalls,
    reset: resetSwap,
  } = useEkuboSwap();

  // Filter out the entry fee token from swap options
  const availableTokens = useMemo(() => {
    const normalizedEntryToken = entryFeeToken.toLowerCase();
    return SWAP_TOKENS.filter(
      (token) => token.address.toLowerCase() !== normalizedEntryToken
    );
  }, [entryFeeToken]);

  // Fetch token balances
  useEffect(() => {
    if (!open || !account) return;

    const fetchBalances = async () => {
      setLoadingBalances(true);
      const balances: Record<string, bigint> = {};

      for (const token of availableTokens) {
        try {
          const balance = await getBalanceGeneral(token.address);
          balances[token.address] = BigInt(balance.toString());
        } catch (err) {
          console.error(`Failed to fetch balance for ${token.symbol}:`, err);
          balances[token.address] = 0n;
        }
      }

      setTokenBalances(balances);
      setLoadingBalances(false);
    };

    fetchBalances();
  }, [open, account, availableTokens, getBalanceGeneral]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("select-token");
      setSelectedToken(null);
      setInputAmount("");
      setSwapError(null);
      resetSwap();
    }
  }, [open, resetSwap]);

  // Get quote when user enters amount
  const handleGetQuote = useCallback(async () => {
    if (!selectedToken || !inputAmount) return;

    setSwapError(null);

    // Get quote for exact output (entry fee amount)
    const result = await getQuoteForExactOutput(
      entryFeeAmount.toString(),
      selectedToken.address,
      entryFeeToken
    );

    if (result) {
      setStep("review");
    }
  }, [selectedToken, inputAmount, entryFeeAmount, entryFeeToken, getQuoteForExactOutput]);

  // Handle swap execution
  const handleSwap = useCallback(async () => {
    if (!quoteResult || !selectedToken) return;

    setStep("swapping");
    setSwapError(null);

    try {
      const calls = generateCalls(100); // 1% slippage

      if (calls.length === 0) {
        throw new Error("Failed to generate swap calls");
      }

      await executeSwap(calls);
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Swap failed";
      setSwapError(message);
      setStep("review"); // Go back to review on error
    }
  }, [quoteResult, selectedToken, generateCalls, executeSwap]);

  // Format display amounts
  const formatBalance = (address: string, decimals: number) => {
    const balance = tokenBalances[address] ?? 0n;
    return formatTokenAmount(balance.toString(), decimals);
  };

  const hasEnoughBalance = useMemo(() => {
    if (!selectedToken || !quoteResult) return false;
    const balance = tokenBalances[selectedToken.address] ?? 0n;
    return balance >= BigInt(quoteResult.inputAmount);
  }, [selectedToken, quoteResult, tokenBalances]);

  const renderStep = () => {
    switch (step) {
      case "select-token":
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Select a token you hold on Starknet to swap for {entryFeeSymbol}
            </p>

            {loadingBalances ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
                <span className="ml-2">Loading balances...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {availableTokens.map((token) => {
                  const balance = tokenBalances[token.address] ?? 0n;
                  const hasBalance = balance > 0n;

                  return (
                    <button
                      key={token.address}
                      onClick={() => {
                        if (hasBalance) {
                          setSelectedToken(token);
                          setStep("enter-amount");
                        }
                      }}
                      disabled={!hasBalance}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        hasBalance
                          ? "border-brand/25 hover:border-brand/50 cursor-pointer"
                          : "border-brand/10 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={getTokenLogoUrl(chainId, token.address)}
                          alt={token.symbol}
                          className="w-8 h-8 rounded-full"
                        />
                        <div className="text-left">
                          <div className="font-medium">{token.symbol}</div>
                          <div className="text-xs text-muted-foreground">
                            {token.name}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">
                          {formatBalance(token.address, token.decimals)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Balance
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        );

      case "enter-amount":
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-3 bg-neutral/5 rounded-lg">
              <img
                src={getTokenLogoUrl(chainId, selectedToken?.address ?? "")}
                alt={selectedToken?.symbol}
                className="w-8 h-8 rounded-full"
              />
              <div>
                <div className="font-medium">{selectedToken?.symbol}</div>
                <div className="text-xs text-muted-foreground">
                  Balance: {formatBalance(selectedToken?.address ?? "", selectedToken?.decimals ?? 18)}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>You will receive</Label>
              <div className="flex items-center gap-2 p-3 bg-neutral/5 rounded-lg">
                <img
                  src={getTokenLogoUrl(chainId, entryFeeToken)}
                  alt={entryFeeSymbol}
                  className="w-6 h-6 rounded-full"
                />
                <span className="font-mono">
                  {formatTokenAmount(entryFeeAmount.toString(), entryFeeDecimals)}
                </span>
                <span className="text-muted-foreground">{entryFeeSymbol}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                This is the exact amount needed for the tournament entry fee
              </p>
            </div>

            {swapState === "quoting" ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner />
                <span className="ml-2">Getting best swap rate...</span>
              </div>
            ) : quoteError ? (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {quoteError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedToken(null);
                  setStep("select-token");
                  resetSwap();
                }}
              >
                Back
              </Button>
              <Button
                onClick={handleGetQuote}
                disabled={swapState === "quoting"}
              >
                {swapState === "quoting" ? "Getting Quote..." : "Get Quote"}
              </Button>
            </div>
          </div>
        );

      case "review":
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-center gap-4 py-4">
              <div className="flex flex-col items-center gap-2">
                <img
                  src={getTokenLogoUrl(chainId, selectedToken?.address ?? "")}
                  alt={selectedToken?.symbol}
                  className="w-12 h-12 rounded-full"
                />
                <div className="text-center">
                  <div className="font-mono font-bold">
                    {quoteResult && formatTokenAmount(quoteResult.inputAmount, selectedToken?.decimals ?? 18)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedToken?.symbol}
                  </div>
                </div>
              </div>

              <span className="w-8 h-8 text-muted-foreground">
                <ARROW_RIGHT />
              </span>

              <div className="flex flex-col items-center gap-2">
                <img
                  src={getTokenLogoUrl(chainId, entryFeeToken)}
                  alt={entryFeeSymbol}
                  className="w-12 h-12 rounded-full"
                />
                <div className="text-center">
                  <div className="font-mono font-bold">
                    {formatTokenAmount(entryFeeAmount.toString(), entryFeeDecimals)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {entryFeeSymbol}
                  </div>
                </div>
              </div>
            </div>

            {quoteResult && (
              <div className="p-3 bg-neutral/5 rounded-lg text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price Impact</span>
                  <span className={quoteResult.priceImpact > 3 ? "text-warning" : ""}>
                    {quoteResult.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Slippage Tolerance</span>
                  <span>1%</span>
                </div>
              </div>
            )}

            {!hasEnoughBalance && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                Insufficient {selectedToken?.symbol} balance for this swap
              </div>
            )}

            {swapError && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {swapError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("enter-amount");
                  resetSwap();
                }}
              >
                Back
              </Button>
              <Button onClick={handleSwap} disabled={!hasEnoughBalance}>
                Confirm Swap
              </Button>
            </div>
          </div>
        );

      case "swapping":
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <LoadingSpinner />
            <div className="text-center">
              <p className="font-medium">Swapping tokens...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please confirm the transaction in your wallet
              </p>
            </div>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
              <span className="w-8 h-8 text-success">
                <CHECK />
              </span>
            </div>
            <div className="text-center">
              <p className="font-medium text-lg">Swap Complete!</p>
              <p className="text-sm text-muted-foreground mt-1">
                You now have {formatTokenAmount(entryFeeAmount.toString(), entryFeeDecimals)} {entryFeeSymbol}
              </p>
            </div>
            <Button
              onClick={() => {
                onSwapSuccess();
                onOpenChange(false);
              }}
              className="mt-4"
            >
              Continue to Enter Tournament
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "success" ? "Swap Complete" : `Swap to ${entryFeeSymbol}`}
          </DialogTitle>
        </DialogHeader>
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
