import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GeoBlockedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GeoBlockedDialog = ({ open, onOpenChange }: GeoBlockedDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Not Available in Your Region</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-neutral">
          Financial features such as entering paid tournaments, claiming prizes,
          and creating tournaments are not available in your region due to
          regulatory restrictions. You can still browse tournaments and view
          results.
        </p>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GeoBlockedDialog;
