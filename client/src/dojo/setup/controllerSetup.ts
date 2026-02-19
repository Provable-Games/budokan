import { Connector } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { stringToFelt } from "@/lib/utils";

export const initializeController = (
  chainRpcUrls: { rpcUrl: string }[],
  defaultChainId: string
): Connector => {
  return new ControllerConnector({
    chains: chainRpcUrls,
    defaultChainId: stringToFelt(defaultChainId).toString(),
    preset: "budokan",
    slot: "pg-mainnet-10",
    tokens: {
      erc20: ["strk"],
    },
  }) as never as Connector;
};
