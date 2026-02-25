import { Button } from "@/components/ui/button";
import SettingsTable from "./SettingsTable";

interface SettingsDisplayProps {
  currentSetting: any;
  currentSettingId: number;
  onChange: (value: string) => void;
  setOpen: (value: boolean) => void;
  value: string;
  close: () => void;
  setSelectedSetting: (value: number | null) => void;
  selectable: boolean;
}

const SettingsDisplay = ({
  currentSetting,
  currentSettingId,
  onChange,
  setOpen,
  value,
  close,
  setSelectedSetting,
  selectable,
}: SettingsDisplayProps) => {
  const isSelected = currentSettingId === Number(value);
  return (
    <div className="relative flex flex-col gap-2 border border-brand-subtle rounded-lg p-5">
      {selectable && (
        <div className="absolute -top-12 left-0">
          <Button variant="outline" onClick={() => close()} size="sm">
            Back
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-brand">{currentSetting.name}</h3>
        <p className="text-sm text-muted-foreground">
          {currentSetting.description}
        </p>
      </div>
      <SettingsTable hasSettings={true} settings={currentSetting.data} />
      {selectable && (
        <Button
          onClick={() => {
            onChange(currentSettingId.toString());
            setOpen(false);
            setSelectedSetting(null);
          }}
          disabled={isSelected}
          className="flex items-center justify-center"
        >
          {isSelected ? "Selected" : "Select"}
        </Button>
      )}
    </div>
  );
};

export default SettingsDisplay;
