/**
 * Dialog for selecting a token to swap for tournament entry fee using Ekubo DEX.
 * Returns swap calls to the parent for combined execution with enter tournament.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useAccount } from "@starknet-react/core";
import { useVoyagerTokenBalances } from "@/hooks/useVoyagerTokenBalances";
import {
  formatTokenAmount,
  getRequiredInput,
  generateSwapCalls,
  type SwapQuote,
} from "@/lib/ekuboSwap";
import { useDojo } from "@/context/dojo";
import { getTokenLogoUrl } from "@/lib/tokensMeta";

// Type for swap call that can be combined with other calls
export interface SwapCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

// Common tokens on Starknet for swapping
const SWAP_TOKENS = [
  {
    symbol: "ETH",
    name: "Ethereum",
    address:
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    decimals: 18,
  },
  {
    symbol: "STRK",
    name: "Starknet Token",
    address:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    decimals: 18,
  },
  {
    symbol: "LORDS",
    name: "LORDS",
    address:
      "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
    decimals: 18,
  },
  {
    symbol: "SURVIVOR",
    name: "Survivor",
    address:
      "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b",
    decimals: 18,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address:
      "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    decimals: 6,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address:
      "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    decimals: 6,
  },
];

interface TokenQuote {
  inputAmount: string;
  priceImpact: number;
  quote: SwapQuote;
}

/** Info about the selected swap token for display in parent component */
export interface SelectedSwapInfo {
  token: {
    symbol: string;
    address: string;
    decimals: number;
  };
  inputAmount: string;
  swapCalls: SwapCall[];
}

interface SwapTokensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryFeeAmount: bigint;
  entryFeeToken: string;
  entryFeeDecimals: number;
  entryFeeSymbol: string;
  /** Called when user selects a token - returns swap info for display and later execution */
  onTokenSelected: (swapInfo: SelectedSwapInfo) => void;
  /** If true, renders inline without Dialog wrapper */
  embedded?: boolean;
}

