import { useState, useEffect } from "react";

interface GeoBlockResult {
  isBlocked: boolean;
  isLoading: boolean;
  country: string;
  region: string;
}

const SESSION_KEY = "budokan_geo_check";

export function useGeoBlock(): GeoBlockResult {
  const [result, setResult] = useState<GeoBlockResult>({
    isBlocked: false,
    isLoading: true,
    country: "",
    region: "",
  });

  useEffect(() => {
    // Try reading from sessionStorage cache
    try {
      const cached = sessionStorage.getItem(SESSION_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setResult({
          isBlocked: parsed.blocked ?? false,
          isLoading: false,
          country: parsed.country ?? "",
          region: parsed.region ?? "",
        });
        return;
      }
    } catch {
      // sessionStorage unavailable, proceed with fetch
    }

    let cancelled = false;

    fetch("/api/geo")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;

        // Cache in sessionStorage
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
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
