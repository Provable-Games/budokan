import { ReactNode } from "react";

interface TournamentTabProps {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  mobileLabel?: string;
  count?: number;
}

export const TournamentTab = ({
  selected,
  onClick,
  icon,
  label,
  mobileLabel,
  count,
}: TournamentTabProps) => {
  return (
    <button
      className={`
        relative flex items-center gap-2
        px-3 lg:px-4 py-2.5
        rounded-lg
        text-sm font-medium
        transition-all duration-200 ease-out
        ${
          selected
            ? "bg-brand/10 text-brand border border-brand/20 shadow-[0_0_12px_-4px_rgba(var(--color-brand),0.2)]"
            : "text-brand-muted hover:text-brand hover:bg-brand/5 border border-transparent"
        }
      `}
      onClick={onClick}
    >
      <span className="hidden sm:inline [&_svg]:size-4">{icon}</span>
      <span className="hidden xl:inline">{label}</span>
      <span className="xl:hidden">{mobileLabel || label}</span>
      {label !== "Ended Tournaments" && count !== undefined && count > 0 && (
        <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-brand/15 text-brand text-[10px] font-semibold tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
};
