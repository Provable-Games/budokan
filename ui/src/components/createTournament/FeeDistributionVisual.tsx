import { useMemo, useState } from "react";
import { FormDescription, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatNumber } from "@/lib/utils";

interface FeeDistributionVisualProps {
  creatorFee: number;
  gameFee: number;
  refundShare: number;
  onCreatorFeeChange: (value: number) => void;
  onGameFeeChange: (value: number) => void;
  onRefundShareChange: (value: number) => void;
  disabled?: boolean;
  amount?: number;
  tokenSymbol?: string;
  usdValue?: number;
  tokenLogoUrl?: string;
}

export const FeeDistributionVisual = ({
  creatorFee,
  gameFee,
  refundShare,
  onCreatorFeeChange,
  onGameFeeChange,
  onRefundShareChange,
  disabled = false,
  amount = 0,
  tokenSymbol = "",
  usdValue = 0,
  tokenLogoUrl = "",
}: FeeDistributionVisualProps) => {
  const [creatorFeeEnabled, setCreatorFeeEnabled] = useState(creatorFee > 0);
  const [refundShareEnabled, setRefundShareEnabled] = useState(refundShare > 0);

  const PRESET_VALUES = [
    { value: 1, label: "1%" },
    { value: 2.5, label: "2.5%" },
    { value: 5, label: "5%" },
  ];

  const prizePool = useMemo(() => {
    return Math.max(0, 100 - creatorFee - gameFee - refundShare);
  }, [creatorFee, gameFee, refundShare]);

  const totalAllocated = creatorFee + gameFee + refundShare;
  const isOverAllocated = totalAllocated > 100;

  // Calculate actual amounts
  const creatorAmount = (amount * creatorFee) / 100;
  const gameAmount = (amount * gameFee) / 100;
  const refundAmount = (amount * refundShare) / 100;
  const prizeAmount = (amount * prizePool) / 100;

  const creatorValue = (usdValue * creatorFee) / 100;
  const gameValue = (usdValue * gameFee) / 100;
  const refundValue = (usdValue * refundShare) / 100;
  const prizeValue = (usdValue * prizePool) / 100;

  const sections = [
    {
      label: "Creator Fee",
      percentage: creatorFee,
      color: "bg-blue-500",
      amount: creatorAmount,
      value: creatorValue,
    },
    {
      label: "Game Fee",
      percentage: gameFee,
      color: "bg-purple-500",
      amount: gameAmount,
      value: gameValue,
    },
    {
      label: "Refund",
      percentage: refundShare,
      color: "bg-yellow-500",
      amount: refundAmount,
      value: refundValue,
    },
    {
      label: "Prize Pool",
      percentage: prizePool,
      color: "bg-brand",
      amount: prizeAmount,
      value: prizeValue,
    },
  ].filter((section) => section.percentage > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <FormLabel className="font-brand text-lg">
            Fee Distribution
          </FormLabel>
          <FormDescription className="text-xs">
            Adjust how entry fees are distributed
          </FormDescription>
        </div>
        {isOverAllocated && (
          <span className="text-destructive text-sm font-medium">
            Over 100% ({totalAllocated}%)
          </span>
        )}
      </div>

      {/* Two Column Layout: Inputs (Left) | Visual Bar (Right) */}
      <div className="grid grid-cols-3 gap-6">
        {/* Fee Inputs Column - Takes 2/3 of space */}
        <div className="col-span-2 grid grid-cols-2 gap-3">
        {/* Creator Fee Input */}
        <div className={`space-y-1.5 p-3 border border-brand rounded-lg transition-opacity relative ${!creatorFeeEnabled ? 'opacity-50' : ''}`}>
          <Switch
            checked={creatorFeeEnabled}
            onCheckedChange={(checked) => {
              setCreatorFeeEnabled(checked);
              if (!checked) {
                onCreatorFeeChange(0);
              } else {
                onCreatorFeeChange(2.5); // Default to 2.5% when enabled
              }
            }}
            disabled={disabled}
            className="absolute top-3 right-3 scale-75"
          />
          <div className="flex items-center gap-2 pr-8">
            <FormLabel className="text-sm font-medium flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-blue-500" />
              Creator Fee
            </FormLabel>
            {amount > 0 && tokenLogoUrl && creatorFeeEnabled && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
                <span>
                  {formatNumber(creatorAmount)} {tokenSymbol}
                </span>
                {usdValue > 0 && (
                  <span>≈ ${formatNumber(creatorValue)}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {PRESET_VALUES.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={creatorFee === preset.value ? "default" : "outline"}
                size="sm"
                className="h-9 w-11 px-0 text-xs flex items-center justify-center"
                onClick={() => onCreatorFeeChange(preset.value)}
                disabled={disabled || !creatorFeeEnabled}
              >
                {preset.value}
              </Button>
            ))}
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={creatorFee.toFixed(2)}
              onChange={(e) => onCreatorFeeChange(Number(e.target.value))}
              disabled={disabled || !creatorFeeEnabled}
              className="h-9 text-sm w-20"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>

        {/* Game Fee Input */}
        <div className="space-y-1.5 p-3 border border-brand rounded-lg">
          <div className="flex items-center gap-2">
            <FormLabel className="text-sm font-medium flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-purple-500" />
              Game Fee
            </FormLabel>
            {amount > 0 && tokenLogoUrl && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
                <span>
                  {formatNumber(gameAmount)} {tokenSymbol}
                </span>
                {usdValue > 0 && (
                  <span>≈ ${formatNumber(gameValue)}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {PRESET_VALUES.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={gameFee === preset.value ? "default" : "outline"}
                size="sm"
                className="h-9 w-11 px-0 text-xs flex items-center justify-center"
                onClick={() => onGameFeeChange(Math.max(1, preset.value))}
                disabled={disabled}
              >
                {preset.value}
              </Button>
            ))}
            <Input
              type="number"
              min={1}
              max={100}
              step={0.01}
              value={gameFee.toFixed(2)}
              onChange={(e) => onGameFeeChange(Math.max(1, Number(e.target.value)))}
              disabled={disabled}
              className="h-9 text-sm w-20"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>

        {/* Refund Share Input */}
        <div className={`space-y-1.5 p-3 border border-brand rounded-lg transition-opacity relative ${!refundShareEnabled ? 'opacity-50' : ''}`}>
          <Switch
            checked={refundShareEnabled}
            onCheckedChange={(checked) => {
              setRefundShareEnabled(checked);
              if (!checked) {
                onRefundShareChange(0);
              } else {
                onRefundShareChange(2.5); // Default to 2.5% when enabled
              }
            }}
            disabled={disabled}
            className="absolute top-3 right-3 scale-75"
          />
          <div className="flex items-center gap-2 pr-8">
            <FormLabel className="text-sm font-medium flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-yellow-500" />
              Refund Share
            </FormLabel>
            {amount > 0 && tokenLogoUrl && refundShareEnabled && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
                <span>
                  {formatNumber(refundAmount)} {tokenSymbol}
                </span>
                {usdValue > 0 && (
                  <span>≈ ${formatNumber(refundValue)}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {PRESET_VALUES.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={refundShare === preset.value ? "default" : "outline"}
                size="sm"
                className="h-9 w-11 px-0 text-xs flex items-center justify-center"
                onClick={() => onRefundShareChange(preset.value)}
                disabled={disabled || !refundShareEnabled}
              >
                {preset.value}
              </Button>
            ))}
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={refundShare.toFixed(2)}
              onChange={(e) => onRefundShareChange(Number(e.target.value))}
              disabled={disabled || !refundShareEnabled}
              className="h-9 text-sm w-20"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>

        {/* Prize Pool (Read-only Display) */}
        <div className="space-y-1.5 p-3 border border-brand rounded-lg">
          <div className="flex items-center gap-2">
            <FormLabel className="text-sm font-medium text-brand flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-brand" />
              Prize Pool
            </FormLabel>
            {amount > 0 && tokenLogoUrl && (
              <div className="flex items-center gap-1 text-xs text-brand">
                <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
                <span>
                  {formatNumber(prizeAmount)} {tokenSymbol}
                </span>
                {usdValue > 0 && (
                  <span>≈ ${formatNumber(prizeValue)}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-brand font-medium">{prizePool}%</span>
          </div>
        </div>
        </div>

        {/* Visual Distribution Bar Column - Takes 1/3 of space */}
        <div className="col-span-1 flex flex-col justify-center gap-3">
          {/* Legends above bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {sections.map((section, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded ${section.color}`} />
                <span className="text-xs font-medium">{section.label}</span>
                <span className="text-xs text-muted-foreground">
                  {section.percentage}%
                </span>
              </div>
            ))}
          </div>

          {/* Distribution bar */}
          <div className="w-full h-12 flex rounded-lg overflow-hidden border-2 border-brand/50">
            {sections.map((section, index) => (
              <div
                key={index}
                className={`${section.color} flex items-center justify-center text-xs font-medium text-black transition-all duration-300`}
                style={{ width: `${section.percentage}%` }}
              >
                {section.percentage >= 8 && `${section.percentage}%`}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
