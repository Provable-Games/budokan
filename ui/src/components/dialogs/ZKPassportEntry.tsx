import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ZKPASSPORT } from "@/components/Icons";
import { CHECK, X, REFRESH } from "@/components/Icons";
import { LoadingSpinner } from "@/components/ui/spinner";
import { ZKPASSPORT_SDK_DOMAIN } from "@/lib/zkpassport/constants";
import type { ZKPassportTemplate } from "@/lib/zkpassport/templates";
import type { CollectedProof } from "@/lib/zkpassport/proofConverter";

type VerificationStatus =
  | "idle"
  | "waiting_scan"
  | "generating_proof"
  | "converting"
  | "ready"
  | "error";

interface ZKPassportEntryProps {
  template: ZKPassportTemplate | undefined;
  onProofReady: (qualification: string[]) => void;
  onError: (error: string) => void;
}

export function ZKPassportEntry({
  template,
  onProofReady,
  onError,
}: ZKPassportEntryProps) {
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [proofProgress, setProofProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef(false);
  const collectedProofsRef = useRef<CollectedProof[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const startVerification = useCallback(async () => {
    if (!template) {
      setErrorMessage("No requirement template found");
      setStatus("error");
      return;
    }

    abortRef.current = false;
    collectedProofsRef.current = [];
    setStatus("waiting_scan");
    setErrorMessage("");
    setProofProgress({ current: 0, total: 0 });

    try {
      // Lazy-load ZKPassport SDK
      const { ZKPassport } = await import("@zkpassport/sdk");

      const zkpassport = new ZKPassport(ZKPASSPORT_SDK_DOMAIN);

      // Create the verification request
      const queryBuilder = await zkpassport.request({
        name: "Budokan Tournament",
        logo: "https://zkpassport.id/logo.png",
        purpose: template.description,
      });

      // Apply the template's query
      const configuredBuilder = template.buildQuery(queryBuilder);

      // Finalize and get callbacks
      const result = configuredBuilder.done();

      setQrUrl(result.url);

      // Wire up callbacks
      result.onRequestReceived(() => {
        if (!abortRef.current) {
          setStatus("generating_proof");
        }
      });

      result.onProofGenerated((proof: { proof?: string; name?: string; version?: string; total?: number }) => {
        if (!abortRef.current) {
          // Collect proof data for later conversion
          if (proof.proof && proof.name) {
            collectedProofsRef.current.push({
              proof: proof.proof,
              name: proof.name,
              version: proof.version,
            });
          }
          setProofProgress((prev) => ({
            current: prev.current + 1,
            total: Math.max(prev.total, proof.total ?? prev.current + 1),
          }));
        }
      });

      result.onResult(async (response: { uniqueIdentifier: string | undefined; verified: boolean }) => {
        if (abortRef.current) return;

        if (!response.verified || !response.uniqueIdentifier) {
          setErrorMessage("Verification failed: proofs could not be verified");
          setStatus("error");
          onError("Verification failed");
          return;
        }

        setStatus("converting");

        try {
          // Lazy-load proof converter
          const { buildQualification } = await import(
            "@/lib/zkpassport/proofConverter"
          );

          const qualification = await buildQualification(
            collectedProofsRef.current,
            response.uniqueIdentifier
          );

          if (!abortRef.current) {
            setStatus("ready");
            onProofReady(qualification);
          }
        } catch (err) {
          if (!abortRef.current) {
            const msg =
              err instanceof Error ? err.message : "Proof conversion failed";
            setErrorMessage(msg);
            setStatus("error");
            onError(msg);
          }
        }
      });

      result.onReject(() => {
        if (!abortRef.current) {
          setErrorMessage("User rejected the verification request");
          setStatus("error");
          onError("User rejected");
        }
      });

      result.onError((error: string) => {
        if (!abortRef.current) {
          setErrorMessage(error || "An error occurred during verification");
          setStatus("error");
          onError(error);
        }
      });
    } catch (err) {
      if (!abortRef.current) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to initialize ZKPassport";
        setErrorMessage(msg);
        setStatus("error");
        onError(msg);
      }
    }
  }, [template, onProofReady, onError]);

  const renderContent = () => {
    switch (status) {
      case "idle":
        return (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={startVerification}
          >
            <span className="w-5 h-5 mr-2">
              <ZKPASSPORT />
            </span>
            Verify with ZK Passport
          </Button>
        );

      case "waiting_scan":
        return (
          <div className="flex flex-col items-center gap-3">
            {qrUrl && (
              <div className="bg-white p-3 rounded-lg">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                  alt="Scan with ZKPassport"
                  className="w-48 h-48"
                />
              </div>
            )}
            <span className="text-sm text-muted-foreground">
              Scan with ZKPassport app
            </span>
          </div>
        );

      case "generating_proof":
        return (
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner />
            <span className="text-sm">
              Generating proof...
              {proofProgress.current > 0 &&
                ` (${proofProgress.current} proofs generated)`}
            </span>
          </div>
        );

      case "converting":
        return (
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner />
            <span className="text-sm">
              Converting for Starknet...
            </span>
          </div>
        );

      case "ready":
        return (
          <div className="flex flex-row items-center gap-2">
            <span className="w-5 text-green-500">
              <CHECK />
            </span>
            <span>Identity verified</span>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-row items-center gap-2">
              <span className="w-5 text-red-500">
                <X />
              </span>
              <span className="text-sm text-red-500">{errorMessage}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startVerification}
            >
              <span className="w-4 h-4 mr-1">
                <REFRESH />
              </span>
              Retry
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 border border-brand-muted rounded-md">
      <div className="flex flex-row items-center gap-2 mb-1">
        <span className="w-5 h-5 text-brand">
          <ZKPASSPORT />
        </span>
        <span className="font-medium text-sm">ZK Passport Verification</span>
      </div>
      {template && (
        <span className="text-xs text-muted-foreground mb-2">
          Requirement: {template.description}
        </span>
      )}
      {renderContent()}
    </div>
  );
}
