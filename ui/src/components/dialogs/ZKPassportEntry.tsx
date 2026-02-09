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
  chainId?: string;
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
      // Intercept WebSocket to log all bridge traffic for diagnostics.
      // This runs BEFORE the SDK creates its connection.
      const OriginalWebSocket = window.WebSocket;
      const WebSocketProxy = new Proxy(OriginalWebSocket, {
        construct(target, args) {
          const ws = new target(...(args as [string, ...string[]]));
          const url = args[0] as string;
          console.log("[ZKPassport WS] Opening:", url);

          ws.addEventListener("open", () => {
            console.log("[ZKPassport WS] Connected");
          });
          ws.addEventListener("message", (event: MessageEvent) => {
            const data = typeof event.data === "string" ? event.data : "<binary>";
            const preview = data.length > 200 ? data.slice(0, 200) + "..." : data;
            console.log("[ZKPassport WS] Received:", preview);
          });
          ws.addEventListener("close", (event: CloseEvent) => {
            console.log("[ZKPassport WS] Closed:", event.code, event.reason);
          });
          ws.addEventListener("error", () => {
            console.error("[ZKPassport WS] Error event");
          });

          return ws;
        },
      });
      window.WebSocket = WebSocketProxy as typeof WebSocket;

      // Lazy-load ZKPassport SDK
      const { ZKPassport } = await import("@zkpassport/sdk");

      console.log("[ZKPassport] Initializing SDK with domain:", ZKPASSPORT_SDK_DOMAIN);
      const zkpassport = new ZKPassport(ZKPASSPORT_SDK_DOMAIN);

      // Create the verification request
      console.log("[ZKPassport] Creating request with template:", template.id, template.description);
      const queryBuilder = await zkpassport.request({
        name: "Budokan Tournament",
        logo: "https://zkpassport.id/logo.png",
        purpose: template.description,
        scope: ZKPASSPORT_SDK_DOMAIN,
        devMode: true,
      });

      // Apply the template's query
      const configuredBuilder = template.buildQuery(queryBuilder);

      // Finalize and get callbacks
      const result = configuredBuilder.done();

      // Restore original WebSocket so other code isn't affected
      window.WebSocket = OriginalWebSocket;

      console.log("[ZKPassport] Request created, URL:", result.url);
      console.log("[ZKPassport] Request ID:", result.requestId);
      setQrUrl(result.url);

      // Wire up ALL callbacks for diagnostic visibility

      result.onBridgeConnect(() => {
        console.log("[ZKPassport] Bridge connected, isBridgeConnected:", result.isBridgeConnected());
      });

      result.onRequestReceived(() => {
        console.log("[ZKPassport] Request received by mobile app, isBridgeConnected:", result.isBridgeConnected());
        if (!abortRef.current) {
          setStatus("generating_proof");

          // Start bridge connection monitoring
          bridgePollRef.current = setInterval(() => {
            const connected = result.isBridgeConnected();
            console.log("[ZKPassport] Bridge poll - connected:", connected);
            if (!connected) {
              console.warn("[ZKPassport] Bridge disconnected during proof generation");
              handleError("Connection to ZKPassport app was lost. Please try again.");
            }
          }, BRIDGE_POLL_INTERVAL_MS);

          // Start timeout - if no result within PROOF_TIMEOUT_MS, show error
          timeoutRef.current = setTimeout(() => {
            console.error("[ZKPassport] Timed out waiting for proof result");
            handleError(
              "Verification timed out. The ZKPassport app may have encountered an error. Please try again.",
            );
          }, PROOF_TIMEOUT_MS);
        }
      });

      result.onGeneratingProof(() => {
        console.log("[ZKPassport] Mobile app started generating proof");
      });

      result.onProofGenerated((proof: { proof?: string; name?: string; version?: string; total?: number }) => {
        console.log("[ZKPassport] Proof generated:", proof.name, "version:", proof.version);
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
        console.log("[ZKPassport] Result received:", {
          verified: response.verified,
          hasIdentifier: !!response.uniqueIdentifier,
          proofsCollected: collectedProofsRef.current.length,
        });

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

        if (!response.verified || !response.uniqueIdentifier) {
          handleError("Verification failed: proofs could not be verified");
          return;
        }

        setStatus("converting");

        try {
          // Lazy-load proof converter
          const { buildQualification } = await import(
            "@/lib/zkpassport/proofConverter"
          );

          console.log("[ZKPassport] Converting proofs for Starknet...");
          const qualification = await buildQualification(
            collectedProofsRef.current,
            response.uniqueIdentifier,
            chainId,
          );

          if (!abortRef.current) {
            console.log("[ZKPassport] Proof conversion complete, qualification length:", qualification.length);
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
        console.log("[ZKPassport] User rejected the verification request");
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
  }, [template, onProofReady, onError, chainId, handleError]);

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
