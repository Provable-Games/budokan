import { useMemo, useState } from "react";
import { FormDescription, FormLabel } from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  autoBalanceBasisPointShares,
  formatNumber,
  getOrdinalSuffix,
  parseCustomSharesBulkInput,
  type DistributionType,
} from "@/lib/utils";

// Local extension: the SDK's DistributionType covers Linear/Exponential/Uniform
// but Custom is a Budokan-level distribution shape (Cairo side now persists a
// Span<u16> of basis-point shares). Keep the extension local so the SDK type
// stays stable.
export type DistributionTypeWithCustom = DistributionType | "custom";

interface PrizeDistributionVisualProps {
  distributions: Array<{ position: number; percentage: number }>;
  weight: number;
  onWeightChange: (value: number) => void;
  disabled?: boolean;
  amount?: number;
  tokenSymbol?: string;
  usdValue?: number;
  tokenLogoUrl?: string;
  leaderboardSize: number;
  onLeaderboardSizeChange?: (value: number) => void;
  distributionType?: DistributionTypeWithCustom;
  onDistributionTypeChange?: (type: DistributionTypeWithCustom) => void;
  // Custom distribution: per-position basis-point shares (sum must be 10000).
  // `distributions[i].percentage` still drives the bar chart; the parent is
  // expected to mirror customShares into that array when custom is active.
  customShares?: number[];
  onCustomShareChange?: (index: number, basisPoints: number) => void;
  onResetCustomShares?: () => void;
  // Bulk-replace the entire customShares array. Used by the paste importer
  // and auto-balance button so they can land a length-N update in a single
  // render (rather than firing N `onCustomShareChange` calls).
  onCustomSharesReplace?: (shares: number[]) => void;
}

