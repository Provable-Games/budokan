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
  useControllerProfile,
  isControllerAccount,
} from "@/hooks/useController";
import { useNavigate, useLocation } from "react-router-dom";
import { getConnectorIcon } from "@/lib/connectors";
import { useDojo } from "@/context/dojo";
import { ChainId, NetworkId } from "@/dojo/setup/networks";
import { useSwitchNetwork } from "@/dojo/hooks/useChain";
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
  const { openProfile } = useControllerProfile();
  const { username } = useControllerUsername();
  const { switchToMainnet, switchToSepolia } = useSwitchNetwork();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedChainConfig } = useDojo();
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
    <div className="flex flex-col">
      <WalletsDialog open={showWallets} onOpenChange={setShowWallets} />
      <TermsOfServiceModal
        open={showTermsOfService}
        onAccept={acceptTerms}
        onDecline={declineTerms}
      />
      <GeoBlockedDialog open={showGeoBlock} onOpenChange={setShowGeoBlock} />

      <div className="flex flex-row items-center justify-between px-5 sm:py-5 sm:px-10 h-[60px] sm:h-[80px]">
        {/* Hamburger menu for small screens */}
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

                    // Create the button element
                    const buttonElement = (
                      <GameButton
                        game={game}
                        gameFilters={gameFilters}
                        setGameFilters={setGameFilters}
                      />
                    );

                    // Only wrap with SheetClose if the button is not disabled
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
            className="h-8 max-w-32 sm:max-w-none sm:h-10 xl:h-12 hover:opacity-80 transition-opacity duration-200 object-contain"
            src={logoImage}
            alt="logo"
          />
        </div>

        <div className="flex flex-row items-center gap-2">
          {/* Navigation buttons - only visible on larger screens */}
          <div className="hidden sm:flex sm:flex-row sm:items-center sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                window.open("https://discord.gg/lootsurvivor", "_blank");
              }}
            >
              <span className="flex flex-row items-center gap-2">
                <DISCORD />
                Support
              </span>
            </Button>
            {account && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline">
                    <STARKNET />
                    {NetworkId[selectedChainConfig.chainId as ChainId]}
                  </Button>
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
              // && isAdmin
              <Button
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
                  Create Tournament
                </span>
              </Button>
            )}
          </div>

          {/* Connect button - visible on all screen sizes */}
          <Button
            onClick={() => {
              if (!account) {
                setShowWallets(true);
              }
            }}
            className="px-2"
          >
            <span className="flex flex-row items-center gap-2">
              <span
                className="flex flex-row items-center gap-2"
                onClick={() => {
                  if (account) {
                    openProfile();
                  }
                }}
              >
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
                  onClick={() => {
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
    </div>
  );
};

export default Header;
