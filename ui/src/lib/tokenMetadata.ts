import { TokenMetadata } from "@/lib/types";
import { mainnetTokens } from "@/lib/mainnetTokens";
import { sepoliaTokens } from "@/lib/sepoliaTokens";
import { mainnetNFTs } from "@/lib/nfts";
import { indexAddress } from "@/lib/utils";

// Normalize token lists to TokenMetadata format
const normalizeTokenList = (
  tokens: Array<{ l2_token_address?: string; address?: string; [key: string]: any }>,
  tokenType: "erc20" | "erc721" = "erc20"
): TokenMetadata[] => {
  return tokens.map((token) => ({
    name: token.name,
    symbol: token.symbol,
    token_address: token.l2_token_address || token.address || "",
    decimals: token.decimals ?? 18,
    token_type: tokenType,
    logo_url: token.logo_url || token.image,
    total_supply: token.total_supply,
    sort_order: token.sort_order,
  }));
};

// Mainnet tokens normalized
export const mainnetTokenMetadata: TokenMetadata[] = normalizeTokenList(mainnetTokens, "erc20");
export const mainnetNFTMetadata: TokenMetadata[] = normalizeTokenList(mainnetNFTs as any, "erc721");

// Sepolia tokens normalized
export const sepoliaTokenMetadata: TokenMetadata[] = normalizeTokenList(sepoliaTokens, "erc20");

// Combined lists
export const allMainnetTokens: TokenMetadata[] = [...mainnetTokenMetadata, ...mainnetNFTMetadata];
export const allSepoliaTokens: TokenMetadata[] = sepoliaTokenMetadata;

// Helper to get all tokens for a chain
export const getTokensForChain = (chainId: string): TokenMetadata[] => {
  if (chainId === "SN_MAIN") {
    return allMainnetTokens;
  } else if (chainId === "SN_SEPOLIA") {
    return allSepoliaTokens;
  }
  return [];
};

// Helper to find token by address
export const findTokenByAddress = (
  address: string,
  chainId: string
): TokenMetadata | undefined => {
  const tokens = getTokensForChain(chainId);
  return tokens.find((t) => indexAddress(t.token_address) === indexAddress(address));
};

// Helper to get token symbol
export const getTokenSymbol = (address: string, chainId: string): string => {
  const token = findTokenByAddress(address, chainId);
  return token?.symbol ?? "Unknown";
};

// Helper to get token name
export const getTokenName = (address: string, chainId: string): string => {
  const token = findTokenByAddress(address, chainId);
  return token?.name ?? "Unknown Token";
};

// Helper to get token decimals
export const getTokenDecimals = (address: string, chainId: string): number => {
  const token = findTokenByAddress(address, chainId);
  return token?.decimals ?? 18;
};
