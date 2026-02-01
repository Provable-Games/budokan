import { useMemo, useState, useRef, useCallback } from "react";
import { FormDescription, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/utils";
import { InfoIcon } from "lucide-react";

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
  minGameFee?: number;
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
  minGameFee = 1,
}: FeeDistributionVisualProps) => {
  const [creatorFeeEnabled, setCreatorFeeEnabled] = useState(creatorFee > 0);
  const [refundShareEnabled, setRefundShareEnabled] = useState(refundShare > 0);
  const [prizePoolEnabled, setPrizePoolEnabled] = useState(true);
  const [draggingDivider, setDraggingDivider] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const prizePool = useMemo(() => {
    if (!prizePoolEnabled) return 0;
    return Math.max(0, 100 - creatorFee - gameFee - refundShare);
  }, [creatorFee, gameFee, refundShare, prizePoolEnabled]);

  const totalAllocated = creatorFee + gameFee + refundShare + (prizePoolEnabled ? prizePool : 0);
  const isOverAllocated = totalAllocated > 100;

  // Calculate max values for inputs
  const maxCreatorFee = prizePoolEnabled
    ? Math.min(99 - gameFee - refundShare, 100)
    : 100 - gameFee - refundShare;
  const maxGameFee = prizePoolEnabled
    ? Math.min(99 - creatorFee - refundShare, 100)
    : 100 - creatorFee - refundShare;
  const maxRefundShare = prizePoolEnabled
    ? Math.min(99 - creatorFee - gameFee, 100)
    : 100 - creatorFee - gameFee;

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
      label: "Refund Portion",
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

  // Handle dragging dividers in the bar
  const handleDividerDrag = useCallback(
    (e: React.MouseEvent | MouseEvent, dividerIndex: number) => {
      if (disabled || !barRef.current) return;

      const rect = barRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;

      // Determine which sections are on either side of this divider
      const leftSection = sections[dividerIndex];
      const rightSection = sections[dividerIndex + 1];

      if (!leftSection || !rightSection) return;

      // Calculate the cumulative percentage up to this divider
      const cumulativeLeft = sections
        .slice(0, dividerIndex)
        .reduce((sum, s) => sum + s.percentage, 0);

      // The new percentage for the left section is the drag position minus everything to its left
      const newLeftPercentage = percentage - cumulativeLeft;

      // Adjust the appropriate fee based on which section is on the left
      if (leftSection.label === "Creator Fee") {
        const minCreator = 0;
        const maxCreator = prizePoolEnabled ? 99 - gameFee - refundShare : 100 - gameFee - refundShare;
        onCreatorFeeChange(Math.max(minCreator, Math.min(maxCreator, newLeftPercentage)));
      } else if (leftSection.label === "Game Fee") {
        const minGame = minGameFee;
        const maxGame = prizePoolEnabled
          ? 99 - creatorFee - refundShare
          : 100 - creatorFee - refundShare;
        onGameFeeChange(Math.max(minGame, Math.min(maxGame, newLeftPercentage)));
      } else if (leftSection.label === "Refund Portion") {
        const minRefund = 0;
        const maxRefund = prizePoolEnabled ? 99 - creatorFee - gameFee : 100 - creatorFee - gameFee;
        onRefundShareChange(Math.max(minRefund, Math.min(maxRefund, newLeftPercentage)));
      }
    },
    [
      disabled,
      sections,
      creatorFee,
      gameFee,
      refundShare,
      prizePoolEnabled,
      minGameFee,
      onCreatorFeeChange,
      onGameFeeChange,
      onRefundShareChange,
    ]
  );

  const handleMouseDown = useCallback(
    (dividerIndex: number) => {
      if (disabled) return;
      setDraggingDivider(dividerIndex);

      const handleMouseMove = (e: MouseEvent) => {
        handleDividerDrag(e, dividerIndex);
      };

      const handleMouseUp = () => {
        setDraggingDivider(null);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [disabled, handleDividerDrag]
  );

  return (
    <TooltipProvider>
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
        <div className="flex flex-col items-end gap-1">
          {isOverAllocated && (
            <span className="text-destructive text-sm font-medium">
              Over 100% ({totalAllocated.toFixed(1)}%)
            </span>
          )}
          {!prizePoolEnabled && totalAllocated < 100 && (
            <span className="text-yellow-500 text-sm font-medium">
              Unallocated: {(100 - totalAllocated).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Interactive Draggable Bar */}
      <div className="space-y-3 p-4 bg-neutral/10 rounded-lg">
        <FormLabel className="text-sm font-medium">
          Drag the boundaries to adjust distribution
        </FormLabel>
        <div
          ref={barRef}
          className="relative w-full h-16 flex rounded-lg overflow-hidden border-2 border-brand/50 cursor-ew-resize select-none"
        >
          {sections.map((section, index) => (
              <div
                key={index}
                className={`${section.color} flex items-center justify-center text-xs font-medium text-black transition-all duration-150 relative`}
                style={{ width: `${section.percentage}%` }}
              >
                {section.percentage >= 5 && (
                  <span className="font-semibold">
                    {section.label}<br />{section.percentage.toFixed(1)}%
                  </span>
                )}

                {/* Draggable divider */}
                {index < sections.length - 1 && (
                  <div
                    className={`absolute right-0 top-0 bottom-0 w-1 bg-white/50 hover:bg-white hover:w-2 cursor-ew-resize z-10 transition-all ${
                      draggingDivider === index ? 'bg-white w-2' : ''
                    }`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(index);
                    }}
                  />
                )}
              </div>
          ))}
        </div>
      </div>

      {/* Summary Information */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Creator Fee */}
        <div className={`p-3 border border-brand rounded-lg space-y-2 transition-opacity ${!creatorFeeEnabled ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <FormLabel className="text-sm font-medium">Creator Fee</FormLabel>
            </div>
            <Switch
              checked={creatorFeeEnabled}
              onCheckedChange={(checked) => {
                setCreatorFeeEnabled(checked);
                if (!checked) {
                  onCreatorFeeChange(0);
                } else {
                  onCreatorFeeChange(2.5);
                }
              }}
              disabled={disabled}
              className="scale-75"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={maxCreatorFee}
              step={0.1}
              value={creatorFee.toFixed(1)}
              onChange={(e) => onCreatorFeeChange(Math.min(maxCreatorFee, Math.max(0, Number(e.target.value))))}
              disabled={disabled || !creatorFeeEnabled}
              className="h-10 text-lg font-bold"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {amount > 0 && tokenLogoUrl && creatorFeeEnabled && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
              <span>{formatNumber(creatorAmount)} {tokenSymbol}</span>
              {usdValue > 0 && <span>≈ ${formatNumber(creatorValue)}</span>}
            </div>
          )}
        </div>

        {/* Game Fee */}
        <div className="p-3 border border-brand rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-purple-500" />
              <FormLabel className="text-sm font-medium">Game Fee</FormLabel>
            </div>
            <span className="text-xs text-muted-foreground">(min {minGameFee}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={minGameFee}
              max={maxGameFee}
              step={0.1}
              value={gameFee.toFixed(1)}
              onChange={(e) => onGameFeeChange(Math.min(maxGameFee, Math.max(minGameFee, Number(e.target.value))))}
              disabled={disabled}
              className="h-10 text-lg font-bold"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {amount > 0 && tokenLogoUrl && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
              <span>{formatNumber(gameAmount)} {tokenSymbol}</span>
              {usdValue > 0 && <span>≈ ${formatNumber(gameValue)}</span>}
            </div>
          )}
        </div>

        {/* Refund Portion */}
        <div className={`p-3 border border-brand rounded-lg space-y-2 transition-opacity ${!refundShareEnabled ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-yellow-500" />
              <FormLabel className="text-sm font-medium">Refund Portion</FormLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Percentage of the entry fee that is returned to the entrant after the tournament.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch
              checked={refundShareEnabled}
              onCheckedChange={(checked) => {
                setRefundShareEnabled(checked);
                if (!checked) {
                  onRefundShareChange(0);
                } else {
                  onRefundShareChange(2.5);
                }
              }}
              disabled={disabled}
              className="scale-75"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={maxRefundShare}
              step={0.1}
              value={refundShare.toFixed(1)}
              onChange={(e) => onRefundShareChange(Math.min(maxRefundShare, Math.max(0, Number(e.target.value))))}
              disabled={disabled || !refundShareEnabled}
              className="h-10 text-lg font-bold"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {amount > 0 && tokenLogoUrl && refundShareEnabled && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
              <span>{formatNumber(refundAmount)} {tokenSymbol}</span>
              {usdValue > 0 && <span>≈ ${formatNumber(refundValue)}</span>}
            </div>
          )}
        </div>

        {/* Prize Pool */}
        <div className={`p-3 border border-brand rounded-lg space-y-2 transition-opacity ${!prizePoolEnabled ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-brand" />
              <FormLabel className="text-sm font-medium text-brand">Prize Pool</FormLabel>
            </div>
            <Switch
              checked={prizePoolEnabled}
              onCheckedChange={setPrizePoolEnabled}
              disabled={disabled}
              className="scale-75"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={prizePoolEnabled ? 1 : 0}
              max={99}
              step={0.1}
              value={prizePool.toFixed(1)}
              onChange={(e) => {
                const newPrizePool = Math.max(0, Math.min(99, Number(e.target.value)));
                const targetTotal = 100 - newPrizePool;

                // Calculate current total of fees (excluding prize pool)
                const currentFees = creatorFee + gameFee + refundShare;

                if (currentFees === 0) {
                  // If all fees are 0, distribute equally to game fee
                  onGameFeeChange(Math.max(minGameFee, targetTotal));
                  return;
                }

                // Adjust fees proportionally while respecting constraints
                const ratio = targetTotal / currentFees;

                const newCreatorFee = creatorFeeEnabled ? creatorFee * ratio : 0;
                const newGameFee = Math.max(minGameFee, gameFee * ratio);
                const newRefundShare = refundShareEnabled ? refundShare * ratio : 0;

                onCreatorFeeChange(newCreatorFee);
                onGameFeeChange(newGameFee);
                onRefundShareChange(newRefundShare);
              }}
              disabled={disabled || !prizePoolEnabled}
              className="h-10 text-lg font-bold text-brand"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {amount > 0 && tokenLogoUrl && prizePoolEnabled && (
            <div className="flex items-center gap-1 text-xs text-brand">
              <img src={tokenLogoUrl} className="w-3 h-3" alt={tokenSymbol} />
              <span>{formatNumber(prizeAmount)} {tokenSymbol}</span>
              {usdValue > 0 && <span>≈ ${formatNumber(prizeValue)}</span>}
            </div>
          )}
        </div>
      </div>

    </div>
    </TooltipProvider>
  );
};
