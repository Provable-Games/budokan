import { useState, useCallback, useRef, useEffect } from "react";
import {
  getQuote,
  getStatus,
  submitDeposit,
  createTournamentEntryQuoteRequest,
  SUPPORTED_CHAINS,
  type QuoteResponse,
  type SwapStatus,
  type SupportedToken,
} from "@/lib/nearIntents";

// =============================================================================
// Types
// =============================================================================

export type PaymentState =
  | "idle"
  | "fetching_quote"
  | "awaiting_deposit"
  | "polling_status"
  | "success"
  | "error";

interface UseNearIntentsPaymentProps {
  recipientAddress: string;
  enabled: boolean;
}

interface UseNearIntentsPaymentResult {
  paymentState: PaymentState;
  error: string | null;
  quote: QuoteResponse | null;
  depositAddress: string | null;
  swapStatus: SwapStatus | null;

  requestQuote: (
    chain: string,
    token: SupportedToken,
    amount: string,
    refundAddress: string
  ) => Promise<void>;
  notifyDeposit: (txHash: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  reset: () => void;

  isQuoteLoading: boolean;
  isPolling: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const POLLING_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLLING_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// =============================================================================
// Hook Implementation
// =============================================================================

export function useNearIntentsPayment({
  recipientAddress,
  enabled,
}: UseNearIntentsPaymentProps): UseNearIntentsPaymentResult {
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [swapStatus, setSwapStatus] = useState<SwapStatus | null>(null);

  // Refs for managing polling
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null);
  const isPollingRef = useRef(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      reset();
    }
  }, [enabled]);

  /**
   * Stop polling for status updates
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    isPollingRef.current = false;
    pollingStartTimeRef.current = null;
  }, []);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    stopPolling();
    setPaymentState("idle");
    setError(null);
    setQuote(null);
    setSwapStatus(null);
  }, [stopPolling]);

  /**
   * Request a quote for the cross-chain swap
   */
  const requestQuote = useCallback(
    async (
      chain: string,
      token: SupportedToken,
      amount: string,
      refundAddress: string
    ) => {
      if (!enabled || !recipientAddress) {
        setError("Payment not enabled or missing recipient address");
        return;
      }

      setPaymentState("fetching_quote");
      setError(null);

      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const quoteRequest = createTournamentEntryQuoteRequest({
            sourceChain: chain,
            sourceToken: token,
            sourceAmount: amount,
            refundAddress,
            recipientAddress,
          });

          const quoteResponse = await getQuote(quoteRequest);

          setQuote(quoteResponse);
          setPaymentState("awaiting_deposit");
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.error(
            `Quote request attempt ${attempt + 1} failed:`,
            lastError
          );

          if (attempt < MAX_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }

      setError(lastError?.message ?? "Failed to get quote");
      setPaymentState("error");
    },
    [enabled, recipientAddress]
  );

  /**
   * Notify the API about a deposit transaction
   */
  const notifyDeposit = useCallback(
    async (txHash: string) => {
      if (!quote?.depositAddress) {
        setError("No deposit address available");
        return;
      }

      try {
        await submitDeposit(quote.depositAddress, txHash);
      } catch (err) {
        // Don't fail on deposit notification - it's optional
        console.warn("Failed to notify deposit:", err);
      }
    },
    [quote?.depositAddress]
  );

  /**
   * Poll for status updates
   */
  const pollStatus = useCallback(async () => {
    if (!quote?.depositAddress) {
      return;
    }

    // Check if we've exceeded max polling duration
    if (pollingStartTimeRef.current) {
      const elapsed = Date.now() - pollingStartTimeRef.current;
      if (elapsed >= MAX_POLLING_DURATION_MS) {
        stopPolling();
        setError(
          "Payment timeout. Please check your deposit transaction status."
        );
        setPaymentState("error");
        return;
      }
    }

    try {
      const status = await getStatus(quote.depositAddress);
      setSwapStatus(status.status);

      switch (status.status) {
        case "SUCCESS":
          stopPolling();
          setPaymentState("success");
          break;

        case "FAILED":
          stopPolling();
          setError(status.errorMessage ?? "Swap failed");
          setPaymentState("error");
          break;

        case "REFUNDED":
          stopPolling();
          setError(
            "Deposit was refunded. Please check your source wallet for the refund."
          );
          setPaymentState("error");
          break;

        case "INCOMPLETE_DEPOSIT":
          // Continue polling but show a warning
          console.warn("Incomplete deposit detected");
          break;

        case "PENDING_DEPOSIT":
        case "PROCESSING":
          // Continue polling
          break;

        default:
          // Unknown status, continue polling
          console.warn("Unknown swap status:", status.status);
      }
    } catch (err) {
      console.error("Error polling status:", err);
      // Don't stop polling on individual errors, just log them
    }
  }, [quote?.depositAddress, stopPolling]);

  /**
   * Start polling for status updates
   */
  const startPolling = useCallback(() => {
    if (isPollingRef.current || !quote?.depositAddress) {
      return;
    }

    setPaymentState("polling_status");
    isPollingRef.current = true;
    pollingStartTimeRef.current = Date.now();

    // Poll immediately
    pollStatus();

    // Set up interval polling
    pollingIntervalRef.current = setInterval(pollStatus, POLLING_INTERVAL_MS);
  }, [quote?.depositAddress, pollStatus]);

  return {
    paymentState,
    error,
    quote,
    depositAddress: quote?.depositAddress ?? null,
    swapStatus,

    requestQuote,
    notifyDeposit,
    startPolling,
    stopPolling,
    reset,

    isQuoteLoading: paymentState === "fetching_quote",
    isPolling: paymentState === "polling_status",
  };
}

// =============================================================================
// Utility Exports
// =============================================================================

export { SUPPORTED_CHAINS };
export type { SupportedToken, SupportedChain } from "@/lib/nearIntents";
