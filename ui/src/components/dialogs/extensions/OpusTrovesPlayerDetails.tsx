import { useMemo } from "react";
import { OPUS } from "@/components/Icons";
import { getTokenByAddress } from "@/lib/tokenUtils";
import { useDojo } from "@/context/dojo";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface OpusTrovesConfig {
  assetCount: number;
  assetAddresses: string[];
  threshold: bigint;
  valuePerEntry: bigint;
  maxEntries: number;
  thresholdUSD: string;
  valuePerEntryUSD: string;
  isWildcard: boolean;
  formatCashToUSD: (value: bigint) => string;
}

interface OpusTrovesPlayerDetailsProps {
  playerAddress: string;
  config: OpusTrovesConfig;
  troveDebt: bigint;
  totalEntriesRegistered: number;
}

export const OpusTrovesPlayerDetails = ({
  playerAddress,
  config,
  troveDebt,
  totalEntriesRegistered,
}: OpusTrovesPlayerDetailsProps) => {
  const { selectedChainConfig } = useDojo();

  // Get CASH token for display
  const cashToken = useMemo(() => {
    return getTokenByAddress(
      "0x0498edfaf50ca5855666a700c25dd629d577eb9afccdf3b5977aec79aee55ada",
      selectedChainConfig?.chainId ?? ""
    );
  }, [selectedChainConfig?.chainId]);

  // Calculate total entries allowed based on debt
  const { totalEntriesAllowed, bannableEntries, usableDebt } = useMemo(() => {
    const debt = troveDebt || 0n;
    const threshold = config.threshold;
    const valuePerEntry = config.valuePerEntry;

    let totalEntriesAllowed = 0;
    let usableDebt = 0n;

    if (valuePerEntry > 0n) {
      // Proportional mode
      if (debt > threshold) {
        usableDebt = debt - threshold;
        totalEntriesAllowed = Number(usableDebt / valuePerEntry);
      }
    } else {
      // Fixed mode: if debt meets threshold, allow maxEntries
      if (debt >= threshold && config.maxEntries > 0) {
        totalEntriesAllowed = config.maxEntries;
        usableDebt = debt;
      }
    }

    // Cap at max entries if specified
    if (config.maxEntries > 0) {
      totalEntriesAllowed = Math.min(totalEntriesAllowed, config.maxEntries);
    }

    const bannableEntries = Math.max(
      0,
      totalEntriesRegistered - totalEntriesAllowed
    );

    return { totalEntriesAllowed, bannableEntries, usableDebt };
  }, [troveDebt, config, totalEntriesRegistered]);

  const debtUSD = config.formatCashToUSD(troveDebt);
  const usableDebtUSD = config.formatCashToUSD(usableDebt);
  const allowedPercentage = totalEntriesRegistered > 0
    ? (totalEntriesAllowed / totalEntriesRegistered) * 100
    : 0;

  return (
    <div className="mt-3 pt-3 border-t border-brand/20">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-4 h-4 text-brand">
          <OPUS />
        </span>
        <span className="text-sm font-semibold">Opus Troves Qualification</span>
      </div>

      {/* Debt Information */}
      <div className="bg-black/20 border border-brand-muted/30 rounded-lg p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Total Borrowed</span>
          <div className="flex items-center gap-1.5">
            {cashToken?.logo_url && (
              <img src={cashToken.logo_url} alt="CASH" className="w-4 h-4" />
            )}
            <span className="text-sm font-bold text-brand">${debtUSD}</span>
          </div>
        </div>

        {config.threshold > 0n && (
          <>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground">Threshold</span>
              <span className="text-muted-foreground">-${config.thresholdUSD}</span>
            </div>
            <div className="h-px bg-brand-muted/20 mb-2" />
          </>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Usable for Entries</span>
          <div className="flex items-center gap-1.5">
            {cashToken?.logo_url && (
              <img src={cashToken.logo_url} alt="CASH" className="w-4 h-4" />
            )}
            <span className="text-sm font-bold">${usableDebtUSD}</span>
          </div>
        </div>
      </div>

      {/* Entry Allocation Visual */}
      <div className="bg-black/20 border border-brand-muted/30 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium">Entry Allocation</span>
          <span className="text-xs text-muted-foreground">
            {config.valuePerEntry > 0n
              ? `$${config.valuePerEntryUSD} per entry`
              : `${config.maxEntries} max`}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="relative h-8 bg-black/40 rounded border border-brand-muted/30 overflow-hidden mb-3">
          {/* Allowed entries (green) */}
          <div
            className="absolute top-0 left-0 h-full bg-green-500/30 border-r-2 border-green-500 transition-all"
            style={{ width: `${Math.min(allowedPercentage, 100)}%` }}
          />
          {/* Excess entries (red) */}
          {bannableEntries > 0 && (
            <div
              className="absolute top-0 h-full bg-red-500/30 border-r-2 border-red-500 transition-all"
              style={{
                left: `${Math.min(allowedPercentage, 100)}%`,
                width: `${Math.min(100 - allowedPercentage, 100)}%`
              }}
            />
          )}
          {/* Labels overlay */}
          <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-medium">
            <span className="text-green-400">{totalEntriesAllowed} allowed</span>
            <span className="text-white">{totalEntriesRegistered} registered</span>
          </div>
        </div>

        {/* Entry Breakdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-green-400">
                {totalEntriesAllowed} Qualified
              </span>
              <span className="text-[10px] text-muted-foreground">
                Debt supports
              </span>
            </div>
          </div>

          {bannableEntries > 0 && (
            <>
              <div className="w-px h-8 bg-brand-muted/30" />
              <div className="flex items-center gap-1.5 flex-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-red-400">
                    {bannableEntries} To Ban
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Insufficient debt
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
