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
  | "validating"
  | "ready"
  | "error";

interface ZKPassportEntryProps {
  template: ZKPassportTemplate | undefined;
  onProofReady: (qualification: string[]) => void;
  onError: (error: string) => void;
  chainId?: string;
  provider?: {
    callContract: (call: {
      contractAddress: string;
      entrypoint: string;
      calldata: string[];
    }) => Promise<string[]>;
  };
  verifierAddress?: string;
}

/** Timeout in ms after onRequestReceived with no result/error */
const PROOF_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
/** Interval in ms to poll bridge connection status */
const BRIDGE_POLL_INTERVAL_MS = 3000;

export function ZKPassportEntry({
  template,
  onProofReady,
  onError,
  chainId,
  provider,
  verifierAddress,
}: ZKPassportEntryProps) {
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [proofProgress, setProofProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef(false);
  const collectedProofsRef = useRef<CollectedProof[]>([]);
  const bridgePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (bridgePollRef.current) clearInterval(bridgePollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleError = useCallback(
    (msg: string) => {
      if (abortRef.current) return;
      if (bridgePollRef.current) {
        clearInterval(bridgePollRef.current);
        bridgePollRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setErrorMessage(msg);
      setStatus("error");
      onError(msg);
    },
    [onError],
  );

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

    // Clean up any previous polling/timeouts
    if (bridgePollRef.current) clearInterval(bridgePollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Catch unhandled rejections from the SDK's unawaited promises
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error("[ZKPassport] Unhandled promise rejection:", event.reason);
      handleError(
        event.reason instanceof Error
          ? event.reason.message
          : "Unexpected error during verification",
      );
    };
    window.addEventListener("unhandledrejection", rejectionHandler);

    try {
      // Lazy-load ZKPassport SDK
      const { ZKPassport } = await import("@zkpassport/sdk");

      const zkpassport = new ZKPassport(ZKPASSPORT_SDK_DOMAIN);

      // Create the verification request
      const queryBuilder = await zkpassport.request({
        name: "Budokan Tournament",
        logo: "https://zkpassport.id/logo.png",
        purpose: template.description,
        scope: ZKPASSPORT_SDK_DOMAIN,
        // Keep proof layout compatible with current Garaga calldata generation.
        mode: "fast",
      });

      // Apply the template's query
      const configuredBuilder = template.buildQuery(queryBuilder);

      // Finalize and get callbacks
      const result = configuredBuilder.done();

      setQrUrl(result.url);

      result.onBridgeConnect(() => {
        console.log("[ZKPassport] Bridge connected");
      });

      result.onRequestReceived(() => {
        if (!abortRef.current) {
          setStatus("generating_proof");

          // Start bridge connection monitoring
          bridgePollRef.current = setInterval(() => {
            if (!result.isBridgeConnected()) {
              handleError("Connection to ZKPassport app was lost. Please try again.");
            }
          }, BRIDGE_POLL_INTERVAL_MS);

          // Start timeout
          timeoutRef.current = setTimeout(() => {
            handleError(
              "Verification timed out. The ZKPassport app may have encountered an error. Please try again.",
            );
          }, PROOF_TIMEOUT_MS);
        }
      });

      result.onGeneratingProof(() => {
        console.log("[ZKPassport] Generating proof on mobile");
      });

      result.onProofGenerated((proof: { proof?: string; name?: string; version?: string; total?: number }) => {
        if (!abortRef.current) {
          if (proof.proof && proof.name) {
            collectedProofsRef.current.push({
              proof: proof.proof,
              name: proof.name,
              version: proof.version,
            });
            console.log("[ZKPassport] Proof generated:", {
              name: proof.name,
              version: proof.version,
              proofHexLength: proof.proof.length,
              collectedCount: collectedProofsRef.current.length,
            });
          }
          setProofProgress((prev) => ({
            current: prev.current + 1,
            total: Math.max(prev.total, proof.total ?? prev.current + 1),
          }));
        }
      });

      result.onResult(async (response: { uniqueIdentifier?: string; verified?: boolean }) => {
        // Clear monitoring
        if (bridgePollRef.current) {
          clearInterval(bridgePollRef.current);
          bridgePollRef.current = null;
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        if (abortRef.current) return;

        console.log("[ZKPassport] Result received:", {
          verified: response?.verified,
          hasUniqueIdentifier: Boolean(response?.uniqueIdentifier),
          proofCount: collectedProofsRef.current.length,
          proofNames: collectedProofsRef.current.map((p) => p.name),
        });

        // Prefer uniqueIdentifier directly from SDK result, then fallback to proof parsing.
        let identifier: string | undefined = response?.uniqueIdentifier;
        if (!identifier && collectedProofsRef.current.length > 0) {
          try {
            const { extractNullifierFromProof } = await import(
              "@/lib/zkpassport/proofConverter"
            );
            identifier = await extractNullifierFromProof(collectedProofsRef.current);
          } catch (err) {
            console.error("[ZKPassport] Failed to extract nullifier:", err);
          }
        }

        if (!identifier) {
          handleError("Verification failed: could not determine unique identifier");
          return;
        }

        if (collectedProofsRef.current.length === 0) {
          handleError(
            "Verification result received but no proofs were returned by the SDK. Please try again.",
          );
          return;
        }

        setStatus("converting");

        try {
          const { buildQualification, verifyProofViaRPC } = await import(
            "@/lib/zkpassport/proofConverter"
          );

          const qualification = await buildQualification(
            collectedProofsRef.current,
            identifier,
          );

          if (abortRef.current) return;

          // Validate via RPC if provider and verifier address are available
          if (provider && verifierAddress) {
            setStatus("validating");
            try {
              // The garaga calldata is everything after nullifier_low and nullifier_high
              const garagaCalldata = qualification.slice(2);
              const rpcResult = await verifyProofViaRPC(
                garagaCalldata,
                verifierAddress,
                provider,
              );

              if (!rpcResult.valid) {
                handleError("On-chain proof validation failed. Please try again.");
                return;
              }
              console.log("[ZKPassport] RPC validation passed");
            } catch (err) {
              console.error("[ZKPassport] RPC validation error:", err);
              // Continue anyway — the on-chain tx will validate
            }
          }

          if (!abortRef.current) {
            setStatus("ready");
            onProofReady(qualification);
          }
        } catch (err) {
          console.error("[ZKPassport] Proof conversion error:", err);
          if (!abortRef.current) {
            const msg =
              err instanceof Error ? err.message : "Proof conversion failed";
            handleError(msg);
          }
        }
      });

      result.onReject(() => {
        if (!abortRef.current) {
          handleError("User rejected the verification request");
        }
      });

      result.onError((error: string) => {
        console.error("[ZKPassport] SDK error:", error);
        if (!abortRef.current) {
          handleError(error || "An error occurred during verification");
        }
      });
    } catch (err) {
      console.error("[ZKPassport] Initialization error:", err);
      if (!abortRef.current) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to initialize ZKPassport";
        handleError(msg);
      }
    }

    // Cleanup rejection listener when the flow completes or component re-renders
    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, [template, onProofReady, onError, chainId, handleError, provider, verifierAddress]);

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

      case "validating":
        return (
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner />
            <span className="text-sm">
              Validating proof on-chain...
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
