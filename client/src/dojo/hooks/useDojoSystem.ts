import { useMemo } from "react";
import { useDojo } from "@/context/dojo";
import { getContractByName } from "@dojoengine/core";
import { Manifest } from "@dojoengine/core";

export type DojoManifest = Manifest & any;

export const useDojoSystem = (systemName: string) => {
  const { manifest, namespace } = useDojo();
  return useSystem(namespace, systemName, manifest);
};

const useSystem = (
  namespace: string,
  systemName: string,
  manifest: DojoManifest
) => {
  const { contractAddress, abi } = useMemo(() => {
    const contract = manifest
      ? getContractByName(manifest, namespace, systemName)
      : null;
    return {
      contractAddress: contract?.address ?? null,
      abi: contract?.abi ?? null,
    };
  }, [systemName, manifest]);
  return {
    contractAddress,
    abi,
  };
};
