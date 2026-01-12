import { displayAddress } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VERIFIED, QUESTION } from "@/components/Icons";
import { Ban } from "lucide-react";

export const PlayerDetails = ({
  playerName,
  username,
  metadata,
  isEnded,
  hasSubmitted,
  isBanned,
}: {
  playerName: string;
  username: string;
  metadata: string;
  isEnded: boolean;
  hasSubmitted: boolean;
  isBanned?: boolean;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-4">
        <div className="flex flex-row gap-2">
          <span className="text-brand-muted">Player Name:</span>
          <span className="truncate">{playerName}</span>
        </div>
        <div className="flex flex-row gap-2">
          <span className="text-brand-muted">Owner:</span>
          <span>{username}</span>
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
      {metadata !== "" && metadata !== undefined ? (
        <img
          src={JSON.parse(metadata)?.image}
          alt="metadata"
          className="w-full h-auto px-4"
        />
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
    </div>
  );
};

export const MobilePlayerCard = ({
  open,
  onOpenChange,
  selectedPlayer,
  usernames,
  ownerAddress,
  isEnded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlayer: any;
  usernames: Map<string, string> | undefined;
  ownerAddress: string;
  isEnded: boolean;
}) => {
  const username =
    usernames?.get(ownerAddress ?? "0x0") ||
    displayAddress(ownerAddress ?? "0x0");
  const isBanned = selectedPlayer?.registration?.is_banned === 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-brand text-lg text-brand">Player Details</h3>
        </div>

        {selectedPlayer && (
          <PlayerDetails
            playerName={selectedPlayer.game?.player_name}
            username={username}
            metadata={selectedPlayer.game?.metadata}
            isEnded={isEnded}
            hasSubmitted={selectedPlayer.game?.has_submitted}
            isBanned={isBanned}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
