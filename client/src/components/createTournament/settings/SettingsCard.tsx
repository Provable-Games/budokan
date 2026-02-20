interface SettingsCardProps {
  settings_id: number;
  setting: any;
  onClick: () => void;
  value: string;
}

const SettingsCard = ({
  settings_id,
  setting,
  onClick,
  value,
}: SettingsCardProps) => {
  const isSelected = value === settings_id.toString();
  return (
    <div
      className={`flex flex-col border border-brand-muted rounded-lg p-2 w-full cursor-pointer transition-all duration-300 ${
        isSelected ? "bg-brand/80 text-black" : "hover:bg-brand-muted/10 "
      }`}
      onClick={onClick}
    >
      <div className="flex flex-row justify-between items-center">
        <h3 className="font-brand">{setting.name}</h3>
        <p className={isSelected ? "text-black" : "text-brand-muted"}>
          {`#${settings_id}`}
        </p>
      </div>
      <p className={isSelected ? "text-black" : "text-brand-muted"}>
        {setting.description}
      </p>
    </div>
  );
};

export default SettingsCard;
