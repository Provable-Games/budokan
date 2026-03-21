import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { useChainConfig } from "@/context/chain";
import { getExtensionAddresses } from "@provable-games/metagame-sdk";

interface ZkPassportConfigProps {
  extensionError?: string;
}

export const ZkPassportConfig = ({
  extensionError,
}: ZkPassportConfigProps) => {
  const { selectedChainConfig } = useChainConfig();
  const form = useFormContext();

  // Set the ZK Passport validator address on mount
  useEffect(() => {
    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    if (extensionAddresses.zkPassportValidator) {
      form.setValue(
        "gatingOptions.extension.address",
        extensionAddresses.zkPassportValidator
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
            ZK Passport
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Requires a valid zero-knowledge passport proof to enter
          </FormDescription>
        </div>
        {extensionError && (
          <span className="text-red-500 text-sm">{extensionError}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        No additional configuration needed. Players will need to provide a valid ZK passport proof when entering.
      </p>
    </FormItem>
  );
};
