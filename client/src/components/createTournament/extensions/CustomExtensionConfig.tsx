import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { getChecksumAddress, validateChecksumAddress } from "starknet";

interface CustomExtensionConfigProps {
  extensionError?: string;
  onExtensionErrorChange: (error: string) => void;
}

export const CustomExtensionConfig = ({
  extensionError,
  onExtensionErrorChange,
}: CustomExtensionConfigProps) => {
  const form = useFormContext();

  // Local state for managing the config values
  const [address, setAddress] = useState("");
  const [config, setConfig] = useState("");

  // Parse values from form on mount
  useEffect(() => {
    const formAddress = form.watch("gatingOptions.extension.address");
    const formConfig = form.watch("gatingOptions.extension.config");

    if (formAddress) {
      setAddress(formAddress);
    }
    if (formConfig) {
      setConfig(formConfig);
    }
  }, []); // Only on mount to restore from saved values

  const handleAddressBlur = () => {
    const rawAddress = address?.trim();

    if (!rawAddress) {
      onExtensionErrorChange("");
      return;
    }

    try {
      // Try to convert to checksum address
      const checksumAddr = getChecksumAddress(rawAddress);

      // Validate the checksum address
      if (!validateChecksumAddress(checksumAddr)) {
        onExtensionErrorChange("Invalid contract address");
        return;
      }

      // Update with checksum address
      setAddress(checksumAddr);
      form.setValue("gatingOptions.extension.address", checksumAddr);
      onExtensionErrorChange("");
    } catch (e) {
      onExtensionErrorChange("Invalid contract address format");
    }
  };

  return (
    <>
      <FormItem>
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-row items-center gap-5">
            <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
              Extension Contract
            </FormLabel>
            <FormDescription className="hidden sm:block">
              Enter the contract address that will validate entries
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
            placeholder="0x..."
            value={address}
            onChange={(e) => {
              const rawAddress = e.target.value.trim();

              // Clear error when field is empty
              if (!rawAddress) {
                onExtensionErrorChange("");
                setAddress("");
                form.setValue("gatingOptions.extension.address", "");
                return;
              }

              // Set the raw value immediately for user feedback
              setAddress(rawAddress);
            }}
            onBlur={handleAddressBlur}
            className="font-mono"
          />
        </FormControl>
        <FormMessage />
      </FormItem>

      <FormItem>
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            Extension Config
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Optional configuration values (comma-separated felt252 values)
          </FormDescription>
        </div>
        <FormControl>
          <Textarea
            placeholder="Enter configuration values separated by commas (optional)"
            value={config || ""}
            onChange={(e) => {
              const value = e.target.value;
              setConfig(value);
              form.setValue("gatingOptions.extension.config", value);
            }}
            className="font-mono h-20"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </>
  );
};
