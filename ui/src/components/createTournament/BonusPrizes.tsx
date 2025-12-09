import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StepProps } from "@/containers/CreateTournament";
import {
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getTokenLogoUrl, getTokenSymbol } from "@/lib/tokensMeta";
import { X } from "@/components/Icons";
import {
  calculateDistribution,
  getOrdinalSuffix,
  formatNumber,
} from "@/lib/utils";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";
import { TokenSelector } from "@/components/createTournament/inputs/TokenSelector";
import { TokenAmountInput } from "@/components/createTournament/inputs/TokenAmountInput";
import { PrizeDistributionVisual } from "@/components/createTournament/PrizeDistributionVisual";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { useDojo } from "@/context/dojo";
import { FormToken } from "@/lib/types";
import { ChainId } from "@/dojo/setup/networks";

interface NewPrize {
  token: FormToken;
  tokenType: "ERC20" | "ERC721" | "";
  amount?: number;
  value?: number;
  tokenId?: number;
  position?: number;
}

const BonusPrizes = ({ form }: StepProps) => {
  const [selectedToken, setSelectedToken] = useState<FormToken | undefined>(
    undefined
  );
  const [tokenEverSelected, setTokenEverSelected] = useState(false);
  const [newPrize, setNewPrize] = useState<NewPrize>({
    token: {
      address: "",
      token_type: "",
      name: "",
      symbol: "",
      is_registered: false,
    },
    tokenType: "",
  });
  const [distributionWeight, setDistributionWeight] = useState(1);
  const [distributionType, setDistributionType] = useState<"exponential" | "linear" | "uniform">("exponential");
  const [leaderboardSize, setLeaderboardSize] = useState(10);
  const [prizeDistributions, setPrizeDistributions] = useState<
    { position: number; percentage: number }[]
  >([]);
  const [hasInsufficientBalance, setHasInsufficientBalance] = useState(false);
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

  const { getBalanceGeneral, getTokenDecimals } = useSystemCalls();

  const uniqueTokenSymbols = useMemo(() => {
    const bonusPrizes = form.watch("bonusPrizes") || [];

    // First map to get symbols, then filter out undefined values, then create a Set
    const symbols = bonusPrizes
      .map((prize) => getTokenSymbol(chainId, prize.token.address))
      .filter(
        (symbol): symbol is string =>
          typeof symbol === "string" && symbol !== ""
      );

    // Create a Set from the filtered array to get unique values
    return [...new Set(symbols)];
  }, [form.watch("bonusPrizes")]);

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: [
      ...uniqueTokenSymbols,
      ...(newPrize.token
        ? [getTokenSymbol(chainId, newPrize.token.address) ?? ""]
        : []),
    ],
  });

  const totalDistributionPercentage = useMemo(() => {
    return (
      prizeDistributions.reduce((sum, pos) => sum + (pos.percentage || 0), 0) ||
      0
    );
  }, [prizeDistributions]);

  const isValidPrize = () => {
    if (!newPrize.token) return false;

    if (newPrize.tokenType === "ERC20") {
      return !!newPrize.amount && totalDistributionPercentage === 100;
    }

    if (newPrize.tokenType === "ERC721") {
      return !!newPrize.tokenId && !!newPrize.position;
    }

    return false;
  };

  const isERC20 = newPrize.tokenType === "ERC20";

  useEffect(() => {
    const distributions = calculateDistribution(
      leaderboardSize,
      distributionWeight,
      0, // creatorFee
      0, // gameFee
      0, // refundShare
      distributionType
    );
    setPrizeDistributions(
      distributions.map((percentage, index) => ({
        position: index + 1,
        percentage,
      }))
    );
  }, [leaderboardSize, distributionWeight, distributionType]);

  useEffect(() => {
    setNewPrize((prev) => ({
      ...prev,
      amount:
        (prev.value ?? 0) /
        (prices?.[getTokenSymbol(chainId, prev.token?.address ?? "") ?? ""] ??
          1),
    }));
  }, [prices, newPrize.value]);

  useEffect(() => {
    if (selectedToken && !tokenEverSelected) {
      setTokenEverSelected(true);
    }
  }, [selectedToken, tokenEverSelected]);

  useEffect(() => {
    const checkBalances = async () => {
      if (!newPrize.token?.address || !newPrize.amount) {
        setHasInsufficientBalance(false);
        return;
      }

      const balances = await getBalanceGeneral(newPrize.token.address);
      const decimals = await getTokenDecimals(newPrize.token.address);
      const amount = (newPrize.amount ?? 0) * 10 ** decimals;

      if (balances < BigInt(amount)) {
        setHasInsufficientBalance(true);
      } else {
        setHasInsufficientBalance(false);
      }
    };
    checkBalances();
  }, [newPrize.token?.address, newPrize.amount]);

  return (
    <FormField
      control={form.control}
      name="enableBonusPrizes"
      render={({ field }) => (
        <FormItem className="flex flex-col sm:p-4">
          <OptionalSection
            label="Bonus Prizes"
            description="Enable additional prizes"
            checked={field.value}
            onCheckedChange={field.onChange}
          />

          {field.value && (
            <>
              <div className="w-full h-0.5 bg-brand/25" />
              <div className="flex flex-col gap-4">
                {/* Token Selection and Amount in a grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:divide-x lg:divide-brand/25">
                  {/* Token Selection */}
                  <TokenSelector
                    label="Prize Token"
                    description="Select the token for bonus prize"
                    selectedToken={selectedToken}
                    onTokenSelect={(token) => {
                      setSelectedToken(token);
                      setNewPrize((prev) => ({
                        ...prev,
                        token: token,
                        tokenType:
                          token.token_type === "erc20" ? "ERC20" : "ERC721",
                        // Reset other values when token changes
                        amount: undefined,
                        tokenId: undefined,
                        position: undefined,
                      }));
                    }}
                    quickSelectAddresses={QUICK_SELECT_ADDRESSES}
                  />

                  {/* Amount Input - Always rendered but hidden until token is selected */}
                  <div className="w-full h-0.5 bg-brand/25 lg:hidden" />
                  {newPrize.tokenType === "ERC20" ? (
                    <TokenAmountInput
                      label="Prize Amount"
                      description="Prize amount in USD"
                      value={newPrize.value || 0}
                      onChange={(value) =>
                        setNewPrize((prev) => ({
                          ...prev,
                          value: value,
                        }))
                      }
                      tokenAmount={newPrize.amount ?? 0}
                      tokenAddress={newPrize.token.address}
                      usdValue={newPrize.value ?? 0}
                      isLoading={pricesLoading}
                      visible={tokenEverSelected}
                      className="lg:pl-4"
                    />
                  ) : newPrize.tokenType === "ERC721" ? (
                    <div
                      className={`flex flex-col gap-2 transition-opacity lg:pl-4 ${
                        !tokenEverSelected
                          ? "opacity-0 pointer-events-none"
                          : "opacity-100"
                      }`}
                    >
                      <div className="flex flex-row items-center gap-5">
                        <FormLabel className="text-lg font-brand">
                          Token ID & Position
                        </FormLabel>
                        <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                          Enter token ID and leaderboard position
                        </FormDescription>
                      </div>
                      <div className="flex items-center gap-4">
                        <Input
                          type="number"
                          placeholder="Token ID"
                          value={newPrize.tokenId || ""}
                          onChange={(e) =>
                            setNewPrize((prev) => ({
                              ...prev,
                              tokenId: Number(e.target.value),
                            }))
                          }
                          className="w-[150px]"
                        />
                        <Input
                          type="number"
                          placeholder="Position"
                          min={1}
                          max={10}
                          value={newPrize.position || ""}
                          onChange={(e) =>
                            setNewPrize((prev) => ({
                              ...prev,
                              position: Number(e.target.value),
                            }))
                          }
                          className="w-[100px]"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="lg:pl-4" />
                  )}
                </div>

                {/* Add Prize Button */}
                {tokenEverSelected && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={!isValidPrize() || hasInsufficientBalance}
                        onClick={async () => {
                          const currentPrizes = form.watch("bonusPrizes") || [];
                          if (
                            newPrize.tokenType === "ERC20" &&
                            newPrize.amount &&
                            totalDistributionPercentage === 100
                          ) {
                            // Fetch token decimals for ERC20 tokens
                            let tokenDecimals = 18;
                            try {
                              tokenDecimals = await getTokenDecimals(newPrize.token.address);
                            } catch (error) {
                              console.error("Failed to fetch token decimals:", error);
                            }
                            
                            // Filter out prizes with 0 amount to avoid transaction errors
                            const validPrizes = prizeDistributions
                              .map((prize) => ({
                                type: "ERC20" as const,
                                token: newPrize.token,
                                amount:
                                  ((newPrize.amount ?? 0) * prize.percentage) /
                                  100,
                                position: prize.position,
                                tokenDecimals,
                              }))
                              .filter((prize) => prize.amount > 0);

                            form.setValue("bonusPrizes", [
                              ...currentPrizes,
                              ...validPrizes,
                            ]);
                          } else if (
                            newPrize.tokenType === "ERC721" &&
                            newPrize.tokenId &&
                            newPrize.position
                          ) {
                            form.setValue("bonusPrizes", [
                              ...currentPrizes,
                              {
                                type: "ERC721",
                                token: newPrize.token,
                                tokenId: newPrize.tokenId,
                                position: newPrize.position,
                              },
                            ]);
                          }
                          setNewPrize({
                            token: {
                              address: "",
                              token_type: "",
                              name: "",
                              symbol: "",
                              is_registered: false,
                            },
                            tokenType: "",
                          });
                          setSelectedToken(undefined);
                        }}
                      >
                        {hasInsufficientBalance
                          ? "Insufficient Balance"
                          : "Add Prize"}
                      </Button>
                    </div>
                  </>
                )}
                {isERC20 && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <PrizeDistributionVisual
                      distributions={prizeDistributions}
                      weight={distributionWeight}
                      onWeightChange={(value) => {
                        setDistributionWeight(value);
                      }}
                      onLeaderboardSizeChange={(value) => {
                        setLeaderboardSize(value);
                      }}
                      distributionType={distributionType}
                      onDistributionTypeChange={(type) => {
                        setDistributionType(type);
                      }}
                      disabled={false}
                      amount={newPrize.amount ?? 0}
                      tokenSymbol={newPrize.token.symbol}
                      usdValue={newPrize.value ?? 0}
                      tokenLogoUrl={getTokenLogoUrl(
                        chainId,
                        newPrize.token.address
                      )}
                      leaderboardSize={leaderboardSize}
                    />
                  </>
                )}

                {(form.watch("bonusPrizes") || []).length > 0 && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <div className="space-y-2">
                      <FormLabel className="font-brand text-2xl">
                        Added Prizes
                      </FormLabel>
                      <div className="flex flex-row items-center gap-2 overflow-x-auto pb-2 w-full">
                        {(form.watch("bonusPrizes") || []).map(
                          (prize, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 bg-background/50 border border-brand-muted/50 rounded flex-shrink-0"
                            >
                              <span>
                                {prize.position}
                                {getOrdinalSuffix(prize.position)}
                              </span>

                              <div className="flex flex-row items-center gap-2">
                                {prize.type === "ERC20" ? (
                                  <div className="flex flex-row items-center gap-1">
                                    <div className="flex flex-row gap-1 items-center">
                                      <span>
                                        {formatNumber(prize.amount ?? 0)}
                                      </span>
                                      <img
                                        src={prize.token.image}
                                        className="w-6 h-6 flex-shrink-0 rounded-full"
                                        alt="Token logo"
                                      />
                                    </div>

                                    <span className="text-sm text-neutral">
                                      {pricesLoading
                                        ? "Loading..."
                                        : prices?.[
                                            getTokenSymbol(
                                              chainId,
                                              prize.token.address
                                            ) ?? ""
                                          ] &&
                                          `~$${(
                                            (prize.amount ?? 0) *
                                            (prices?.[
                                              getTokenSymbol(
                                                chainId,
                                                prize.token.address
                                              ) ?? ""
                                            ] ?? 0)
                                          ).toFixed(2)}`}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex flex-row items-center gap-1">
                                    <img
                                      src={prize.token.image}
                                      className="w-6 h-6 flex-shrink-0 rounded-full"
                                      alt="Token logo"
                                    />
                                    <span className="whitespace-nowrap text-neutral">
                                      #{prize.tokenId}
                                    </span>
                                  </div>
                                )}

                                {/* Delete button */}
                                <span
                                  className="w-6 h-6 text-brand-muted cursor-pointer flex-shrink-0"
                                  onClick={() => {
                                    const newPrizes = [
                                      ...(form.watch("bonusPrizes") || []),
                                    ];
                                    newPrizes.splice(index, 1);
                                    form.setValue("bonusPrizes", newPrizes);
                                  }}
                                >
                                  <X />
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
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

export default BonusPrizes;
