import { useState, useEffect, useCallback } from "react";
import { addAddressPadding } from "starknet";

export interface PGNftItem {
  tokenId: string;
  lastBlock: number;
}

interface PGNftResponse {
  contract: string;
  owner: string;
  tokenCount: number;
  tokens: PGNftItem[];
}

interface UsePGNftsProps {
  contractAddress: string;
  owner?: string;
  active?: boolean;
}

interface UsePGNftsResult {
  nfts: PGNftItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const PG_API_BASE_URL =
  import.meta.env.VITE_PG_API_BASE_URL ||
  "https://apibara-tokens-production.up.railway.app";

// List of contract addresses that should use the PG API
const PG_CONTRACT_ADDRESSES = (import.meta.env.VITE_PG_CONTRACT_ADDRESSES || "")
  .split(",")
  .filter(Boolean)
  .concat([
    "0x0377c2d65debb3978ea81904e7d59740da1f07412e30d01c5ded1c5d6f1ddc43",
  ]);

export const shouldUsePGApi = (contractAddress: string): boolean => {
  const normalized = addAddressPadding(contractAddress).toLowerCase();
  return PG_CONTRACT_ADDRESSES.some(
    (addr: string) => addAddressPadding(addr).toLowerCase() === normalized
  );
};

export const usePGNfts = ({
  contractAddress,
  owner,
  active = true,
}: UsePGNftsProps): UsePGNftsResult => {
  const [nfts, setNfts] = useState<PGNftItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchNfts = useCallback(async () => {
    if (!active || !contractAddress || !owner) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Normalize addresses
      const normalizedContract =
        addAddressPadding(contractAddress).toLowerCase();
      const normalizedOwner = addAddressPadding(owner).toLowerCase();

      const url = `${PG_API_BASE_URL}/owners/${normalizedContract}/${normalizedOwner}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `PG API error: ${response.status} ${response.statusText}`
        );
      }

      const data: PGNftResponse = await response.json();
      const tokens = data.tokens || [];
      setNfts(tokens);
    } catch (err) {
      console.error("Error fetching NFTs from PG API:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setNfts([]);
    } finally {
      setLoading(false);
    }
  }, [contractAddress, owner, active]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  const refetch = useCallback(() => {
    fetchNfts();
  }, [fetchNfts]);

  return {
    nfts,
    loading,
    error,
    refetch,
  };
};
