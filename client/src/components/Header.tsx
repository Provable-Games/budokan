import { useAccount, useDisconnect, useConnect } from "@starknet-react/core";
import { Button } from "@/components/ui/button";
import {
  CONTROLLER,
  LOGOUT,
  PLAY,
  SPACE_INVADER_SOLID,
  TROPHY_LINE,
  STARKNET,
  DISCORD,
} from "@/components/Icons";
import { displayAddress } from "@/lib/utils";
import {
  useControllerUsername,
  isControllerAccount,
} from "@/hooks/useController";
import { useNavigate, useLocation } from "react-router-dom";
import { getConnectorIcon } from "@/lib/connectors";
import { useChainConfig } from "@/context/chain";
import { ChainId, NetworkId } from "@/chain/setup/networks";
import { useSwitchNetwork } from "@/chain/hooks/useChain";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import useUIStore from "@/hooks/useUIStore";
import { GameButton } from "@/components/overview/gameFilters/GameButton";
import { useState, useEffect, useCallback } from "react";
import WalletsDialog from "@/components/dialogs/Wallets";
import TermsOfServiceModal from "@/components/dialogs/TermsOfService";
import GeoBlockedDialog from "@/components/dialogs/GeoBlocked";
import { useGeoBlock } from "@/hooks/useGeoBlock";
import logoImage from "@/assets/images/logo.svg";

const TOS_KEY_PREFIX = "budokan_tos_";
const TOS_VERSION = "1.0";

const hasAcceptedCurrentTerms = (address: string): boolean => {
  const value = localStorage.getItem(`${TOS_KEY_PREFIX}${address}`);
  return value === TOS_VERSION;
};

const saveTermsAcceptance = (address: string): void => {
  localStorage.setItem(`${TOS_KEY_PREFIX}${address}`, TOS_VERSION);
};