export function SwapTokensDialog({
  open,
  onOpenChange,
  entryFeeAmount,
  entryFeeToken,
  entryFeeDecimals,
  entryFeeSymbol,
  onTokenSelected,
  embedded = false,
}: SwapTokensDialogProps) {
  const { address } = useAccount();
  const { selectedChainConfig } = useDojo();
  const chainId = selectedChainConfig?.chainId ?? "";

  const [quotes, setQuotes] = useState<Record<string, TokenQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  // Track if quotes have been fetched for this session
  const quotesFetchedRef = useRef(false);

  // Fetch all token balances via Voyager API (single request)
  const {
    balances,
    loading: loadingBalances,
    getBalance,
  } = useVoyagerTokenBalances({
    walletAddress: address ?? "",
    active: open && !!address,
  });

  // Filter out the entry fee token from swap options
  const availableTokens = useMemo(() => {
    const normalizedEntryToken = entryFeeToken.toLowerCase();
    return SWAP_TOKENS.filter(
      (token) => token.address.toLowerCase() !== normalizedEntryToken,
    );
  }, [entryFeeToken]);

  // Fetch quotes for all tokens with balance when balances are loaded
  useEffect(() => {
    if (!open || loadingBalances || quotesFetchedRef.current) return;
    if (balances.length === 0) return;

    const fetchQuotes = async () => {
      setLoadingQuotes(true);
      const newQuotes: Record<string, TokenQuote> = {};

      // Fetch quotes in parallel for tokens with balance
      const quotePromises = availableTokens
        .filter((token) => getBalance(token.address) > 0n)
        .map(async (token) => {
          try {
            // getRequiredInput now returns the quote directly
            const result = await getRequiredInput(
              entryFeeAmount.toString(),
              token.address,
              entryFeeToken,
            );
            if (result) {
              newQuotes[token.address] = {
                inputAmount: result.input,
                priceImpact: result.priceImpact,
                quote: result.quote,
              };
            }
          } catch (err) {
            console.error(`Failed to get quote for ${token.symbol}:`, err);
          }
        });

      await Promise.all(quotePromises);
      setQuotes(newQuotes);
      setLoadingQuotes(false);
      quotesFetchedRef.current = true;
    };

    fetchQuotes();
  }, [
    open,
    loadingBalances,
    balances,
    availableTokens,
    entryFeeAmount,
    entryFeeToken,
    getBalance,
  ]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuotes({});
      quotesFetchedRef.current = false;
    }
  }, [open]);

  // Handle token selection - generate swap calls and return to parent
  const handleSelectToken = useCallback(
    (token: (typeof SWAP_TOKENS)[0]) => {
      const quote = quotes[token.address];
      if (!quote) return;

      const balance = getBalance(token.address);
      if (balance < BigInt(quote.inputAmount)) return;

      // Generate swap calls - require exact output amount (no slippage)
      // Input buffer (~1% extra) handles price movement
      const calls = generateSwapCalls(
        token.address,
        entryFeeToken,
        quote.inputAmount,
        entryFeeAmount.toString(), // Exact amount required
        quote.quote,
      );

      if (calls.length === 0) {
        console.error("Failed to generate swap calls");
        return;
      }

      // Return swap info to parent and close dialog
      onTokenSelected({
        token: {
          symbol: token.symbol,
          address: token.address,
          decimals: token.decimals,
        },
        inputAmount: quote.inputAmount,
        swapCalls: calls,
      });
      onOpenChange(false);
    },
    [
      quotes,
      getBalance,
      entryFeeAmount,
      entryFeeToken,
      onTokenSelected,
      onOpenChange,
    ],
  );

  // Check if user has enough balance for a token
  const hasEnoughBalance = useCallback(
    (tokenAddress: string) => {
      const quote = quotes[tokenAddress];
      if (!quote) return false;
      const balance = getBalance(tokenAddress);
      return balance >= BigInt(quote.inputAmount);
    },
    [quotes, getBalance],
  );

  const isLoading = loadingBalances || loadingQuotes;

  // Sort tokens: swappable first (sorted by best rate), then others
  const sortedTokens = useMemo(() => {
    return [...availableTokens].sort((a, b) => {
      const balanceA = getBalance(a.address);
      const balanceB = getBalance(b.address);
      const quoteA = quotes[a.address];
      const quoteB = quotes[b.address];
      const canSwapA =
        balanceA > 0n && quoteA && balanceA >= BigInt(quoteA.inputAmount);
      const canSwapB =
        balanceB > 0n && quoteB && balanceB >= BigInt(quoteB.inputAmount);

      // Swappable tokens first
      if (canSwapA && !canSwapB) return -1;
      if (!canSwapA && canSwapB) return 1;

      // Among swappable tokens, sort by lowest input amount (best rate)
      if (canSwapA && canSwapB && quoteA && quoteB) {
        return BigInt(quoteA.inputAmount) < BigInt(quoteB.inputAmount) ? -1 : 1;
      }

      // Tokens with balance but insufficient come next
      const hasBalanceA = balanceA > 0n;
      const hasBalanceB = balanceB > 0n;
      if (hasBalanceA && !hasBalanceB) return -1;
      if (!hasBalanceA && hasBalanceB) return 1;

      return 0;
    });
  }, [availableTokens, quotes, getBalance]);

  // Content to render (shared between embedded and dialog modes)
  const content = (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Select a token to swap for{" "}
        {formatTokenAmount(entryFeeAmount.toString(), entryFeeDecimals)}{" "}
        {entryFeeSymbol}
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
          <span className="ml-2">
            {loadingBalances ? "Loading balances..." : "Fetching quotes..."}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedTokens.map((token) => {
            const balance = getBalance(token.address);
            const quote = quotes[token.address];
            const hasBalance = balance > 0n;
            const hasQuote = !!quote;
            const canSwap =
              hasBalance && hasQuote && hasEnoughBalance(token.address);

            return (
              <button
                key={token.address}
                onClick={() => canSwap && handleSelectToken(token)}
                disabled={!canSwap}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  canSwap
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
                      Balance:{" "}
                      {formatTokenAmount(
                        balance.toString(),
                        token.decimals,
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {hasQuote ? (
                    <>
                      <div className="font-mono text-sm">
                        {formatTokenAmount(
                          quote.inputAmount,
                          token.decimals,
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {!hasEnoughBalance(token.address)
                          ? "Insufficient"
                          : "Required"}
                      </div>
                    </>
                  ) : hasBalance ? (
                    <div className="text-xs text-muted-foreground">
                      No liquidity
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      No balance
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Embedded mode: return content directly
  if (embedded) {
    return content;
  }

  // Dialog mode: wrap in Dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Token to Swap</DialogTitle>
        </DialogHeader>
        {content}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
