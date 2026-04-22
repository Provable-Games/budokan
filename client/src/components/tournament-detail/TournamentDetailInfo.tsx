import { SLIDERS, USER } from "@/components/Icons";
import { Ticket, Clock } from "lucide-react";
import Countdown from "@/components/Countdown";
import { cn } from "@/lib/utils";

type EntryFeeInfo =
  | { type: "free"; display: "Free" }
  | { type: "token"; display: string }
  | { type: "usd"; display: string };

interface TournamentDetailInfoProps {
  settingsName?: string | null;
  registrationType: "open" | "fixed";
  entryCount: number;
  entryFeeInfo: EntryFeeInfo;
  entryFeeTokenLogo?: string;
  /** Refund share in basis points (0-10000). 5000 = 50% refund. */
  refundBps?: number;
  countdownTarget?: number | null;
  countdownLabel?: string;
  onSettingsClick?: () => void;
}

const StatChip = ({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent?: "brand" | "muted" | "success";
}) => {
  const accentClass =
    accent === "success"
      ? "text-success"
      : accent === "muted"
        ? "text-brand-muted"
        : "text-brand";
  return (
    <div className="flex flex-col items-center justify-center px-2 md:px-3 py-1.5 md:py-2 rounded-md border border-brand/10 bg-brand/5 min-w-[70px] md:min-w-[90px]">
      <div className="flex flex-row items-center gap-1.5">
        <span
          className={cn("w-3.5 h-3.5 md:w-4 md:h-4 opacity-70", accentClass)}
        >
          {icon}
        </span>
        <span
          className={cn(
            "font-brand font-bold text-sm md:text-base",
            accentClass,
          )}
        >
          {value}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-brand-muted mt-0.5">
        {label}
      </span>
    </div>
  );
};

const TournamentDetailInfo = ({
  settingsName,
  registrationType,
  entryCount,
  entryFeeInfo,
  entryFeeTokenLogo,
  refundBps,
  countdownTarget,
  countdownLabel,
  onSettingsClick,
}: TournamentDetailInfoProps) => {
  const hasCountdown = countdownTarget != null && countdownTarget > 0;
  const hasRefund =
    entryFeeInfo.type !== "free" && refundBps != null && refundBps > 0;
  const refundPct = hasRefund ? (refundBps! / 100).toFixed(0) : null;

  const settingsCard = (
    <button
      onClick={onSettingsClick}
      disabled={!settingsName}
      className={cn(
        "flex flex-row items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2 rounded-md border bg-brand/5 border-brand/10",
        settingsName
          ? "hover:bg-brand/10 hover:border-brand/25 transition-colors cursor-pointer"
          : "opacity-70 cursor-default",
      )}
    >
      <span className="w-5 h-5 md:w-6 md:h-6 text-brand opacity-60 flex-shrink-0">
        <SLIDERS />
      </span>
      <div className="flex flex-col items-start leading-none">
        <span className="text-[9px] uppercase tracking-wider text-brand-muted">
          Settings
        </span>
        <span className="font-brand font-bold text-xs md:text-sm text-brand mt-0.5 truncate max-w-[120px]">
          {settingsName ?? "Default"}
        </span>
      </div>
    </button>
  );

  const registrationChip = (
    <span className="inline-flex items-center rounded border border-brand/20 bg-brand/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand">
      {registrationType === "open" ? "Open Entry" : "Fixed Window"}
    </span>
  );

  const entriesChip = (
    <StatChip
      icon={<USER />}
      value={entryCount}
      label="Entries"
      accent="brand"
    />
  );

  const entryFeeChip = (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center px-2 md:px-3 py-1.5 md:py-2 rounded-md border bg-brand/5 min-w-[80px] md:min-w-[100px]",
        hasRefund ? "border-success/30" : "border-brand/10",
      )}
    >
      {hasRefund && (
        <span className="absolute -top-2.5 -right-2 px-1.5 py-0.5 rounded-md bg-success border border-success text-[10px] font-bold uppercase tracking-wider text-black leading-none whitespace-nowrap shadow-sm">
          {refundPct}% back
        </span>
      )}
      <div className="flex flex-row items-center gap-1.5">
        {entryFeeInfo.type === "token" && entryFeeTokenLogo ? (
          <img
            src={entryFeeTokenLogo}
            alt=""
            className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full"
          />
        ) : (
          <span
            className={cn(
              "w-3.5 h-3.5 md:w-4 md:h-4",
              entryFeeInfo.type === "free" ? "text-brand-muted" : "text-brand",
            )}
          >
            <Ticket className="w-full h-full" />
          </span>
        )}
        <span
          className={cn(
            "font-brand font-bold text-sm md:text-base",
            entryFeeInfo.type === "free" ? "text-brand-muted" : "text-brand",
          )}
        >
          {entryFeeInfo.display}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-brand-muted mt-0.5">
        Entry Fee
      </span>
    </div>
  );

  const countdownChip = hasCountdown && (
    <div className="flex flex-col items-center justify-center px-2 md:px-3 py-1.5 md:py-2 rounded-md border border-brand/10 bg-brand/5">
      <div className="flex flex-row items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand opacity-70" />
        <Countdown
          targetTimestamp={countdownTarget!}
          size="sm"
          labelPosition="horizontal"
        />
      </div>
      <span className="text-[9px] uppercase tracking-wider text-brand-muted mt-0.5">
        {countdownLabel ?? "Remaining"}
      </span>
    </div>
  );

  return (
    <>
      {/* Desktop: single row */}
      <div className="hidden md:flex flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-row items-center gap-2 flex-shrink-0">
          {settingsCard}
          <span className="hidden sm:inline-flex">{registrationChip}</span>
        </div>

        <div className="flex flex-row items-stretch gap-2 flex-shrink-0">
          {countdownChip}
          {entriesChip}
          {entryFeeChip}
        </div>
      </div>

      {/* Mobile: 2 rows — meta chips above, countdown below */}
      <div className="md:hidden flex flex-col gap-2">
        <div className="flex flex-row items-stretch gap-2 flex-wrap justify-center">
          {settingsCard}
          {entriesChip}
          {entryFeeChip}
        </div>
        {hasCountdown && (
          <div className="flex flex-row items-stretch gap-2 flex-wrap justify-center">
            {countdownChip}
          </div>
        )}
      </div>
    </>
  );
};

export default TournamentDetailInfo;
