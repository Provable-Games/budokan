import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SettingsCarousel from "@/components/createTournament/settings/SettingsCarousel";
import TokenGameIcon from "../icons/TokenGameIcon";
import useUIStore from "@/hooks/useUIStore";
import SettingsDisplay from "../createTournament/settings/SettingsDisplay";
import { useState } from "react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: string;
  settings: any[];
  value: string;
  onChange: (value: string) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  settingsCount: number;
  totalPages: number;
  isLoadingSettings: boolean;
}

export const SettingsDialog = ({
  open,
  onOpenChange,
  game,
  settings,
  value,
  onChange,
  currentPage,
  setCurrentPage,
  settingsCount,
  totalPages,
  isLoadingSettings,
}: SettingsDialogProps) => {
  const { getGameImage, getGameName } = useUIStore();

  const [selectedSetting, setSelectedSetting] = useState<number | null>(null);

  const noSettings = !Object.values(settings)?.length;

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
              {selectedSetting === null ? (
                <SettingsCarousel
                  game={game}
                  settings={settings}
                  value={value}
                  setOpen={onOpenChange}
                  currentPage={currentPage}
                  setCurrentPage={setCurrentPage}
                  setSelectedSetting={setSelectedSetting}
                  settingsCount={settingsCount}
                  totalPages={totalPages}
                  isLoadingSettings={isLoadingSettings}
                />
              ) : (
                <SettingsDisplay
                  currentSetting={settings.find(
                    (setting) => setting.settings_id === selectedSetting
                  )}
                  currentSettingId={selectedSetting}
                  onChange={onChange}
                  setOpen={onOpenChange}
                  value={value}
                  close={() => setSelectedSetting(null)}
                  setSelectedSetting={setSelectedSetting}
                  selectable={true}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
