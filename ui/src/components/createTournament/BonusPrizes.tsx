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
import AmountInput from "@/components/createTournament/inputs/Amount";
import TokenDialog from "@/components/dialogs/Token";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { X } from "@/components/Icons";
import { Slider } from "@/components/ui/slider";
import {
  calculateDistribution,
  getOrdinalSuffix,
  formatNumber,
} from "@/lib/utils";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";
import { TokenValue } from "@/components/createTournament/containers/TokenValue";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { useDojo } from "@/context/dojo";
import { FormToken } from "@/lib/types";

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
  const [prizeDistributions, setPrizeDistributions] = useState<
    { position: number; percentage: number }[]
  >([]);
  const [hasInsufficientBalance, setHasInsufficientBalance] = useState(false);
  const { selectedChainConfig } = useDojo();

  const chainId = selectedChainConfig?.chainId ?? "";

  const { getBalanceGeneral, getTokenDecimals } = useSystemCalls();

  const uniqueTokenAddresses = useMemo(() => {
    const bonusPrizes = form.watch("bonusPrizes") || [];

    // Get unique token addresses
    const addresses = bonusPrizes
      .map((prize) => prize.token.address)
      .filter((address): address is string => typeof address === "string" && address !== "");

    // Create a Set from the filtered array to get unique values
    return [...new Set(addresses)];
  }, [form.watch("bonusPrizes")]);

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: [
      ...uniqueTokenAddresses,
      ...(newPrize.token ? [newPrize.token.address] : []),
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
      form.watch("leaderboardSize"),
      distributionWeight
    );
    setPrizeDistributions(
      distributions.map((percentage, index) => ({
        position: index + 1,
        percentage,
      }))
    );
  }, []);

  useEffect(() => {
    setNewPrize((prev) => ({
      ...prev,
      amount:
        (prev.value ?? 0) /
        (prices?.[prev.token?.address ?? ""] ?? 1),
    }));
  }, [prices, newPrize.value]);

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
              <div className="flex flex-col gap-5">
                <div className="flex flex-row justify-between items-center sm:px-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-10 w-full">
                    <div className="flex flex-row items-center justify-between pt-4 sm:pt-6 w-full sm:w-auto">
                      <TokenDialog
                        selectedToken={selectedToken}
                        onSelect={(token) => {
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
                      />
                      <Button
                        className="sm:hidden"
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
                    {newPrize.token.address !== "" && (
                      <>
                        <div className="w-full h-0.5 bg-brand/25 sm:hidden" />
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-row items-center gap-5">
                            {newPrize.tokenType === "ERC20" ? (
                              <>
                                <FormLabel className="text-lg font-brand">
                                  Amount ($)
                                </FormLabel>
                                <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                                  Prize amount in USD
                                </FormDescription>
                                <TokenValue
                                  className="sm:hidden"
                                  amount={newPrize.amount ?? 0}
                                  tokenAddress={newPrize.token.address}
                                  usdValue={newPrize.value ?? 0}
                                  isLoading={pricesLoading}
                                />
                              </>
                            ) : (
                              <FormLabel className="text-lg font-brand">
                                Token ID
                              </FormLabel>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            {newPrize.tokenType === "ERC20" ? (
                              <div className="flex flex-row items-center gap-2">
                                <AmountInput
                                  value={newPrize.value || 0}
                                  onChange={(value) =>
                                    setNewPrize((prev) => ({
                                      ...prev,
                                      value: value,
                                    }))
                                  }
                                />
                                <TokenValue
                                  className="hidden sm:flex"
                                  amount={newPrize.amount ?? 0}
                                  tokenAddress={newPrize.token.address}
                                  usdValue={newPrize.value ?? 0}
                                  isLoading={pricesLoading}
                                />
                              </div>
                            ) : (
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
                            )}
                            {!isERC20 && (
                              <Input
                                type="number"
                                placeholder="Position"
                                min={1}
                                max={form.watch("leaderboardSize")}
                                value={newPrize.position || ""}
                                onChange={(e) =>
                                  setNewPrize((prev) => ({
                                    ...prev,
                                    position: Number(e.target.value),
                                  }))
                                }
                                className="w-[100px]"
                              />
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <Button
                    className="hidden sm:block"
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
                              ((newPrize.amount ?? 0) * prize.percentage) / 100,
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
                {isERC20 && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row justify-between">
                        <div className="flex flex-row items-center gap-5">
                          <FormLabel className="font-brand text-lg">
                            Prize Distribution
                          </FormLabel>
                          <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                            Set prize percentages for each position
                          </FormDescription>
                        </div>
                        <div className="flex flex-col">
                          <div className="flex flex-row gap-2 items-center justify-between text-sm text-muted-foreground">
                            <div className="flex flex-row items-center gap-2">
                              <FormLabel>Distribution Weight</FormLabel>
                              <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
                                Adjust the spread of the distribution
                              </FormDescription>
                            </div>
                            {totalDistributionPercentage !== 100 && (
                              <span className="text-destructive">
                                Total must equal 100%
                              </span>
                            )}
                          </div>
                          <div className="flex flex-row items-center gap-4">
                            <Slider
                              min={0}
                              max={5}
                              step={0.1}
                              value={[distributionWeight]}
                              onValueChange={([value]) => {
                                setDistributionWeight(value);
                                const distributions = calculateDistribution(
                                  form.watch("leaderboardSize"),
                                  value
                                );
                                setPrizeDistributions(
                                  distributions.map((percentage, index) => ({
                                    position: index + 1,
                                    percentage,
                                  }))
                                );
                              }}
                              className="w-[200px] h-10"
                            />
                            <span className="w-12 text-center">
                              {distributionWeight.toFixed(1)}
                            </span>
                            <div className="flex flex-row gap-2 items-center justify-between text-sm text-muted-foreground">
                              <span>Total: {totalDistributionPercentage}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center sm:flex-row gap-4 overflow-x-auto pb-2">
                        {Array.from({
                          length: form.watch("leaderboardSize"),
                        }).map((_, index) => (
                          <div
                            key={index}
                            className="w-[175px] min-w-[175px] flex flex-row items-center justify-between flex-shrink-0 border border-neutral rounded-md p-2"
                          >
                            <span className="font-brand text-lg">
                              {index + 1}
                              {getOrdinalSuffix(index + 1)}
                            </span>

                            <div className="relative m-0 w-[50px]">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                className="pr-4 px-1"
                                onChange={(e) => {
                                  const value = Number(e.target.value);
                                  setPrizeDistributions((prev) =>
                                    prev.map((item) =>
                                      item.position === index + 1
                                        ? { ...item, percentage: value }
                                        : item
                                    )
                                  );
                                }}
                                value={
                                  prizeDistributions[index]?.percentage || ""
                                }
                              />
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                                %
                              </span>
                            </div>

                            <div className="flex flex-col">
                              <div className="flex flex-row items-center gap-1">
                                <span className="text-xs">
                                  {formatNumber(
                                    ((prizeDistributions[index]?.percentage ??
                                      0) *
                                      (newPrize.amount ?? 0)) /
                                      100
                                  )}
                                </span>
                                <img
                                  src={getTokenLogoUrl(
                                    chainId,
                                    newPrize.token.address
                                  )}
                                  className="w-4"
                                />
                              </div>
                              {prices?.[newPrize.token.address] && (
                                <span className="text-xs text-neutral">
                                  ~$
                                  {(
                                    ((prizeDistributions[index]?.percentage ??
                                      0) *
                                      (newPrize.value ?? 0)) /
                                    100
                                  ).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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
                                        : prices?.[prize.token.address] &&
                                          `~$${(
                                            (prize.amount ?? 0) *
                                            (prices?.[prize.token.address] ?? 0)
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
