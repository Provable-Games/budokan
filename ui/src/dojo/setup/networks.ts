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
export type DojoChainConfig = {
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
  nearIntentsApiUrl?: string;
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
};

const snSepoliaConfig: DojoChainConfig = {
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
    "0x02334dc9c950c74c3228e2a343d495ae36f0b4edf06767a679569e9f9de08776",
  budokanAddress:
    "0x027649a648ce25712cf90a3b32b9f15f86edb21293227d0b3cc689987c77a02b",
};

const snMainnetConfig: DojoChainConfig = {
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
  nearIntentsApiUrl: "https://1click.chaindefuser.com",
  masterAddress: undefined,
  masterPrivateKey: undefined,
  accountClassHash: undefined,
  ethAddress: mainnet.nativeCurrency.address,
  connectorIds: [supportedConnectorIds.CONTROLLER],
  denshokanAddress:
    "0x036017e69d21d6d8c13e266eabb73ef1f1d02722d86bdcabe5f168f8e549d3cd",
  budokanAddress:
    "0x051f5fc1ddcffcb0bf548378e0166a5e5328fb4894efbab170e3fb1a4c0cdfdf",
} as const;

//--------------------------------
// Available chains
//

const makeDojoChainConfig = (config: DojoChainConfig): DojoChainConfig => {
  let chain = { ...config };
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

export const CHAINS: Record<ChainId, DojoChainConfig> = {
  [ChainId.SN_MAIN]: makeDojoChainConfig(snMainnetConfig),
  [ChainId.SN_SEPOLIA]: makeDojoChainConfig(snSepoliaConfig),
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
  const envChainId = import.meta.env.VITE_CHAIN_ID as ChainId;

  if (envChainId && !isChainIdSupported(envChainId)) {
    throw new Error(`Unsupported chain ID in environment: ${envChainId}`);
  }

  return envChainId || ChainId.SN_MAIN;
};

const isChainIdSupported = (chainId: ChainId): boolean => {
  return Object.keys(CHAINS).includes(chainId);
};
