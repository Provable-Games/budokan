import { TokenUri } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NftDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenUri: TokenUri | null;
  tokenId: bigint;
  symbol: string;
}

export const NftDetailsDialog = ({
  open,
  onOpenChange,
  tokenUri,
  tokenId,
  symbol,
}: NftDetailsDialogProps) => {
  if (!tokenUri) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tokenUri.name || `${symbol} #${tokenId}`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {tokenUri.image && (
            <div className="flex items-center justify-center bg-black/50 rounded-md p-4">
              <img
                src={tokenUri.image}
                alt={tokenUri.name || `${symbol} #${tokenId}`}
                className="w-full h-auto max-w-full max-h-[400px] object-contain rounded-md"
              />
            </div>
          )}
          {tokenUri.description && (
            <div className="text-sm space-y-2">
              <p className="text-xs text-brand-muted leading-relaxed">
                {tokenUri.description}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
