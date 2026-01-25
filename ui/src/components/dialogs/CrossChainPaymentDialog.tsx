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
import { useEkuboSwap } from "@/hooks/useEkuboSwap";
import { useAccount } from "@starknet-react/core";
import { isStrkToken, STARKNET_STRK_ADDRESS } from "@/lib/nearIntents";
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

type Step =
  | "select-chain"
  | "connect-wallet"
  | "get-quote"
  | "deposit"
  | "bridging"
  | "swap-quote"
  | "swapping"
  | "success";

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
      label: "Bridging",
      className: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    },
    SUCCESS: {
      label: "Bridge Complete",
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
    <div className="flex items-center justify-center gap-1 mb-4">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-1">
          <div
            className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium",
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
            <div className={cn("w-4 h-0.5", index < currentStep ? "bg-success" : "bg-neutral/20")} />
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
  entryFeeToken,
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

  // Starknet account for swap transactions
  const { account } = useAccount();

  // Check if entry fee is STRK (no swap needed after bridge)
  const needsSwapAfterBridge = !isStrkToken(entryFeeToken);

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

  // Ekubo swap hook
  const {
    swapState,
    error: swapError,
    quoteResult: swapQuote,
    getQuoteForExactOutput,
    generateCalls: generateSwapCalls,
    reset: resetSwap,
  } = useEkuboSwap();

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
    error: bridgeError,
    quote,
    depositAddress,
    swapStatus,
    requestQuote,
    notifyDeposit,
    startPolling,
    reset: resetBridge,
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

  // Format amounts
  const formattedEntryFee = useMemo(() => {
    const amount = Number(entryFeeAmount) / 10 ** entryFeeDecimals;
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }, [entryFeeAmount, entryFeeDecimals]);

  // Step indicators
  const steps = needsSwapAfterBridge
    ? ["Chain", "Wallet", "Quote", "Deposit", "Bridge", "Swap", "Done"]
    : ["Chain", "Wallet", "Quote", "Deposit", "Bridge", "Done"];

  const stepNumber = useMemo(() => {
    const stepMap: Record<Step, number> = {
      "select-chain": 0,
      "connect-wallet": 1,
      "get-quote": 2,
      "deposit": 3,
      "bridging": 4,
      "swap-quote": needsSwapAfterBridge ? 5 : 4,
      "swapping": needsSwapAfterBridge ? 5 : 4,
      "success": needsSwapAfterBridge ? 6 : 5,
    };
    return stepMap[step] ?? 0;
  }, [step, needsSwapAfterBridge]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("select-chain");
      setSelectedChain("");
      setSelectedTokenSymbol("");
      setManualRefundAddress("");
      setUseManualAddress(false);
      resetBridge();
      resetSwap();
    }
  }, [open, resetBridge, resetSwap]);

  // Watch for bridge success → move to swap or complete
  useEffect(() => {
    if (paymentState === "success" && step === "bridging") {
      if (needsSwapAfterBridge) {
        setStep("swap-quote");
      } else {
        setStep("success");
        const timer = setTimeout(() => {
          onPaymentSuccess();
          onOpenChange(false);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [paymentState, step, needsSwapAfterBridge, onPaymentSuccess, onOpenChange]);

  // Watch for EVM transaction confirmation
  useEffect(() => {
    if (evmTxHash && isEVMTxConfirmed && step === "deposit") {
      notifyDeposit(evmTxHash);
      startPolling();
      setStep("bridging");
    }
  }, [evmTxHash, isEVMTxConfirmed, step, notifyDeposit, startPolling]);

  // Sync payment state with step
  useEffect(() => {
    if (paymentState === "awaiting_deposit" && step === "get-quote") {
      setStep("deposit");
    } else if (paymentState === "polling_status" && step === "deposit") {
      setStep("bridging");
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
    setStep("bridging");
  }, [startPolling]);

  // Get swap quote for STRK → entry fee token
  const handleGetSwapQuote = useCallback(async () => {
    if (!needsSwapAfterBridge) return;

    await getQuoteForExactOutput(
      entryFeeAmount.toString(),
      STARKNET_STRK_ADDRESS,
      entryFeeToken
    );
  }, [needsSwapAfterBridge, entryFeeAmount, entryFeeToken, getQuoteForExactOutput]);

  // Execute the swap
  const handleExecuteSwap = useCallback(async () => {
    if (!account || !swapQuote) return;

    setStep("swapping");

    try {
      const calls = generateSwapCalls(100); // 1% slippage

      if (calls.length === 0) {
        throw new Error("Failed to generate swap calls");
      }

      // Execute the multicall
      await account.execute(calls);

      setStep("success");
      setTimeout(() => {
        onPaymentSuccess();
        onOpenChange(false);
      }, 2000);
    } catch (err) {
      console.error("Swap failed:", err);
      // Stay on swap-quote step to retry
      setStep("swap-quote");
    }
  }, [account, swapQuote, generateSwapCalls, onPaymentSuccess, onOpenChange]);

  const handleBack = useCallback(() => {
    switch (step) {
      case "connect-wallet":
        setStep("select-chain");
        break;
      case "get-quote":
        setStep("connect-wallet");
        break;
      case "deposit":
        resetBridge();
        setStep("get-quote");
        break;
      case "swap-quote":
        // Can't go back from here - bridge is done
        break;
    }
  }, [step, resetBridge]);

  const error = bridgeError || swapError;

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== "select-chain" && step !== "success" && step !== "swap-quote" && step !== "swapping" && step !== "bridging" && (
              <button onClick={handleBack} className="p-1 hover:bg-brand/10 rounded">
                <span className="w-4 h-4">
                  <ARROW_LEFT />
                </span>
              </button>
            )}
            Pay from Another Chain
          </DialogTitle>
        </DialogHeader>

        <StepIndicator currentStep={stepNumber} steps={steps} />

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

            {needsSwapAfterBridge && selectedTokenSymbol && (
              <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-400">
                Tokens will bridge to STRK, then swap to {entryFeeSymbol} via Ekubo
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
                <span className="text-sm font-medium">{selectedChainData?.name} Wallet</span>
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
                  <span className="text-xs text-neutral">For refunds if the bridge fails</span>
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
            <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-brand-muted">From:</span>
                <span>{selectedToken?.symbol} on {selectedChainData?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-muted">To:</span>
                <span>STRK on Starknet</span>
              </div>
              {needsSwapAfterBridge && (
                <div className="flex justify-between text-blue-400">
                  <span>Then swap to:</span>
                  <span>{entryFeeSymbol}</span>
                </div>
              )}
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
                <span className="text-xs text-brand-muted">Deposit Amount</span>
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
                <span className="text-xs text-brand-muted">You Will Receive (STRK)</span>
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
                  Send the exact amount to the address above
                </span>
                <Button onClick={handleManualDeposit} className="w-full">
                  I've Sent the Deposit
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step: Bridging */}
        {step === "bridging" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <LoadingSpinner />
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm text-brand-muted">Bridging your tokens...</span>
              <StatusBadge status={swapStatus} />
            </div>
            {evmTxHash && (
              <div className="w-full p-2 bg-neutral/5 rounded border border-brand/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-brand-muted">TX:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono truncate max-w-[120px]">{evmTxHash}</span>
                    <CopyButton text={evmTxHash} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Swap Quote (after bridge) */}
        {step === "swap-quote" && (
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-success/10 border border-success/30 rounded">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 text-success">
                  <CHECK />
                </span>
                <span className="text-sm">Bridge complete! STRK received.</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-3 border border-brand/25 rounded-lg text-sm">
              <span className="font-medium">Final Step: Swap to {entryFeeSymbol}</span>
              <div className="flex justify-between">
                <span className="text-brand-muted">From:</span>
                <span>STRK</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-muted">To:</span>
                <span>{formattedEntryFee} {entryFeeSymbol}</span>
              </div>
              {swapQuote && (
                <div className="flex justify-between text-xs text-brand-muted pt-2 border-t border-brand/10">
                  <span>STRK needed:</span>
                  <span>{(Number(swapQuote.inputAmount) / 1e18).toFixed(6)} STRK</span>
                </div>
              )}
            </div>

            {!swapQuote ? (
              <Button onClick={handleGetSwapQuote} disabled={swapState === "quoting"} className="w-full">
                {swapState === "quoting" ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">Getting Swap Quote...</span>
                  </>
                ) : (
                  "Get Swap Quote"
                )}
              </Button>
            ) : (
              <Button onClick={handleExecuteSwap} className="w-full">
                Swap STRK → {entryFeeSymbol}
              </Button>
            )}
          </div>
        )}

        {/* Step: Swapping */}
        {step === "swapping" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <LoadingSpinner />
            <span className="text-sm text-brand-muted">Executing swap via Ekubo...</span>
          </div>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <span className="w-12 h-12 text-success">
              <CHECK />
            </span>
            <div className="flex flex-col items-center gap-2">
              <span className="text-lg font-medium">Payment Ready!</span>
              <span className="text-sm text-brand-muted">
                You now have {entryFeeSymbol} to pay the entry fee
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
