import { useState, useEffect, useCallback } from "react";
import { addAddressPadding } from "starknet";

export interface VoyagerNftItem {
  tokenId: string;
  contract_address: string;
  owner: string;
  name?: string;
  image?: string;
  metadata?: Record<string, any>;
}

interface VoyagerPagination {
  prev?: string;
  next?: string;
}

// Raw API response from Voyager (uses camelCase)
interface VoyagerApiNftItem {
  contractAddress: string;
  tokenId: string;
  ownerAddress?: string;
  balance?: {
    ownerAddress: string;
    balance: string;
    contractAddress: string;
    tokenId: string;
  };
  name?: string;
  imageUrl?: string;
  imageLargeUrl?: string;
  imageSmallUrl?: string;
  [key: string]: any; // For additional fields
}

interface VoyagerApiResponse {
  items: VoyagerApiNftItem[];
  pagination?: VoyagerPagination;
}

interface UseVoyagerNftsProps {
  contractAddress: string;
  owner?: string;
  limit?: number;
  active?: boolean;
  fetchAll?: boolean; // If true, automatically fetches all pages
  maxPages?: number; // Maximum number of pages to fetch (safety limit)
  delayMs?: number; // Delay between pagination requests in milliseconds
}

interface UseVoyagerNftsResult {
  nfts: VoyagerNftItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  hasMore: boolean;
}

// Use proxy URL where API key is hidden server-side
const VOYAGER_PROXY_URL = import.meta.env.VITE_VOYAGER_PROXY_URL;

export const useVoyagerNfts = ({
  contractAddress,
  owner,
  limit = 100,
  active = true,
  fetchAll = true,
  maxPages = 10,
  delayMs = 500, // Default 500ms delay between requests
}: UseVoyagerNftsProps): UseVoyagerNftsResult => {
  const [nfts, setNfts] = useState<VoyagerNftItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const fetchNfts = useCallback(async () => {
    // Skip if inactive
    if (!active || !contractAddress) {
      return;
    }

    // Proxy URL is required (API key is hidden server-side)
    if (!VOYAGER_PROXY_URL) {
      setError(new Error("Voyager proxy URL must be configured"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Normalize addresses
      const normalizedContract =
        addAddressPadding(contractAddress).toLowerCase();
      const normalizedOwner = owner
        ? addAddressPadding(owner).toLowerCase()
        : undefined;

      const allNfts: VoyagerNftItem[] = [];
      let currentUrl: string | null = null;
      let pageCount = 0;

      // Build initial query parameters
      const params = new URLSearchParams({
        contract_address: normalizedContract,
      });

      if (normalizedOwner) {
        params.append("owner_address", normalizedOwner);
      }

      params.append("limit", limit.toString());

      // Use proxy URL (API key is hidden server-side)
      currentUrl = `${VOYAGER_PROXY_URL}/api/voyager/nft-items?${params.toString()}`;

      // Fetch pages
      while (currentUrl && pageCount < maxPages) {
        // Add delay between requests (except for the first one)
        if (pageCount > 0 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        const response = await fetch(currentUrl, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          throw new Error(
            `Voyager API error: ${response.status} ${response.statusText}`
          );
        }

        const data: VoyagerApiResponse = await response.json();

        // Map the API response to match our interface
        const mappedItems: VoyagerNftItem[] = (data.items || []).map(
          (item) => ({
            tokenId: item.tokenId,
            contract_address: item.contractAddress,
            owner: item.balance?.ownerAddress || item.ownerAddress || "",
            name: item.name,
            image: item.imageUrl || item.imageLargeUrl || item.imageSmallUrl,
            metadata: item,
          })
        );

        allNfts.push(...mappedItems);
        pageCount++;

        // Check if we should continue fetching
        if (fetchAll && data.pagination?.next) {
          // Construct the full proxy URL for the next page
          currentUrl = `${VOYAGER_PROXY_URL}/api/voyager${data.pagination.next}`;
        } else {
          setHasMore(!!data.pagination?.next);
          currentUrl = null;
        }
      }

      setNfts(allNfts);
      setHasMore(!!currentUrl); // If we stopped due to maxPages, there might be more
    } catch (err) {
      console.error("Error fetching NFTs from Voyager:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setNfts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [contractAddress, owner, limit, active, fetchAll, maxPages, delayMs]);

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
    hasMore,
  };
};
