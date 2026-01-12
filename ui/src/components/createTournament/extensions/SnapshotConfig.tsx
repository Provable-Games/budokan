import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { useDojo } from "@/context/dojo";
import { getExtensionAddresses } from "@/lib/extensionConfig";

interface SnapshotConfigProps {
  extensionError?: string;
}

export const SnapshotConfig = ({
  extensionError,
}: SnapshotConfigProps) => {
  const { selectedChainConfig } = useDojo();
  const form = useFormContext();

  // Local state for managing the config value
  const [snapshotId, setSnapshotId] = useState("");

  // Update form config whenever local state changes
  const updateFormConfig = (id: string) => {
    form.setValue("gatingOptions.extension.config", id);

    // Set the Snapshot validator address
    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    if (extensionAddresses.snapshotValidator) {
      form.setValue(
        "gatingOptions.extension.address",
        extensionAddresses.snapshotValidator
      );
    }
  };

  // Parse config from form on mount and when it changes externally
  useEffect(() => {
    const config = form.watch("gatingOptions.extension.config");
    if (config) {
      setSnapshotId(config);
    }
  }, []); // Only on mount to restore from saved config

  return (
    <FormItem>
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            Snapshot ID
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Enter the Snapshot space ID for validation
          </FormDescription>
        </div>
        {extensionError && (
          <div className="flex flex-row items-center gap-2">
            <span className="text-red-500 text-sm">{extensionError}</span>
          </div>
        )}
      </div>
      <FormControl>
        <Input
          placeholder="e.g., 1"
          value={snapshotId}
          onChange={(e) => {
            const value = e.target.value.trim();
            setSnapshotId(value);
            updateFormConfig(value);
          }}
          className="font-mono"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  );
};
