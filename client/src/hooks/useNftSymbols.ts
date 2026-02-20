import { useState, useEffect } from "react";
import { useProvider } from "@starknet-react/core";
import { ByteArray, byteArray } from "starknet";

export const useNftSymbols = (tokenAddresses: string[]) => {
  const { provider } = useProvider();
  const [nftSymbols, setNftSymbols] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const tokenAddressesKey = JSON.stringify(tokenAddresses);

  useEffect(() => {
    const fetchSymbols = async () => {
      if (tokenAddresses.length === 0) {
        setNftSymbols({});
        return;
      }

      setIsLoading(true);
      try {
        const results: Record<string, string> = {};

        await Promise.all(
          tokenAddresses.map(async (tokenAddress) => {
            try {
              const symbolResult = await provider.callContract({
                contractAddress: tokenAddress,
                entrypoint: "symbol",
                calldata: [],
              });

              if (symbolResult && symbolResult.length > 0) {
                // Parse ByteArray response
                const symbolByteArray: ByteArray = {
                  data: symbolResult.slice(0, -2),
                  pending_word: symbolResult[symbolResult.length - 2],
                  pending_word_len: symbolResult[symbolResult.length - 1],
                };
                results[tokenAddress] = byteArray.stringFromByteArray(symbolByteArray);
              } else {
                // Fallback to shortened address
                results[tokenAddress] = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
              }
            } catch (error) {
              console.error(`Error fetching symbol for ${tokenAddress}:`, error);
              // Fallback to shortened address if symbol fetch fails
              results[tokenAddress] = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
            }
          })
        );

        setNftSymbols(results);
      } catch (error) {
        console.error("Error fetching NFT symbols:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSymbols();
  }, [tokenAddressesKey, provider]);

  return { nftSymbols, isLoading };
};
