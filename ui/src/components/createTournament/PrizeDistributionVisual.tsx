import { useMemo } from "react";
import { FormDescription, FormLabel } from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber, getOrdinalSuffix, type DistributionType } from "@/lib/utils";

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
  distributionType?: DistributionType;
  onDistributionTypeChange?: (type: DistributionType) => void;
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
}: PrizeDistributionVisualProps) => {
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
          </div>
          {/* Distribution Weight - Only show if not uniform */}
          {distributionType !== "uniform" && (
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
                      {dist.percentage}%
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
