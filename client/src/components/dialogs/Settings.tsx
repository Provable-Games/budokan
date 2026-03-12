import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TokenGameIcon from "../icons/TokenGameIcon";
import useUIStore from "@/hooks/useUIStore";
import { GameSettings } from "@/lib/types";
import SettingsDisplay from "../createTournament/settings/SettingsDisplay";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: string;
  settings: GameSettings | undefined;
}

export const SettingsDialog = ({
  open,
  onOpenChange,
  game,
  settings,
}: SettingsDialogProps) => {
  const { getGameImage, getGameName } = useUIStore();

  const noSettings = !settings;

  const noSettingsDisplay = () => {
    if (noSettings) {
      return (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
            <TokenGameIcon size="lg" image={getGameImage(game)} />
            <div className="text-sm">
              No settings available for this game yet
            </div>
            <div className="text-xs">Default configuration will be used</div>
          </div>
        </div>
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Game Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col w-full">
          {noSettings ? (
            noSettingsDisplay()
          ) : (
            <div className="relative flex flex-col gap-2 h-[500px] w-full">
              <div className="flex flex-col gap-2 items-center w-full">
                <TokenGameIcon size="lg" image={getGameImage(game)} />
                <h3 className="text-2xl font-brand">{getGameName(game)}</h3>
              </div>
              <SettingsDisplay
                currentSetting={settings}
                currentSettingId={settings.settings_id}
                onChange={() => undefined}
                setOpen={onOpenChange}
                value={settings.settings_id.toString()}
                close={() => undefined}
                setSelectedSetting={() => undefined}
                selectable={false}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
