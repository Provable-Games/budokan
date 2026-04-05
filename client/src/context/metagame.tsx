import { MetagameProvider as SdkMetagameProvider } from "@provable-games/metagame-sdk/react";
import { useChainConfig } from "@/context/chain";

export function MetagameProvider({ children }: { children: React.ReactNode }) {
  const { selectedChainConfig } = useChainConfig();

  return (
    <SdkMetagameProvider chainId={selectedChainConfig?.chainId ?? "SN_MAIN"}>
      {children as any}
    </SdkMetagameProvider>
  );
}
