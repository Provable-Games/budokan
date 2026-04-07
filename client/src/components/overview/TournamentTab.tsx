import { Button } from "@/components/ui/button";
import { ReactNode } from "react";
import { COUNTER } from "@/components/Icons";

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
    <div className="relative hover:cursor-pointer" onClick={onClick}>
      <Button
        variant={selected ? "default" : "outline"}
        className={`
          [border-image-width:4px_4px_0_4px] 
          rounded-b-none
          px-2
          lg:px-4
          py-2
          sm:py-4
        `}
      >
        <span className="hidden sm:inline">{icon}</span>
        <span className="hidden xl:inline">{label}</span>
        <span className="xl:hidden">{mobileLabel || label}</span>
      </Button>
      {label !== "Ended Tournaments" && count !== undefined && count > 0 && (
        <span className="absolute -top-2 -right-1 flex items-center justify-center text-brand-subtle h-5 w-5 2xl:h-6 2xl:w-6 text-xs">
          <COUNTER />
          <span className="absolute inset-0 flex items-center justify-center text-brand text-center">
            {count}
          </span>
        </span>
      )}
    </div>
  );
};
