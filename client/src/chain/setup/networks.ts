import {
  Chain,
  mainnet,
  sepolia,
  NativeCurrency,
} from "@starknet-react/chains";
import { stringToFelt } from "@/lib/utils";
import { supportedConnectorIds } from "@/lib/connectors";

export enum ChainId {
  SN_MAIN = "SN_MAIN",
  SN_SEPOLIA = "SN_SEPOLIA",
}

export enum NetworkId {
  SN_MAIN = "MAINNET",
  SN_SEPOLIA = "SEPOLIA",
}

//
// explorers
//
type ChainExplorers = {
  [key: string]: string[];
};

//
// chain config
//
export type ChainConfig = {
  chain?: Chain;
  chainId?: ChainId;
  name?: string;
  rpcUrl?: string;
  toriiUrl?: string;
  toriiTokensUrl?: string;
  relayUrl?: string;
  blastRpc?: string;
  blockExplorerUrl?: string;
  ekuboPriceAPI?: string;
  masterAddress?: string;
  masterPrivateKey?: string;
  accountClassHash?: string;
  ethAddress?: string;
  connectorIds?: string[];
  // starknet Chain
  network?: string;
  testnet?: boolean;
  nativeCurrency?: NativeCurrency;
  explorers?: ChainExplorers;
  denshokanAddress?: string;
  budokanAddress?: string;
  budokanViewerAddress?: string;
  // SDK API URLs
  budokanApiUrl?: string;
  denshokanApiUrl?: string;
};

const snSepoliaConfig: ChainConfig = {
  chain: { ...sepolia },
  chainId: ChainId.SN_SEPOLIA,
  name: "Starknet Sepolia",
  rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia",
  toriiUrl: "https://api.cartridge.gg/x/pg-sepolia-2/torii",
  toriiTokensUrl: "",
  relayUrl: undefined,
  blastRpc: undefined,
  blockExplorerUrl: "https://sepolia.voyager.online",
  ekuboPriceAPI: "https://sepolia-api.ekubo.org/price",
  // masterAddress: KATANA_PREFUNDED_ADDRESS,
  // masterPrivateKey: KATANA_PREFUNDED_PRIVATE_KEY,
  masterAddress: undefined,
  masterPrivateKey: undefined,
  accountClassHash: undefined,
  ethAddress: sepolia.nativeCurrency.address,
  connectorIds: [supportedConnectorIds.CONTROLLER],
  denshokanAddress:
    "0x024c4870f96355ac9fd701bd05ab5d08c220c371ebb861535eb9851a959c522d",
  budokanAddress:
    "0x0423583f0e9461708a3eb763f1c4d89dbda03814da0f048af5eefd9c97e742ef",
  budokanViewerAddress:
    "0x0568f6078cdf5d9aad881c3a9da1be58fc83018a198bb78ca43a663070a4fcbb",
  budokanApiUrl: "https://budokan-api-sepolia.up.railway.app",
  denshokanApiUrl: "https://denshokan-api-sepolia.up.railway.app",
};

const snMainnetConfig: ChainConfig = {
  chain: { ...mainnet },
  chainId: ChainId.SN_MAIN,
  name: "Mainnet",
  rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet",
  toriiUrl: "https://api.cartridge.gg/x/pg-mainnet-10/torii",
  toriiTokensUrl: "https://api.cartridge.gg/x/pg-mainnet-10/torii",
  relayUrl: undefined,
  blastRpc:
    "https://starknet-mainnet.blastapi.io/5ef61753-e7c1-4593-bc62-97fdf96f8de5",
  blockExplorerUrl: "https://voyager.online",
  ekuboPriceAPI: "https://prod-api-quoter.ekubo.org",
  masterAddress: undefined,
  masterPrivateKey: undefined,
  accountClassHash: undefined,
  ethAddress: mainnet.nativeCurrency.address,
  connectorIds: [supportedConnectorIds.CONTROLLER],
  denshokanAddress:
    "0x036017e69d21d6d8c13e266eabb73ef1f1d02722d86bdcabe5f168f8e549d3cd",
  budokanAddress:
    "0x06137ee50f57d08e1d0d758045e45982e2f5ef4826091ed4db136e7afbafecce",
  budokanViewerAddress:
    "0x075d1b9f1a9751e6b8f8b5a4ca8e721f10c58d87607e703cda062e512a434443",
  budokanApiUrl: "https://budokan-api-production.up.railway.app",
  denshokanApiUrl: "https://denshokan-api-production.up.railway.app",
} as const;

//--------------------------------
// Available chains
//

const makeChainConfig = (config: ChainConfig): ChainConfig => {
  const chain = { ...config };
  //
  // derive starknet Chain
  if (!chain.chain) {
    chain.chain = {
      id: BigInt(stringToFelt(chain.chainId ?? "")),
      name: chain.name,
      network: chain.network ?? "katana",
      testnet: chain.testnet ?? true,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: {
        default: { http: [] },
        public: { http: [] },
      },
      paymasterRpcUrls: {
        default: { http: [] },
        public: { http: [] },
      },
      explorers: chain.explorers,
    } as Chain;
  }
  //
  // use Cartridge RPCs
  if (chain.rpcUrl) {
    chain.chain.rpcUrls.default.http = [chain.rpcUrl];
    chain.chain.rpcUrls.public.http = [chain.rpcUrl];
  }

  return chain;
};

export const CHAINS: Record<ChainId, ChainConfig> = {
  [ChainId.SN_MAIN]: makeChainConfig(snMainnetConfig),
  [ChainId.SN_SEPOLIA]: makeChainConfig(snSepoliaConfig),
};

// Maps legacy VITE_CHAIN_ID values (MAINNET, SEPOLIA) to ChainId enum values
const CHAIN_ID_ALIASES: Record<string, ChainId> = {
  MAINNET: ChainId.SN_MAIN,
  SN_MAIN: ChainId.SN_MAIN,
  SEPOLIA: ChainId.SN_SEPOLIA,
  SN_SEPOLIA: ChainId.SN_SEPOLIA,
};

export const getDefaultChainId = (): ChainId => {
  // Check URL parameter first (for sepolia support)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const networkParam = params.get("network");

    if (networkParam === "sepolia") {
      return ChainId.SN_SEPOLIA;
    }
  }

  // Fall back to environment variable
  const envValue = import.meta.env.VITE_CHAIN_ID as string;

  if (envValue) {
    const resolved = CHAIN_ID_ALIASES[envValue];
    if (!resolved) {
      throw new Error(
        `Unsupported VITE_CHAIN_ID: "${envValue}". Use one of: ${Object.keys(CHAIN_ID_ALIASES).join(", ")}`,
      );
    }
    return resolved;
  }

  return ChainId.SN_MAIN;
};
