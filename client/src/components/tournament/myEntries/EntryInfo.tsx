import { HoverCardContent } from "@/components/ui/hover-card";
import type { Tournament } from "@provable-games/budokan-sdk";
import { useMemo } from "react";
import { useTokenUri } from "@provable-games/denshokan-sdk/react";
import { getObjectImage } from "@/assets/games";

interface EntryInfoProps {
  entryNumber: string;
  tokenId: string;
  tournamentModel: Tournament;
}

const EntryInfo = ({
  entryNumber,
  tokenId,
  tournamentModel,
}: EntryInfoProps) => {
  const settings =
    (tournamentModel as any)?.gameConfig?.settingsId === 0
      ? "Default"
      : "Custom";

  // Fetch token URI on demand (only when this HoverCard content mounts)
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
        {isLoading ? (
          <span className="text-center text-neutral">Loading...</span>
        ) : parsedImage ? (
          <div className="w-full px-4">
            {getObjectImage(tournamentModel?.gameAddress ?? "") ? (
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
        ) : (
          <span className="text-center text-neutral">No Token URI</span>
        )}
      </div>
    </HoverCardContent>
  );
};

export default EntryInfo;
