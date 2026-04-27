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
    "0x0004e6e5bbf18424dfb825f1dbb65e10473b4603a1ec7b9ab02c143d877114f9",
  budokanAddress:
    "0x017750a167b7c4968249d7db06dccc8b3908ef8954cb40cfe4d3c651ca0dcd1d",
  budokanViewerAddress:
    "0x03d5febe0042b943967074f4ebd850a6b5d50850cd3fb84fbd0eb66dadd9ddec",
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
    "0x00263cc540dac11334470a64759e03952ee2f84a290e99ba8cbc391245cd0bf9",
  budokanAddress:
    "0x0596ced030e74ebc37f33607f07ecd5a62eff22cdc4ae31fe2d724040c1bdc0b",
  budokanViewerAddress:
    "0x013c8239361fdbd7ec26db2c83f4ff270c5bba83a0bc105b4005b676ff57fdbe",
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
