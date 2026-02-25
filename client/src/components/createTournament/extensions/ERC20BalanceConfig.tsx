import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import TokenDialog from "@/components/dialogs/Token";
import { FormToken } from "@/lib/types";
import { getTokenByAddress } from "@/lib/tokenUtils";
import { indexAddress } from "@/lib/utils";
import { useDojo } from "@/context/dojo";
import { getExtensionAddresses } from "@/lib/extensionConfig";

interface ERC20BalanceConfigProps {
  extensionError?: string;
}

export const ERC20BalanceConfig = ({
  extensionError,
}: ERC20BalanceConfigProps) => {
  const { selectedChainConfig } = useDojo();
  const form = useFormContext();

  // Local state for managing the config values
  const [erc20Token, setErc20Token] = useState<FormToken | undefined>();
  const [minThreshold, setMinThreshold] = useState("");
  const [maxThreshold, setMaxThreshold] = useState("");
  const [valuePerEntry, setValuePerEntry] = useState("");
  const [maxEntries, setMaxEntries] = useState("");

  // Calculate USD value for display
  // Note: Price data not currently available, returns "0"
  const calculateUSDValue = (_weiAmount: string): string => {
    return "0";
  };

  // Update form config whenever local state changes
  const updateFormConfig = (
    token: FormToken | undefined,
    minThresh: string,
    maxThresh: string,
    valPerEntry: string,
    maxEntr: string
  ) => {
    if (!token) {
      form.setValue("gatingOptions.extension.config", "");
      form.setValue("gatingOptions.extension.address", "");
      return;
    }

    const tokenAddress = indexAddress(token.address);
    const minThreshValue = minThresh && minThresh !== "" ? minThresh : "0";
    const maxThreshValue = maxThresh && maxThresh !== "" ? maxThresh : "0";
    const valPerEntryValue =
      valPerEntry && valPerEntry !== "" ? valPerEntry : "0";
    const maxEntrValue = maxEntr && maxEntr !== "" ? maxEntr : "0";

    const configArray = [
      tokenAddress,
      minThreshValue,
      maxThreshValue,
      valPerEntryValue,
      maxEntrValue,
    ];

    const config = configArray.join(",");
    form.setValue("gatingOptions.extension.config", config);

    // Set the ERC20 balance validator address
    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    if (extensionAddresses.erc20BalanceValidator) {
      form.setValue(
        "gatingOptions.extension.address",
        extensionAddresses.erc20BalanceValidator
      );
    }
  };

  // Parse config from form on mount and when it changes externally
  useEffect(() => {
    const config = form.watch("gatingOptions.extension.config");
    if (!config) return;

    const configParts = config.split(",");
    if (configParts.length >= 5) {
      // Extract values
      const tokenAddress = configParts[0];
      const minThresh = configParts[1];
      const maxThresh = configParts[2];
      const valPerEntry = configParts[3];
      const maxEntr = configParts[4];

      // Get token details
      const token = getTokenByAddress(
        tokenAddress,
        selectedChainConfig?.chainId ?? ""
      );
      if (token) {
        setErc20Token({
          address: token.token_address,
          name: token.name,
          symbol: token.symbol,
          token_type: token.token_type,
        });
      }

      setMinThreshold(minThresh);
      setMaxThreshold(maxThresh);
      setValuePerEntry(valPerEntry);
      setMaxEntries(maxEntr);
    }
  }, []); // Only on mount to restore from saved config

  return (
    <div className="space-y-4">
      <FormItem>
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            ERC20 Token
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Select the ERC20 token for balance validation
          </FormDescription>
        </div>
        {extensionError && (
          <div className="flex flex-row items-center gap-2">
            <span className="text-red-500 text-sm">{extensionError}</span>
          </div>
        )}
        <FormControl>
          <TokenDialog
            selectedToken={erc20Token}
            onSelect={(token) => {
              setErc20Token(token);
              updateFormConfig(
                token,
                minThreshold,
                maxThreshold,
                valuePerEntry,
                maxEntries
              );
            }}
            type="erc20"
          />
        </FormControl>
      </FormItem>

      <div className="grid grid-cols-2 gap-4">
        <FormItem>
          <FormLabel>Minimum Balance Threshold</FormLabel>
          <FormControl>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={minThreshold}
              onChange={(e) => {
                const value = e.target.value;
                setMinThreshold(value);
                updateFormConfig(
                  erc20Token,
                  value,
                  maxThreshold,
                  valuePerEntry,
                  maxEntries
                );
              }}
            />
          </FormControl>
          <FormDescription className="text-xs flex flex-col gap-1">
            <span>Minimum token balance required (in wei)</span>
            {minThreshold && erc20Token && (
              <span className="text-neutral">
                ≈ ${calculateUSDValue(minThreshold)}
              </span>
            )}
          </FormDescription>
        </FormItem>

        <FormItem>
          <FormLabel>Maximum Balance Threshold</FormLabel>
          <FormControl>
            <Input
              type="number"
              min="0"
              placeholder="0 (no max)"
              value={maxThreshold}
              onChange={(e) => {
                const value = e.target.value;
                setMaxThreshold(value);
                updateFormConfig(
                  erc20Token,
                  minThreshold,
                  value,
                  valuePerEntry,
                  maxEntries
                );
              }}
            />
          </FormControl>
          <FormDescription className="text-xs flex flex-col gap-1">
            <span>
              Maximum token balance allowed (in wei, 0 for unlimited)
            </span>
            {maxThreshold && maxThreshold !== "0" && erc20Token && (
              <span className="text-neutral">
                ≈ ${calculateUSDValue(maxThreshold)}
              </span>
            )}
          </FormDescription>
        </FormItem>

        <FormItem>
          <FormLabel>Value Per Entry</FormLabel>
          <FormControl>
            <Input
              type="number"
              min="0"
              placeholder="0 (no cost per entry)"
              value={valuePerEntry}
              onChange={(e) => {
                const value = e.target.value;
                setValuePerEntry(value);
                updateFormConfig(
                  erc20Token,
                  minThreshold,
                  maxThreshold,
                  value,
                  maxEntries
                );
              }}
            />
          </FormControl>
          <FormDescription className="text-xs flex flex-col gap-1">
            <span>
              Token amount consumed per entry (in wei, 0 for no consumption)
            </span>
            {valuePerEntry && valuePerEntry !== "0" && erc20Token && (
              <span className="text-neutral">
                ≈ ${calculateUSDValue(valuePerEntry)}
              </span>
            )}
          </FormDescription>
        </FormItem>

        <FormItem>
          <FormLabel>Max Entries</FormLabel>
          <FormControl>
            <Input
              type="number"
              min="0"
              placeholder="0 (unlimited)"
              value={maxEntries}
              onChange={(e) => {
                const value = e.target.value;
                setMaxEntries(value);
                updateFormConfig(
                  erc20Token,
                  minThreshold,
                  maxThreshold,
                  valuePerEntry,
                  value
                );
              }}
            />
          </FormControl>
          <FormDescription className="text-xs">
            Maximum number of entries allowed (0 for unlimited based on balance)
          </FormDescription>
        </FormItem>
      </div>
    </div>
  );
};
