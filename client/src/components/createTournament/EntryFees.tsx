import { useEffect } from "react";
import { StepProps } from "@/containers/CreateTournament";
import {
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import React from "react";
import {
  buildUniformBasisPointShares,
  calculateDistribution,
  indexAddress,
} from "@/lib/utils";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { FeeDistributionVisual } from "@/components/createTournament/FeeDistributionVisual";
import { PrizeDistributionVisual } from "@/components/createTournament/PrizeDistributionVisual";
import { useChainConfig } from "@/context/chain";
import { TokenSelector } from "@/components/createTournament/inputs/TokenSelector";
import { TokenAmountInput } from "@/components/createTournament/inputs/TokenAmountInput";
import { ChainId } from "@/chain/setup/networks";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";
import { getGameDefaults } from "@/assets/games";

const EntryFees = ({ form }: StepProps) => {
  const { selectedChainConfig } = useChainConfig();

  const chainId = selectedChainConfig?.chainId ?? "";
  const isSepolia = selectedChainConfig?.chainId === ChainId.SN_SEPOLIA;

  const enableEntryFees = form.watch("enableEntryFees");
  const gameAddress = form.watch("game");
  const gameDefaults = gameAddress ? getGameDefaults(gameAddress, chainId) : null;

  // Quick select token addresses for mainnet
  const MAINNET_QUICK_SELECT_ADDRESSES = [
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
    "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49", // LORDS
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // USDC
    "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b", // SURVIVOR
  ];

  // Quick select token addresses for sepolia
  const SEPOLIA_QUICK_SELECT_ADDRESSES = [
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
  ];

  const QUICK_SELECT_ADDRESSES = isSepolia
    ? SEPOLIA_QUICK_SELECT_ADDRESSES
    : MAINNET_QUICK_SELECT_ADDRESSES;

  // Get distribution values from form, with fallbacks
  const distributionWeight = form.watch("entryFees.distributionWeight") ?? 1;
  const distributionType =
    form.watch("entryFees.distributionType") ?? "exponential";
  const customShares = form.watch("entryFees.customShares") ?? [];
  const prizePoolPayoutCount =
    form.watch("entryFees.prizePoolPayoutCount") ?? 10;

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: [form.watch("entryFees.token")?.address ?? ""],
  });

  const creatorFee = form.watch("entryFees.creatorFeePercentage") || 0;
  const gameFee = form.watch("entryFees.gameFeePercentage") || 0;
  const minGameFee = form.watch("entryFees.minGameFeePercentage") || 1;
  const minEntryFeeUsd = form.watch("entryFees.minEntryFeeUsd") || 1;
  const refundShare = form.watch("entryFees.refundSharePercentage") || 0;

  // Calculate prize pool amount (100% - fees - refund)
  const prizePoolPercentage = Math.max(
    0,
    100 - creatorFee - gameFee - refundShare,
  );
  const prizePoolAmount =
    ((form.watch("entryFees.amount") ?? 0) * prizePoolPercentage) / 100;
  const prizePoolValue =
    ((form.watch("entryFees.value") ?? 0) * prizePoolPercentage) / 100;

  // Auto-reshape customShares when the paid-places count changes while the
  // user is on Custom — length must always equal prizePoolPayoutCount. We
  // preserve existing values where we can and fill the tail with 0s; users
  // can then either tweak manually or hit "Reset to equal".
  useEffect(() => {
    if (distributionType !== "custom") return;
    if (customShares.length === prizePoolPayoutCount) return;
    if (customShares.length === 0) {
      form.setValue(
        "entryFees.customShares",
        buildUniformBasisPointShares(prizePoolPayoutCount),
      );
      return;
    }
    const next = Array<number>(prizePoolPayoutCount).fill(0);
    for (let i = 0; i < Math.min(customShares.length, prizePoolPayoutCount); i++) {
      next[i] = customShares[i] ?? 0;
    }
    form.setValue("entryFees.customShares", next);
  }, [distributionType, prizePoolPayoutCount, customShares.length]);

  useEffect(() => {
    let percentages: number[];
    if (distributionType === "custom") {
      // Custom shares are already basis points of the prize pool; render them
      // directly as percentages (bp / 100). Pad to paid-places count in case
      // the reshape effect above hasn't run yet.
      percentages = Array.from({ length: prizePoolPayoutCount }, (_, i) =>
        (customShares[i] ?? 0) / 100,
      );
    } else {
      percentages = calculateDistribution(
        prizePoolPayoutCount,
        distributionWeight,
        creatorFee,
        gameFee,
        refundShare,
        distributionType,
      );
    }
    form.setValue(
      "entryFees.prizeDistribution",
      percentages.map((percentage, index) => ({
        position: index + 1,
        percentage,
      })),
    );
  }, [
    creatorFee,
    gameFee,
    refundShare,
    distributionWeight,
    distributionType,
    prizePoolPayoutCount,
    // Serialise the shares array so useEffect runs on any element change
    // without needing a stable ref.
    customShares.join(","),
  ]);

  useEffect(() => {
    form.setValue(
      "entryFees.amount",
      (form.watch("entryFees.value") ?? 0) /
        (prices?.[
          indexAddress(form.watch("entryFees.token")?.address ?? "") ?? ""
        ] ?? 1),
    );
  }, [form.watch("entryFees.value"), prices]);

  const entryFeeAmountExists = (form.watch("entryFees.amount") ?? 0) > 0;
  const hasTokenSelected = !!form.watch("entryFees.token");

  // Track if a token has ever been selected to prevent flickering when switching tokens
  const [tokenEverSelected, setTokenEverSelected] = React.useState(false);

  // Owned here so the prize distribution visual can react to the toggle as
  // well. When the prize pool is off (by toggle) OR computed-zero (fees
  // consume 100%), we hide the Prize Distribution block entirely — there's
  // nothing meaningful to visualise.
  const [prizePoolEnabled, setPrizePoolEnabled] = React.useState(true);
  const showPrizeDistribution =
    prizePoolEnabled && prizePoolPercentage > 0;

  React.useEffect(() => {
    if (hasTokenSelected && !tokenEverSelected) {
      setTokenEverSelected(true);
    }
  }, [hasTokenSelected, tokenEverSelected]);

  return (
    <FormField
      control={form.control}
      name="enableEntryFees"
      render={({ field }) => (
        <FormItem className="flex flex-col sm:p-4">
          <OptionalSection
            label="Entry Fees"
            description="Charge players a fee to enter the tournament"
            checked={field.value}
            onCheckedChange={field.onChange}
          />

          <div className="w-full h-0.5 bg-brand/25" />

          {!enableEntryFees && gameDefaults?.averageGasCostUsd && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
              <p className="text-sm text-yellow-500">
                Note: This game costs approximately ${gameDefaults.averageGasCostUsd.toFixed(2)} in gas per play. Without entry fees, players only pay gas costs.
              </p>
            </div>
          )}

          {enableEntryFees && (
          <div className="space-y-4">
        {/* Token Selection and Amount in a row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:divide-x lg:divide-brand/25">
          {/* Token Selection */}
          <FormField
            control={form.control}
            name="entryFees.token"
            render={({ field: tokenField }) => (
              <FormItem>
                <FormControl>
                  <TokenSelector
                    label="Entry Fee Token"
                    description="Select the token players will pay as entry fee"
                    selectedToken={form.watch("entryFees.token")}
                    onTokenSelect={(token) => {
                      tokenField.onChange(token);
                    }}
                    onTokenDecimalsChange={(decimals) => {
                      form.setValue("entryFees.tokenDecimals", decimals);
                    }}
                    quickSelectAddresses={QUICK_SELECT_ADDRESSES}
                    tokenType="erc20"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Amount Input - Always rendered but hidden until token is selected */}
          <div className="w-full h-0.5 bg-brand/25 lg:hidden" />
          <FormField
            control={form.control}
            name="entryFees.value"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <TokenAmountInput
                    label="Entry Fee Amount"
                    description={`Fee per entry in USD (min $${minEntryFeeUsd})`}
                    value={field.value || 0}
                    onChange={(val) =>
                      field.onChange(Math.max(minEntryFeeUsd, val))
                    }
                    tokenAmount={form.watch("entryFees.amount") ?? 0}
                    tokenAddress={form.watch("entryFees.token")?.address ?? ""}
                    usdValue={form.watch("entryFees.value") ?? 0}
                    isLoading={pricesLoading}
                    disabled={!hasTokenSelected}
                    visible={tokenEverSelected}
                    className="lg:pl-4"
                    minValue={minEntryFeeUsd}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {/* Fee Distribution and Prize Distribution - Only show after amount is entered */}
        {tokenEverSelected && entryFeeAmountExists && (
          <>
            <div className="w-full h-0.5 bg-brand/25" />
            {/* Fee Distribution Visual */}
            <FeeDistributionVisual
              creatorFee={creatorFee}
              gameFee={gameFee}
              refundShare={refundShare}
              onCreatorFeeChange={(value) =>
                form.setValue("entryFees.creatorFeePercentage", value)
              }
              onGameFeeChange={(value) =>
                form.setValue(
                  "entryFees.gameFeePercentage",
                  Math.max(minGameFee, value),
                )
              }
              minGameFee={minGameFee}
              onRefundShareChange={(value) =>
                form.setValue("entryFees.refundSharePercentage", value)
              }
              disabled={!hasTokenSelected || !entryFeeAmountExists}
              amount={form.watch("entryFees.amount") ?? 0}
              tokenSymbol={form.watch("entryFees.token")?.symbol}
              usdValue={form.watch("entryFees.value") ?? 0}
              tokenLogoUrl={getTokenLogoUrl(
                chainId,
                form.watch("entryFees.token")?.address ?? "",
              )}
              prizePoolEnabled={prizePoolEnabled}
              onPrizePoolEnabledChange={setPrizePoolEnabled}
            />
            {showPrizeDistribution && (
              <>
                <div className="w-full h-0.5 bg-brand/25" />
                <PrizeDistributionVisual
                  distributions={
                    form.watch("entryFees.prizeDistribution") ?? []
                  }
                  weight={distributionWeight}
                  onWeightChange={(value) => {
                    form.setValue("entryFees.distributionWeight", value);
                  }}
                  onLeaderboardSizeChange={(value) => {
                    form.setValue("entryFees.prizePoolPayoutCount", value);
                  }}
                  distributionType={distributionType}
                  onDistributionTypeChange={(type) => {
                    form.setValue("entryFees.distributionType", type);
                    // Seed custom shares on first switch so the user sees a
                    // valid (summing-to-100) starting distribution instead of
                    // an empty grid.
                    if (type === "custom") {
                      const existing =
                        form.getValues("entryFees.customShares") ?? [];
                      if (
                        existing.length !== prizePoolPayoutCount ||
                        existing.reduce((a, b) => a + (b || 0), 0) !== 10000
                      ) {
                        form.setValue(
                          "entryFees.customShares",
                          buildUniformBasisPointShares(prizePoolPayoutCount),
                        );
                      }
                    }
                  }}
                  customShares={customShares}
                  onCustomShareChange={(index, basisPoints) => {
                    const next = [...customShares];
                    while (next.length < prizePoolPayoutCount) next.push(0);
                    next[index] = basisPoints;
                    form.setValue("entryFees.customShares", next);
                  }}
                  onCustomSharesReplace={(shares) => {
                    // Pad/trim to paid-places count so bulk imports that
                    // don't cover every slot still yield a valid-length
                    // array (the missing tail is 0s).
                    const next = Array<number>(prizePoolPayoutCount).fill(0);
                    for (
                      let i = 0;
                      i < Math.min(shares.length, prizePoolPayoutCount);
                      i++
                    ) {
                      next[i] = shares[i] ?? 0;
                    }
                    form.setValue("entryFees.customShares", next);
                  }}
                  onResetCustomShares={() => {
                    form.setValue(
                      "entryFees.customShares",
                      buildUniformBasisPointShares(prizePoolPayoutCount),
                    );
                  }}
                  disabled={!hasTokenSelected || !entryFeeAmountExists}
                  amount={prizePoolAmount}
                  tokenSymbol={form.watch("entryFees.token")?.symbol}
                  usdValue={prizePoolValue}
                  tokenLogoUrl={getTokenLogoUrl(
                    chainId,
                    form.watch("entryFees.token")?.address ?? "",
                  )}
                  leaderboardSize={
                    form.watch("entryFees.prizePoolPayoutCount") ?? 10
                  }
                />
              </>
            )}
          </>
        )}
      </div>
          )}
        </FormItem>
      )}
    />
  );
};

export default EntryFees;
