import { Card } from "@/components/ui/card";
import { CairoCustomEnum } from "starknet";
import { Tournament } from "@/generated/models.gen";
import { displayAddress, feltToString } from "@/lib/utils";
import { useDojo } from "@/context/dojo";
import {
  COIN,
  TROPHY,
  CLOCK,
  LOCK,
  COUNTER,
  USER,
  EXTERNAL_LINK,
  INFO,
} from "@/components/Icons";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tournament as TournamentModel } from "@/generated/models.gen";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getTokenByAddress } from "@/lib/tokenUtils";

// Helper component for Entry Limit display with info tooltip
const EntryLimitInfo = ({ limit }: { limit: number }) => (
  <div className="flex flex-row items-center gap-2">
    <span>Entry Limit:</span>
    <span>{limit}</span>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-4 h-4 text-brand-muted hover:text-brand cursor-help">
            <INFO />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>
            Maximum number of times each eligible address can register for this tournament.
            Set to limit multiple entries per participant.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

const EntryRequirements = ({
  tournamentModel,
  tournamentsData,
}: {
  tournamentModel: TournamentModel;
  tournamentsData: Tournament[];
}) => {
  if (!tournamentModel?.entry_requirement?.isSome()) {
    return null;
  }
  const { selectedChainConfig } = useDojo();

  const navigate = useNavigate();

  const entryRequirement = useMemo(
    () => tournamentModel.entry_requirement.Some,
    [tournamentModel]
  );
  const entryLimit = entryRequirement?.entry_limit;
  const hasEntryLimit = Number(entryLimit) > 0;
  const activeVariant = useMemo(
    () => entryRequirement?.entry_requirement_type.activeVariant(),
    [entryRequirement]
  );

  const tokenAddress = useMemo(
    () => entryRequirement?.entry_requirement_type?.variant.token,
    [entryRequirement]
  );

  // Get token data from static tokens
  const token = useMemo(() => {
    if (activeVariant !== "token" || !tokenAddress) return undefined;
    return getTokenByAddress(tokenAddress, selectedChainConfig?.chainId ?? "");
  }, [tokenAddress, activeVariant, selectedChainConfig]);

  const tokenLoading = false; // No loading needed for static data

  const tournament = useMemo(
    () =>
      entryRequirement?.entry_requirement_type?.variant?.tournament as
        | CairoCustomEnum
        | undefined,
    [entryRequirement]
  );

  const tournamentVariant = useMemo(
    () => tournament?.activeVariant(),
    [tournament]
  );

  const allowlist = useMemo(
    () => entryRequirement?.entry_requirement_type?.variant?.allowlist,
    [entryRequirement]
  );

  const extensionConfig = useMemo(
    () => entryRequirement?.entry_requirement_type?.variant?.extension,
    [entryRequirement]
  );

  const blockExplorerExists =
    selectedChainConfig.blockExplorerUrl !== undefined;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [allowlistDialogOpen, setAllowlistDialogOpen] = useState(false);

  const renderContent = () => {
    if (activeVariant === "token") {
      return (
        <div className="text-brand flex flex-row items-center gap-1 w-full">
          <span className="w-8">
            <COIN />
          </span>
          {tokenLoading ? (
            <Skeleton className="hidden sm:block h-4 w-20" />
          ) : (
            <span className="hidden sm:block text-xs">{token?.name}</span>
          )}
        </div>
      );
    } else if (activeVariant === "tournament") {
      return (
        <div className="flex flex-row items-center gap-1">
          <span className="w-6">
            <TROPHY />
          </span>
          <span className="hidden sm:block capitalize">
            {tournamentVariant}
          </span>
        </div>
      );
    } else if (activeVariant === "extension") {
      return (
        <div className="flex flex-row items-center gap-1 w-full">
          <span className="w-6">
            <EXTERNAL_LINK />
          </span>
          <span className="hidden sm:block">Extension</span>
        </div>
      );
    } else {
      return (
        <div className="flex flex-row items-center gap-1 w-full">
          <span className="w-6">
            <USER />
          </span>
          <span className="hidden sm:block">Allowlist</span>
        </div>
      );
    }
  };

  const renderHoverContent = () => {
    if (activeVariant === "token") {
      return (
        <>
          <p className="text-muted-foreground">
            To enter this tournament you must hold:
          </p>
          <div className="flex items-center gap-2">
            <span className="w-8">
              <COIN />
            </span>
            {tokenLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <>
                <span>{token?.name}</span>
                <span
                  className="text-brand-muted hover:cursor-pointer"
                  onClick={() => {
                    if (blockExplorerExists) {
                      window.open(
                        `${selectedChainConfig.blockExplorerUrl}/nft-contract/${token?.token_address}`,
                        "_blank"
                      );
                    }
                  }}
                >
                  {displayAddress(token?.token_address ?? "0x0")}
                </span>
              </>
            )}
          </div>
          {!!hasEntryLimit && <EntryLimitInfo limit={Number(entryLimit)} />}
        </>
      );
    } else if (activeVariant === "tournament") {
      return (
        <>
          <p className="text-muted-foreground">
            {`To enter you must have ${
              tournamentVariant === "participants" ? "participated in" : "won"
            }:`}
          </p>
          <div className="h-[100px] flex flex-col gap-2 overflow-y-auto">
            {tournamentsData?.map((tournament, index) => {
              const tournamentEnd = tournament.schedule.game.end;
              const tournamentEnded =
                BigInt(tournamentEnd) < BigInt(Date.now()) / 1000n;
              return (
                <div key={index} className="flex flex-row items-center gap-2">
                  <span>{feltToString(tournament.metadata.name)}</span>|
                  <div className="flex flex-row items-center gap-1">
                    <span className="w-4">
                      <CLOCK />
                    </span>
                    <span>{tournamentEnded ? "Ended" : "Active"}</span>
                  </div>
                  |
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      navigate(`/tournament/${Number(tournament.id)}`);
                    }}
                  >
                    View
                  </Button>
                </div>
              );
            })}
          </div>
          {!!hasEntryLimit && <EntryLimitInfo limit={Number(entryLimit)} />}
        </>
      );
    } else if (activeVariant === "extension") {
      return (
        <>
          <p className="text-muted-foreground">
            Entry validated by custom contract:
          </p>
          <div className="flex items-center gap-2">
            <span className="w-6">
              <EXTERNAL_LINK />
            </span>
            <span
              className="text-brand-muted hover:cursor-pointer font-mono text-xs"
              onClick={() => {
                if (blockExplorerExists) {
                  window.open(
                    `${selectedChainConfig.blockExplorerUrl}/contract/${extensionConfig?.address}`,
                    "_blank"
                  );
                }
              }}
            >
              {displayAddress(extensionConfig?.address ?? "0x0")}
            </span>
          </div>
          {extensionConfig?.config && extensionConfig.config.length > 0 && (
            <div className="flex flex-row items-center gap-2">
              <span>Config:</span>
              <span className="font-mono text-xs">
                {extensionConfig.config.join(", ")}
              </span>
            </div>
          )}
          {!!hasEntryLimit && <EntryLimitInfo limit={Number(entryLimit)} />}
        </>
      );
    } else {
      return (
        <>
          <p className="text-muted-foreground">
            {`To enter you must be whitelisted:`}
          </p>
          <Button
            className="w-fit"
            variant="outline"
            onClick={() => {
              setAllowlistDialogOpen(true);
            }}
          >
            <span>See Allowlist</span>
          </Button>
          {!!hasEntryLimit && <EntryLimitInfo limit={Number(entryLimit)} />}
        </>
      );
    }
  };

  const TriggerCard = ({ onClick = () => {} }) => (
    <Card
      variant="outline"
      className="relative flex flex-row items-center justify-between sm:w-36 h-full p-1 px-2 hover:cursor-pointer"
      onClick={onClick}
    >
      <span className="hidden sm:block absolute left-0 -top-5 text-xs whitespace-nowrap uppercase text-brand-muted font-bold">
        Entry Requirements:
      </span>
      <span className="absolute -top-2 -right-1 flex items-center justify-center text-brand-subtle h-6 w-6 2xl:h-7 2xl:w-7 text-xs">
        <COUNTER />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center justify-center text-brand w-4 h-4 2xl:w-5 2xl:h-5">
            <LOCK />
          </span>
        </span>
      </span>
      {renderContent()}
    </Card>
  );

  const ContentSection = () => (
    <div className="flex flex-col gap-2 h-full">{renderHoverContent()}</div>
  );

  return (
    <>
      {/* Mobile: Dialog (visible below sm breakpoint) */}
      <div className="sm:hidden">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <div>
              <TriggerCard />
            </div>
          </DialogTrigger>
          <DialogContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Entry Requirements</h3>
            <ContentSection />
          </DialogContent>
        </Dialog>
      </div>

      {/* Desktop: HoverCard (visible at sm breakpoint and above) */}
      <div className="hidden sm:block">
        <HoverCard openDelay={50} closeDelay={0}>
          <HoverCardTrigger asChild>
            <div>
              <TriggerCard />
            </div>
          </HoverCardTrigger>
          <HoverCardContent
            className="w-80 max-h-[150px] p-4 text-sm z-50 overflow-hidden"
            align="start"
            side="bottom"
            sideOffset={5}
          >
            <ContentSection />
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Allowlist Dialog */}
      <Dialog open={allowlistDialogOpen} onOpenChange={setAllowlistDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Tournament Allowlist</DialogTitle>
            <DialogDescription>
              Only addresses on this list can participate in the tournament.
            </DialogDescription>
          </DialogHeader>

          <div className="h-[300px] mt-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3">
            {allowlist && allowlist.length > 0 ? (
              <div className="space-y-2">
                {allowlist.map((address: string, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border border-brand-muted rounded"
                  >
                    <span className="w-6">
                      <USER />
                    </span>
                    <span className="font-mono text-xs">
                      {displayAddress(address)}
                    </span>
                    {blockExplorerExists && (
                      <a
                        href={`${selectedChainConfig.blockExplorerUrl}/contract/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-6"
                      >
                        <EXTERNAL_LINK />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No addresses in allowlist
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <div className="flex justify-between w-full">
              <span className="text-muted-foreground">
                {allowlist ? `${allowlist.length} addresses` : "0 addresses"}
              </span>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EntryRequirements;
