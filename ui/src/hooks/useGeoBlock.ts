import { useState, useEffect } from "react";

interface GeoBlockResult {
  isBlocked: boolean;
  isLoading: boolean;
  country: string;
  region: string;
}

const SESSION_KEY = "budokan_geo_check";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useGeoBlock(): GeoBlockResult {
  const [result, setResult] = useState<GeoBlockResult>({
    isBlocked: false,
    isLoading: true,
    country: "",
    region: "",
  });

  useEffect(() => {
    // Check sessionStorage cache with TTL
    try {
      const cached = sessionStorage.getItem(SESSION_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed.timestamp ?? 0);
        if (age < CACHE_TTL_MS) {
          setResult({
            isBlocked: parsed.blocked ?? false,
            isLoading: false,
            country: parsed.country ?? "",
            region: parsed.region ?? "",
          });
          return;
        }
        // Cache expired, remove it
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // sessionStorage unavailable, proceed with fetch
    }

    let cancelled = false;

    fetch("/api/geo")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;

        // Cache in sessionStorage with timestamp
        try {
          sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ ...data, timestamp: Date.now() })
          );
        } catch {
          // Ignore storage errors
        }

        setResult({
          isBlocked: data.blocked ?? false,
          isLoading: false,
          country: data.country ?? "",
          region: data.region ?? "",
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Fail open — allow access on error
        setResult({
          isBlocked: false,
          isLoading: false,
          country: "",
          region: "",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return result;
}
