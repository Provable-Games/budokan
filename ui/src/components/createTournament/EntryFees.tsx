import { useEffect } from "react";
import { StepProps } from "@/containers/CreateTournament";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import React from "react";
import { calculateDistribution } from "@/lib/utils";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";
import { FeeDistributionVisual } from "@/components/createTournament/FeeDistributionVisual";
import { PrizeDistributionVisual } from "@/components/createTournament/PrizeDistributionVisual";
import { useDojo } from "@/context/dojo";
import { TokenSelector } from "@/components/createTournament/inputs/TokenSelector";
import { TokenAmountInput } from "@/components/createTournament/inputs/TokenAmountInput";
import { ChainId } from "@/dojo/setup/networks";

const EntryFees = ({ form }: StepProps) => {
  const { selectedChainConfig } = useDojo();

  const chainId = selectedChainConfig?.chainId ?? "";
  const isSepolia = selectedChainConfig?.chainId === ChainId.SN_SEPOLIA;

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

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: [form.watch("entryFees.token")?.address ?? ""],
  });

  const creatorFee = form.watch("entryFees.creatorFeePercentage") || 0;
  const gameFee = form.watch("entryFees.gameFeePercentage") || 0;
  const refundShare = form.watch("entryFees.refundSharePercentage") || 0;

  // Calculate prize pool amount (100% - fees - refund)
  const prizePoolPercentage = Math.max(
    0,
    100 - creatorFee - gameFee - refundShare
  );
  const prizePoolAmount =
    ((form.watch("entryFees.amount") ?? 0) * prizePoolPercentage) / 100;
  const prizePoolValue =
    ((form.watch("entryFees.value") ?? 0) * prizePoolPercentage) / 100;

  useEffect(() => {
    const prizePoolPayoutCount =
      form.watch("entryFees.prizePoolPayoutCount") ?? 10;
    const distributions = calculateDistribution(
      prizePoolPayoutCount,
      distributionWeight,
      creatorFee,
      gameFee,
      refundShare,
      distributionType
    );
    form.setValue(
      "entryFees.prizeDistribution",
      distributions.map((percentage, index) => ({
        position: index + 1,
        percentage,
      }))
    );
  }, [
    creatorFee,
    gameFee,
    refundShare,
    distributionWeight,
    distributionType,
    form.watch("entryFees.prizePoolPayoutCount"),
  ]);

  useEffect(() => {
    form.setValue(
      "entryFees.amount",
      (form.watch("entryFees.value") ?? 0) /
        (prices?.[form.watch("entryFees.token")?.address ?? ""] ?? 1)
    );
  }, [form.watch("entryFees.value"), prices]);

  const entryFeeAmountExists = (form.watch("entryFees.amount") ?? 0) > 0;
  const hasTokenSelected = !!form.watch("entryFees.token");

  // Track if a token has ever been selected to prevent flickering when switching tokens
  const [tokenEverSelected, setTokenEverSelected] = React.useState(false);

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
            description="Enable tournament entry fees"
            checked={field.value}
            onCheckedChange={field.onChange}
          />

          {field.value && (
            <>
              <div className="w-full h-0.5 bg-brand/25" />
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
                              form.setValue(
                                "entryFees.tokenDecimals",
                                decimals
                              );
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
                            description="Fee per entry in USD"
                            value={field.value || 0}
                            onChange={field.onChange}
                            tokenAmount={form.watch("entryFees.amount") ?? 0}
                            tokenAddress={
                              form.watch("entryFees.token")?.address ?? ""
                            }
                            usdValue={form.watch("entryFees.value") ?? 0}
                            isLoading={pricesLoading}
                            disabled={!hasTokenSelected}
                            visible={tokenEverSelected}
                            className="lg:pl-4"
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
                          Math.max(1, value)
                        )
                      }
                      onRefundShareChange={(value) =>
                        form.setValue("entryFees.refundSharePercentage", value)
                      }
                      disabled={!hasTokenSelected || !entryFeeAmountExists}
                      amount={form.watch("entryFees.amount") ?? 0}
                      tokenSymbol={form.watch("entryFees.token")?.symbol}
                      usdValue={form.watch("entryFees.value") ?? 0}
                      tokenLogoUrl={getTokenLogoUrl(
                        chainId,
                        form.watch("entryFees.token")?.address ?? ""
                      )}
                    />
                    {prizePoolPercentage > 0 && (
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
                      }}
                      disabled={!hasTokenSelected || !entryFeeAmountExists}
                      amount={prizePoolAmount}
                      tokenSymbol={form.watch("entryFees.token")?.symbol}
                      usdValue={prizePoolValue}
                      tokenLogoUrl={getTokenLogoUrl(
                        chainId,
                        form.watch("entryFees.token")?.address ?? ""
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
            </>
          )}
        </FormItem>
      )}
    />
  );
};

export default EntryFees;
