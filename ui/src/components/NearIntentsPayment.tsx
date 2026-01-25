import { useState, useCallback, useMemo, useEffect } from "react";
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
import { useCrossChainWallet, type ChainType } from "@/context/crossChainWallet";
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

function WalletButton({
  isConnected,
  address,
  isConnecting,
  onConnect,
  onDisconnect,
  chainName,
}: {
  isConnected: boolean;
  address: string | null;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  chainName: string;
}) {
  if (isConnecting) {
    return (
      <Button variant="outline" size="sm" disabled className="w-full">
        <LoadingSpinner />
        <span className="ml-2">Connecting...</span>
      </Button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between p-2 bg-success/10 border border-success/30 rounded">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 text-success">
              <CHECK />
            </span>
            <span className="text-xs font-mono truncate max-w-[200px]">
              {address}
            </span>
          </div>
          <CopyButton text={address} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onDisconnect}
          className="text-xs text-muted-foreground"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onConnect} className="w-full">
      Connect {chainName} Wallet
    </Button>
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
  const [manualRefundAddress, setManualRefundAddress] = useState<string>("");
  const [useManualAddress, setUseManualAddress] = useState(false);

  // Cross-chain wallet
  const {
    walletState,
    connectEVM,
    disconnectEVM,
    isEVMConnecting,
    sendEVMTransaction,
    evmTxHash,
    isEVMTxPending,
    isEVMTxConfirmed,
    connectSolana,
    disconnectSolana,
    isSolanaConnecting,
    connectNEAR,
    disconnectNEAR,
    isNEARConnecting,
  } = useCrossChainWallet();

  // Get the selected chain and token
  const selectedChainData = useMemo(() => {
    return Object.values(SUPPORTED_CHAINS).find((c) => c.id === selectedChain);
  }, [selectedChain]);

  const selectedToken = useMemo(() => {
    return selectedChainData?.tokens.find(
      (t) => t.symbol === selectedTokenSymbol
    );
  }, [selectedChainData, selectedTokenSymbol]);

  // Determine chain type
  const chainType = useMemo<ChainType | null>(() => {
    if (!selectedChainData) return null;
    return selectedChainData.chainType as ChainType;
  }, [selectedChainData]);

  // Get refund address (from wallet or manual input)
  const refundAddress = useMemo(() => {
    if (useManualAddress) return manualRefundAddress;
    if (walletState.isConnected && walletState.chainType === chainType) {
      return walletState.address || "";
    }
    return "";
  }, [useManualAddress, manualRefundAddress, walletState, chainType]);

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
  useEffect(() => {
    if (paymentState === "success") {
      const timer = setTimeout(handleSuccess, 100);
      return () => clearTimeout(timer);
    }
  }, [paymentState, handleSuccess]);

  // Watch for EVM transaction confirmation and notify deposit
  useEffect(() => {
    if (evmTxHash && isEVMTxConfirmed) {
      notifyDeposit(evmTxHash);
      startPolling();
    }
  }, [evmTxHash, isEVMTxConfirmed, notifyDeposit, startPolling]);

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

  // Handle wallet connection based on chain type
  const handleConnectWallet = useCallback(async () => {
    if (!chainType || !selectedChain) return;

    switch (chainType) {
      case "evm":
        await connectEVM(selectedChain);
        break;
      case "solana":
        await connectSolana();
        break;
      case "near":
        await connectNEAR();
        break;
    }
  }, [chainType, selectedChain, connectEVM, connectSolana, connectNEAR]);

  // Handle wallet disconnection
  const handleDisconnectWallet = useCallback(() => {
    if (!chainType) return;

    switch (chainType) {
      case "evm":
        disconnectEVM();
        break;
      case "solana":
        disconnectSolana();
        break;
      case "near":
        disconnectNEAR();
        break;
    }
  }, [chainType, disconnectEVM, disconnectSolana, disconnectNEAR]);

  // Check if wallet is connected for selected chain
  const isWalletConnectedForChain = useMemo(() => {
    return walletState.isConnected && walletState.chainType === chainType;
  }, [walletState, chainType]);

  // Check if connecting
  const isConnecting = useMemo(() => {
    switch (chainType) {
      case "evm":
        return isEVMConnecting;
      case "solana":
        return isSolanaConnecting;
      case "near":
        return isNEARConnecting;
      default:
        return false;
    }
  }, [chainType, isEVMConnecting, isSolanaConnecting, isNEARConnecting]);

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

  // Handle sending deposit via connected wallet
  const handleSendDeposit = useCallback(async () => {
    if (!depositAddress || !quote || !selectedToken) return;

    try {
      if (chainType === "evm") {
        // Convert deposit amount to proper units
        const amountInEth = (
          Number(quote.depositAmount) / 10 ** selectedToken.decimals
        ).toString();
        await sendEVMTransaction(depositAddress, amountInEth);
      } else {
        // For Solana/NEAR, show manual instructions for now
        startPolling();
      }
    } catch (err) {
      console.error("Failed to send deposit:", err);
    }
  }, [depositAddress, quote, selectedToken, chainType, sendEVMTransaction, startPolling]);

  // Handle manual deposit confirmation
  const handleManualDepositConfirmed = useCallback(async () => {
    startPolling();
  }, [startPolling]);

  // Handle reset/try again
  const handleReset = useCallback(() => {
    reset();
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

          {/* Wallet Connection */}
          {selectedToken && (
            <div className="flex flex-col gap-3 p-3 border border-brand/25 rounded-lg bg-neutral/5">
              <div className="flex items-center justify-between">
                <Label>Source Wallet (for refunds)</Label>
                <button
                  onClick={() => setUseManualAddress(!useManualAddress)}
                  className="text-xs text-brand-muted hover:text-brand underline"
                >
                  {useManualAddress ? "Connect wallet instead" : "Enter address manually"}
                </button>
              </div>

              {useManualAddress ? (
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder={`Enter your ${selectedChainData?.name} address`}
                    value={manualRefundAddress}
                    onChange={(e) => setManualRefundAddress(e.target.value)}
                  />
                  <span className="text-xs text-neutral">
                    In case of issues, funds will be refunded to this address
                  </span>
                </div>
              ) : (
                <WalletButton
                  isConnected={isWalletConnectedForChain}
                  address={walletState.address}
                  isConnecting={isConnecting}
                  onConnect={handleConnectWallet}
                  onDisconnect={handleDisconnectWallet}
                  chainName={selectedChainData?.name || ""}
                />
              )}
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
                  {(Number(quote.depositAmount) / 10 ** (selectedToken?.decimals || 18)).toFixed(6)}
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
                  ~{(Number(quote.destinationAmount) / 10 ** 18).toFixed(6)}
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

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {/* Send via connected wallet (EVM only for now) */}
            {isWalletConnectedForChain && chainType === "evm" && (
              <Button
                onClick={handleSendDeposit}
                disabled={isEVMTxPending}
                className="w-full"
              >
                {isEVMTxPending ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">Sending Transaction...</span>
                  </>
                ) : (
                  <>Send Deposit via Wallet</>
                )}
              </Button>
            )}

            {/* Manual deposit option */}
            {(!isWalletConnectedForChain || chainType !== "evm") && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-brand-muted text-center">
                  Send the deposit from your wallet, then click below
                </span>
                <Button onClick={handleManualDepositConfirmed} className="w-full">
                  I've Made the Deposit
                </Button>
              </div>
            )}

            <Button variant="outline" onClick={handleReset} className="w-full">
              Cancel
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

          {/* Transaction Hash (if sent via wallet) */}
          {evmTxHash && (
            <div className="flex flex-col gap-1 p-3 border border-brand/10 rounded-lg bg-neutral/5">
              <span className="text-xs text-brand-muted">Transaction Hash</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono break-all flex-1">
                  {evmTxHash}
                </span>
                <CopyButton text={evmTxHash} />
              </div>
            </div>
          )}

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
