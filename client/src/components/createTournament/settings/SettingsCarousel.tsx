import { Button } from "@/components/ui/button";
import { WEDGE_LEFT, WEDGE_RIGHT } from "@/components/Icons";
import SettingsCard from "./SettingsCard";
import { LoadingSpinner } from "@/components/ui/spinner";

interface SettingsCarouselProps {
  game: string;
  settings: any[];
  value: string;
  setOpen: (value: boolean) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  setSelectedSetting: (setting: number | null) => void;
  settingsCount: number;
  totalPages: number;
  isLoadingSettings: boolean;
}

const SettingsCarousel = ({
  settings,
  value,
  currentPage,
  setCurrentPage,
  setSelectedSetting,
  settingsCount,
  totalPages,
  isLoadingSettings,
}: SettingsCarouselProps) => {
  return (
    <div className="flex flex-col px-10 w-full">
      <div className="flex flex-row justify-end gap-2 w-full overflow-hidden">
        <span className="text-neutral">Number of Settings:</span>
        <span>{settingsCount}</span>
      </div>

      {!isLoadingSettings && (
        <div className="flex flex-col gap-2 w-full">
          {Object.entries(settings).map(([key, setting]) => (
            <SettingsCard
              key={key}
              settings_id={Number(setting.settings_id)}
              setting={setting}
              onClick={() => setSelectedSetting(Number(setting.settings_id))}
              value={value}
            />
          ))}
        </div>
      )}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-8 w-8 rounded-full"
          >
            <WEDGE_LEFT />
          </Button>
        </div>
        {isLoadingSettings && (
          <div className="h-full w-full flex justify-center items-center">
            <LoadingSpinner className="w-20 h-20 border-brand" />
          </div>
        )}
        <div className="pointer-events-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 rounded-full"
          >
            <WEDGE_RIGHT />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsCarousel;
