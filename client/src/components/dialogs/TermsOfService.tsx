import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface TermsOfServiceModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const TermsOfServiceModal = ({
  open,
  onAccept,
  onDecline,
}: TermsOfServiceModalProps) => {
  const [hasAgreed, setHasAgreed] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onDecline();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-neutral">
          Welcome to Budokan! Before you continue, please review and accept our
          Terms of Service.
        </p>

        <div className="overflow-y-auto flex-1 pr-2 text-sm text-neutral space-y-4 max-h-[50vh] border border-brand-muted rounded-md p-4">
          <section>
            <h3 className="text-brand font-semibold mb-1">
              1. Acceptance of Terms
            </h3>
            <p>
              By accessing and using Budokan, you agree to be bound by these
              Terms of Service. If you do not agree, please disconnect your
              wallet.
            </p>
          </section>

          <section>
            <h3 className="text-brand font-semibold mb-1">2. Eligibility</h3>
            <p>
              You must be at least 18 years old and have the legal capacity to
              enter into these terms. You are responsible for ensuring
              compliance with all applicable laws in your jurisdiction.
            </p>
          </section>

          <section>
            <h3 className="text-brand font-semibold mb-1">3. Risks</h3>
            <p>
              Participating in on-chain tournaments involves significant risk.
              Token values can be volatile and you may lose some or all of your
              investment. You acknowledge that you understand these risks and
              accept full responsibility for your decisions.
            </p>
          </section>

          <section>
            <h3 className="text-brand font-semibold mb-1">
              4. No Financial Advice
            </h3>
            <p>
              Nothing on this platform constitutes financial, investment, or
              trading advice. Always do your own research before making any
              decisions.
            </p>
          </section>

          <section>
            <h3 className="text-brand font-semibold mb-1">
              5. Smart Contract Risks
            </h3>
            <p>
              Budokan operates through smart contracts on Starknet. While we
              strive for security, smart contracts may contain bugs or
              vulnerabilities. Use at your own risk.
            </p>
          </section>

          <section>
            <h3 className="text-brand font-semibold mb-1">6. Privacy</h3>
            <p>
              Your wallet address and transaction history are publicly visible
              on the blockchain. We do not collect additional personal
              information beyond what is necessary to provide our services.
            </p>
          </section>

          <section>
            <h3 className="text-brand font-semibold mb-1">7. Modifications</h3>
            <p>
              We reserve the right to modify these terms at any time. Continued
              use of the platform after changes constitutes acceptance of the
              new terms.
            </p>
          </section>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Checkbox
            id="tos-agree"
            checked={hasAgreed}
            onCheckedChange={(checked) => setHasAgreed(checked === true)}
          />
          <label
            htmlFor="tos-agree"
            className="text-sm cursor-pointer select-none"
          >
            I have read and agree to the Terms of Service
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDecline}>
            Decline
          </Button>
          <Button disabled={!hasAgreed} onClick={onAccept}>
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TermsOfServiceModal;
