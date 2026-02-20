import { useCallback, useMemo, useState, useEffect } from "react";
import { Connector, useAccount, useConnect } from "@starknet-react/core";
import { lookupAddresses } from "@cartridge/controller";
import { ControllerConnector } from "@cartridge/connector";
import { supportedConnectorIds } from "@/lib/connectors";

// sync from here:
// https://github.com/cartridge-gg/controller/blob/main/packages/account-wasm/src/constants.rs
export const CONTROLLER_CLASS_HASH =
  "0x05f0f2ae9301e0468ca3f9218dadd43a448a71acc66b6ef1a5570bb56cf10c6f";

export const useControllerMenu = () => {
  const { account } = useAccount();
  const controllerConnector = useConnectedController();
  const openMenu = async () => {
    if (account) {
      await controllerConnector?.controller.openSettings();
    }
  };
  return {
    openMenu,
  };
};

export const useControllerProfile = () => {
  const { account } = useAccount();
  const controllerConnector = useConnectedController();
  const openProfile = async () => {
    if (account) {
      await controllerConnector?.controller.openProfile();
    }
  };
  return {
    openProfile,
  };
};

export const useConnectedController = () => {
  const { connector } = useConnect();

  const controllerConnector = useMemo(
    () =>
      connector?.id == supportedConnectorIds.CONTROLLER
        ? (connector as unknown as ControllerConnector)
        : undefined,
    [connector]
  );
  return controllerConnector;
};

export const useConnectController = () => {
  const { connect, connectors } = useConnect();

  const controllerConnector = useMemo(
    () =>
      connectors.find(
        (c) => c.id === supportedConnectorIds.CONTROLLER
      ) as unknown as ControllerConnector | undefined,
    [connectors]
  );

  const connectController = () => {
    connect({ connector: controllerConnector });
  };

  return {
    connectController,
  };
};

export const useControllerUsername = () => {
  const { address } = useAccount();
  const [username, setUsername] = useState<string | undefined>(undefined);
  const controllerConnector = useConnectedController();

  const getUsername = useCallback(async () => {
    if (!controllerConnector?.controller) return;
    try {
      const username = await controllerConnector.username();
      setUsername(username || "");
    } catch (error) {
      console.error("Failed to fetch username:", error);
      setUsername(undefined);
    }
  }, [controllerConnector, address]);

  useEffect(() => {
    getUsername();
  }, [getUsername, address]);

  return {
    username,
  };
};

export const useGetUsernames = (addresses: string[]) => {
  const [usernames, setUsernames] = useState<Map<string, string> | undefined>(
    undefined
  );

  const addressesKey = useMemo(() => {
    return addresses.join(",");
  }, [addresses]);

  const fetchUsernames = async () => {
    if (addresses.length === 0) return;
    const addressMap = await lookupAddresses(addresses);
    setUsernames(addressMap);
  };

  useEffect(() => {
    fetchUsernames();
  }, [addressesKey]);

  return {
    usernames,
    refetch: fetchUsernames,
  };
};

export const isControllerAccount = (connector: Connector) => {
  return connector?.id == supportedConnectorIds.CONTROLLER;
};
