import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { useChainConfig } from "@/context/chain";
import { getExtensionAddresses } from "@provable-games/metagame-sdk";

interface GovernanceConfigProps {
  extensionError?: string;
}

export const GovernanceConfig = ({
  extensionError,
}: GovernanceConfigProps) => {
  const { selectedChainConfig } = useChainConfig();
  const form = useFormContext();

  // Set the governance validator address on mount
  useEffect(() => {
    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    if (extensionAddresses.governanceValidator) {
      form.setValue(
        "gatingOptions.extension.address",
        extensionAddresses.governanceValidator
      );
    }
    // Config is set by the contract owner — no user input needed
    form.setValue("gatingOptions.extension.config", "");
  }, [selectedChainConfig?.chainId]);

  return (
    <FormItem>
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            Governance
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Requires governance participation or token balance to enter
          </FormDescription>
        </div>
        {extensionError && (
          <span className="text-red-500 text-sm">{extensionError}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        No additional configuration needed. The governance validator contract checks token balance, voting participation, and proposal activity on-chain.
      </p>
    </FormItem>
  );
};
