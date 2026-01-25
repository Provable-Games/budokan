import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/spinner";
import { CHECK, X, COPY } from "@/components/Icons";
import {
  useNearIntentsPayment,
  SUPPORTED_CHAINS,
} from "@/hooks/useNearIntentsPayment";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface NearIntentsPaymentProps {
  entryFeeAmount: bigint;
  entryFeeToken: string;
  entryFeeDecimals: number;
  recipientAddress: string;
  onPaymentSuccess: () => void;
  onCancel: () => void;
}

// =============================================================================
// Helper Components
// =============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 hover:bg-brand/10 rounded transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <span className="w-4 h-4 text-success">
          <CHECK />
        </span>
      ) : (
        <span className="w-4 h-4 text-brand-muted">
          <COPY />
        </span>
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;

  const statusConfig: Record<
    string,
    { label: string; className: string }
  > = {
    PENDING_DEPOSIT: {
      label: "Waiting for Deposit",
      className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
    },
    PROCESSING: {
      label: "Processing",
      className: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    },
    SUCCESS: {
      label: "Success",
      className: "bg-green-500/20 text-green-400 border-green-500/50",
    },
    INCOMPLETE_DEPOSIT: {
      label: "Incomplete Deposit",
      className: "bg-orange-500/20 text-orange-400 border-orange-500/50",
    },
    REFUNDED: {
      label: "Refunded",
      className: "bg-purple-500/20 text-purple-400 border-purple-500/50",
    },
    FAILED: {
      label: "Failed",
      className: "bg-red-500/20 text-red-400 border-red-500/50",
    },
  };

  const config = statusConfig[status] ?? {
    label: status,
    className: "bg-neutral/20 text-neutral border-neutral/50",
  };

  return (
    <span
      className={cn(
        "px-2 py-0.5 text-xs font-medium rounded border",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function NearIntentsPayment({
  entryFeeAmount,
  entryFeeDecimals,
  recipientAddress,
  onPaymentSuccess,
  onCancel,
}: NearIntentsPaymentProps) {
  // Form state
  const [selectedChain, setSelectedChain] = useState<string>("");
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState<string>("");
  const [refundAddress, setRefundAddress] = useState<string>("");
  const [depositTxHash, setDepositTxHash] = useState<string>("");

  // Get the selected chain and token
  const selectedChainData = useMemo(() => {
    return Object.values(SUPPORTED_CHAINS).find((c) => c.id === selectedChain);
  }, [selectedChain]);

  const selectedToken = useMemo(() => {
    return selectedChainData?.tokens.find(
      (t) => t.symbol === selectedTokenSymbol
    );
  }, [selectedChainData, selectedTokenSymbol]);

  // Payment hook
  const {
    paymentState,
    error,
    quote,
    depositAddress,
    swapStatus,
    requestQuote,
    notifyDeposit,
    startPolling,
    reset,
  } = useNearIntentsPayment({
    recipientAddress,
    enabled: true,
  });

  // Handle success
  const handleSuccess = useCallback(() => {
    onPaymentSuccess();
  }, [onPaymentSuccess]);

  // Watch for success state
  if (paymentState === "success") {
    // Trigger the success callback
    setTimeout(handleSuccess, 100);
  }

  // Format the entry fee for display
  const formattedEntryFee = useMemo(() => {
    const amount = Number(entryFeeAmount) / 10 ** entryFeeDecimals;
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }, [entryFeeAmount, entryFeeDecimals]);

  // Handle chain selection
  const handleChainChange = useCallback((value: string) => {
    setSelectedChain(value);
    setSelectedTokenSymbol(""); // Reset token when chain changes
  }, []);

  // Handle get quote
  const handleGetQuote = useCallback(async () => {
    if (!selectedChain || !selectedToken || !refundAddress) {
      return;
    }

    // For now, use a placeholder amount - in production, this would be calculated
    // based on the entry fee and current exchange rates
    const sourceAmount = (
      BigInt(10) ** BigInt(selectedToken.decimals)
    ).toString();

    await requestQuote(
      selectedChain,
      selectedToken,
      sourceAmount,
      refundAddress
    );
  }, [selectedChain, selectedToken, refundAddress, requestQuote]);

  // Handle deposit confirmation
  const handleDepositConfirmed = useCallback(async () => {
    if (depositTxHash) {
      await notifyDeposit(depositTxHash);
    }
    startPolling();
  }, [depositTxHash, notifyDeposit, startPolling]);

  // Handle reset/try again
  const handleReset = useCallback(() => {
    reset();
    setDepositTxHash("");
  }, [reset]);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-brand-muted">
          Pay from Another Chain
        </span>
        <span className="text-xs text-neutral">
          Bridge tokens from any supported chain to pay your entry fee
        </span>
      </div>

      {/* Error State */}
      {paymentState === "error" && error && (
        <div className="flex flex-col gap-3 p-3 border border-destructive/50 rounded-lg bg-destructive/10">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 text-destructive">
              <X />
            </span>
            <span className="text-sm text-destructive">{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Try Again
          </Button>
        </div>
      )}

      {/* Idle State - Chain/Token Selection */}
      {paymentState === "idle" && (
        <div className="flex flex-col gap-4">
          {/* Chain Selection */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="chain-select">Source Chain</Label>
            <Select value={selectedChain} onValueChange={handleChainChange}>
              <SelectTrigger id="chain-select">
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SUPPORTED_CHAINS).map((chain) => (
                  <SelectItem key={chain.id} value={chain.id}>
                    {chain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Token Selection */}
          {selectedChainData && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="token-select">Token</Label>
              <Select
                value={selectedTokenSymbol}
                onValueChange={setSelectedTokenSymbol}
              >
                <SelectTrigger id="token-select">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent>
                  {selectedChainData.tokens.map((token) => (
                    <SelectItem key={token.symbol} value={token.symbol}>
                      {token.symbol} - {token.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Refund Address */}
          {selectedToken && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-address">
                Refund Address ({selectedChainData?.name})
              </Label>
              <Input
                id="refund-address"
                placeholder={`Enter your ${selectedChainData?.name} address`}
                value={refundAddress}
                onChange={(e) => setRefundAddress(e.target.value)}
              />
              <span className="text-xs text-neutral">
                In case of issues, funds will be refunded to this address
              </span>
            </div>
          )}

          {/* Get Quote Button */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={!selectedChain || !selectedToken || !refundAddress}
              onClick={handleGetQuote}
            >
              Get Quote
            </Button>
          </div>
        </div>
      )}

      {/* Fetching Quote State */}
      {paymentState === "fetching_quote" && (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <LoadingSpinner />
          <span className="text-sm text-brand-muted">Fetching quote...</span>
        </div>
      )}

      {/* Awaiting Deposit State */}
      {paymentState === "awaiting_deposit" && quote && (
        <div className="flex flex-col gap-4">
          {/* Deposit Instructions */}
          <div className="flex flex-col gap-3 p-3 border border-brand/25 rounded-lg bg-neutral/5">
            <span className="text-sm font-medium">Deposit Instructions</span>

            {/* Amount to Deposit */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-brand-muted">Amount to Deposit</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono">
                  {quote.depositAmount}
                </span>
                <span className="text-sm text-neutral">
                  {selectedToken?.symbol}
                </span>
              </div>
            </div>

            {/* Deposit Address */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-brand-muted">Deposit Address</span>
              <div className="flex items-center gap-2 p-2 bg-black/50 rounded border border-brand/10">
                <span className="text-sm font-mono break-all flex-1">
                  {depositAddress}
                </span>
                <CopyButton text={depositAddress ?? ""} />
              </div>
            </div>

            {/* Expected Output */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-brand-muted">You Will Receive</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">
                  ~{quote.destinationAmount}
                </span>
                <span className="text-xs text-neutral">STRK</span>
              </div>
            </div>

            {/* Entry Fee Reminder */}
            <div className="flex items-center gap-2 pt-2 border-t border-brand/10">
              <span className="text-xs text-brand-muted">Entry Fee:</span>
              <span className="text-xs font-medium">{formattedEntryFee} STRK</span>
            </div>
          </div>

          {/* Optional: Transaction Hash Input */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-hash">
              Transaction Hash (Optional)
            </Label>
            <Input
              id="tx-hash"
              placeholder="Enter deposit transaction hash"
              value={depositTxHash}
              onChange={(e) => setDepositTxHash(e.target.value)}
            />
            <span className="text-xs text-neutral">
              Providing the transaction hash speeds up processing
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleReset}>
              Cancel
            </Button>
            <Button onClick={handleDepositConfirmed}>
              I've Made the Deposit
            </Button>
          </div>
        </div>
      )}

      {/* Polling Status State */}
      {paymentState === "polling_status" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <LoadingSpinner />
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm text-brand-muted">
                Processing your payment...
              </span>
              <StatusBadge status={swapStatus} />
            </div>
          </div>

          {/* Deposit Address Reference */}
          {depositAddress && (
            <div className="flex flex-col gap-1 p-3 border border-brand/10 rounded-lg bg-neutral/5">
              <span className="text-xs text-brand-muted">Deposit Address</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono break-all flex-1">
                  {depositAddress}
                </span>
                <CopyButton text={depositAddress} />
              </div>
            </div>
          )}

          <Button variant="outline" onClick={handleReset} className="w-full">
            Cancel
          </Button>
        </div>
      )}

      {/* Success State */}
      {paymentState === "success" && (
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <span className="w-12 h-12 text-success">
            <CHECK />
          </span>
          <div className="flex flex-col items-center gap-2">
            <span className="text-lg font-medium">Payment Successful!</span>
            <span className="text-sm text-brand-muted">
              Completing tournament entry...
            </span>
          </div>
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
}
