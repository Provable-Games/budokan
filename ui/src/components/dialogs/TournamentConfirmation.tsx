import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TournamentFormData } from "@/containers/CreateTournament";
import { format } from "date-fns";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { ALERT, EXTERNAL_LINK } from "@/components/Icons";
import { useAccount } from "@starknet-react/core";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import useUIStore from "@/hooks/useUIStore";
import {
  feltToString,
  formatNumber,
  formatTime,
  getOrdinalSuffix,
  displayAddress,
  calculateDistribution,
} from "@/lib/utils";
import { calculatePaidPlaces } from "@/lib/utils/formatting";
import { getTokenLogoUrl, getTokenDecimals } from "@/lib/tokensMeta";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useMemo, useState, useEffect } from "react";
import { useDojo } from "@/context/dojo";
// import { calculateTotalValue } from "@/lib/utils/formatting";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useSettings } from "metagame-sdk/sql";
import { getExtensionAddresses } from "@/lib/extensionConfig";
import { getTokenByAddress } from "@/lib/tokenUtils";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";

interface TournamentConfirmationProps {
  formData: TournamentFormData;
  onConfirm: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TournamentConfirmation = ({
  formData,
  onConfirm,
  open,
  onOpenChange,
}: TournamentConfirmationProps) => {
  const { address } = useAccount();
  const { connect } = useConnectToSelectedChain();
  const { selectedChainConfig } = useDojo();
  const { gameData, getGameImage } = useUIStore();
  const [isCreating, setIsCreating] = useState(false);
  const [extensionRequiresRegistration, setExtensionRequiresRegistration] = useState(false);
  const { checkRegistrationOnly } = useSystemCalls();

  const { settings } = useSettings({
    settingsIds: [Number(formData.settings)],
  });

  const hasSettings = !!settings[0];

  const hasBonusPrizes =
    formData.bonusPrizes && formData.bonusPrizes.length > 0;

  const { prices, isLoading: _pricesLoading } = useEkuboPrices({
    tokens: [
      ...(formData.bonusPrizes?.map((prize) => prize.token.address) ?? []),
      ...(formData.entryFees?.token?.address
        ? [formData.entryFees.token.address]
        : []),
    ],
  });

  const currentTime = BigInt(new Date().getTime()) / 1000n;
  const startTime = BigInt(formData.startTime.getTime()) / 1000n;

  const isStartTimeValid =
    formData.type === "fixed" ? startTime - currentTime >= 900n : true;
  const isDurationValid = formData.duration >= 900n;

  // Check if extension requires registration period by calling the contract
  useEffect(() => {
    const checkExtensionRegistrationRequirement = async () => {
      if (
        formData.enableGating &&
        formData.gatingOptions?.type === "extension" &&
        formData.gatingOptions.extension?.address
      ) {
        const requiresReg = await checkRegistrationOnly(
          formData.gatingOptions.extension.address
        );
        setExtensionRequiresRegistration(requiresReg);
      } else {
        setExtensionRequiresRegistration(false);
      }
    };

    checkExtensionRegistrationRequirement();
  }, [
    formData.enableGating,
    formData.gatingOptions?.type,
    formData.gatingOptions?.extension?.address,
    checkRegistrationOnly,
  ]);

  // Check if there's a conflict between extension requirement and tournament type
  const hasRegistrationConflict =
    extensionRequiresRegistration && formData.type === "open";

  // Then convert the full prize distribution to JSON
  const prizeDistributionString = useMemo(
    () => JSON.stringify(formData.entryFees?.prizeDistribution || []),
    [formData.entryFees?.prizeDistribution]
  );

  const convertedEntryFees = useMemo(() => {
    return formData.entryFees?.prizeDistribution?.map((prize) => {
      return {
        type: "ERC20",
        tokenAddress: formData.entryFees?.token?.address ?? "",
        position: prize.position,
        amount: (prize.percentage * (formData.entryFees?.amount ?? 0)) / 100,
        value: (prize.percentage * (formData.entryFees?.value ?? 0)) / 100,
      };
    });
  }, [
    prizeDistributionString,
    formData.entryFees?.amount,
    formData.entryFees?.value,
    formData.entryFees?.token?.address,
  ]);

  // Expand distributed bonus prizes into individual position entries
  const expandedBonusPrizes = useMemo(() => {
    if (!formData.bonusPrizes) return [];

    const expanded: any[] = [];

    formData.bonusPrizes.forEach((prize) => {
      // For ERC20 prizes with distribution, expand into individual positions
      if (
        prize.type === "ERC20" &&
        prize.distribution &&
        prize.distributionCount &&
        prize.distributionCount > 1
      ) {
        // Calculate distribution percentages
        let distributionPercentages: number[] = [];
        const weight = 1; // Default weight for uniform distribution

        if (prize.distribution === "linear") {
          distributionPercentages = calculateDistribution(
            prize.distributionCount,
            weight,
            0,
            0,
            0,
            "linear"
          );
        } else if (prize.distribution === "exponential") {
          distributionPercentages = calculateDistribution(
            prize.distributionCount,
            weight,
            0,
            0,
            0,
            "exponential"
          );
        } else {
          // Uniform distribution
          distributionPercentages = calculateDistribution(
            prize.distributionCount,
            weight,
            0,
            0,
            0,
            "uniform"
          );
        }

        // Create individual position entries
        distributionPercentages.forEach((percentage, index) => {
          const tokenPrice =
            prices?.[prize.token.address] ?? 0;
          expanded.push({
            type: "ERC20",
            token: prize.token,
            position: prize.position + index,
            amount: (percentage * prize.amount) / 100,
            value: (percentage * prize.amount * tokenPrice) / 100,
            isDistributed: true,
          });
        });
      } else {
        // For NFTs or non-distributed ERC20 prizes, keep as-is
        const tokenPrice =
          prize.type === "ERC20" ? prices?.[prize.token.address] ?? 0 : 0;
        expanded.push({
          ...prize,
          value:
            prize.type === "ERC20" ? prize.amount * tokenPrice : undefined,
          isDistributed: false,
        });
      }
    });

    return expanded;
  }, [formData.bonusPrizes, prices]);

  // Parse ERC20 balance validator config if present
  const erc20BalanceConfig = useMemo(() => {
    if (
      formData.gatingOptions?.type !== "extension" ||
      !formData.gatingOptions?.extension?.config
    ) {
      return null;
    }

    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    const isERC20Validator =
      formData.gatingOptions.extension.address ===
      extensionAddresses.erc20BalanceValidator;

    if (!isERC20Validator) return null;

    // Parse config: [token_address, min_threshold_low, min_threshold_high, max_threshold_low, max_threshold_high, value_per_entry_low, value_per_entry_high, max_entries]
    const configParts =
      formData.gatingOptions.extension.config.split(",");
    if (configParts.length < 8) return null;

    const tokenAddress = configParts[0];
    const minThresholdLow = BigInt(configParts[1]);
    const minThresholdHigh = BigInt(configParts[2]);
    const maxThresholdLow = BigInt(configParts[3]);
    const maxThresholdHigh = BigInt(configParts[4]);
    const valuePerEntryLow = BigInt(configParts[5]);
    const valuePerEntryHigh = BigInt(configParts[6]);
    const maxEntriesValue = Number(configParts[7]);

    // Combine high and low parts to form u256 values
    const minThreshold = (minThresholdHigh << 128n) | minThresholdLow;
    const maxThreshold = (maxThresholdHigh << 128n) | maxThresholdLow;
    const valuePerEntry = (valuePerEntryHigh << 128n) | valuePerEntryLow;

    const token = getTokenByAddress(
      tokenAddress,
      selectedChainConfig?.chainId ?? ""
    );

    // Get token decimals (default to 18 if not available)
    const decimals = getTokenDecimals(
      selectedChainConfig?.chainId ?? "",
      tokenAddress
    ) || 18;
    const divisor = BigInt(10 ** decimals);

    // Convert wei values to human-readable format
    const formatTokenAmount = (value: bigint) => {
      if (value === 0n) return "0";
      const integerPart = value / divisor;
      const remainder = value % divisor;
      if (remainder === 0n) {
        return integerPart.toString();
      }
      // Format with decimals, removing trailing zeros
      const decimalStr = remainder.toString().padStart(decimals, "0");
      const trimmed = decimalStr.replace(/0+$/, "");
      return trimmed ? `${integerPart}.${trimmed}` : integerPart.toString();
    };

    // Calculate USD values
    const tokenPrice = prices?.[tokenAddress] ?? 0;
    const calculateUSD = (value: bigint): number => {
      if (value === 0n || tokenPrice === 0) return 0;
      const amount = Number(value) / (10 ** decimals);
      return amount * tokenPrice;
    };

    return {
      tokenAddress,
      token,
      minThreshold: minThreshold,
      maxThreshold: maxThreshold,
      valuePerEntry: valuePerEntry,
      maxEntries: maxEntriesValue,
      // Human-readable formatted values
      minThresholdFormatted: formatTokenAmount(minThreshold),
      maxThresholdFormatted: formatTokenAmount(maxThreshold),
      valuePerEntryFormatted: formatTokenAmount(valuePerEntry),
      // USD values
      minThresholdUSD: calculateUSD(minThreshold),
      maxThresholdUSD: calculateUSD(maxThreshold),
      valuePerEntryUSD: calculateUSD(valuePerEntry),
    };
  }, [
    formData.gatingOptions?.type,
    formData.gatingOptions?.extension?.address,
    formData.gatingOptions?.extension?.config,
    selectedChainConfig?.chainId,
    prices,
  ]);

  const handleConfirm = async () => {
    setIsCreating(true);
    try {
      await onConfirm();
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to create tournament:", error);
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex flex-row gap-2 items-center">
              <span className="w-8 h-8">
                <ALERT />
              </span>
              Confirm Tournament Details
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto sm:p-6 pt-2 max-h-[60vh]">
          <div className="space-y-6">
            {/* Details Section */}
            <div className="space-y-2">
              <h3 className="font-bold text-lg">Tournament Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Name:</span>
                <span>{formData.name}</span>
                <span className="text-muted-foreground">Description:</span>
                <span className="whitespace-pre-wrap">
                  {formData.description}
                </span>
                <span className="text-muted-foreground">Game:</span>
                <div className="flex flex-row items-center gap-2">
                  <TokenGameIcon image={getGameImage(formData.game)} />
                  <span>
                    {gameData.find(
                      (game) => game.contract_address === formData.game
                    )?.name ?? ""}
                  </span>
                  <a
                    href={`${selectedChainConfig.blockExplorerUrl}/contract/${formData.game}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-6 text-neutral"
                  >
                    <EXTERNAL_LINK />
                  </a>
                </div>
                <span className="text-muted-foreground">Settings:</span>
                <span>{hasSettings ? settings[0].name : "Default"}</span>
                {/* TODO: Uncomment when ready to use soulbound and play_url */}
                {/* <span className="text-muted-foreground">Soulbound:</span>
                <span>{formData.soulbound ? "Yes" : "No"}</span>
                {formData.play_url && formData.play_url.trim() !== "" && (
                  <>
                    <span className="text-muted-foreground">Play URL:</span>
                    <a
                      href={formData.play_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline flex items-center gap-1"
                    >
                      {formData.play_url}
                      <span className="w-4 h-4">
                        <EXTERNAL_LINK />
                      </span>
                    </a>
                  </>
                )} */}
              </div>
            </div>

            <div className="w-full h-0.5 bg-brand/25 mt-2" />

            {/* Schedule Section */}
            <div className="space-y-2">
              <div className="flex flex-col gap-2">
                <div className="flex flex-row justify-between items-center">
                  <h3 className="font-bold text-lg">Schedule</h3>
                  <div className="flex flex-col gap-1">
                    {!isStartTimeValid && (
                      <div className="flex flex-row gap-2 items-center text-destructive">
                        <span className="w-6">
                          <ALERT />
                        </span>
                        Registration period is less than 15 minutes
                      </div>
                    )}
                    {!isDurationValid && (
                      <span className="flex flex-row gap-2 items-center text-destructive">
                        <span className="w-6">
                          <ALERT />
                        </span>
                        Tournament duration is less than 15 minutes
                      </span>
                    )}
                    {hasRegistrationConflict && (
                      <div className="flex flex-row gap-2 items-center text-destructive">
                        <span className="w-6">
                          <ALERT />
                        </span>
                        <span className="text-sm">
                          This extension requires a Fixed tournament with registration period
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">
                  Registration Type:
                </span>
                <span className="capitalize">{formData.type}</span>
                {formData.type === "fixed" &&
                  formData.registrationStartTime && (
                    <>
                      <span className="text-muted-foreground">
                        Registration Start:
                      </span>
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {format(formData.registrationStartTime, "PPP")}
                        </span>
                        <span>
                          {format(formData.registrationStartTime, "p")}
                        </span>
                      </div>
                    </>
                  )}
                {formData.type === "fixed" && formData.registrationEndTime && (
                  <>
                    <span className="text-muted-foreground">
                      Registration End:
                    </span>
                    <div className="flex flex-col">
                      <span className="font-semibold">
                        {format(formData.registrationEndTime, "PPP")}
                      </span>
                      <span>{format(formData.registrationEndTime, "p")}</span>
                    </div>
                  </>
                )}
                <span className="text-muted-foreground">Tournament Start:</span>
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {format(formData.startTime, "PPP")}
                  </span>
                  <span>{format(formData.startTime, "p")}</span>
                </div>
                <span className="text-muted-foreground">Tournament End:</span>
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {format(
                      new Date(
                        formData.startTime.getTime() +
                          Number(formData.duration) * 1000
                      ),
                      "PPP"
                    )}
                  </span>
                  <span>
                    {format(
                      new Date(
                        formData.startTime.getTime() +
                          Number(formData.duration) * 1000
                      ),
                      "p"
                    )}
                  </span>
                </div>
                <span className="text-muted-foreground">Duration:</span>
                <span>{formatTime(formData.duration)}</span>
                <span className="text-muted-foreground">
                  Submission Period:
                </span>
                <span>{formatTime(formData.submissionPeriod)}</span>
              </div>
            </div>

            {/* Entry Requirements */}
            {formData.enableGating && formData.gatingOptions && (
              <>
                <div className="w-full h-0.5 bg-brand/25 mt-2" />
                <div className="space-y-2">
                  <h3 className="font-bold text-lg">Entry Requirements</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="capitalize">
                      {formData.gatingOptions.type}
                    </span>
                    {formData.enableEntryLimit &&
                      formData.gatingOptions.type !== "extension" && (
                        <>
                          <span className="text-muted-foreground">
                            Entry Limit:
                          </span>
                          <span>{formData.gatingOptions.entry_limit}</span>
                        </>
                      )}
                    {formData.gatingOptions.type === "token" ? (
                      <>
                        <span className="text-muted-foreground">
                          Token Details:
                        </span>
                        <div className="flex flex-row items-center gap-2">
                          <img
                            src={formData.gatingOptions.token?.image ?? ""}
                            alt={formData.gatingOptions.token?.address ?? ""}
                            className="w-8 h-8 rounded-full"
                          />
                          <span>{formData.gatingOptions.token?.symbol}</span>
                          <span className="text-neutral">
                            {displayAddress(
                              formData.gatingOptions.token?.address ?? ""
                            )}
                          </span>
                          <a
                            href={`${selectedChainConfig.blockExplorerUrl}/nft-contract/${formData.gatingOptions.token?.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-6 text-neutral"
                          >
                            <EXTERNAL_LINK />
                          </a>
                        </div>
                      </>
                    ) : formData.gatingOptions.type === "tournament" ? (
                      <>
                        <span className="text-muted-foreground">
                          Requirement:
                        </span>
                        <span className="capitalize">
                          {formData.gatingOptions.tournament?.requirement}
                        </span>
                        <span className="text-muted-foreground">
                          Qualifying Mode:
                        </span>
                        <span>
                          {formData.gatingOptions.tournament?.qualifying_mode === 0
                            ? "At Least One"
                            : formData.gatingOptions.tournament?.qualifying_mode === 1
                            ? "Cumulative per Tournament"
                            : formData.gatingOptions.tournament?.qualifying_mode === 2
                            ? "All"
                            : formData.gatingOptions.tournament?.qualifying_mode === 3
                            ? "Cumulative per Entry"
                            : formData.gatingOptions.tournament?.qualifying_mode === 4
                            ? "All Participate, Any Win"
                            : formData.gatingOptions.tournament?.qualifying_mode === 5
                            ? "All With Cumulative"
                            : "Unknown"}
                        </span>
                        {formData.gatingOptions.tournament?.requirement === "won" && (
                          <>
                            <span className="text-muted-foreground">
                              Top Positions:
                            </span>
                            <span>
                              Top {formData.gatingOptions.tournament?.top_positions ?? 1}
                            </span>
                          </>
                        )}
                        <span>Total Tournaments:</span>
                        <span>
                          {
                            formData.gatingOptions.tournament?.tournaments
                              ?.length
                          }
                        </span>
                        <span>Tournaments:</span>
                        <table className="table-auto col-span-2 w-full">
                          <thead>
                            <tr>
                              <th className="px-4 py-2 text-left">Id</th>
                              <th className="px-4 py-2 text-left">Name</th>
                              <th className="px-4 py-2 text-left">Game</th>
                              <th className="px-4 py-2 text-left">
                                Paid Places
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.gatingOptions.tournament?.tournaments?.map(
                              (tournament) => {
                                // Calculate paid places for this tournament
                                const paidPlaces = calculatePaidPlaces(
                                  tournament.entry_fee,
                                  [] // We don't have prizes data here, so just use entry fee
                                );

                                return (
                                  <tr key={tournament.metadata.name}>
                                    <td className="px-4">
                                      {Number(tournament.id)}
                                    </td>
                                    <td className="px-4 capitalize">
                                      {feltToString(tournament.metadata.name)}
                                    </td>
                                    <td className="px-4 capitalize">
                                      <div className="flex flex-row items-center gap-2">
                                        <TokenGameIcon
                                          image={getGameImage(
                                            tournament.game_config.address
                                          )}
                                        />
                                        {gameData.find(
                                          (game) =>
                                            game.contract_address ===
                                            tournament.game_config.address
                                        )?.name ?? ""}
                                      </div>
                                    </td>
                                    <td className="px-4">
                                      {paidPlaces > 0 ? paidPlaces : "-"}
                                    </td>
                                  </tr>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </>
                    ) : formData.gatingOptions.type === "extension" ? (
                      <>
                        {erc20BalanceConfig ? (
                          <>
                            <span className="text-muted-foreground">
                              Extension Type:
                            </span>
                            <span>ERC20 Balance Validation</span>
                            <span className="text-muted-foreground">
                              Token:
                            </span>
                            <div className="flex flex-row items-center gap-2">
                              <img
                                src={erc20BalanceConfig.token?.image ?? ""}
                                alt={erc20BalanceConfig.token?.symbol ?? ""}
                                className="w-6 h-6 rounded-full"
                              />
                              <span>{erc20BalanceConfig.token?.symbol ?? "Unknown"}</span>
                              <span className="text-neutral font-mono text-xs">
                                {displayAddress(erc20BalanceConfig.tokenAddress)}
                              </span>
                              <a
                                href={`${selectedChainConfig.blockExplorerUrl}/contract/${erc20BalanceConfig.tokenAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-6 text-neutral"
                              >
                                <EXTERNAL_LINK />
                              </a>
                            </div>
                            <span className="text-muted-foreground">
                              Min Balance:
                            </span>
                            <div className="flex flex-row items-center gap-2">
                              <span>
                                {erc20BalanceConfig.minThresholdFormatted}
                              </span>
                              <span className="text-neutral">
                                {erc20BalanceConfig.token?.symbol ?? "tokens"}
                              </span>
                              {erc20BalanceConfig.minThresholdUSD > 0 && (
                                <span className="text-neutral">
                                  (≈ ${erc20BalanceConfig.minThresholdUSD.toFixed(2)})
                                </span>
                              )}
                            </div>
                            {erc20BalanceConfig.maxThreshold > 0n && (
                              <>
                                <span className="text-muted-foreground">
                                  Max Balance:
                                </span>
                                <div className="flex flex-row items-center gap-2">
                                  <span>
                                    {erc20BalanceConfig.maxThresholdFormatted}
                                  </span>
                                  <span className="text-neutral">
                                    {erc20BalanceConfig.token?.symbol ?? "tokens"}
                                  </span>
                                  {erc20BalanceConfig.maxThresholdUSD > 0 && (
                                    <span className="text-neutral">
                                      (≈ ${erc20BalanceConfig.maxThresholdUSD.toFixed(2)})
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                            {erc20BalanceConfig.valuePerEntry > 0n && (
                              <>
                                <span className="text-muted-foreground">
                                  Value Per Entry:
                                </span>
                                <div className="flex flex-row items-center gap-2">
                                  <span>
                                    {erc20BalanceConfig.valuePerEntryFormatted}
                                  </span>
                                  <span className="text-neutral">
                                    {erc20BalanceConfig.token?.symbol ?? "tokens"}
                                  </span>
                                  {erc20BalanceConfig.valuePerEntryUSD > 0 && (
                                    <span className="text-neutral">
                                      (≈ ${erc20BalanceConfig.valuePerEntryUSD.toFixed(2)})
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                            {erc20BalanceConfig.maxEntries > 0 && (
                              <>
                                <span className="text-muted-foreground">
                                  Max Entries:
                                </span>
                                <span>{erc20BalanceConfig.maxEntries}</span>
                              </>
                            )}
                          </>
                        ) : formData.gatingOptions.extension?.address ? (
                          <>
                            <span className="text-muted-foreground">
                              Extension Contract:
                            </span>
                            <div className="flex flex-row items-center gap-2">
                              <span className="font-mono text-xs">
                                {displayAddress(
                                  formData.gatingOptions.extension.address
                                )}
                              </span>
                              <a
                                href={`${selectedChainConfig.blockExplorerUrl}/contract/${formData.gatingOptions.extension.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-6 text-neutral"
                              >
                                <EXTERNAL_LINK />
                              </a>
                            </div>
                            {formData.gatingOptions.extension?.config && (
                              <>
                                <span className="text-muted-foreground">
                                  Extension Config:
                                </span>
                                <span className="font-mono text-xs break-all">
                                  {formData.gatingOptions.extension.config}
                                </span>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              Extension Type:
                            </span>
                            <span>Snapshot Voting</span>
                            {formData.gatingOptions.extension?.config && (
                              <>
                                <span className="text-muted-foreground">
                                  Snapshot ID:
                                </span>
                                <span className="font-mono text-xs break-all">
                                  {formData.gatingOptions.extension.config}
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span>Addresses:</span>
                        <div className="flex flex-col gap-1">
                          {formData.gatingOptions.addresses?.map(
                            (address, index) => (
                              <div
                                key={index}
                                className="flex flex-row items-center gap-2"
                              >
                                <span>{index + 1}.</span>
                                <span>{displayAddress(address)}</span>
                                <a
                                  href={`${selectedChainConfig.blockExplorerUrl}/${address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-6"
                                >
                                  <EXTERNAL_LINK />
                                </a>
                              </div>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Entry Fees */}
            {formData.enableEntryFees && formData.entryFees && (
              <>
                <div className="w-full h-0.5 bg-brand/25 mt-2" />
                <div className="space-y-2">
                  <div className="flex flex-row justify-between items-center">
                    <h3 className="font-bold text-lg">Entry Fees</h3>
                    <div className="flex flex-row items-center gap-2">
                      <span className="font-bold text-lg">Total:</span>
                      <div className="flex flex-row items-center gap-2">
                        <span>
                          {formatNumber(formData.entryFees.amount ?? 0)}
                        </span>
                        <img
                          src={formData.entryFees.token?.image ?? ""}
                          alt={formData.entryFees.token?.address ?? ""}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-neutral">
                          ~${formData.entryFees.value?.toFixed(2) ?? "0.00"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Creator Fee:</span>
                    <div className="flex flex-row items-center gap-2">
                      <span>{formData.entryFees.creatorFeePercentage}%</span>
                      <span>
                        {formatNumber(
                          ((formData.entryFees.creatorFeePercentage ?? 0) *
                            (formData.entryFees.amount ?? 0)) /
                            100
                        )}
                      </span>
                      <img
                        src={formData.entryFees.token?.image ?? ""}
                        alt={formData.entryFees.token?.address ?? ""}
                        className="w-6 h-6 rounded-full"
                      />
                      <span className="text-neutral">
                        ~$
                        {(
                          ((formData.entryFees.creatorFeePercentage ?? 0) *
                            (formData.entryFees.value ?? 0)) /
                          100
                        )?.toFixed(2) ?? "0.00"}
                      </span>
                    </div>
                    <span className="text-muted-foreground">Game Fee:</span>
                    <div className="flex flex-row items-center gap-2">
                      <span>{formData.entryFees.gameFeePercentage}%</span>
                      <span>
                        {formatNumber(
                          ((formData.entryFees.gameFeePercentage ?? 0) *
                            (formData.entryFees.amount ?? 0)) /
                            100
                        )}
                      </span>
                      <img
                        src={formData.entryFees.token?.image ?? ""}
                        alt={formData.entryFees.token?.address ?? ""}
                        className="w-6 h-6 rounded-full"
                      />
                      <span className="text-neutral">
                        ~$
                        {(
                          ((formData.entryFees.gameFeePercentage ?? 0) *
                            (formData.entryFees.value ?? 0)) /
                          100
                        )?.toFixed(2) ?? "0.00"}
                      </span>
                    </div>
                    <span>Payouts:</span>
                    <div className="flex flex-col col-span-2 gap-2">
                      {convertedEntryFees?.map((prize, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border border-brand-muted rounded-md"
                        >
                          <span className="font-brand w-10">
                            {`${prize.position}${getOrdinalSuffix(
                              prize.position
                            )}`}
                            :
                          </span>
                          <div className="flex flex-row gap-2 items-center">
                            <span>{formatNumber(prize.amount)}</span>
                            <img
                              src={getTokenLogoUrl(
                                selectedChainConfig.chainId ?? "",
                                prize.tokenAddress
                              )}
                              alt={prize.tokenAddress}
                              className="w-6 h-6 rounded-full"
                            />
                            <span className="text-neutral">
                              ~$
                              {(prize.value ?? 0)?.toFixed(2) ?? "0.00"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Bonus Prizes */}
            {formData.enableBonusPrizes && hasBonusPrizes && (
              <>
                <div className="w-full h-0.5 bg-brand/25 mt-2" />
                <div className="space-y-2">
                  <div className="flex flex-row justify-between items-center">
                    <h3 className="font-bold text-lg">Bonus Prizes</h3>
                    <span className="text-muted-foreground">
                      {expandedBonusPrizes.length} position{expandedBonusPrizes.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {expandedBonusPrizes.map((prize, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border border-brand-muted rounded-md"
                      >
                        <span className="font-brand w-10">
                          {`${prize.position}${getOrdinalSuffix(
                            prize.position
                          )}`}
                          :
                        </span>
                        {prize.type === "ERC20" ? (
                          <div className="flex flex-row gap-2 items-center">
                            <span>{formatNumber(prize.amount)}</span>
                            <img
                              src={prize.token.image ?? ""}
                              alt={prize.token.address}
                              className="w-6 h-6 rounded-full"
                            />
                            <span className="text-neutral">
                              ~${(prize.value ?? 0).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-row gap-2 items-center">
                            <img
                              src={prize.token.image ?? ""}
                              alt={prize.token.address}
                              className="w-6 h-6 rounded-full"
                            />
                            <span>#{prize.tokenId}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 sm:mt-4 2xl:mt-6">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {address ? (
            <Button
              onClick={handleConfirm}
              disabled={
                !isStartTimeValid ||
                !isDurationValid ||
                hasRegistrationConflict ||
                isCreating
              }
            >
              {isCreating ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner />
                  <span>Creating...</span>
                </div>
              ) : (
                "Confirm & Create"
              )}
            </Button>
          ) : (
            <Button onClick={() => connect()}>Connect Wallet</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TournamentConfirmation;
