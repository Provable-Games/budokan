import { useCallback, useEffect, useState } from "react";
import {
  Connector,
  useAccount,
  useConnect,
  useSwitchChain,
} from "@starknet-react/core";
import { useDojo } from "@/context/dojo";
import { ChainId } from "@/dojo/setup/networks";
import { stringToFelt } from "@/lib/utils";

export const useConnectToSelectedChain = (onConnect?: () => void) => {
  const { connect, connectors } = useConnect();
  const { isConnected, isConnecting } = useAccount();
  const { selectedChainConfig } = useDojo();

  const [requestedConnect, setRequestedConnect] = useState(false);
  useEffect(() => {
    if (requestedConnect && isConnected) {
      onConnect?.();
    }
  }, [requestedConnect, isConnected]);

  let _connect = useCallback(() => {
    if (isConnected) {
      onConnect?.();
    } else if (!isConnecting) {
      // get 1st supported connector on this chain
      const connector = selectedChainConfig?.connectorIds?.reduce(
        (acc: Connector | undefined, id: string) => {
          return acc ?? connectors.find((connector) => connector.id == id);
        },
        undefined as Connector | undefined
      );
      if (connector) {
        console.log(`>> Connecting with [${connector.id}]...`);
        setRequestedConnect(true);
        connect({ connector });
      } else {
        setRequestedConnect(false);
        console.warn(`NO CONNECTOR!`);
      }
    }
  }, [connectors, isConnected, isConnecting]);

  return {
    connect: _connect,
    isConnected,
    isConnecting,
  };
};

export const useSwitchNetwork = () => {
  const { switchChainAsync } = useSwitchChain({
    params: {
      chainId: ChainId.SN_MAIN,
    },
  });

  const switchToMainnet = async () => {
    await switchChainAsync({
      chainId: stringToFelt(ChainId.SN_MAIN).toString(),
    });
  };

  const switchToSepolia = async () => {
    await switchChainAsync({
      chainId: stringToFelt(ChainId.SN_SEPOLIA).toString(),
    });
  };

  return {
    switchToMainnet,
    switchToSepolia,
  };
};
