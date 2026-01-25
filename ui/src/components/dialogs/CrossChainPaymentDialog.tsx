import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CHECK, X, COPY, ARROW_LEFT } from "@/components/Icons";
import {
  useNearIntentsPayment,
  SUPPORTED_CHAINS,
} from "@/hooks/useNearIntentsPayment";
import { useCrossChainWallet, type ChainType } from "@/context/crossChainWallet";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface CrossChainPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryFeeAmount: bigint;
  entryFeeToken: string;
  entryFeeDecimals: number;
  entryFeeSymbol: string;
  recipientAddress: string;
  onPaymentSuccess: () => void;
}

type Step = "select-chain" | "connect-wallet" | "get-quote" | "deposit" | "processing" | "success";

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

  const statusConfig: Record<string, { label: string; className: string }> = {
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
    <span className={cn("px-2 py-0.5 text-xs font-medium rounded border", config.className)}>
      {config.label}
    </span>
  );
}

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
              index < currentStep
                ? "bg-success text-white"
                : index === currentStep
                ? "bg-brand text-white"
                : "bg-neutral/20 text-neutral"
            )}
          >
            {index < currentStep ? <CHECK /> : index + 1}
          </div>
          {index < steps.length - 1 && (
            <div className={cn("w-8 h-0.5", index < currentStep ? "bg-success" : "bg-neutral/20")} />
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CrossChainPaymentDialog({
  open,
  onOpenChange,
  entryFeeAmount,
  entryFeeDecimals,
  entryFeeSymbol,
  recipientAddress,
  onPaymentSuccess,
}: CrossChainPaymentDialogProps) {
  // Form state
  const [selectedChain, setSelectedChain] = useState<string>("");
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState<string>("");
  const [manualRefundAddress, setManualRefundAddress] = useState<string>("");
  const [useManualAddress, setUseManualAddress] = useState(false);
  const [step, setStep] = useState<Step>("select-chain");

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
    return selectedChainData?.tokens.find((t) => t.symbol === selectedTokenSymbol);
  }, [selectedChainData, selectedTokenSymbol]);

  // Determine chain type
  const chainType = useMemo<ChainType | null>(() => {
    if (!selectedChainData) return null;
    return selectedChainData.chainType as ChainType;
  }, [selectedChainData]);

  // Get refund address
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
    enabled: open,
  });

  // Check if wallet is connected for selected chain
  const isWalletConnectedForChain = useMemo(() => {
    return walletState.isConnected && walletState.chainType === chainType;
  }, [walletState, chainType]);

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

  // Format the entry fee
  const formattedEntryFee = useMemo(() => {
    const amount = Number(entryFeeAmount) / 10 ** entryFeeDecimals;
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }, [entryFeeAmount, entryFeeDecimals]);

  // Step number for indicator
  const stepNumber = useMemo(() => {
    switch (step) {
      case "select-chain":
        return 0;
      case "connect-wallet":
        return 1;
      case "get-quote":
        return 2;
      case "deposit":
        return 3;
      case "processing":
        return 4;
      case "success":
        return 5;
      default:
        return 0;
    }
  }, [step]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("select-chain");
      setSelectedChain("");
      setSelectedTokenSymbol("");
      setManualRefundAddress("");
      setUseManualAddress(false);
      reset();
    }
  }, [open, reset]);

  // Watch for payment success
  useEffect(() => {
    if (paymentState === "success") {
      setStep("success");
      const timer = setTimeout(() => {
        onPaymentSuccess();
        onOpenChange(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [paymentState, onPaymentSuccess, onOpenChange]);

  // Watch for EVM transaction confirmation
  useEffect(() => {
    if (evmTxHash && isEVMTxConfirmed && step === "deposit") {
      notifyDeposit(evmTxHash);
      startPolling();
      setStep("processing");
    }
  }, [evmTxHash, isEVMTxConfirmed, step, notifyDeposit, startPolling]);

  // Sync payment state with step
  useEffect(() => {
    if (paymentState === "awaiting_deposit" && step === "get-quote") {
      setStep("deposit");
    } else if (paymentState === "polling_status" && step === "deposit") {
      setStep("processing");
    }
  }, [paymentState, step]);

  // Handlers
  const handleChainSelect = useCallback((value: string) => {
    setSelectedChain(value);
    setSelectedTokenSymbol("");
  }, []);

  const handleContinueToWallet = useCallback(() => {
    if (selectedChain && selectedTokenSymbol) {
      setStep("connect-wallet");
    }
  }, [selectedChain, selectedTokenSymbol]);

  const handleConnectWallet = useCallback(async () => {
    if (!chainType || !selectedChain) return;

    try {
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
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }, [chainType, selectedChain, connectEVM, connectSolana, connectNEAR]);

  const handleDisconnectWallet = useCallback(() => {
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

  const handleContinueToQuote = useCallback(() => {
    if (refundAddress) {
      setStep("get-quote");
    }
  }, [refundAddress]);

  const handleGetQuote = useCallback(async () => {
    if (!selectedChain || !selectedToken || !refundAddress) return;

    const sourceAmount = (BigInt(10) ** BigInt(selectedToken.decimals)).toString();
    await requestQuote(selectedChain, selectedToken, sourceAmount, refundAddress);
  }, [selectedChain, selectedToken, refundAddress, requestQuote]);

  const handleSendDeposit = useCallback(async () => {
    if (!depositAddress || !quote || !selectedToken) return;

    try {
      if (chainType === "evm") {
        const amountInEth = (Number(quote.depositAmount) / 10 ** selectedToken.decimals).toString();
        await sendEVMTransaction(depositAddress, amountInEth);
      }
    } catch (err) {
      console.error("Failed to send deposit:", err);
    }
  }, [depositAddress, quote, selectedToken, chainType, sendEVMTransaction]);

  const handleManualDeposit = useCallback(() => {
    startPolling();
    setStep("processing");
  }, [startPolling]);

  const handleBack = useCallback(() => {
    switch (step) {
      case "connect-wallet":
        setStep("select-chain");
        break;
      case "get-quote":
        setStep("connect-wallet");
        break;
      case "deposit":
        reset();
        setStep("get-quote");
        break;
    }
  }, [step, reset]);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== "select-chain" && step !== "success" && (
              <button onClick={handleBack} className="p-1 hover:bg-brand/10 rounded">
                <span className="w-4 h-4">
                  <ARROW_LEFT />
                </span>
              </button>
            )}
            Pay from Another Chain
          </DialogTitle>
        </DialogHeader>

        <StepIndicator
          currentStep={stepNumber}
          steps={["Chain", "Wallet", "Quote", "Deposit", "Done"]}
        />

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 border border-destructive/50 rounded-lg bg-destructive/10">
            <span className="w-5 h-5 text-destructive">
              <X />
            </span>
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {/* Entry Fee Info */}
        <div className="flex items-center justify-between p-2 bg-neutral/5 rounded border border-brand/10">
          <span className="text-xs text-brand-muted">Entry Fee Required:</span>
          <span className="text-sm font-medium">
            {formattedEntryFee} {entryFeeSymbol}
          </span>
        </div>

        {/* Step: Select Chain */}
        {step === "select-chain" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Source Chain</Label>
              <Select value={selectedChain} onValueChange={handleChainSelect}>
                <SelectTrigger>
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

            {selectedChainData && (
              <div className="flex flex-col gap-2">
                <Label>Token to Send</Label>
                <Select value={selectedTokenSymbol} onValueChange={setSelectedTokenSymbol}>
                  <SelectTrigger>
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

            <Button
              onClick={handleContinueToWallet}
              disabled={!selectedChain || !selectedTokenSymbol}
              className="w-full"
            >
              Continue
            </Button>
          </div>
        )}

        {/* Step: Connect Wallet */}
        {step === "connect-wallet" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 p-3 border border-brand/25 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedChainData?.name} Wallet
                </span>
                <button
                  onClick={() => setUseManualAddress(!useManualAddress)}
                  className="text-xs text-brand-muted hover:text-brand underline"
                >
                  {useManualAddress ? "Connect wallet" : "Enter manually"}
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
                    This address will receive refunds if the transaction fails
                  </span>
                </div>
              ) : isWalletConnectedForChain ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between p-2 bg-success/10 border border-success/30 rounded">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 text-success">
                        <CHECK />
                      </span>
                      <span className="text-xs font-mono truncate max-w-[200px]">
                        {walletState.address}
                      </span>
                    </div>
                    <CopyButton text={walletState.address || ""} />
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDisconnectWallet}>
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleConnectWallet}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">Connecting...</span>
                    </>
                  ) : (
                    `Connect ${selectedChainData?.name} Wallet`
                  )}
                </Button>
              )}
            </div>

            <Button onClick={handleContinueToQuote} disabled={!refundAddress} className="w-full">
              Continue
            </Button>
          </div>
        )}

        {/* Step: Get Quote */}
        {step === "get-quote" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-brand-muted">From:</span>
                <span>
                  {selectedToken?.symbol} on {selectedChainData?.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-muted">To:</span>
                <span>STRK on Starknet</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-muted">Refund Address:</span>
                <span className="font-mono text-xs truncate max-w-[150px]">{refundAddress}</span>
              </div>
            </div>

            <Button
              onClick={handleGetQuote}
              disabled={paymentState === "fetching_quote"}
              className="w-full"
            >
              {paymentState === "fetching_quote" ? (
                <>
                  <LoadingSpinner />
                  <span className="ml-2">Getting Quote...</span>
                </>
              ) : (
                "Get Quote"
              )}
            </Button>
          </div>
        )}

        {/* Step: Deposit */}
        {step === "deposit" && quote && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 p-3 border border-brand/25 rounded-lg">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-brand-muted">Amount to Deposit</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold font-mono">
                    {(Number(quote.depositAmount) / 10 ** (selectedToken?.decimals || 18)).toFixed(6)}
                  </span>
                  <span className="text-sm">{selectedToken?.symbol}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-brand-muted">Deposit Address</span>
                <div className="flex items-center gap-2 p-2 bg-black/50 rounded border border-brand/10">
                  <span className="text-xs font-mono break-all flex-1">{depositAddress}</span>
                  <CopyButton text={depositAddress ?? ""} />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-brand-muted">You Will Receive</span>
                <span className="text-sm font-mono">
                  ~{(Number(quote.destinationAmount) / 10 ** 18).toFixed(6)} STRK
                </span>
              </div>
            </div>

            {isWalletConnectedForChain && chainType === "evm" ? (
              <Button onClick={handleSendDeposit} disabled={isEVMTxPending} className="w-full">
                {isEVMTxPending ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">Sending...</span>
                  </>
                ) : (
                  "Send via Wallet"
                )}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-brand-muted text-center">
                  Send the exact amount to the address above, then click below
                </span>
                <Button onClick={handleManualDeposit} className="w-full">
                  I've Sent the Deposit
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <LoadingSpinner />
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm text-brand-muted">Processing your payment...</span>
              <StatusBadge status={swapStatus} />
            </div>

            {evmTxHash && (
              <div className="w-full p-2 bg-neutral/5 rounded border border-brand/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-brand-muted">TX Hash:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono truncate max-w-[120px]">{evmTxHash}</span>
                    <CopyButton text={evmTxHash} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <span className="w-12 h-12 text-success">
              <CHECK />
            </span>
            <div className="flex flex-col items-center gap-2">
              <span className="text-lg font-medium">Payment Successful!</span>
              <span className="text-sm text-brand-muted">Returning to tournament entry...</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
