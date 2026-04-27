import { displayAddress, indexAddress } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { USER, VERIFIED, QUESTION } from "@/components/Icons";
import { Ban, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWatchLink, getReplayLink, getObjectImage } from "@/assets/games";
import { useTokenUri } from "@provable-games/denshokan-sdk/react";
import { useMemo } from "react";

const TokenUriImage = ({ tokenId, gameAddress }: { tokenId: string; gameAddress?: string }) => {
  const { data: tokenUri, isLoading } = useTokenUri(tokenId);

  const parsedImage = useMemo(() => {
    if (!tokenUri) return "";
    try {
      const match = tokenUri.match(/^data:application\/json;base64,(.+)$/);
      const json = match ? atob(match[1]) : tokenUri;
      return JSON.parse(json)?.image ?? "";
    } catch {
      return "";
    }
  }, [tokenUri]);

  if (isLoading) {
    return <span className="text-center text-neutral px-4">Loading...</span>;
  }

  if (!parsedImage) {
    return <span className="text-center text-neutral">No Token URI</span>;
  }

  const useObject = gameAddress ? getObjectImage(gameAddress) : false;

  return (
    <div className="w-full px-4">
      {useObject ? (
        <object
          data={parsedImage}
          type="image/svg+xml"
          className="w-full h-auto"
        >
          <img src={parsedImage} alt="metadata" className="w-full h-auto" />
        </object>
      ) : (
        <img src={parsedImage} alt="metadata" className="w-full h-auto" />
      )}
    </div>
  );
};

export const PlayerDetails = ({
  username,
  isStarted,
  isEnded,
  hasSubmitted,
  isBanned,
  gameAddress,
  tokenId,
}: {
  username: string;
  isStarted?: boolean;
  isEnded: boolean;
  hasSubmitted: boolean;
  isBanned?: boolean;
  gameAddress?: string;
  tokenId?: string;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-4">
        <div className="flex flex-row items-center gap-2">
          <span className="w-5 h-5 flex-shrink-0 text-brand-muted">
            <USER />
          </span>
          <span className="truncate">{username}</span>
        </div>
        {isBanned && (
          <div className="flex flex-row gap-2 items-center">
            <Ban className="w-4 h-4 text-destructive" />
            <span className="text-destructive font-medium">
              This entry has been banned
            </span>
          </div>
        )}
      </div>
      <div className="w-full h-0.5 bg-brand/50" />
      {tokenId ? (
        <TokenUriImage tokenId={tokenId} gameAddress={gameAddress} />
      ) : (
        <span className="text-center text-neutral">No Token URI</span>
      )}
      {isEnded && (
        <div className="flex items-center gap-2 justify-center">
          <span className="text-brand w-6 h-6">
            {hasSubmitted ? <VERIFIED /> : <QUESTION />}
          </span>
          <span>{hasSubmitted ? "Submitted" : "Not submitted"}</span>
        </div>
      )}
      {isStarted && gameAddress && tokenId && (
        <>
          {isEnded || hasSubmitted ? (
            // Game is over, show replay link if available
            (() => {
              const replayLink = getReplayLink(gameAddress);
              return replayLink ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mx-4"
                  onClick={() => {
                    const hexId = tokenId!.startsWith("0x") ? tokenId : "0x" + BigInt(tokenId!).toString(16);
                    window.open(`${replayLink}${hexId}`, "_blank");
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Watch Replay
                </Button>
              ) : null;
            })()
          ) : (
            // Game is still live, show watch link if available
            (() => {
              const watchLink = getWatchLink(gameAddress);
              return watchLink ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mx-4"
                  onClick={() => {
                    const hexId = tokenId!.startsWith("0x") ? tokenId : "0x" + BigInt(tokenId!).toString(16);
                    window.open(`${watchLink}${hexId}`, "_blank");
                  }}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Watch Live
                </Button>
              ) : null;
            })()
          )}
        </>
      )}
    </div>
  );
};

export const MobilePlayerCard = ({
  open,
  onOpenChange,
  selectedPlayer,
  usernames,
  ownerAddress,
  isStarted,
  isEnded,
  gameAddress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlayer: any;
  usernames: Map<string, string> | undefined;
  ownerAddress: string;
  isStarted?: boolean;
  isEnded: boolean;
  gameAddress?: string;
}) => {
  const username =
    usernames?.get(indexAddress(ownerAddress ?? "0x0")) ||
    displayAddress(ownerAddress ?? "0x0");
  const isBanned = !!selectedPlayer?.registration?.isBanned;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-brand text-lg text-brand">Player Details</h3>
        </div>

        {selectedPlayer && (
          <PlayerDetails
            username={username}
            isStarted={isStarted}
            isEnded={isEnded}
            hasSubmitted={selectedPlayer.game?.hasSubmitted}
            isBanned={isBanned}
            gameAddress={gameAddress}
            tokenId={selectedPlayer.game?.tokenId?.toString()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
