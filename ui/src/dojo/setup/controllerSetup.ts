import { Connector } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { stringToFelt } from "@/lib/utils";
import { DojoManifest } from "../hooks/useDojoSystem";
import { SessionPolicies } from "@cartridge/presets";

const exclusions = ["dojo_init", "upgrade"];

const toTitleCase = (str: string): string => {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const _makeControllerPolicies = (manifest: DojoManifest): SessionPolicies => {
  const policies: SessionPolicies = { contracts: {} };
  // contracts
  manifest?.contracts?.forEach((contract: any) => {
    if (!policies.contracts) policies.contracts = {};
    policies.contracts[contract.address] = {
      methods: contract.systems
        .filter((system: string) => !exclusions.includes(system))
        .map((system: string) => ({
          name: toTitleCase(system), // You'll need to implement toTitleCase
          entrypoint: system,
          description: `${contract.tag}::${system}()`,
        })),
    };
  });

  return policies;
};

export const initializeController = (
  chainRpcUrls: { rpcUrl: string }[],
  defaultChainId: string,
  manifest: DojoManifest
): Connector => {
  const policies = _makeControllerPolicies(manifest);

  return new ControllerConnector({
    chains: chainRpcUrls,
    defaultChainId: stringToFelt(defaultChainId).toString(),
    preset: "budokan",
    slot: "pg-mainnet-10",
    tokens: {
      erc20: ["strk"],
    },
    policies,
  }) as never as Connector;
};
