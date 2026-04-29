import { cn } from "@/lib/utils";

export type StatChipAccent = "brand" | "success" | "warning" | "muted";

interface StatChipProps {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent?: StatChipAccent;
  className?: string;
}

const ACCENT_CLASS: Record<StatChipAccent, string> = {
  brand: "text-brand",
  success: "text-success",
  warning: "text-warning",
  muted: "text-brand-muted",
};

const StatChip = ({
  icon,
  value,
  label,
  accent = "brand",
  className,
}: StatChipProps) => {
  const accentClass = ACCENT_CLASS[accent];
  return (
    <div
      className={cn(
        "flex flex-row items-center gap-2 px-3 py-2 rounded-md border border-brand/15 bg-brand/5 min-w-[110px]",
        className,
      )}
    >
      <span className={cn("flex-shrink-0 w-4 h-4 opacity-80", accentClass)}>
        {icon}
      </span>
      <div className="flex flex-col leading-none min-w-0">
        <span
          className={cn(
            "font-brand font-bold text-base truncate",
            accentClass,
          )}
        >
          {value}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-brand-muted mt-0.5">
          {label}
        </span>
      </div>
    </div>
  );
};

export default StatChip;
