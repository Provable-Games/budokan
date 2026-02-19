import { indexAddress } from "./utils";
import { mainnetTokens } from "./mainnetTokens";
import { sepoliaTokens } from "./sepoliaTokens";
import { mainnetNFTs, sepoliaNFTs } from "./nfts";
import { ChainId } from "@/dojo/setup/networks";

// Helper to get the token address
const getTokenAddr = (token: { address: string }): string => token.address;

const normalizedMatch = (a: string, b: string) =>
  indexAddress(a).toLowerCase() === indexAddress(b).toLowerCase();

export function getTokenLogoUrl(
  chainId: string,
  l2TokenAddress: string
): string | undefined {
  const isMainnet = chainId === ChainId.SN_MAIN;
  const isSepolia = chainId === ChainId.SN_SEPOLIA;

  // Check ERC20 tokens first
  const tokens = isMainnet ? mainnetTokens : isSepolia ? sepoliaTokens : [];
  const token = tokens.find((t) =>
    normalizedMatch(getTokenAddr(t), l2TokenAddress)
  );
  if (token?.logo_url) return token.logo_url;

  // Check NFT collections
  const nfts = isMainnet ? mainnetNFTs : isSepolia ? sepoliaNFTs : [];
  const nft = nfts.find((n) => normalizedMatch(n.address, l2TokenAddress));
  return nft?.image ?? undefined;
}

export const getTokenSymbol = (
  chainId: string,
  l2TokenAddress: string
): string | undefined => {
  const isMainnet = chainId === ChainId.SN_MAIN;
  const isSepolia = chainId === ChainId.SN_SEPOLIA;

  const tokens = isMainnet ? mainnetTokens : isSepolia ? sepoliaTokens : [];
  const token = tokens.find((t) =>
    normalizedMatch(getTokenAddr(t), l2TokenAddress)
  );
  if (token?.symbol) return token.symbol;

  const nfts = isMainnet ? mainnetNFTs : isSepolia ? sepoliaNFTs : [];
  const nft = nfts.find((n) => normalizedMatch(n.address, l2TokenAddress));
  return nft?.symbol;
};

export const getTokenHidden = (
  chainId: string,
  l2TokenAddress: string
): boolean | undefined => {
  const isMainnet = chainId === ChainId.SN_MAIN;
  const isSepolia = chainId === ChainId.SN_SEPOLIA;
  const tokens = isMainnet ? mainnetTokens : isSepolia ? sepoliaTokens : [];
  const token = tokens.find((t) =>
    normalizedMatch(getTokenAddr(t), l2TokenAddress)
  );
  return (token as any)?.hidden;
};

export const getTokenDecimals = (
  chainId: string,
  l2TokenAddress: string
): number => {
  const isMainnet = chainId === ChainId.SN_MAIN;
  const isSepolia = chainId === ChainId.SN_SEPOLIA;
  const tokens = isMainnet ? mainnetTokens : isSepolia ? sepoliaTokens : [];
  const token = tokens.find((t) =>
    normalizedMatch(getTokenAddr(t), l2TokenAddress)
  );
  return token?.decimals ?? 18;
};
