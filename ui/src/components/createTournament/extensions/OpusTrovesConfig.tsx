import { useState, useMemo, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import TokenDialog from "@/components/dialogs/Token";
import { FormToken } from "@/lib/types";
import { X } from "@/components/Icons";
import { getTokenByAddress } from "@/lib/tokenUtils";
import { indexAddress } from "@/lib/utils";
import { useDojo } from "@/context/dojo";
import { getExtensionAddresses } from "@/lib/extensionConfig";

interface OpusTrovesConfigProps {
  allowedAssetAddresses: string[];
  extensionError?: string;
}

export const OpusTrovesConfig = ({
  allowedAssetAddresses,
  extensionError,
}: OpusTrovesConfigProps) => {
  const { selectedChainConfig } = useDojo();
  const form = useFormContext();

  // Local state for managing the config values
  const [opusTroveAssets, setOpusTroveAssets] = useState<FormToken[]>([]);
  const [opusThreshold, setOpusThreshold] = useState("");
  const [opusThresholdUSD, setOpusThresholdUSD] = useState("");
  const [opusValuePerEntry, setOpusValuePerEntry] = useState("");
  const [opusValuePerEntryUSD, setOpusValuePerEntryUSD] = useState("");
  const [opusMaxEntries, setOpusMaxEntries] = useState("");
  const [opusProportionalMode, setOpusProportionalMode] = useState(false);

  // Get CASH token for display
  const cashToken = useMemo(() => {
    const tokens = getTokenByAddress(
      "0x0498edfaf50ca5855666a700c25dd629d577eb9afccdf3b5977aec79aee55ada",
      selectedChainConfig?.chainId ?? ""
    );
    return tokens;
  }, [selectedChainConfig?.chainId]);

  const CASH_DECIMALS = 18;

  const usdToCashWei = (usd: string): string => {
    if (!usd || usd === "0" || usd === "") return "0";
    const usdNum = parseFloat(usd);
    if (isNaN(usdNum)) return "0";
    const wei = BigInt(Math.floor(usdNum * 10 ** CASH_DECIMALS));
    return wei.toString();
  };

  const cashWeiToUSD = (wei: string): string => {
    if (!wei || wei === "0" || wei === "") return "0";
    try {
      const weiNum = BigInt(wei);
      const usd = Number(weiNum) / 10 ** CASH_DECIMALS;
      return usd.toFixed(2);
    } catch {
      return "0";
    }
  };

  // Update form config whenever local state changes
  const updateFormConfig = (
    assets: FormToken[],
    threshold: string,
    valPerEntry: string,
    maxEntr: string
  ) => {
    const assetCount = assets.length;
    const assetAddresses = assets.map((asset) => indexAddress(asset.address));

    const thresholdValue = threshold && threshold !== "" ? threshold : "0";
    const valPerEntryValue =
      valPerEntry && valPerEntry !== "" ? valPerEntry : "0";
    const maxEntrValue = maxEntr && maxEntr !== "" ? maxEntr : "0";

    const configArray = [
      assetCount.toString(),
      ...assetAddresses,
      thresholdValue,
      valPerEntryValue,
      maxEntrValue,
    ];

    const config = configArray.join(",");
    form.setValue("gatingOptions.extension.config", config);

    // Set the Opus Troves validator address
    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    if (extensionAddresses.opusTrovesValidator) {
      form.setValue(
        "gatingOptions.extension.address",
        extensionAddresses.opusTrovesValidator
      );
    }
  };

  // Parse config from form on mount and when it changes externally
  useEffect(() => {
    const config = form.watch("gatingOptions.extension.config");
    if (!config) return;

    const configParts = config.split(",");
    const assetCount = Number(configParts[0]);

    if (configParts.length >= assetCount + 4) {
      // Extract asset addresses
      const assetAddresses = configParts.slice(1, assetCount + 1);
      const assets = assetAddresses
        .map((addr) => {
          const token = getTokenByAddress(
            addr,
            selectedChainConfig?.chainId ?? ""
          );
          if (token) {
            return {
              address: token.token_address,
              name: token.name,
              symbol: token.symbol,
            } as FormToken;
          }
          return null;
        })
        .filter((t): t is FormToken => t !== null);

      setOpusTroveAssets(assets);

      // Extract threshold, value_per_entry, max_entries
      const threshold = configParts[assetCount + 1];
      const valPerEntry = configParts[assetCount + 2];
      const maxEntr = configParts[assetCount + 3];

      setOpusThreshold(threshold);
      setOpusThresholdUSD(cashWeiToUSD(threshold));
      setOpusValuePerEntry(valPerEntry);
      setOpusValuePerEntryUSD(cashWeiToUSD(valPerEntry));
      setOpusMaxEntries(maxEntr);

      // Set proportional mode if value per entry > 0
      setOpusProportionalMode(valPerEntry !== "0" && valPerEntry !== "");
    }
  }, []); // Only on mount to restore from saved config

  // Import getExtensionAddresses
  const getExtensionAddresses = (chainId: string) => {
    // This should come from @/lib/extensionConfig but we'll import it at the top
    const { getExtensionAddresses: getAddresses } = require("@/lib/extensionConfig");
    return getAddresses(chainId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-row items-center gap-5 flex-1">
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            Opus Troves Configuration
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Configure asset filtering and entry requirements
          </FormDescription>
        </div>
      </div>

      {/* Entry Mode Switch */}
      <div className="border-2 border-brand-muted rounded-lg p-4 bg-black/20">
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <FormLabel className="font-brand text-base">
              Entry Calculation Mode
            </FormLabel>
            <FormDescription className="text-xs">
              {opusProportionalMode
                ? "Proportional - Entries based on CASH borrowed per entry value"
                : "Fixed - Set number of entries for meeting threshold"}
            </FormDescription>
          </div>
          <div className="flex flex-row items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {opusProportionalMode ? "Proportional" : "Fixed"}
            </span>
            <Switch
              checked={opusProportionalMode}
              onCheckedChange={(checked) => {
                setOpusProportionalMode(checked);
                if (!checked) {
                  // Fixed mode - set value per entry to 0
                  const newValuePerEntry = "0";
                  const newValuePerEntryUSD = "0";
                  setOpusValuePerEntry(newValuePerEntry);
                  setOpusValuePerEntryUSD(newValuePerEntryUSD);
                  updateFormConfig(
                    opusTroveAssets,
                    opusThreshold,
                    newValuePerEntry,
                    opusMaxEntries
                  );
                } else {
                  // Proportional mode - set default value
                  const defaultUSD = "1";
                  const defaultWei = usdToCashWei(defaultUSD);
                  setOpusValuePerEntry(defaultWei);
                  setOpusValuePerEntryUSD(defaultUSD);
                  updateFormConfig(
                    opusTroveAssets,
                    opusThreshold,
                    defaultWei,
                    opusMaxEntries
                  );
                }
              }}
            />
          </div>
        </div>
      </div>

      {extensionError && (
        <div className="flex flex-row items-center gap-2">
          <span className="text-red-500 text-sm">{extensionError}</span>
        </div>
      )}

      <FormItem>
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-base">
            Trove Assets (Optional)
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Filter by specific assets (leave empty for wildcard - all troves)
          </FormDescription>
        </div>
        <div className="flex flex-col gap-2">
          {opusTroveAssets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {opusTroveAssets.map((asset, index) => (
                <div
                  key={index}
                  className="inline-flex items-center gap-2 p-2 border border-brand-muted rounded"
                >
                  <span className="text-sm uppercase">{asset.symbol}</span>
                  <span
                    className="h-4 w-4 hover:cursor-pointer"
                    onClick={() => {
                      const newAssets = opusTroveAssets.filter(
                        (_, i) => i !== index
                      );
                      setOpusTroveAssets(newAssets);
                      updateFormConfig(
                        newAssets,
                        opusThreshold,
                        opusValuePerEntry,
                        opusMaxEntries
                      );
                    }}
                  >
                    <X />
                  </span>
                </div>
              ))}
            </div>
          )}
          <TokenDialog
            selectedToken={undefined}
            onSelect={(token) => {
              if (!opusTroveAssets.some((a) => a.address === token.address)) {
                const newAssets = [...opusTroveAssets, token];
                setOpusTroveAssets(newAssets);
                updateFormConfig(
                  newAssets,
                  opusThreshold,
                  opusValuePerEntry,
                  opusMaxEntries
                );
              }
            }}
            type="erc20"
            allowedAddresses={allowedAssetAddresses}
          />
          <FormDescription className="text-xs">
            {opusTroveAssets.length === 0
              ? "No assets selected - wildcard mode (all troves qualify)"
              : `${opusTroveAssets.length} asset${
                  opusTroveAssets.length !== 1 ? "s" : ""
                } selected - troves must contain at least one of these assets`}
          </FormDescription>
        </div>
      </FormItem>

      <div className="space-y-4">
        <FormItem>
          <div className="flex flex-row items-center gap-2">
            <FormLabel>Minimum CASH Borrowed Threshold</FormLabel>
            {cashToken?.logo_url && (
              <img
                src={cashToken.logo_url}
                alt="CASH"
                className="w-4 h-4"
              />
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Template buttons */}
            <div className="flex flex-wrap gap-2">
              {[0, 1, 5, 10].map((usd) => (
                <Button
                  key={usd}
                  type="button"
                  size="sm"
                  variant={
                    opusThresholdUSD === usd.toString() ? "default" : "outline"
                  }
                  onClick={() => {
                    const usdStr = usd.toString();
                    const wei = usdToCashWei(usdStr);
                    setOpusThresholdUSD(usdStr);
                    setOpusThreshold(wei);
                    updateFormConfig(
                      opusTroveAssets,
                      wei,
                      opusValuePerEntry,
                      opusMaxEntries
                    );
                  }}
                >
                  ${usd}
                </Button>
              ))}
            </div>

            {/* Slider */}
            <div className="flex-1 flex flex-col gap-1 min-w-[200px]">
              <div className="flex justify-between items-center">
                <Label className="text-xs">Custom</Label>
                <span className="text-xs text-muted-foreground">
                  ${opusThresholdUSD || "0"}
                </span>
              </div>
              <Slider
                value={[parseFloat(opusThresholdUSD || "0")]}
                onValueChange={([usd]) => {
                  const usdStr = usd.toString();
                  const wei = usdToCashWei(usdStr);
                  setOpusThresholdUSD(usdStr);
                  setOpusThreshold(wei);
                  updateFormConfig(
                    opusTroveAssets,
                    wei,
                    opusValuePerEntry,
                    opusMaxEntries
                  );
                }}
                max={10000}
                min={0}
                step={10}
              />
            </div>
          </div>
          <FormDescription className="text-xs">
            Minimum CASH borrowed required to qualify (1:1 USD parity)
          </FormDescription>
        </FormItem>

        {/* Only show CASH per entry in proportional mode */}
        {opusProportionalMode && (
          <FormItem>
            <div className="flex flex-row items-center gap-2">
              <FormLabel>CASH Required Per Entry</FormLabel>
              {cashToken?.logo_url && (
                <img
                  src={cashToken.logo_url}
                  alt="CASH"
                  className="w-4 h-4"
                />
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Template buttons */}
              <div className="flex flex-wrap gap-2">
                {[1, 5, 10].map((usd) => (
                  <Button
                    key={usd}
                    type="button"
                    size="sm"
                    variant={
                      opusValuePerEntryUSD === usd.toString()
                        ? "default"
                        : "outline"
                    }
                    onClick={() => {
                      const usdStr = usd.toString();
                      const wei = usdToCashWei(usdStr);
                      setOpusValuePerEntryUSD(usdStr);
                      setOpusValuePerEntry(wei);
                      updateFormConfig(
                        opusTroveAssets,
                        opusThreshold,
                        wei,
                        opusMaxEntries
                      );
                    }}
                  >
                    ${usd}
                  </Button>
                ))}
              </div>

              {/* Slider */}
              <div className="flex-1 flex flex-col gap-1 min-w-[200px]">
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Custom</Label>
                  <span className="text-xs text-muted-foreground">
                    ${opusValuePerEntryUSD || "0"}
                  </span>
                </div>
                <Slider
                  value={[parseFloat(opusValuePerEntryUSD || "0")]}
                  onValueChange={([usd]) => {
                    const usdStr = usd.toString();
                    const wei = usdToCashWei(usdStr);
                    setOpusValuePerEntryUSD(usdStr);
                    setOpusValuePerEntry(wei);
                    updateFormConfig(
                      opusTroveAssets,
                      opusThreshold,
                      wei,
                      opusMaxEntries
                    );
                  }}
                  max={1000}
                  min={0}
                  step={1}
                />
              </div>
            </div>
            <FormDescription className="text-xs">
              CASH borrowed consumed per entry (1:1 USD parity)
            </FormDescription>
          </FormItem>
        )}

        <FormItem>
          <FormLabel>
            {opusProportionalMode ? "Max Entries Cap" : "Fixed Entry Count"}
          </FormLabel>
          <FormControl>
            <div className="flex flex-col gap-2">
              <Input
                type="number"
                min="0"
                max="255"
                placeholder={
                  opusProportionalMode ? "0 (no cap)" : "Number of entries"
                }
                value={opusMaxEntries}
                onChange={(e) => {
                  const value = e.target.value;
                  setOpusMaxEntries(value);
                  updateFormConfig(
                    opusTroveAssets,
                    opusThreshold,
                    opusValuePerEntry,
                    value
                  );
                }}
              />
            </div>
          </FormControl>
          <FormDescription className="text-xs">
            {opusProportionalMode
              ? "Maximum entries cap (0-255, 0 = no cap based on CASH borrowed)"
              : "Number of entries granted for meeting threshold (0-255)"}
          </FormDescription>
        </FormItem>
      </div>
    </div>
  );
};
