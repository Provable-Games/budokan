import { Connector } from "@starknet-react/core";

export const supportedConnectorIds = {
  CONTROLLER: "controller",
  PREDEPLOYED: "katana-0",
  ARGENT: "argent",
  BRAAVOS: "braavos",
};

export const checkCartridgeConnector = (connector?: Connector) => {
  return connector?.id === "controller";
};

export const getConnectorIcon = (connector: Connector): string | null => {
  if (!connector) return null;
  if (typeof connector.icon === "string") return connector.icon;
  return connector.icon?.dark ?? null;
};