const Header = () => {
  const { account } = useAccount();
  const { connector } = useConnect();
  const { gameFilters, setGameFilters, gameData } = useUIStore();
  const { disconnect } = useDisconnect();
  const { username } = useControllerUsername();
  const { switchToMainnet, switchToSepolia } = useSwitchNetwork();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedChainConfig } = useChainConfig();
  const isMainnet = selectedChainConfig.chainId === ChainId.SN_MAIN;
  const isSepolia = selectedChainConfig.chainId === ChainId.SN_SEPOLIA;
  const isHomeScreen = location.pathname === "/";
  const isController = connector ? isControllerAccount(connector) : false;
  const walletIcon =
    connector && !isController ? getConnectorIcon(connector) : null;

  const [showWallets, setShowWallets] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showGeoBlock, setShowGeoBlock] = useState(false);
  const { isBlocked: isGeoBlocked } = useGeoBlock();

  // Show ToS modal when a wallet connects for the first time
  useEffect(() => {
    if (account?.address) {
      if (!hasAcceptedCurrentTerms(account.address)) {
        setShowTermsOfService(true);
      }
    } else {
      setShowTermsOfService(false);
    }
  }, [account?.address]);

  const acceptTerms = useCallback(() => {
    if (account?.address) {
      saveTermsAcceptance(account.address);
    }
    setShowTermsOfService(false);
  }, [account?.address]);

  const declineTerms = useCallback(() => {
    setShowTermsOfService(false);
    disconnect();
  }, [disconnect]);

  return (
    <header className="glass-pane flex-shrink-0 sticky top-0 z-30">
      <WalletsDialog open={showWallets} onOpenChange={setShowWallets} />
      <TermsOfServiceModal
        open={showTermsOfService}
        onAccept={acceptTerms}
        onDecline={declineTerms}
      />
      <GeoBlockedDialog open={showGeoBlock} onOpenChange={setShowGeoBlock} />

      <div className="flex flex-row items-center justify-between gap-3 px-4 sm:px-8 xl:px-10 h-[56px] sm:h-[68px]">
        {/* Left cluster: hamburger (mobile) + logo */}
        <div className="flex flex-row items-center gap-3 min-w-0">
          {isHomeScreen && (
            <div className="sm:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="p-0 flex items-center justify-center"
                  >
                    <span className="flex items-center justify-center w-full h-full">
                      <SPACE_INVADER_SOLID />
                    </span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[250px] sm:w-[300px]">
                  <div className="flex flex-col gap-4 py-4">
                    <div
                      className="text-3xl font-brand hover:cursor-pointer hover:text-brand-muted transition-colors duration-200"
                      onClick={() => navigate("/")}
                    >
                      Games
                    </div>

                    {gameData.map((game) => {
                      const isDisabled = !game.existsInMetadata;

                      const buttonElement = (
                        <GameButton
                          game={game}
                          gameFilters={gameFilters}
                          setGameFilters={setGameFilters}
                        />
                      );

                      return isDisabled ? (
                        <div key={game.contract_address}>{buttonElement}</div>
                      ) : (
                        <SheetClose asChild key={game.contract_address}>
                          {buttonElement}
                        </SheetClose>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}

          <div
            className="font-brand hover:cursor-pointer hover:text-brand-muted transition-colors duration-200 h-full flex items-center"
            onClick={() => {
              navigate("/");
            }}
          >
            <img
              className="h-7 max-w-28 sm:max-w-none sm:h-9 xl:h-10 hover:opacity-80 transition-opacity duration-200 object-contain"
              src={logoImage}
              alt="logo"
            />
          </div>
        </div>

        {/* Right cluster: chips + actions */}
        <div className="flex flex-row items-center gap-2">
          <div className="hidden sm:flex sm:flex-row sm:items-center sm:gap-2">
            <button
              onClick={() => {
                window.open("https://discord.gg/lootsurvivor", "_blank");
              }}
              aria-label="Open support Discord"
              className="inline-flex items-center gap-2 h-9 rounded-md border border-brand/20 bg-brand/5 px-3 text-xs font-semibold uppercase tracking-wider text-brand hover:bg-brand/10 hover:border-brand/40 transition-colors [&_svg]:w-4 [&_svg]:h-4"
            >
              <DISCORD />
              <span>Support</span>
            </button>

            {account && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Switch network"
                    className="inline-flex items-center gap-2 h-9 rounded-md border border-brand/20 bg-brand/5 px-3 text-xs font-semibold uppercase tracking-wider text-brand hover:bg-brand/10 hover:border-brand/40 transition-colors [&_svg]:w-4 [&_svg]:h-4"
                  >
                    <STARKNET />
                    <span>{NetworkId[selectedChainConfig.chainId as ChainId]}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-black border-2 border-brand-muted">
                  <DropdownMenuItem
                    key="mainnet"
                    active={selectedChainConfig.chainId === ChainId.SN_MAIN}
                    onClick={() => switchToMainnet()}
                  >
                    <span className="[&_svg]:w-8 [&_svg]:h-8">
                      <STARKNET />
                    </span>
                    {NetworkId[ChainId.SN_MAIN]}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    key="sepolia"
                    active={selectedChainConfig.chainId === ChainId.SN_SEPOLIA}
                    onClick={() => switchToSepolia()}
                  >
                    <span className="[&_svg]:w-8 [&_svg]:h-8">
                      <STARKNET />
                    </span>
                    {NetworkId[ChainId.SN_SEPOLIA]}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {!isMainnet && !isSepolia && location.pathname !== "/play" && (
              <Button
                size="sm"
                onClick={() => {
                  navigate("/play");
                }}
              >
                <span className="flex flex-row items-center gap-2">
                  <PLAY />
                  Play
                </span>
              </Button>
            )}

            {location.pathname !== "/create-tournament" && (
              <Button
                size="sm"
                onClick={() => {
                  if (isGeoBlocked) {
                    setShowGeoBlock(true);
                  } else {
                    navigate("/create-tournament");
                  }
                }}
              >
                <span className="flex flex-row items-center gap-2">
                  <TROPHY_LINE />
                  <span className="hidden md:inline">Create Tournament</span>
                  <span className="md:hidden">Create</span>
                </span>
              </Button>
            )}
          </div>

          {/* Connect button - visible on all screen sizes */}
          <Button
            size="sm"
            onClick={() => {
              if (!account) {
                setShowWallets(true);
              } else {
                navigate(`/profile/${account.address}`);
              }
            }}
            className="px-2"
          >
            <span className="flex flex-row items-center gap-2">
              <span className="flex flex-row items-center gap-2">
                {account &&
                  (walletIcon ? (
                    <img src={walletIcon} alt="wallet" className="w-4 h-4" />
                  ) : (
                    <CONTROLLER />
                  ))}
                <span>
                  {account ? (
                    username ? (
                      <span className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[100px]">
                        {username}
                      </span>
                    ) : (
                      displayAddress(account.address)
                    )
                  ) : (
                    "Connect"
                  )}
                </span>
              </span>
              {account && (
                <span
                  className="hidden sm:block hover:bg-brand-muted p-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    disconnect();
                  }}
                >
                  <LOGOUT />
                </span>
              )}
            </span>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
