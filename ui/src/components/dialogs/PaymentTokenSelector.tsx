import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COIN, REFRESH } from "@/components/Icons";
import { indexAddress, formatPrizeAmount } from "@/lib/utils";
import type { VoyagerTokenBalance } from "@/hooks/useVoyagerTokenBalances";
import type { QuotesMap } from "@provable-games/ekubo-sdk/react";
import { ChevronDown } from "lucide-react";

interface PaymentTokenSelectorProps {
  /** Entry fee token address */
  entryFeeToken: string;
  /** Entry fee amount in smallest units */
  entryFeeAmount: string;
  /** Entry fee in USD */
  entryFeeUsd: number;
  /** Entry fee token decimals */
  entryFeeDecimals: number;
  /** Entry fee token symbol */
  entryFeeSymbol?: string;
  /** Entry fee token logo URL */
  entryFeeLogo?: string;
  /** User's on-chain balance of the entry fee token (fallback if not in Voyager balances) */
  entryFeeUserBalance?: string;
  /** User's token balances */
  balances: VoyagerTokenBalance[];
  /** Currently selected payment token */
  selectedToken: string | null;
  /** Callback when user selects a different token */
  onTokenSelect: (tokenAddress: string) => void;
  /** Map of token address to quote result */
  quotes: QuotesMap;
  /** Whether quotes are loading */
  quotesLoading: boolean;
  /** Callback to refetch quotes */
  onRefetch?: () => void;
  /** Creator share in basis points */
  creatorShare?: number;
  /** Game share in basis points */
  gameShare?: number;
  /** Prize pool share in basis points */
  prizePoolShare?: number;
}

