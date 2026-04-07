/**
 * Thin adapters for denshokan-sdk hooks not directly provided by the SDK.
 * For standard queries, import directly from "@provable-games/denshokan-sdk/react".
 */
import { useState, useEffect, useCallback } from "react";
import { useDenshokanClient } from "@provable-games/denshokan-sdk/react";
import type { GameSettingDetails } from "@provable-games/denshokan-sdk";

/**
 * Fetch a single game setting by settingsId and gameAddress.
 * The SDK provides getSettings (list) but no single-setting hook.
 */
export function useGameSetting({
  settingsId,
  gameAddress,
  active = true,
}: {
  settingsId?: number;
  gameAddress?: string;
  active?: boolean;
}) {
  const client = useDenshokanClient();
  const [data, setData] = useState<GameSettingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(() => {
    if (!active || settingsId === undefined || !gameAddress) return;
    setIsLoading(true);
    setError(null);
    client
      .getSetting(settingsId, gameAddress)
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [client, active, settingsId, gameAddress]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}
