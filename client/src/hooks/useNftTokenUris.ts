import { useState, useEffect } from "react";
import { useProvider } from "@starknet-react/core";
import { ByteArray, byteArray } from "starknet";
import { TokenUri } from "@/lib/types";

export interface NftPrizeInfo {
  address: string;
  tokenId: bigint;
}

export const useNftTokenUris = (nfts: NftPrizeInfo[]) => {
  const { provider } = useProvider();
  const [tokenUris, setTokenUris] = useState<Record<string, TokenUri | null>>(
    {}
  );
  const [loading, setLoading] = useState(false);

  const nftsKey = JSON.stringify(nfts.map(n => ({ address: n.address, tokenId: n.tokenId.toString() })));

  // Helper function to process the URI based on its format
  const processUri = (uri: string): TokenUri | null => {
    try {
      // First, try to parse as JSON directly (in case it's already a JSON string)
      const parsed = JSON.parse(uri);
      return parsed;
    } catch {
      // Not a direct JSON string, continue processing
    }

    // Find where the data prefix starts (handle extra characters before it)
    const dataIndex = uri.indexOf("data:");
    if (dataIndex === -1) {
      return null;
    }

    // Extract from "data:" onwards to remove any prefix characters
    const dataUri = uri.substring(dataIndex);

    // Check if it's utf8 JSON
    if (dataUri.includes("utf8")) {
      try {
        // Extract the JSON part (after the comma)
        const jsonStart = dataUri.indexOf(",") + 1;
        const jsonData = dataUri.substring(jsonStart);
        // Parse the JSON
        return JSON.parse(jsonData);
      } catch (e) {
        console.error("Failed to parse UTF-8 JSON data:", e);
        return null;
      }
    }
    // Check if it's base64
    else if (dataUri.includes("base64")) {
      try {
        // Extract the base64 part (after the comma)
        const base64Start = dataUri.indexOf(",") + 1;
        const base64Data = dataUri.substring(base64Start);
        // Decode base64
        const decodedData = atob(base64Data);

        // Try to parse as JSON if possible
        try {
          return JSON.parse(decodedData);
        } catch {
          // Try to fix common JSON issues (unescaped control characters)
          try {
            // Replace unescaped newlines and other control characters
            const fixedData = decodedData
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t');

            return JSON.parse(fixedData);
          } catch (secondError) {
            console.error("Failed to parse NFT metadata JSON:", secondError);
            return null;
          }
        }
      } catch (e) {
        console.error("Failed to decode base64 data:", e);
        return null;
      }
    }

    return null;
  };

  useEffect(() => {
    const fetchTokenUris = async () => {
      if (nfts.length === 0) return;

      setLoading(true);
      try {
        const results: Record<string, TokenUri | null> = {};

        await Promise.all(
          nfts.map(async ({ address, tokenId }) => {
            const key = `${address}_${tokenId}`;
            try {
              // Convert bigint to Uint256 format (low, high)
              const low = tokenId & ((1n << 128n) - 1n);
              const high = tokenId >> 128n;

              const tokenUri = await provider.callContract({
                contractAddress: address,
                entrypoint: "token_uri",
                calldata: [low.toString(), high.toString()],
              });

              const tokenUriByteArray: ByteArray = {
                data: tokenUri.slice(0, -2),
                pending_word: tokenUri[tokenUri.length - 2],
                pending_word_len: tokenUri[tokenUri.length - 1],
              };

              const fullString =
                byteArray.stringFromByteArray(tokenUriByteArray);
              // Process the URI based on its format
              results[key] = processUri(fullString);
            } catch (error) {
              console.error(`Error fetching URI for ${address} token ${tokenId}:`, error);
              results[key] = null;
            }
          })
        );

        setTokenUris(results);
      } catch (error) {
        console.error("Error fetching NFT token URIs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTokenUris();
  }, [nftsKey, provider]);

  return { tokenUris, loading };
};
