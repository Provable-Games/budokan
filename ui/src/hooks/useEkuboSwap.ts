/**
 * Hook for executing Ekubo swaps
 */

import { useState, useCallback } from "react";
import {
  getSwapQuote,
  getRequiredInput,
  generateSwapCalls,
  calculateMinOutput,
  type SwapQuote,
  type SwapCall,
} from "@/lib/ekuboSwap";

// =============================================================================
// Types
// =============================================================================

export type SwapState = "idle" | "quoting" | "ready" | "swapping" | "success" | "error";

export interface SwapQuoteResult {
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  quote: SwapQuote;
}

export interface UseEkuboSwapResult {
  // State
  swapState: SwapState;
  error: string | null;
  quoteResult: SwapQuoteResult | null;

  // Actions
  getQuoteForExactInput: (
    inputAmount: string,
    fromToken: string,
    toToken: string
  ) => Promise<SwapQuoteResult | null>;

  getQuoteForExactOutput: (
    outputAmount: string,
    fromToken: string,
    toToken: string
  ) => Promise<SwapQuoteResult | null>;

  generateCalls: (slippageBps?: number) => SwapCall[];

  reset: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useEkuboSwap(): UseEkuboSwapResult {
  const [swapState, setSwapState] = useState<SwapState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quoteResult, setQuoteResult] = useState<SwapQuoteResult | null>(null);
  const [fromToken, setFromToken] = useState<string>("");
  const [toToken, setToToken] = useState<string>("");

  /**
   * Get a quote for an exact input amount
   */
  const getQuoteForExactInput = useCallback(
    async (
      inputAmount: string,
      from: string,
      to: string
    ): Promise<SwapQuoteResult | null> => {
      setSwapState("quoting");
      setError(null);
      setFromToken(from);
      setToToken(to);

      try {
        const quote = await getSwapQuote(inputAmount, from, to);
        if (!quote || !quote.splits || quote.splits.length === 0) {
          setError("No liquidity available for this swap");
          setSwapState("error");
          return null;
        }

        // Calculate output from quote
        const total = BigInt(quote.total);
        const outputAmount = (total < 0n ? -total : total).toString();

        const result: SwapQuoteResult = {
          inputAmount,
          outputAmount,
          priceImpact: quote.priceImpact,
          quote,
        };

        setQuoteResult(result);
        setSwapState("ready");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to get quote";
        setError(message);
        setSwapState("error");
        return null;
      }
    },
    []
  );

  /**
   * Get a quote for an exact output amount
   */
  const getQuoteForExactOutput = useCallback(
    async (
      outputAmount: string,
      from: string,
      to: string
    ): Promise<SwapQuoteResult | null> => {
      setSwapState("quoting");
      setError(null);
      setFromToken(from);
      setToToken(to);

      try {
        const result = await getRequiredInput(outputAmount, from, to);
        if (!result) {
          setError("No liquidity available for this swap");
          setSwapState("error");
          return null;
        }

        // Get the full quote for generating calls
        const quote = await getSwapQuote(result.input, from, to);
        if (!quote || !quote.splits || quote.splits.length === 0) {
          setError("No liquidity available for this swap");
          setSwapState("error");
          return null;
        }

        const quoteResult: SwapQuoteResult = {
          inputAmount: result.input,
          outputAmount,
          priceImpact: result.priceImpact,
          quote,
        };

        setQuoteResult(quoteResult);
        setSwapState("ready");
        return quoteResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to get quote";
        setError(message);
        setSwapState("error");
        return null;
      }
    },
    []
  );

  /**
   * Generate swap calls for execution
   */
  const generateCalls = useCallback(
    (slippageBps: number = 100): SwapCall[] => {
      if (!quoteResult || !fromToken || !toToken) {
        return [];
      }

      const minOutput = calculateMinOutput(quoteResult.outputAmount, slippageBps);

      return generateSwapCalls(
        fromToken,
        toToken,
        quoteResult.inputAmount,
        minOutput,
        quoteResult.quote
      );
    },
    [quoteResult, fromToken, toToken]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setSwapState("idle");
    setError(null);
    setQuoteResult(null);
    setFromToken("");
    setToToken("");
  }, []);

  return {
    swapState,
    error,
    quoteResult,
    getQuoteForExactInput,
    getQuoteForExactOutput,
    generateCalls,
    reset,
  };
}
