interface SettingsTableProps {
  hasSettings: boolean;
  settings: any[];
}

const SettingsTable = ({ hasSettings, settings }: SettingsTableProps) => {
  // If game doesn't exist in config or has no settings
  if (!hasSettings) {
    return (
      <div className="border border-brand-muted rounded-lg overflow-hidden w-3/4 p-4">
        <div className="flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
          <div className="text-sm">No settings available for this game yet</div>
          <div className="text-xs">Default configuration will be used</div>
        </div>
      </div>
    );
  }

  // Convert settings object to array of { key, value }
  const entries = Object.entries(settings);

  return (
    <div className="overflow-y-auto flex flex-col border border-brand rounded-lg p-5 gap-2 h-[250px]">
      {entries.map(([key, value], index) => (
        <div
          key={index}
          className="hover:bg-brand/5 transition-colors rounded-lg border border-brand-muted flex flex-row justify-between items-center"
        >
          <div className="p-2 text-sm font-medium">{key}</div>
          <div className="p-2 pr-4 text-sm text-muted-foreground text-right">
            {String(value)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SettingsTable;
