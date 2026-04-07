import { format } from "date-fns";

interface DateTimeLabelProps {
  date: Date | undefined;
  label: string;
  borderColor?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
}

const DateTimeLabel = ({ date, label, borderColor = "brand", onMouseDown }: DateTimeLabelProps) => {
  return (
    <>
      <div
        className={`text-xs text-center bg-black/80 backdrop-blur-sm px-2 py-1 rounded border border-${borderColor}/30 cursor-grab active:cursor-grabbing`}
        onMouseDown={onMouseDown}
      >
        <div>{date ? format(date, "dd/MM") : "--/--"}</div>
        <div>{date ? format(date, "HH:mm") : "--:--"}</div>
      </div>
      <div className="text-xs text-brand-muted font-medium bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded">
        {label}
      </div>
    </>
  );
};

export default DateTimeLabel;
