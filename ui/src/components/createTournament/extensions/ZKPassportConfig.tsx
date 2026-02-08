import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { ZKPASSPORT } from "@/components/Icons";
import { useDojo } from "@/context/dojo";
import { getExtensionAddresses } from "@/lib/extensionConfig";
import {
  ZKPASSPORT_SERVICE_SCOPE,
  ZKPASSPORT_SERVICE_SUBSCOPE,
  ZKPASSPORT_NULLIFIER_TYPE,
  ZKPASSPORT_DEFAULT_MAX_PROOF_AGE,
  ZKPASSPORT_VERIFIER_ADDRESSES,
} from "@/lib/zkpassport/constants";
import { ZKPASSPORT_TEMPLATES } from "@/lib/zkpassport/templates";

interface ZKPassportConfigProps {
  extensionError?: string;
}

export const ZKPassportConfig = ({
  extensionError,
}: ZKPassportConfigProps) => {
  const { selectedChainConfig } = useDojo();
  const form = useFormContext();

  const [selectedTemplate, setSelectedTemplate] = useState<string>("age_18_plus");
  const [customCommitment, setCustomCommitment] = useState("");
  const [maxProofAge, setMaxProofAge] = useState(
    ZKPASSPORT_DEFAULT_MAX_PROOF_AGE.toString()
  );

  // Filter out the "custom" template for the preset buttons
  const presetTemplates = ZKPASSPORT_TEMPLATES.filter(
    (t) => t.id !== "custom"
  );

  const updateFormConfig = (
    templateId: string,
    commitment: string,
    proofAge: string
  ) => {
    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    const validatorAddress = extensionAddresses.zkPassportValidator;

    if (!validatorAddress) {
      return;
    }

    // Find the template
    const template = ZKPASSPORT_TEMPLATES.find((t) => t.id === templateId);
    const paramCommitment =
      templateId === "custom" ? commitment : template?.paramCommitment || "0x0";
    const maxAge = proofAge || ZKPASSPORT_DEFAULT_MAX_PROOF_AGE.toString();

    // Config format: verifier_address,scope,subscope,commitment,maxProofAge,nullifierType
    const verifierAddress =
      ZKPASSPORT_VERIFIER_ADDRESSES[selectedChainConfig?.chainId ?? ""] ?? "0x0";
    const configArray = [
      verifierAddress,
      ZKPASSPORT_SERVICE_SCOPE,
      ZKPASSPORT_SERVICE_SUBSCOPE,
      paramCommitment,
      maxAge,
      ZKPASSPORT_NULLIFIER_TYPE,
    ];

    const config = configArray.join(",");
    form.setValue("gatingOptions.extension.config", config);
    form.setValue("gatingOptions.extension.address", validatorAddress);
  };

  // Parse config from form on mount to restore state
  useEffect(() => {
    const config = form.watch("gatingOptions.extension.config");
    if (!config) return;

    const parts = config.split(",");
    if (parts.length >= 6) {
      // Config: [verifier_address, scope, subscope, commitment, maxProofAge, nullifierType]
      const commitment = parts[3];
      const proofAge = parts[4];

      // Try to match a preset template
      const matchedTemplate = ZKPASSPORT_TEMPLATES.find(
        (t) => t.id !== "custom" && t.paramCommitment === commitment
      );

      if (matchedTemplate) {
        setSelectedTemplate(matchedTemplate.id);
      } else {
        setSelectedTemplate("custom");
        setCustomCommitment(commitment);
      }

      setMaxProofAge(proofAge);
    }
  }, []); // Only on mount

  // Update form when template selection changes
  useEffect(() => {
    updateFormConfig(selectedTemplate, customCommitment, maxProofAge);
  }, [selectedTemplate, customCommitment, maxProofAge, selectedChainConfig?.chainId]);

  return (
    <div className="space-y-4">
      <FormItem>
        <div className="flex flex-row items-center gap-3">
          <span className="w-6 h-6 text-brand">
            <ZKPASSPORT />
          </span>
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            ZK Passport
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Gate entry with zero-knowledge passport verification
          </FormDescription>
        </div>
        {extensionError && (
          <div className="flex flex-row items-center gap-2">
            <span className="text-red-500 text-sm">{extensionError}</span>
          </div>
        )}
      </FormItem>

      {/* Template Selection */}
      <FormItem>
        <FormLabel>Requirement Template</FormLabel>
        <FormControl>
          <div className="flex flex-wrap gap-2">
            {presetTemplates.map((template) => (
              <Button
                key={template.id}
                type="button"
                variant={
                  selectedTemplate === template.id ? "default" : "outline"
                }
                onClick={() => setSelectedTemplate(template.id)}
              >
                {template.name}
              </Button>
            ))}
            <Button
              type="button"
              variant={selectedTemplate === "custom" ? "default" : "outline"}
              onClick={() => setSelectedTemplate("custom")}
            >
              Custom
            </Button>
          </div>
        </FormControl>
        <FormDescription className="text-xs">
          {ZKPASSPORT_TEMPLATES.find((t) => t.id === selectedTemplate)
            ?.description || "Select a requirement template"}
        </FormDescription>
      </FormItem>

      {/* Custom Commitment Input */}
      {selectedTemplate === "custom" && (
        <FormItem>
          <FormLabel>Param Commitment</FormLabel>
          <FormControl>
            <Input
              placeholder="0x..."
              value={customCommitment}
              onChange={(e) => setCustomCommitment(e.target.value)}
            />
          </FormControl>
          <FormDescription className="text-xs">
            The Poseidon2 hash of the requirement parameters (hex)
          </FormDescription>
        </FormItem>
      )}

      {/* Max Proof Age */}
      <FormItem>
        <FormLabel>Max Proof Age (seconds)</FormLabel>
        <FormControl>
          <Input
            type="number"
            min="60"
            placeholder={ZKPASSPORT_DEFAULT_MAX_PROOF_AGE.toString()}
            value={maxProofAge}
            onChange={(e) => setMaxProofAge(e.target.value)}
          />
        </FormControl>
        <FormDescription className="text-xs">
          Maximum age of the ZK proof in seconds (default: 3600 = 1 hour)
        </FormDescription>
      </FormItem>
    </div>
  );
};
