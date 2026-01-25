import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { http, createConfig, useAccount, useConnect, useDisconnect, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { mainnet, base, arbitrum } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseEther } from "viem";

// =============================================================================
// Types
// =============================================================================

export type ChainType = "evm" | "solana" | "near";

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: string | null;
  chainType: ChainType | null;
}

export interface CrossChainWalletContextValue {
  // Wallet state
  walletState: WalletState;

  // EVM specific
  connectEVM: (chainId: string) => Promise<void>;
  disconnectEVM: () => void;
  sendEVMTransaction: (to: string, amount: string, tokenAddress?: string) => Promise<string>;
  isEVMConnecting: boolean;
  evmTxHash: string | null;
  isEVMTxPending: boolean;
  isEVMTxConfirmed: boolean;

  // Solana specific (placeholder for now)
  connectSolana: () => Promise<void>;
  disconnectSolana: () => void;
  sendSolanaTransaction: (to: string, amount: string) => Promise<string>;
  isSolanaConnecting: boolean;

  // NEAR specific (placeholder for now)
  connectNEAR: () => Promise<void>;
  disconnectNEAR: () => void;
  sendNEARTransaction: (to: string, amount: string) => Promise<string>;
  isNEARConnecting: boolean;

  // Generic
  disconnect: () => void;
  switchChain: (chainType: ChainType, chainId: string) => Promise<void>;
}

// =============================================================================
// Wagmi Configuration
// =============================================================================

// WalletConnect project ID - users should replace with their own
const WALLET_CONNECT_PROJECT_ID = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || "demo-project-id";

const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum],
  connectors: [
    injected(),
    walletConnect({ projectId: WALLET_CONNECT_PROJECT_ID }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
  },
});

const queryClient = new QueryClient();

// =============================================================================
// Context
// =============================================================================

const CrossChainWalletContext = createContext<CrossChainWalletContextValue | null>(null);

export function useCrossChainWallet() {
  const context = useContext(CrossChainWalletContext);
  if (!context) {
    throw new Error("useCrossChainWallet must be used within CrossChainWalletProvider");
  }
  return context;
}

// =============================================================================
// EVM Wallet Hook (internal)
// =============================================================================

function useEVMWalletInternal() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransaction, data: txHash, isPending: isTxPending } = useSendTransaction();
  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const connectWallet = useCallback(async () => {
    // Try to connect with injected wallet first (MetaMask, etc.)
    const injectedConnector = connectors.find((c) => c.id === "injected");
    if (injectedConnector) {
      connect({ connector: injectedConnector });
    } else if (connectors.length > 0) {
      connect({ connector: connectors[0] });
    }
  }, [connect, connectors]);

  const sendTx = useCallback(
    async (to: string, amount: string, _tokenAddress?: string) => {
      // For native token transfers
      sendTransaction({
        to: to as `0x${string}`,
        value: parseEther(amount),
      });
      return txHash || "";
    },
    [sendTransaction, txHash]
  );

  return {
    address: address ?? null,
    isConnected,
    chainId: chain?.id.toString() ?? null,
    connect: connectWallet,
    disconnect,
    sendTransaction: sendTx,
    isConnecting,
    txHash: txHash ?? null,
    isTxPending,
    isTxConfirmed,
  };
}

// =============================================================================
// Inner Provider (uses wagmi hooks)
// =============================================================================

