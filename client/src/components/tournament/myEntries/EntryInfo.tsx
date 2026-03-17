import { HoverCardContent } from "@/components/ui/hover-card";
import type { Tournament } from "@provable-games/budokan-sdk";
import { useMemo } from "react";

interface EntryInfoProps {
  entryNumber: string;
  tokenMetadata: string;
  tournamentModel: Tournament;
}

const EntryInfo = ({
  entryNumber,
  tokenMetadata,
  tournamentModel,
}: EntryInfoProps) => {
  const settings =
    (tournamentModel as any)?.gameConfig?.settingsId === 0 ? "Default" : "Custom";
  const parsedImage = useMemo(
    () => (tokenMetadata ? JSON.parse(tokenMetadata)?.image : ""),
    [tokenMetadata]
  );
  return (
    <HoverCardContent
      className="w-80 py-4 px-0 text-sm z-50"
      align="start"
      side="top"
      sideOffset={5}
      alignOffset={-80}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 px-4">
          <h4 className="font-medium">Entry #{entryNumber}</h4>
          <div className="flex flex-row gap-2">
            <p>Game Settings</p>
            <span className="text-brand-muted">{settings}</span>
          </div>
        </div>
        <div className="w-full h-0.5 bg-brand/50" />
        {tokenMetadata !== "" ? (
          <img
            src={parsedImage}
            alt="metadata"
            className="w-full h-auto px-4"
          />
        ) : (
          <span className="text-center text-neutral">No Token URI</span>
        )}
      </div>
    </HoverCardContent>
  );
};

export default EntryInfo;
