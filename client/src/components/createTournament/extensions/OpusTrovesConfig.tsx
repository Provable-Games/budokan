import { useState, useMemo, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useChainConfig } from "@/context/chain";
import { getExtensionAddresses } from "@provable-games/metagame-sdk";

interface OpusTrovesConfigProps {
  allowedAssetAddresses: string[];
  extensionError?: string;
}

export const OpusTrovesConfig = ({
  allowedAssetAddresses,
  extensionError,
}: OpusTrovesConfigProps) => {
  const { selectedChainConfig } = useChainConfig();
  const form = useFormContext();

  // Local state for managing the config values
  const [opusTroveAssets, setOpusTroveAssets] = useState<FormToken[]>([]);
  const [opusThreshold, setOpusThreshold] = useState("");
  const [opusThresholdUSD, setOpusThresholdUSD] = useState("");
  const [opusValuePerEntry, setOpusValuePerEntry] = useState("");
  const [opusValuePerEntryUSD, setOpusValuePerEntryUSD] = useState("");
  const [opusMaxEntries, setOpusMaxEntries] = useState("");
  const [opusProportionalMode, setOpusProportionalMode] = useState(false);
  const [opusBannable, setOpusBannable] = useState(false);

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
    maxEntr: string,
    bannable: boolean
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
      bannable ? "1" : "0",
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
        .map((addr: string) => {
          const token = getTokenByAddress(
            addr,
            selectedChainConfig?.chainId ?? ""
          );
          if (token) {
            return {
              address: token.token_address,
              name: token.name,
              symbol: token.symbol,
              token_type: token.token_type,
            } as FormToken;
          }
          return null;
        })
        .filter((t: FormToken | null): t is FormToken => t !== null);

      setOpusTroveAssets(assets);

      // Extract threshold, value_per_entry, max_entries, bannable
      const threshold = configParts[assetCount + 1];
      const valPerEntry = configParts[assetCount + 2];
      const maxEntr = configParts[assetCount + 3];
      const bannable = configParts[assetCount + 4];

      setOpusThreshold(threshold);
      setOpusThresholdUSD(cashWeiToUSD(threshold));
      setOpusValuePerEntry(valPerEntry);
      setOpusValuePerEntryUSD(cashWeiToUSD(valPerEntry));
      setOpusMaxEntries(maxEntr);
      setOpusBannable(bannable === "1");

      // Set proportional mode if value per entry > 0
      setOpusProportionalMode(valPerEntry !== "0" && valPerEntry !== "");
    }
  }, []); // Only on mount to restore from saved config

  // Live human-readable summary of the current config
  const ruleSummary = useMemo(() => {
    const thresholdUSDNum = parseFloat(opusThresholdUSD || "0");
    const valuePerEntryUSDNum = parseFloat(opusValuePerEntryUSD || "0");
    const maxEntriesNum = parseInt(opusMaxEntries || "0", 10);

    const formatUSD = (n: number) =>
      `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

    const assetClause =
      opusTroveAssets.length === 0
        ? "any Opus collateral"
        : `Opus troves backed by ${opusTroveAssets
            .map((a) => a.symbol)
            .join(" or ")}`;

    const thresholdClause =
      thresholdUSDNum > 0
        ? `at least ${formatUSD(thresholdUSDNum)} of CASH from ${assetClause}`
        : `any amount of CASH from ${assetClause}`;

    if (opusProportionalMode) {
      if (valuePerEntryUSDNum <= 0) {
        return "Set a CASH-per-entry value to preview the rule.";
      }
      const cap =
        maxEntriesNum > 0
          ? `, capped at ${maxEntriesNum} ${
              maxEntriesNum === 1 ? "entry" : "entries"
            }`
          : "";
      return `Players who borrowed ${thresholdClause} get 1 entry per ${formatUSD(
        valuePerEntryUSDNum
      )} borrowed${cap}.`;
    }

    if (maxEntriesNum <= 0) {
      return "Set the fixed entry count to preview the rule.";
    }
    return `Players who borrowed ${thresholdClause} get ${maxEntriesNum} ${
      maxEntriesNum === 1 ? "entry" : "entries"
    }.`;
  }, [
    opusThresholdUSD,
    opusValuePerEntryUSD,
    opusMaxEntries,
    opusTroveAssets,
    opusProportionalMode,
  ]);

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

      {/* Live rule preview */}
      <div className="rounded-lg border border-brand/40 bg-brand/5 p-3">
        <div className="flex items-start gap-2">
          <span className="text-xs uppercase tracking-wide text-brand font-brand mt-0.5">
            Rule
          </span>
          <p className="text-sm text-foreground flex-1">{ruleSummary}</p>
        </div>
      </div>

      {/* Entry Mode Checkbox */}
      <div className="border-2 border-brand-muted rounded-lg p-4 bg-black/20">
        <label className="flex flex-row items-start gap-3 cursor-pointer">
          <Checkbox
            id="opus-proportional-mode"
            className="mt-1"
            checked={opusProportionalMode}
            onCheckedChange={(checked) => {
              const isChecked = checked === true;
              setOpusProportionalMode(isChecked);
              if (!isChecked) {
                // Fixed mode - set value per entry to 0
                const newValuePerEntry = "0";
                setOpusValuePerEntry(newValuePerEntry);
                setOpusValuePerEntryUSD("0");
                updateFormConfig(
                  opusTroveAssets,
                  opusThreshold,
                  newValuePerEntry,
                  opusMaxEntries,
                  opusBannable
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
                  opusMaxEntries,
                  opusBannable
                );
              }
            }}
          />
          <div className="flex flex-col gap-1 flex-1">
            <FormLabel
              htmlFor="opus-proportional-mode"
              className="font-brand text-base cursor-pointer"
            >
              Proportional entries (more borrowed = more entries)
            </FormLabel>
            <FormDescription className="text-xs">
              {opusProportionalMode
                ? "Players get one entry per CASH amount borrowed above the threshold"
                : "Each qualifying player gets the same fixed number of entries (no scaling)"}
            </FormDescription>
          </div>
        </label>
      </div>

      {/* Bannable Checkbox */}
      <div className="border-2 border-brand-muted rounded-lg p-4 bg-black/20">
        <label className="flex flex-row items-start gap-3 cursor-pointer">
          <Checkbox
            id="opus-bannable"
            className="mt-1"
            checked={opusBannable}
            onCheckedChange={(checked) => {
              const isChecked = checked === true;
              setOpusBannable(isChecked);
              updateFormConfig(
                opusTroveAssets,
                opusThreshold,
                opusValuePerEntry,
                opusMaxEntries,
                isChecked
              );
            }}
          />
          <div className="flex flex-col gap-1 flex-1">
            <FormLabel
              htmlFor="opus-bannable"
              className="font-brand text-base cursor-pointer"
            >
              Allow removing invalid entries before games start
            </FormLabel>
            <FormDescription className="text-xs">
              {opusBannable
                ? "During the registration window, entries can be removed if the borrower's debt drops below threshold or exceeds quota. Requires a registration period."
                : "Entries are locked in once registered — borrowers can change their position without losing their entry."}
            </FormDescription>
          </div>
        </label>
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
          <div className="flex flex-row items-center flex-wrap gap-2">
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
                    opusMaxEntries,
                    opusBannable
                  );
                }
              }}
              type="erc20"
              allowedAddresses={allowedAssetAddresses}
            />
            {opusTroveAssets.map((asset, index) => {
              const tokenMeta = getTokenByAddress(
                asset.address,
                selectedChainConfig?.chainId ?? ""
              );
              return (
                <div
                  key={index}
                  className="inline-flex items-center gap-2 p-2 border border-brand-muted rounded"
                >
                  {tokenMeta?.logo_url && (
                    <img
                      src={tokenMeta.logo_url}
                      alt={asset.symbol}
                      className="w-4 h-4"
                    />
                  )}
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
                        opusMaxEntries,
                        opusBannable
                      );
                    }}
                  >
                    <X />
                  </span>
                </div>
              );
            })}
          </div>
          <FormDescription className="text-xs">
            {opusTroveAssets.length === 0
              ? "No assets selected - wildcard mode (all troves qualify)"
              : `${opusTroveAssets.length} asset${
                  opusTroveAssets.length !== 1 ? "s" : ""
                } selected - troves must contain at least one of these assets`}
          </FormDescription>
        </div>
      </FormItem>

      <div
        className={
          opusProportionalMode
            ? "grid grid-cols-1 md:grid-cols-2 gap-4"
            : "space-y-4"
        }
      >
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {[0, 1, 5, 10, 50, 100].map((usd) => (
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
                      opusMaxEntries,
                      opusBannable
                    );
                  }}
                >
                  ${usd}
                </Button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                $
              </span>
              <Input
                type="number"
                min="0"
                step="any"
                className="pl-7"
                placeholder="0"
                value={opusThresholdUSD}
                onChange={(e) => {
                  const usdStr = e.target.value;
                  const wei = usdToCashWei(usdStr);
                  setOpusThresholdUSD(usdStr);
                  setOpusThreshold(wei);
                  updateFormConfig(
                    opusTroveAssets,
                    wei,
                    opusValuePerEntry,
                    opusMaxEntries,
                    opusBannable
                  );
                }}
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
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {[1, 5, 10, 25, 50].map((usd) => (
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
                        opusMaxEntries,
                        opusBannable
                      );
                    }}
                  >
                    ${usd}
                  </Button>
                ))}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  $
                </span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  className="pl-7"
                  placeholder="1"
                  value={opusValuePerEntryUSD}
                  onChange={(e) => {
                    const usdStr = e.target.value;
                    const wei = usdToCashWei(usdStr);
                    setOpusValuePerEntryUSD(usdStr);
                    setOpusValuePerEntry(wei);
                    updateFormConfig(
                      opusTroveAssets,
                      opusThreshold,
                      wei,
                      opusMaxEntries,
                      opusBannable
                    );
                  }}
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
              <div className="flex flex-wrap gap-2">
                {(opusProportionalMode
                  ? [0, 5, 10, 25, 100]
                  : [1, 3, 5, 10, 25]
                ).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={
                      opusMaxEntries === n.toString() ? "default" : "outline"
                    }
                    onClick={() => {
                      const valueStr = n.toString();
                      setOpusMaxEntries(valueStr);
                      updateFormConfig(
                        opusTroveAssets,
                        opusThreshold,
                        opusValuePerEntry,
                        valueStr,
                        opusBannable
                      );
                    }}
                  >
                    {opusProportionalMode && n === 0 ? "No cap" : n}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min="0"
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
                    value,
                    opusBannable
                  );
                }}
              />
            </div>
          </FormControl>
          <FormDescription className="text-xs">
            {opusProportionalMode
              ? "Maximum entries cap (0 = no cap based on CASH borrowed)"
              : "Number of entries granted for meeting threshold"}
          </FormDescription>
        </FormItem>
      </div>
    </div>
  );
};