function CrossChainWalletProviderInner({ children }: { children: ReactNode }) {
  const evmWallet = useEVMWalletInternal();

  // Solana state (simplified - would need full wallet-adapter integration)
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [isSolanaConnecting, setIsSolanaConnecting] = useState(false);

  // NEAR state (simplified - would need wallet-selector integration)
  const [nearAddress, setNearAddress] = useState<string | null>(null);
  const [isNEARConnecting, setIsNEARConnecting] = useState(false);

  // Track which chain type is currently connected
  const [activeChainType, setActiveChainType] = useState<ChainType | null>(null);

  // Determine current wallet state
  const walletState = useMemo<WalletState>(() => {
    if (evmWallet.isConnected && activeChainType === "evm") {
      return {
        isConnected: true,
        address: evmWallet.address,
        chainId: evmWallet.chainId,
        chainType: "evm",
      };
    }
    if (solanaAddress && activeChainType === "solana") {
      return {
        isConnected: true,
        address: solanaAddress,
        chainId: "solana",
        chainType: "solana",
      };
    }
    if (nearAddress && activeChainType === "near") {
      return {
        isConnected: true,
        address: nearAddress,
        chainId: "near",
        chainType: "near",
      };
    }
    return {
      isConnected: false,
      address: null,
      chainId: null,
      chainType: null,
    };
  }, [evmWallet.isConnected, evmWallet.address, evmWallet.chainId, solanaAddress, nearAddress, activeChainType]);

  // EVM connect
  const connectEVM = useCallback(async (_chainId: string) => {
    await evmWallet.connect();
    setActiveChainType("evm");
  }, [evmWallet]);

  // EVM disconnect
  const disconnectEVM = useCallback(() => {
    evmWallet.disconnect();
    if (activeChainType === "evm") {
      setActiveChainType(null);
    }
  }, [evmWallet, activeChainType]);

  // Solana connect (placeholder)
  const connectSolana = useCallback(async () => {
    setIsSolanaConnecting(true);
    try {
      // Check if Phantom or other Solana wallet is available
      const solana = (window as any).solana;
      if (solana?.isPhantom) {
        const response = await solana.connect();
        setSolanaAddress(response.publicKey.toString());
        setActiveChainType("solana");
      } else {
        throw new Error("Please install a Solana wallet like Phantom");
      }
    } finally {
      setIsSolanaConnecting(false);
    }
  }, []);

  // Solana disconnect
  const disconnectSolana = useCallback(() => {
    const solana = (window as any).solana;
    if (solana?.disconnect) {
      solana.disconnect();
    }
    setSolanaAddress(null);
    if (activeChainType === "solana") {
      setActiveChainType(null);
    }
  }, [activeChainType]);

  // Solana send transaction (placeholder)
  const sendSolanaTransaction = useCallback(async (_to: string, _amount: string): Promise<string> => {
    throw new Error("Solana transactions not yet implemented - please send manually");
  }, []);

  // NEAR connect (placeholder)
  const connectNEAR = useCallback(async () => {
    setIsNEARConnecting(true);
    try {
      // Check if NEAR wallet is available
      const near = (window as any).near;
      if (near) {
        // This would need proper NEAR wallet selector integration
        throw new Error("NEAR wallet connection requires wallet selector setup");
      } else {
        throw new Error("Please install a NEAR wallet");
      }
    } finally {
      setIsNEARConnecting(false);
    }
  }, []);

  // NEAR disconnect
  const disconnectNEAR = useCallback(() => {
    setNearAddress(null);
    if (activeChainType === "near") {
      setActiveChainType(null);
    }
  }, [activeChainType]);

  // NEAR send transaction (placeholder)
  const sendNEARTransaction = useCallback(async (_to: string, _amount: string): Promise<string> => {
    throw new Error("NEAR transactions not yet implemented - please send manually");
  }, []);

  // Generic disconnect
  const disconnect = useCallback(() => {
    disconnectEVM();
    disconnectSolana();
    disconnectNEAR();
    setActiveChainType(null);
  }, [disconnectEVM, disconnectSolana, disconnectNEAR]);

  // Switch chain
  const switchChain = useCallback(async (chainType: ChainType, chainId: string) => {
    // Disconnect from current chain type if different
    if (activeChainType && activeChainType !== chainType) {
      disconnect();
    }

    switch (chainType) {
      case "evm":
        await connectEVM(chainId);
        break;
      case "solana":
        await connectSolana();
        break;
      case "near":
        await connectNEAR();
        break;
    }
  }, [activeChainType, disconnect, connectEVM, connectSolana, connectNEAR]);

  const value = useMemo<CrossChainWalletContextValue>(() => ({
    walletState,

    connectEVM,
    disconnectEVM,
    sendEVMTransaction: evmWallet.sendTransaction,
    isEVMConnecting: evmWallet.isConnecting,
    evmTxHash: evmWallet.txHash,
    isEVMTxPending: evmWallet.isTxPending,
    isEVMTxConfirmed: evmWallet.isTxConfirmed,

    connectSolana,
    disconnectSolana,
    sendSolanaTransaction,
    isSolanaConnecting,

    connectNEAR,
    disconnectNEAR,
    sendNEARTransaction,
    isNEARConnecting,

    disconnect,
    switchChain,
  }), [
    walletState,
    connectEVM,
    disconnectEVM,
    evmWallet,
    connectSolana,
    disconnectSolana,
    sendSolanaTransaction,
    isSolanaConnecting,
    connectNEAR,
    disconnectNEAR,
    sendNEARTransaction,
    isNEARConnecting,
    disconnect,
    switchChain,
  ]);

  return (
    <CrossChainWalletContext.Provider value={value}>
      {children}
    </CrossChainWalletContext.Provider>
  );
}

// =============================================================================
// Main Provider (wraps with wagmi)
// =============================================================================

export function CrossChainWalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <CrossChainWalletProviderInner>
          {children}
        </CrossChainWalletProviderInner>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// =============================================================================
// Utility: Get chain ID for wagmi from our chain config
// =============================================================================

export function getWagmiChainId(chainId: string): number | undefined {
  const chainMap: Record<string, number> = {
    eth: mainnet.id,
    base: base.id,
    arb: arbitrum.id,
  };
  return chainMap[chainId];
}
