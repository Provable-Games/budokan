import { useState, useEffect, useRef } from "react";
import { useDojo } from "@/context/dojo";

export function useSqlExecute(query: string | null, tokens?: boolean) {
  const { selectedChainConfig } = useDojo();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const requestIdRef = useRef(0); // Track request IDs to handle race conditions

  const fetchData = async () => {
    if (query === null) {
      setLoading(false);
      setError(null);
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);

    // Increment request ID to track the latest request
    const currentRequestId = ++requestIdRef.current;

    try {
      if (!selectedChainConfig?.toriiUrl) {
        throw new Error("toriiUrl is not configured for the selected chain");
      }

      const encodedQuery = encodeURIComponent(query);

      const response = await fetch(
        `${
          tokens
            ? selectedChainConfig.toriiTokensUrl
            : selectedChainConfig.toriiUrl
        }/sql?query=${encodedQuery}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      // If this isn't the latest request, ignore the result
      if (currentRequestId !== requestIdRef.current) {
        console.log("Ignoring stale request result");
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        let errorMessage = "Failed to execute query";

        if (result.error) {
          if (typeof result.error === "string") {
            errorMessage = result.error;
          } else if (typeof result.error === "object") {
            errorMessage = result.error.message || JSON.stringify(result.error);
          }
        }

        throw new Error(errorMessage);
      }

      setData(result);
    } catch (err) {
      // Only set error if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        const errorMessage =
          err instanceof Error ? err.message : "An unknown error occurred";
        setError(errorMessage);
        // Clear data when an error occurs
        setData([]);
        console.error("Query error:", errorMessage);
      }
    } finally {
      // Only update loading state if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData();

    // Clean up function to handle component unmount
    return () => {
      // Increment the request ID to ignore any in-flight requests
      requestIdRef.current++;
    };
  }, [query, selectedChainConfig?.toriiUrl, tokens]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}
