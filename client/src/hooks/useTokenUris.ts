import { useState, useEffect } from "react";
import { useProvider } from "@starknet-react/core";
import { ByteArray, byteArray } from "starknet";
import { TokenUri } from "@/lib/types";

export const useTokenUris = (tokenAddresses: string[]) => {
  const { provider } = useProvider();
  const [tokenUris, setTokenUris] = useState<Record<string, TokenUri | null>>(
    {}
  );

  const tokenaddressesKey = JSON.stringify(tokenAddresses);

  // Helper function to process the URI based on its format
  const processUri = (uri: string) => {
    // Find where the data prefix ends
    const dataIndex = uri.indexOf("data:");
    if (dataIndex === -1) return uri; // Not a data URI

    const dataUri = dataIndex === 0 ? uri : uri.substring(dataIndex);

    // Check if it's utf8 JSON
    if (dataUri.includes("utf8")) {
      try {
        // Extract the JSON part (after the comma)
        const jsonStart = dataUri.indexOf(",") + 1;
        const jsonData = dataUri.substring(jsonStart);
        // Parse the JSON
        return JSON.parse(jsonData);
      } catch (e) {
        console.error("Failed to parse JSON data:", e);
        return dataUri; // Return original on parsing error
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
          // If not valid JSON, return the decoded string
          return decodedData;
        }
      } catch (e) {
        console.error("Failed to decode base64 data:", e);
        return dataUri; // Return original on decoding error
      }
    }

    // If no specific format detected, return as is
    return dataUri;
  };

  useEffect(() => {
    const fetchTokenUri = async () => {
      try {
        const results: Record<string, TokenUri | null> = {};

        await Promise.all(
          tokenAddresses.map(async (tokenAddress) => {
            try {
              const tokenUri = await provider.callContract({
                contractAddress: tokenAddress,
                entrypoint: "tokenURI",
                calldata: ["1", "0"],
              });

              const tokenUriByteArray: ByteArray = {
                data: tokenUri.slice(0, -2),
                pending_word: tokenUri[tokenUri.length - 2],
                pending_word_len: tokenUri[tokenUri.length - 1],
              };

              const fullString =
                byteArray.stringFromByteArray(tokenUriByteArray);
              // Process the URI based on its format
              results[tokenAddress] = processUri(fullString);
            } catch (error) {
              console.error(`Error fetching URI for ${tokenAddress}:`, error);
              results[tokenAddress] = null;
            }
          })
        );

        setTokenUris(results);
      } catch (error) {
        console.error("Error fetching token URIs:", error);
      }
    };

    if (tokenAddresses.length > 0) {
      fetchTokenUri();
    }
  }, [tokenaddressesKey, provider]);

  return tokenUris;
};