export const PrizeDistributionVisual = ({
  distributions,
  weight,
  onWeightChange,
  disabled = false,
  amount = 0,
  tokenSymbol = "",
  usdValue = 0,
  tokenLogoUrl = "",
  leaderboardSize,
  onLeaderboardSizeChange,
  distributionType = "exponential",
  onDistributionTypeChange,
  customShares,
  onCustomShareChange,
  onResetCustomShares,
  onCustomSharesReplace,
}: PrizeDistributionVisualProps) => {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkWarnings, setBulkWarnings] = useState<string[]>([]);
  // Calculate the maximum percentage for scaling the bars
  const maxPercentage = useMemo(() => {
    return Math.max(...distributions.map((d) => d.percentage), 1);
  }, [distributions]);

  // Calculate bar width based on number of positions
  // Wide bars (80px) for <= 10 positions, narrow down to minimum 40px for many positions
  const barWidth = useMemo(() => {
    if (leaderboardSize <= 10) return 80;
    if (leaderboardSize <= 20) return 60;
    return 40; // minimum width for 20+ positions
  }, [leaderboardSize]);

  const isCustom = distributionType === "custom";

  // Basis-point sum for custom shares — the contract requires exactly 10000,
  // so we surface the live total inline for the user to balance.
  const customTotalBp = useMemo(() => {
    if (!isCustom || !customShares) return 0;
    return customShares
      .slice(0, leaderboardSize)
      .reduce((sum, bp) => sum + (bp || 0), 0);
  }, [isCustom, customShares, leaderboardSize]);

  const customSumIsValid = isCustom && customTotalBp === 10000;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-lg">
            Prize Distribution
          </FormLabel>
          <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
            Visualize prize allocation across positions
          </FormDescription>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Prize Pool Positions */}
        <div className="space-y-1.5 p-3 border border-brand rounded-lg">
          <div className="flex items-center gap-2">
            <FormLabel className="text-sm font-medium">
              Prize Pool Positions
            </FormLabel>
            <FormDescription className="text-xs">
              Number of positions that receive payouts
            </FormDescription>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              {[1, 3, 10, 20].map((size) => (
                <Button
                  key={size}
                  type="button"
                  variant={leaderboardSize === size ? "default" : "outline"}
                  size="sm"
                  className="h-9 w-11 px-0 text-xs flex items-center justify-center"
                  onClick={() => onLeaderboardSizeChange?.(size)}
                  disabled={disabled || !onLeaderboardSizeChange}
                >
                  {size}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={1000}
                step={1}
                value={leaderboardSize}
                onChange={(e) => onLeaderboardSizeChange?.(Number(e.target.value))}
                disabled={disabled || !onLeaderboardSizeChange}
                className="h-9 text-sm w-20"
              />
            </div>
            <Slider
              min={1}
              max={1000}
              step={1}
              value={[leaderboardSize]}
              disabled={disabled || !onLeaderboardSizeChange}
              onValueChange={([value]) => onLeaderboardSizeChange?.(value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Distribution Type */}
        <div className="space-y-1.5 p-3 border border-brand rounded-lg">
          <div className="flex items-center gap-2">
            <FormLabel className="text-sm font-medium">
              Distribution Type
            </FormLabel>
            <FormDescription className="text-xs">
              Choose how prizes are spread
            </FormDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={distributionType === "linear" ? "default" : "outline"}
              size="sm"
              className="flex-1 h-9 text-xs"
              onClick={() => onDistributionTypeChange?.("linear")}
              disabled={disabled}
            >
              Linear
            </Button>
            <Button
              type="button"
              variant={distributionType === "exponential" ? "default" : "outline"}
              size="sm"
              className="flex-1 h-9 text-xs"
              onClick={() => onDistributionTypeChange?.("exponential")}
              disabled={disabled}
            >
              Exponential
            </Button>
            <Button
              type="button"
              variant={distributionType === "uniform" ? "default" : "outline"}
              size="sm"
              className="flex-1 h-9 text-xs"
              onClick={() => onDistributionTypeChange?.("uniform")}
              disabled={disabled}
            >
              Uniform
            </Button>
            <Button
              type="button"
              variant={distributionType === "custom" ? "default" : "outline"}
              size="sm"
              className="flex-1 h-9 text-xs"
              onClick={() => onDistributionTypeChange?.("custom")}
              disabled={disabled}
            >
              Custom
            </Button>
          </div>
          {/* Distribution Weight - only for Linear/Exponential */}
          {distributionType !== "uniform" && distributionType !== "custom" && (
            <div className="flex flex-row items-center gap-4">
              <Slider
                min={0}
                max={50}
                step={0.1}
                value={[weight]}
                disabled={disabled}
                onValueChange={([value]) => onWeightChange(value)}
                className="flex-1"
              />
              <span className="w-12 text-center text-sm">{weight.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Custom Shares Editor */}
      {isCustom && (
        <div className="space-y-2 p-3 border border-brand rounded-lg">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col">
              <FormLabel className="text-sm font-medium">
                Custom Shares
              </FormLabel>
              <FormDescription className="text-xs">
                Enter a percentage for each position. Shares must sum to exactly 100%.
              </FormDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={
                  customSumIsValid
                    ? "text-sm font-medium text-brand"
                    : "text-sm font-medium text-destructive"
                }
              >
                Total: {(customTotalBp / 100).toFixed(2)}%
              </span>
              {onCustomSharesReplace && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkOpen((open) => !open);
                    setBulkErrors([]);
                    setBulkWarnings([]);
                  }}
                  disabled={disabled}
                  className="h-8 text-xs"
                >
                  {bulkOpen ? "Hide paste" : "Paste list"}
                </Button>
              )}
              {onCustomSharesReplace && !customSumIsValid && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const balanced = autoBalanceBasisPointShares(
                      customShares ?? [],
                    );
                    if (balanced) onCustomSharesReplace(balanced);
                  }}
                  disabled={disabled}
                  title="Absorb the remaining residual into the first non-zero position so the total hits exactly 100%."
                  className="h-8 text-xs"
                >
                  Auto-balance
                </Button>
              )}
              {onResetCustomShares && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetCustomShares}
                  disabled={disabled}
                  className="h-8 text-xs"
                >
                  Reset to equal
                </Button>
              )}
            </div>
          </div>

          {bulkOpen && onCustomSharesReplace && (
            <div className="space-y-2 p-3 rounded-md border border-brand-muted bg-background/40">
              <FormDescription className="text-xs">
                Paste {leaderboardSize} percentages — comma-, newline-, or
                tab-separated for position order, or
                <span className="font-mono"> 1:40, 2:20, 3:15</span> for
                explicit positions. Values are rounded to 2 decimals.
              </FormDescription>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={`e.g. 40, 20, 15, 10, 5, 5, 3, 2\n\nor: 1:40, 2:20, 3:15`}
                disabled={disabled}
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-brand-muted bg-black px-3 py-2 text-sm text-brand placeholder:text-neutral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
              />
              {bulkErrors.length > 0 && (
                <ul className="text-xs text-destructive list-disc list-inside space-y-0.5">
                  {bulkErrors.map((err, i) => (
                    <li key={`err-${i}`}>{err}</li>
                  ))}
                </ul>
              )}
              {bulkWarnings.length > 0 && (
                <ul className="text-xs text-yellow-500 list-disc list-inside space-y-0.5">
                  {bulkWarnings.map((w, i) => (
                    <li key={`warn-${i}`}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkInput("");
                    setBulkErrors([]);
                    setBulkWarnings([]);
                  }}
                  disabled={disabled || !bulkInput}
                  className="h-8 text-xs"
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const result = parseCustomSharesBulkInput(
                      bulkInput,
                      leaderboardSize,
                    );
                    setBulkErrors(result.errors);
                    setBulkWarnings(result.warnings);
                    // Apply the parsed values even on partial-parse so users
                    // can see what landed in each slot and fix from there.
                    // Skip only if parsing found zero valid numeric entries.
                    const hasAnyValue = result.shares.some((bp) => bp > 0);
                    if (hasAnyValue || result.errors.length === 0) {
                      onCustomSharesReplace(result.shares);
                    }
                  }}
                  disabled={disabled || !bulkInput.trim()}
                  className="h-8 text-xs"
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const parsed = parseCustomSharesBulkInput(
                      bulkInput,
                      leaderboardSize,
                    );
                    const balanced =
                      autoBalanceBasisPointShares(parsed.shares);
                    setBulkErrors(parsed.errors);
                    setBulkWarnings([
                      ...parsed.warnings,
                      ...(balanced
                        ? []
                        : [
                            "Auto-balance skipped — residual could not land on a valid slot.",
                          ]),
                    ]);
                    if (balanced) {
                      onCustomSharesReplace(balanced);
                    } else if (parsed.errors.length === 0) {
                      onCustomSharesReplace(parsed.shares);
                    }
                  }}
                  disabled={disabled || !bulkInput.trim()}
                  className="h-8 text-xs"
                  title="Parse + adjust the first non-zero slot so the total hits exactly 100%."
                >
                  Apply &amp; balance
                </Button>
              </div>
            </div>
          )}
          <div className="w-full overflow-x-auto pb-1">
            <div className="flex gap-2 min-w-fit">
              {Array.from({ length: leaderboardSize }).map((_, index) => {
                const bp = customShares?.[index] ?? 0;
                // Display as a percentage with up to 2 decimals; empty string
                // for zero so users can type a fresh value without fighting a
                // leading 0.
                const pctDisplay = bp === 0 ? "" : (bp / 100).toString();
                return (
                  <div
                    key={index}
                    className="flex flex-col items-center gap-1"
                    style={{ minWidth: "64px" }}
                  >
                    <span className="text-xs text-muted-foreground">
                      {index + 1}
                      {getOrdinalSuffix(index + 1)}
                    </span>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={pctDisplay}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value;
                          const pct = raw === "" ? 0 : Number(raw);
                          if (Number.isNaN(pct)) return;
                          const clamped = Math.max(0, Math.min(100, pct));
                          // Round to the nearest basis point — the contract
                          // requires integer u16 shares summing to 10000, so
                          // percentages with >2 decimals get quantized here.
                          const nextBp = Math.round(clamped * 100);
                          onCustomShareChange?.(index, nextBp);
                        }}
                        disabled={disabled}
                        className="h-8 text-xs pr-5 w-16 text-right"
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {!customSumIsValid && (
            <p className="text-xs text-destructive">
              Shares must sum to exactly 100% (currently {(customTotalBp / 100).toFixed(2)}%).
            </p>
          )}
        </div>
      )}

      {/* Bar Chart Visualization */}
      <div className="w-full overflow-x-auto pb-2">
        <div className="flex items-end gap-2 min-w-fit h-64">
          {distributions.slice(0, leaderboardSize).map((dist, index) => {
            const barHeightPx = (dist.percentage / maxPercentage) * 192; // 192px = h-48
            const prizeAmount = (amount * dist.percentage) / 100;
            const prizeValue = (usdValue * dist.percentage) / 100;

            return (
              <div
                key={index}
                className="flex flex-col items-center justify-end h-full"
                style={{ minWidth: `${barWidth}px`, width: `${barWidth}px` }}
              >
                {/* Amount Display and Percentage (positioned above bar) */}
                <div className="flex flex-col items-center gap-0.5 text-xs mb-1">
                  {amount > 0 && tokenLogoUrl && (
                    <>
                      <div className="flex items-center gap-1">
                        <img
                          src={tokenLogoUrl}
                          className="w-3 h-3"
                          alt={tokenSymbol}
                        />
                        <span className="font-medium">
                          {formatNumber(prizeAmount)}
                        </span>
                      </div>
                      {usdValue > 0 && (
                        <span className="text-neutral-500">
                          ${formatNumber(prizeValue)}
                        </span>
                      )}
                    </>
                  )}
                  {/* Percentage above bar if too small to fit inside */}
                  {dist.percentage < 5 && dist.percentage > 0 && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {dist.percentage.toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* Bar */}
                <div
                  className="w-full bg-brand rounded-t transition-all duration-300 flex items-center justify-center"
                  style={{ height: `${barHeightPx}px` }}
                >
                  {dist.percentage >= 5 && (
                    <span className="text-xs font-medium text-black">
                      {dist.percentage.toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* Position Label (Bottom) */}
                <div className="text-sm font-medium text-center mt-2">
                  {index + 1}
                  {getOrdinalSuffix(index + 1)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
