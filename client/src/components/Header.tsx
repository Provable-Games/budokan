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
  const { openProfile } = useControllerProfile();
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
    <div className="flex flex-col">
      <WalletsDialog open={showWallets} onOpenChange={setShowWallets} />
      <TermsOfServiceModal
        open={showTermsOfService}
        onAccept={acceptTerms}
        onDecline={declineTerms}
      />
      <GeoBlockedDialog open={showGeoBlock} onOpenChange={setShowGeoBlock} />

      <nav className="glass-surface flex flex-row items-center justify-between px-5 sm:py-4 sm:px-8 h-[56px] sm:h-[72px] border-b border-brand/6 z-40">
        {/* Hamburger menu for small screens */}
        {isHomeScreen && (
          <div className="sm:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
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
                    className="text-2xl font-brand tracking-tight hover:cursor-pointer hover:text-brand-muted transition-colors duration-200"
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
          className="font-brand hover:cursor-pointer transition-opacity duration-200 h-full flex items-center"
          onClick={() => {
            navigate("/");
          }}
        >
          <img
            className="h-7 max-w-28 sm:max-w-none sm:h-9 xl:h-10 hover:opacity-75 transition-opacity duration-200 object-contain"
            src={logoImage}
            alt="Budokan"
          />
        </div>

        <div className="flex flex-row items-center gap-2">
          {/* Navigation buttons - only visible on larger screens */}
          <div className="hidden sm:flex sm:flex-row sm:items-center sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                window.open("https://discord.gg/lootsurvivor", "_blank");
              }}
            >
              <span className="flex flex-row items-center gap-2">
                <DISCORD />
                <span className="hidden lg:inline">Support</span>
              </span>
            </Button>
            {account && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" size="sm">
                    <STARKNET />
                    <span className="hidden lg:inline">{NetworkId[selectedChainConfig.chainId as ChainId]}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="glass-surface-elevated border-brand/10">
                  <DropdownMenuItem
                    key="mainnet"
                    active={selectedChainConfig.chainId === ChainId.SN_MAIN}
                    onClick={() => switchToMainnet()}
                  >
                    <span className="[&_svg]:w-6 [&_svg]:h-6">
                      <STARKNET />
                    </span>
                    {NetworkId[ChainId.SN_MAIN]}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    key="sepolia"
                    active={selectedChainConfig.chainId === ChainId.SN_SEPOLIA}
                    onClick={() => switchToSepolia()}
                  >
                    <span className="[&_svg]:w-6 [&_svg]:h-6">
                      <STARKNET />
                    </span>
                    {NetworkId[ChainId.SN_SEPOLIA]}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isMainnet && !isSepolia && location.pathname !== "/play" && (
              <Button
                variant="outline"
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
                  <span className="hidden lg:inline">Create Tournament</span>
                  <span className="lg:hidden">Create</span>
                </span>
              </Button>
            )}
          </div>

          {/* Connect button - visible on all screen sizes */}
          <Button
            variant={account ? "outline" : "default"}
            onClick={() => {
              if (!account) {
                setShowWallets(true);
              }
            }}
            className="px-3"
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
                    <img src={walletIcon} alt="wallet" className="w-4 h-4 rounded-sm" />
                  ) : (
                    <CONTROLLER />
                  ))}
                <span className="text-sm">
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
                  className="hidden sm:flex items-center p-1 rounded hover:bg-brand/10 transition-colors"
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
      </nav>
    </div>
  );
};

export default Header;
