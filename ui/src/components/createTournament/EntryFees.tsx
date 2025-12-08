import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { StepProps } from "@/containers/CreateTournament";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import AmountInput from "@/components/createTournament/inputs/Amount";
import TokenDialog from "@/components/dialogs/Token";
import { Slider } from "@/components/ui/slider";
import React from "react";
import {
  calculateDistribution,
  formatNumber,
  getOrdinalSuffix,
} from "@/lib/utils";
import { getTokenSymbol } from "@/lib/tokensMeta";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";
import { TokenValue } from "@/components/createTournament/containers/TokenValue";
import { FeeDistributionVisual } from "@/components/createTournament/FeeDistributionVisual";
import { PrizeDistributionVisual } from "@/components/createTournament/PrizeDistributionVisual";
import { useDojo } from "@/context/dojo";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { mainnetTokens } from "@/lib/mainnetTokens";
import { sepoliaTokens } from "@/lib/sepoliaTokens";
import { ChainId } from "@/dojo/setup/networks";

const EntryFees = ({ form }: StepProps) => {
  const { selectedChainConfig } = useDojo();
  const { getTokenDecimals } = useSystemCalls();

  const chainId = selectedChainConfig?.chainId ?? "";
  const isMainnet = selectedChainConfig?.chainId === ChainId.SN_MAIN;
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

  const QUICK_SELECT_TOKENS = QUICK_SELECT_ADDRESSES.map((address) => {
    const token = isMainnet
      ? mainnetTokens.find((t) => t.l2_token_address === address)
      : sepoliaTokens.find((t) => t.l2_token_address === address);
    return {
      address,
      symbol: token?.symbol || "",
      name: token?.name || "",
    };
  }).filter((t) => t.symbol); // Filter out any tokens not found

  const PREDEFINED_PERCENTAGES = [
    { value: 1, label: "1%" },
    { value: 3, label: "3%" },
    { value: 5, label: "5%" },
  ];

  // Get distribution values from form, with fallbacks
  const distributionWeight = form.watch("entryFees.distributionWeight") ?? 1;
  const distributionType = form.watch("entryFees.distributionType") ?? "exponential";

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: [form.watch("entryFees.token")?.symbol ?? ""],
  });

  const creatorFee = form.watch("entryFees.creatorFeePercentage") || 0;
  const gameFee = form.watch("entryFees.gameFeePercentage") || 0;
  const refundShare = form.watch("entryFees.refundSharePercentage") || 0;
  const prizeDistribution =
    form
      .watch("entryFees.prizeDistribution")
      ?.reduce((sum, pos) => sum + (pos.percentage || 0), 0) || 0;

  const totalDistributionPercentage = useMemo(() => {
    return creatorFee + gameFee + refundShare + prizeDistribution;
  }, [creatorFee, gameFee, refundShare, prizeDistribution]);

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
        (prices?.[form.watch("entryFees.token")?.symbol ?? ""] ?? 1)
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
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-row items-center gap-5">
                            <FormLabel className="text-lg font-brand">
                              Entry Fee Token
                            </FormLabel>
                            <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                              Select the token players will pay as entry fee
                            </FormDescription>
                          </div>
                          <FormControl>
                            <div className="flex flex-row items-center gap-3">
                              {/* Quick select tokens */}
                              <div className="flex flex-row flex-wrap items-center gap-2">
                                {QUICK_SELECT_TOKENS.map((token) => (
                                  <Button
                                    key={token.address}
                                    type="button"
                                    variant={
                                      form.watch("entryFees.token")?.address ===
                                      token.address
                                        ? "default"
                                        : "outline"
                                    }
                                    size="sm"
                                    className="h-10 px-3 gap-2"
                                    onClick={async () => {
                                      const selectedToken = {
                                        address: token.address,
                                        symbol: token.symbol,
                                        name: token.symbol,
                                        token_type: "erc20" as const,
                                        is_registered: true,
                                      };
                                      tokenField.onChange(selectedToken);
                                      // Fetch token decimals and set it in the form
                                      try {
                                        const decimals = await getTokenDecimals(
                                          token.address
                                        );
                                        form.setValue(
                                          "entryFees.tokenDecimals",
                                          decimals
                                        );
                                      } catch (error) {
                                        console.error(
                                          "Failed to fetch token decimals:",
                                          error
                                        );
                                        form.setValue(
                                          "entryFees.tokenDecimals",
                                          18
                                        ); // Default to 18
                                      }
                                    }}
                                  >
                                    <img
                                      src={getTokenLogoUrl(
                                        chainId,
                                        token.address
                                      )}
                                      className="w-4 h-4"
                                      alt={token.symbol}
                                    />
                                    {token.symbol}
                                  </Button>
                                ))}
                              </div>
                              {/* Vertical divider */}
                              <div className="h-10 w-px bg-brand/25 self-end" />
                              {/* Select Token button */}
                              <div className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-neutral-500">
                                  Custom
                                </span>
                                <TokenDialog
                                  selectedToken={
                                    // Only show as selected if it's NOT one of the template tokens
                                    QUICK_SELECT_ADDRESSES.includes(
                                      form.watch("entryFees.token")?.address ??
                                        ""
                                    )
                                      ? undefined
                                      : form.watch("entryFees.token")
                                  }
                                  onSelect={async (token) => {
                                    tokenField.onChange(token);
                                    // Fetch token decimals and set it in the form
                                    if (
                                      token.address &&
                                      token.token_type === "erc20"
                                    ) {
                                      try {
                                        const decimals = await getTokenDecimals(
                                          token.address
                                        );
                                        form.setValue(
                                          "entryFees.tokenDecimals",
                                          decimals
                                        );
                                      } catch (error) {
                                        console.error(
                                          "Failed to fetch token decimals:",
                                          error
                                        );
                                        form.setValue(
                                          "entryFees.tokenDecimals",
                                          18
                                        ); // Default to 18
                                      }
                                    }
                                  }}
                                  type="erc20"
                                />
                              </div>
                            </div>
                          </FormControl>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Amount Input - Always rendered but hidden until token is selected */}
                  <div className="w-full h-0.5 bg-brand/25 lg:hidden" />
                  <FormField
                    control={form.control}
                    name="entryFees.value"
                    render={({ field }) => (
                      <FormItem
                        className={`lg:pl-4 transition-opacity ${
                          !tokenEverSelected
                            ? "opacity-0 pointer-events-none"
                            : "opacity-100"
                        }`}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-row items-center gap-5">
                            <FormLabel className="text-lg font-brand">
                              Entry Fee Amount
                            </FormLabel>
                            <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                              Fee per entry in USD
                            </FormDescription>
                            <TokenValue
                              className="sm:hidden"
                              amount={form.watch("entryFees.amount") ?? 0}
                              tokenAddress={
                                form.watch("entryFees.token")?.address ?? ""
                              }
                              usdValue={form.watch("entryFees.value") ?? 0}
                              isLoading={pricesLoading}
                            />
                          </div>
                          <FormControl>
                            <div className="flex flex-row items-center gap-2">
                              <AmountInput
                                value={field.value || 0}
                                onChange={field.onChange}
                                disabled={!hasTokenSelected}
                              />
                              <TokenValue
                                className="hidden sm:flex"
                                amount={form.watch("entryFees.amount") ?? 0}
                                tokenAddress={
                                  form.watch("entryFees.token")?.address ?? ""
                                }
                                usdValue={form.watch("entryFees.value") ?? 0}
                                isLoading={pricesLoading}
                              />
                            </div>
                          </FormControl>
                        </div>
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
                    <div className="w-full h-0.5 bg-brand/25" />
                    {/* Hidden/Collapsed individual fee inputs for backward compatibility */}
                    <div className="hidden">
                      <FormField
                        control={form.control}
                        name="entryFees.creatorFeePercentage"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex flex-row items-center gap-5">
                              <FormLabel className="font-brand text-lg">
                                Creator Fee (%)
                              </FormLabel>
                              <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                                Fee provided to you (Tournament Creator)
                              </FormDescription>
                              <TokenValue
                                className="sm:hidden"
                                amount={
                                  ((form.watch("entryFees.amount") ?? 0) *
                                    (field.value ?? 0)) /
                                  100
                                }
                                tokenAddress={
                                  form.watch("entryFees.token")?.address ?? ""
                                }
                                usdValue={
                                  ((form.watch("entryFees.value") ?? 0) *
                                    (field.value ?? 0)) /
                                  100
                                }
                                isLoading={pricesLoading}
                              />
                            </div>
                            <FormControl>
                              <div className="div flex flex-row gap-2">
                                <div className="flex flex-row gap-2">
                                  {PREDEFINED_PERCENTAGES.map(
                                    ({ value, label }) => (
                                      <Button
                                        key={value}
                                        type="button"
                                        variant={
                                          field.value === value
                                            ? "default"
                                            : "outline"
                                        }
                                        className="px-2"
                                        disabled={!hasTokenSelected}
                                        onClick={() => {
                                          field.onChange(value);
                                        }}
                                      >
                                        {label}
                                      </Button>
                                    )
                                  )}
                                </div>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  max="100"
                                  step="1"
                                  className="w-[80px] p-1"
                                  disabled={!hasTokenSelected}
                                  {...field}
                                  onChange={(e) => {
                                    const value = Math.floor(
                                      Number(e.target.value)
                                    );
                                    field.onChange(value);
                                  }}
                                />
                                <TokenValue
                                  className="hidden sm:flex"
                                  amount={
                                    ((form.watch("entryFees.amount") ?? 0) *
                                      (field.value ?? 0)) /
                                    100
                                  }
                                  tokenAddress={
                                    form.watch("entryFees.token")?.address ?? ""
                                  }
                                  usdValue={
                                    ((form.watch("entryFees.value") ?? 0) *
                                      (field.value ?? 0)) /
                                    100
                                  }
                                  isLoading={pricesLoading}
                                />
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="entryFees.gameFeePercentage"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex flex-row items-center gap-5">
                              <FormLabel className="font-brand text-lg">
                                Game Fee (%)
                              </FormLabel>
                              <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                                Fee provided to the Game Creator (minimum 1%)
                              </FormDescription>
                              <TokenValue
                                className="sm:hidden"
                                amount={
                                  ((form.watch("entryFees.amount") ?? 0) *
                                    (field.value ?? 0)) /
                                  100
                                }
                                tokenAddress={
                                  form.watch("entryFees.token")?.address ?? ""
                                }
                                usdValue={
                                  ((form.watch("entryFees.value") ?? 0) *
                                    (field.value ?? 0)) /
                                  100
                                }
                                isLoading={pricesLoading}
                              />
                            </div>
                            <FormControl>
                              <div className="div flex flex-row gap-2">
                                <div className="flex flex-row gap-2">
                                  {PREDEFINED_PERCENTAGES.map(
                                    ({ value, label }) => (
                                      <Button
                                        key={value}
                                        type="button"
                                        variant={
                                          field.value === value
                                            ? "default"
                                            : "outline"
                                        }
                                        className="px-2"
                                        disabled={!hasTokenSelected}
                                        onClick={() => {
                                          field.onChange(value);
                                        }}
                                      >
                                        {label}
                                      </Button>
                                    )
                                  )}
                                </div>
                                <Input
                                  type="number"
                                  placeholder="1"
                                  min="1"
                                  max="100"
                                  step="1"
                                  className="w-[80px] p-1"
                                  disabled={!hasTokenSelected}
                                  {...field}
                                  onChange={(e) => {
                                    const value = Math.floor(
                                      Number(e.target.value)
                                    );
                                    field.onChange(value < 1 ? 1 : value);
                                  }}
                                />
                                <TokenValue
                                  className="hidden sm:flex"
                                  amount={
                                    ((form.watch("entryFees.amount") ?? 0) *
                                      (field.value ?? 0)) /
                                    100
                                  }
                                  tokenAddress={
                                    form.watch("entryFees.token")?.address ?? ""
                                  }
                                  usdValue={
                                    ((form.watch("entryFees.value") ?? 0) *
                                      (field.value ?? 0)) /
                                    100
                                  }
                                  isLoading={pricesLoading}
                                />
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="entryFees.refundSharePercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <input type="hidden" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
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
              </div>
            </>
          )}
        </FormItem>
      )}
    />
  );
};

export default EntryFees;
