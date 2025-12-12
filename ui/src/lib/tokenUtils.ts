import { mainnetTokens } from "./mainnetTokens";
import { mainnetNFTs, sepoliaNFTs } from "./nfts";
import { sepoliaTokens } from "./sepoliaTokens";
import { indexAddress } from "./utils";

export interface StaticToken {
  name: string;
  symbol: string;
  l2_token_address: string;
  decimals?: number;
  total_supply?: number | null;
  sort_order?: number;
  logo_url?: string;
}

export interface TokenForDisplay {
  name: string;
  symbol: string;
  token_address: string;
  decimals: number;
  token_type: "erc20" | "erc721";
  logo_url?: string;
  total_supply?: number | null;
  sort_order?: number;
}

/**
 * Get all tokens for a given chain
 */
export const getTokensForChain = (
  chainId: string,
  tokenType?: "erc20" | "erc721"
): TokenForDisplay[] => {
  const isMainnet = chainId === "SN_MAIN";
  const isSepolia = chainId === "SN_SEPOLIA";

  if (isMainnet) {
    const erc20Tokens: TokenForDisplay[] = mainnetTokens.map((token) => ({
      name: token.name,
      symbol: token.symbol,
      token_address: token.l2_token_address,
      decimals: token.decimals ?? 18,
      token_type: "erc20" as const,
      logo_url: token.logo_url,
      total_supply: token.total_supply,
      sort_order: token.sort_order,
    }));

    const erc721Tokens: TokenForDisplay[] = mainnetNFTs.map((nft) => ({
      name: nft.name || "Unknown NFT",
      symbol: nft.symbol || "NFT",
      token_address: nft.address,
      decimals: 0,
      token_type: "erc721" as const,
      logo_url: nft.image,
    }));

    const allTokens = [...erc20Tokens, ...erc721Tokens];

    if (tokenType) {
      return allTokens.filter((token) => token.token_type === tokenType);
    }

    return allTokens;
  } else if (isSepolia) {
    const erc20Tokens: TokenForDisplay[] = sepoliaTokens.map((token) => ({
      name: token.name,
      symbol: token.symbol,
      token_address: token.l2_token_address,
      decimals: token.decimals ?? 18,
      token_type: "erc20" as const,
      logo_url: token.logo_url,
      total_supply: token.total_supply,
      sort_order: token.sort_order,
    }));

    const erc721Tokens: TokenForDisplay[] = sepoliaNFTs.map((nft) => ({
      name: nft.name || "Unknown NFT",
      symbol: nft.symbol || "NFT",
      token_address: nft.address,
      decimals: 0,
      token_type: "erc721" as const,
      logo_url: nft.image,
    }));

    const allTokens = [...erc20Tokens, ...erc721Tokens];

    if (tokenType) {
      return allTokens.filter((token) => token.token_type === tokenType);
    }

    return allTokens;
  }

  return [];
};

/**
 * Get a single token by address
 */
export const getTokenByAddress = (
  address: string,
  chainId: string
): TokenForDisplay | undefined => {
  const allTokens = getTokensForChain(chainId);
  return allTokens.find(
    (token) => indexAddress(token.token_address) === indexAddress(address)
  );
};

/**
 * Search tokens by name or symbol
 */
export const searchTokens = (
  query: string,
  chainId: string,
  tokenType?: "erc20" | "erc721"
): TokenForDisplay[] => {
  const allTokens = getTokensForChain(chainId, tokenType);

  if (!query) {
    return allTokens;
  }

  const lowerQuery = query.toLowerCase();
  return allTokens.filter(
    (token) =>
      token.name.toLowerCase().includes(lowerQuery) ||
      token.symbol.toLowerCase().includes(lowerQuery)
  );
};

/**
 * Get paginated tokens
 */
export const getPaginatedTokens = (
  chainId: string,
  options: {
    tokenType?: "erc20" | "erc721";
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): {
  tokens: TokenForDisplay[];
  total: number;
} => {
  const { tokenType, search = "", limit = 10, offset = 0 } = options;

  const allTokens = searchTokens(search, chainId, tokenType);

  return {
    tokens: allTokens.slice(offset, offset + limit),
    total: allTokens.length,
  };
};

/**
 * Get tokens by addresses
 */
export const getTokensByAddresses = (
  addresses: string[],
  chainId: string
): TokenForDisplay[] => {
  const allTokens = getTokensForChain(chainId);
  const indexedAddresses = addresses.map(indexAddress);

  return allTokens.filter((token) =>
    indexedAddresses.includes(indexAddress(token.token_address))
  );
};