export function PaymentTokenSelector({
  entryFeeToken,
  entryFeeAmount,
  entryFeeUsd,
  entryFeeDecimals,
  entryFeeSymbol,
  entryFeeLogo,
  entryFeeUserBalance,
  balances,
  selectedToken,
  onTokenSelect,
  quotes,
  quotesLoading,
  onRefetch,
}: PaymentTokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Check if selected token is the entry fee token (direct payment)
  const isDirectPayment = useMemo(() => {
    if (!selectedToken || !entryFeeToken) return false;
    return (
      indexAddress(selectedToken).toLowerCase() ===
      indexAddress(entryFeeToken).toLowerCase()
    );
  }, [selectedToken, entryFeeToken]);

  // Get selected token info
  const selectedTokenInfo = useMemo(() => {
    if (!selectedToken) return null;
    return balances.find(
      (b) =>
        indexAddress(b.tokenAddress).toLowerCase() ===
        indexAddress(selectedToken).toLowerCase(),
    );
  }, [selectedToken, balances]);

  // Get quote for selected token
  const selectedQuote = useMemo(() => {
    if (!selectedToken || isDirectPayment) return null;
    return quotes[selectedToken] ?? null;
  }, [selectedToken, isDirectPayment, quotes]);

  // Calculate the payment amount for the selected token
  const selectedPaymentAmount = useMemo(() => {
    if (isDirectPayment) {
      return {
        amount: formatPrizeAmount(
          Number(entryFeeAmount) / Math.pow(10, entryFeeDecimals),
        ),
        symbol: entryFeeSymbol || "tokens",
        loading: false,
        insufficientLiquidity: false,
      };
    }
    if (selectedQuote?.quote && selectedTokenInfo) {
      const decimals = selectedTokenInfo.decimals;
      return {
        amount: formatPrizeAmount(
          Number(selectedQuote.quote.total) / Math.pow(10, decimals),
        ),
        symbol: selectedTokenInfo.symbol || "tokens",
        loading: false,
        insufficientLiquidity: false,
      };
    }
    if (selectedQuote?.loading) {
      return {
        amount: "",
        symbol: "",
        loading: true,
        insufficientLiquidity: false,
      };
    }
    if (selectedQuote?.insufficientLiquidity) {
      return {
        amount: "",
        symbol: "",
        loading: false,
        insufficientLiquidity: true,
      };
    }
    return null;
  }, [
    isDirectPayment,
    entryFeeAmount,
    entryFeeDecimals,
    entryFeeSymbol,
    selectedQuote,
    selectedTokenInfo,
  ]);

  // Filter tokens that have enough balance or could theoretically swap
  const availableTokens = useMemo(() => {
    const entryFeeNormalized = indexAddress(entryFeeToken).toLowerCase();
    const entryFeeAmountBigInt = BigInt(entryFeeAmount);

    // Check if user has entry fee token in Voyager balances
    const entryFeeBalance = balances.find(
      (b) => indexAddress(b.tokenAddress).toLowerCase() === entryFeeNormalized,
    );

    // Check if user has sufficient balance (from Voyager or on-chain fallback)
    const voyagerBalance = entryFeeBalance
      ? BigInt(entryFeeBalance.balance)
      : 0n;
    const onChainBalance = entryFeeUserBalance
      ? BigInt(entryFeeUserBalance)
      : 0n;
    const effectiveBalance =
      voyagerBalance > 0n ? voyagerBalance : onChainBalance;
    const hasSufficientBalance = effectiveBalance >= entryFeeAmountBigInt;
    const hasAnyBalance = effectiveBalance > 0n;

    // Filter other tokens (those with some balance that aren't the entry fee token)
    // Sort by USD value descending
    const otherTokens = balances
      .filter((b) => {
        const isEntryToken =
          indexAddress(b.tokenAddress).toLowerCase() === entryFeeNormalized;
        const hasBalance = BigInt(b.balance) > 0n;
        // Exclude tokens without sufficient value (> $0.01 worth)
        const hasValue = (b.usdBalance ?? 0) > 0.01;
        return !isEntryToken && hasBalance && hasValue;
      })
      .sort((a, b) => (b.usdBalance ?? 0) - (a.usdBalance ?? 0));

    // Build entry fee token entry if user has any balance
    const entryFeeEntry: VoyagerTokenBalance | null = hasAnyBalance
      ? entryFeeBalance ?? {
          tokenAddress: entryFeeToken,
          balance: entryFeeUserBalance || "0",
          symbol: entryFeeSymbol,
          decimals: entryFeeDecimals,
          logo: entryFeeLogo,
          usdBalance: entryFeeUsd,
        }
      : null;

    // If sufficient balance, put entry fee token first
    // Otherwise, include it in the sorted list by USD value
    const result: VoyagerTokenBalance[] = [];

    if (entryFeeEntry && hasSufficientBalance) {
      result.push(entryFeeEntry);
      result.push(...otherTokens);
    } else {
      // Combine other tokens with insufficient entry fee token and sort by USD value
      const allTokens = entryFeeEntry
        ? [...otherTokens, entryFeeEntry]
        : otherTokens;
      allTokens.sort((a, b) => (b.usdBalance ?? 0) - (a.usdBalance ?? 0));
      result.push(...allTokens);
    }

    return result;
  }, [
    balances,
    entryFeeToken,
    entryFeeAmount,
    entryFeeUserBalance,
    entryFeeSymbol,
    entryFeeDecimals,
    entryFeeLogo,
    entryFeeUsd,
  ]);

  // Get payment info for a token (for the list display)
  const getTokenPaymentInfo = (token: VoyagerTokenBalance) => {
    const isEntryToken =
      indexAddress(token.tokenAddress).toLowerCase() ===
      indexAddress(entryFeeToken).toLowerCase();

    if (isEntryToken) {
      // For direct payment, check if balance covers the entry fee
      const hasEnoughBalance = BigInt(token.balance) >= BigInt(entryFeeAmount);
      return {
        amount: formatPrizeAmount(
          Number(entryFeeAmount) / Math.pow(10, entryFeeDecimals),
        ),
        isDirect: true,
        loading: false,
        insufficientLiquidity: false,
        insufficientBalance: !hasEnoughBalance,
      };
    }

    const tokenQuote = quotes[token.tokenAddress];
    if (tokenQuote?.quote) {
      // Check if user's balance covers the quote total
      const quoteTotal = BigInt(tokenQuote.quote.total);
      const hasEnoughBalance = BigInt(token.balance) >= quoteTotal;
      return {
        amount: formatPrizeAmount(
          Number(tokenQuote.quote.total) / Math.pow(10, token.decimals),
        ),
        isDirect: false,
        loading: false,
        insufficientLiquidity: false,
        insufficientBalance: !hasEnoughBalance,
      };
    }
    if (tokenQuote?.loading) {
      return {
        amount: "",
        isDirect: false,
        loading: true,
        insufficientLiquidity: false,
        insufficientBalance: false,
      };
    }
    if (tokenQuote?.insufficientLiquidity) {
      return {
        amount: "",
        isDirect: false,
        loading: false,
        insufficientLiquidity: true,
        insufficientBalance: false,
      };
    }
    return {
      amount: "",
      isDirect: false,
      loading: quotesLoading,
      insufficientLiquidity: false,
      insufficientBalance: false,
    };
  };

  // Check if any quotes have errors (failed to fetch)
  const hasFailedQuotes = useMemo(() => {
    return Object.values(quotes).some(
      (q) => q.error && !q.insufficientLiquidity && !q.loading,
    );
  }, [quotes]);

  // Check if any quotes are currently loading (more reliable than parent's quotesLoading)
  const isRefreshing = useMemo(() => {
    return Object.values(quotes).some((q) => q.loading);
  }, [quotes]);

  const handleSelect = (tokenAddress: string) => {
    onTokenSelect(tokenAddress);
    setIsOpen(false);
  };

  if (availableTokens.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg bg-neutral/5">
        <span className="text-sm text-warning">
          No tokens available for payment
        </span>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full h-auto p-3 flex flex-row items-center justify-between"
        >
          <div className="flex flex-row items-center gap-3">
            {selectedTokenInfo?.logo ? (
              <img
                src={selectedTokenInfo.logo}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            ) : isDirectPayment && entryFeeLogo ? (
              <img src={entryFeeLogo} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8">
                <COIN />
              </div>
            )}
            <div className="flex flex-col items-start">
              <span className="text-sm text-brand-muted">Pay with</span>
              {selectedPaymentAmount?.loading ? (
                <Skeleton className="h-5 w-24" />
              ) : selectedPaymentAmount?.insufficientLiquidity ? (
                <span className="text-destructive text-sm">No liquidity</span>
              ) : selectedPaymentAmount ? (
                <span className="font-medium">
                  ~{selectedPaymentAmount.amount} {selectedPaymentAmount.symbol}
                </span>
              ) : (
                <span className="text-brand-muted">Select token</span>
              )}
            </div>
          </div>
          <ChevronDown className="w-5 h-5 text-brand-muted" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[500px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 p-4 pr-12 border-b border-brand/20">
          <div className="flex items-center justify-between">
            <DialogTitle>Select Payment Token</DialogTitle>
            {onRefetch && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefetch}
                disabled={isRefreshing}
                className="h-8 px-2 border-none bg-transparent hover:bg-brand/10"
              >
                <REFRESH
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            )}
          </div>
          <p className="text-sm text-brand-muted mt-1">
            Choose which token to pay with
            {hasFailedQuotes && !isRefreshing && (
              <span className="text-warning ml-1">
                (some quotes failed to load)
              </span>
            )}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {availableTokens.map((token) => {
            const paymentInfo = getTokenPaymentInfo(token);
            const isSelected =
              selectedToken &&
              indexAddress(token.tokenAddress).toLowerCase() ===
                indexAddress(selectedToken).toLowerCase();
            const isDisabled =
              paymentInfo.insufficientBalance ||
              paymentInfo.insufficientLiquidity;

            return (
              <div
                key={token.tokenAddress}
                className={`w-full flex flex-row items-center justify-between px-4 py-3 ${
                  isDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-brand/20 hover:cursor-pointer"
                } ${isSelected && !isDisabled ? "bg-brand/30 border-l-2 border-brand" : ""}`}
                onClick={() => !isDisabled && handleSelect(token.tokenAddress)}
              >
                <div className="flex flex-row gap-3 items-center">
                  {token.logo ? (
                    <img
                      src={token.logo}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8">
                      <COIN />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {token.symbol || "Token"}
                      </span>
                      {paymentInfo.isDirect && (
                        <span className="text-xs px-1.5 py-0.5 bg-brand/20 rounded text-brand-muted">
                          Direct
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-neutral">
                      Balance:{" "}
                      {formatPrizeAmount(
                        Number(token.balance) / Math.pow(10, token.decimals),
                      )}
                      {token.usdBalance !== undefined && (
                        <span className="text-brand-muted ml-1">
                          (${token.usdBalance.toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  {paymentInfo.loading ? (
                    <div className="flex flex-col items-end gap-1">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                  ) : paymentInfo.insufficientLiquidity ? (
                    <span className="text-destructive text-sm">
                      No liquidity
                    </span>
                  ) : paymentInfo.insufficientBalance ? (
                    <span className="text-destructive text-sm">
                      Insufficient balance
                    </span>
                  ) : (
                    <>
                      <span className="font-medium">~{paymentInfo.amount}</span>
                      <span className="text-xs text-brand-muted">
                        ${entryFeeUsd.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
