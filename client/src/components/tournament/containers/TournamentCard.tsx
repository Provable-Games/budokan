import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

interface TournamentCardProps {
  showCard: boolean;
  children: React.ReactNode;
  className?: string;
}

export const TournamentCard = ({
  showCard,
  children,
  className,
}: TournamentCardProps) => {
  return (
    <Card
      variant="outline"
      className={`sm:w-1/2 transition-all duration-300 ease-in-out ${
        showCard ? "h-[210px] 3xl:h-[270px]" : "h-[60px] 3xl:h-[80px]"
      } ${className}`}
    >
      <div className="flex flex-col justify-between">{children}</div>
    </Card>
  );
};

interface TournamentCardHeaderProps {
  children: React.ReactNode;
}

export const TournamentCardHeader = ({
  children,
}: TournamentCardHeaderProps) => {
  return (
    <div className="flex flex-row items-center justify-between h-6 sm:h-8 3xl:h-10">
      {children}
    </div>
  );
};

interface TournamentCardTitleProps {
  children: React.ReactNode;
}

export const TournamentCardTitle = ({ children }: TournamentCardTitleProps) => {
  return (
    <div className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
      {children}
    </div>
  );
};

interface TournamentCardSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  showSwitch: boolean;
  notShowingSwitchLabel: string;
  checkedLabel: string;
  uncheckedLabel: string;
}

export const TournamentCardSwitch = ({
  checked,
  onCheckedChange,
  showSwitch,
  notShowingSwitchLabel,
  checkedLabel,
  uncheckedLabel,
}: TournamentCardSwitchProps) => {
  return (
    <>
      {showSwitch ? (
        <>
          <span className="hidden sm:block text-neutral 3xl:text-lg">
            {checked ? checkedLabel : uncheckedLabel}
          </span>
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            className="hidden sm:block"
          />
        </>
      ) : (
        <span className="text-neutral 3xl:text-lg">
          {notShowingSwitchLabel}
        </span>
      )}
    </>
  );
};

interface TournamentCardMetricProps {
  icon: React.ReactNode;
  metric: number;
}

export const TournamentCardMetric = ({
  icon,
  metric,
}: TournamentCardMetricProps) => {
  return (
    <div className="flex flex-row items-center font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
      <span className="w-8 2xl:w-10 3xl:w-12">{icon}</span>
      <span>{metric}</span>
    </div>
  );
};

interface TournamentCardContentProps {
  children: React.ReactNode;
  showContent: boolean;
  className?: string;
}

export const TournamentCardContent = ({
  children,
  showContent,
  className,
}: TournamentCardContentProps) => {
  return (
    <div
      className={`transition-all duration-300 delay-50 ease-in-out ${
        showContent ? "h-[150px] 3xl:h-[200px] opacity-100" : "h-0 opacity-0"
      } ${className}`}
    >
      <div className="w-full h-0.5 bg-brand/25 mt-2" />
      {children}
    </div>
  );
};
