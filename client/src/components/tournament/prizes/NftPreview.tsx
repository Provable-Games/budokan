import { TokenUri } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NftPreviewProps {
  tokenUri: TokenUri | null;
  tokenId: bigint;
  symbol: string;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  showTooltip?: boolean;
  onClick?: () => void;
}

const NftPreview = ({
  tokenUri,
  tokenId,
  symbol,
  size = "md",
  loading = false,
  showTooltip = true,
  onClick,
}: NftPreviewProps) => {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  const imageClass = `${sizeClasses[size]} rounded-md object-cover border border-brand/20 flex-shrink-0`;

  if (loading) {
    return <Skeleton className={imageClass} />;
  }

  const content = tokenUri?.image ? (
    <img
      src={tokenUri.image}
      alt={`${symbol} #${tokenId.toString()}`}
      className={imageClass}
      onError={(e) => {
        // Fallback to placeholder on error
        e.currentTarget.style.display = "none";
        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
        if (fallback) fallback.style.display = "flex";
      }}
    />
  ) : null;

  const fallback = (
    <div
      className={`${imageClass} bg-brand/10 flex items-center justify-center text-xs font-brand text-brand-muted`}
      style={{ display: tokenUri?.image ? "none" : "flex" }}
    >
      #{tokenId.toString().slice(0, 4)}
    </div>
  );

  if (!showTooltip || !tokenUri) {
    const wrapper = (
      <>
        {content}
        {fallback}
      </>
    );

    if (onClick) {
      return (
        <div onClick={onClick} className="cursor-pointer">
          {wrapper}
        </div>
      );
    }

    return wrapper;
  }

  const tooltipContent = (
    <Tooltip delayDuration={50}>
      <TooltipTrigger asChild>
        <div className="cursor-pointer" onClick={onClick}>
          {content}
          {fallback}
        </div>
      </TooltipTrigger>
      <TooltipContent
        className="bg-black text-brand p-4 max-w-sm border border-brand/20 z-[9999]"
        sideOffset={5}
        collisionPadding={20}
        avoidCollisions={true}
      >
        <div className="flex flex-col gap-3">
          {tokenUri.image && (
            <div className="flex items-center justify-center bg-black/50 rounded-md p-2">
              <img
                src={tokenUri.image}
                alt={tokenUri.name || `${symbol} #${tokenId}`}
                className="w-full h-auto max-w-[280px] max-h-[280px] object-contain rounded-md"
              />
            </div>
          )}
          <div className="text-sm space-y-2">
            <p className="font-brand text-base">
              {tokenUri.name || `${symbol} #${tokenId}`}
            </p>
            {tokenUri.description && (
              <p className="text-xs text-brand-muted leading-relaxed max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                {tokenUri.description}
              </p>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );

  return tooltipContent;
};

export default NftPreview;
