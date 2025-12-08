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
} from "@/lib/utils";
import { getTokenLogoUrl, getTokenSymbol } from "@/lib/tokensMeta";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useMemo, useState } from "react";
import { useDojo } from "@/context/dojo";
// import { calculateTotalValue } from "@/lib/utils/formatting";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useSettings } from "metagame-sdk/sql";

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

  const { settings } = useSettings({
    settingsIds: [Number(formData.settings)],
  });

  const hasSettings = !!settings[0];

  const hasBonusPrizes =
    formData.bonusPrizes && formData.bonusPrizes.length > 0;

  const { prices, isLoading: _pricesLoading } = useEkuboPrices({
    tokens: [
      ...(formData.bonusPrizes?.map(
        (prize) =>
          getTokenSymbol(
            selectedChainConfig.chainId ?? "",
            prize.token.address
          ) ?? ""
      ) ?? []),
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
  }, [prizeDistributionString, formData.entryFees?.amount, formData.entryFees?.value, formData.entryFees?.token?.address]);

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
                <span className="text-muted-foreground">Leaderboard Size:</span>
                <span>{formData.leaderboardSize}</span>
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
              <div className="flex flex-row justify-between items-center">
                <h3 className="font-bold text-lg">Schedule</h3>
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
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">
                  Registration Type:
                </span>
                <span className="capitalize">{formData.type}</span>
                {formData.type === "fixed" && formData.registrationStartTime && (
                  <>
                    <span className="text-muted-foreground">Registration Start:</span>
                    <div className="flex flex-col">
                      <span className="font-semibold">
                        {format(formData.registrationStartTime, "PPP")}
                      </span>
                      <span>{format(formData.registrationStartTime, "p")}</span>
                    </div>
                  </>
                )}
                {formData.type === "fixed" && formData.registrationEndTime && (
                  <>
                    <span className="text-muted-foreground">Registration End:</span>
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
                    {formData.enableEntryLimit && formData.gatingOptions.type !== "extension" && (
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
                              <th className="px-4 py-2 text-left">Winners</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.gatingOptions.tournament?.tournaments?.map(
                              (tournament) => (
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
                                  <td className="px-4 capitalize">
                                    {Number(tournament.game_config.prize_spots)}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </>
                    ) : formData.gatingOptions.type === "extension" ? (
                      <>
                        {formData.gatingOptions.extension?.address ? (
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
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              Extension Type:
                            </span>
                            <span>Snapshot Voting</span>
                          </>
                        )}
                        {formData.gatingOptions.extension?.config && (
                          <>
                            <span className="text-muted-foreground">
                              {formData.gatingOptions.extension?.address
                                ? "Extension Config:"
                                : "Snapshot ID:"}
                            </span>
                            <span className="font-mono text-xs break-all">
                              {formData.gatingOptions.extension.config}
                            </span>
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
                      {formData.bonusPrizes?.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {formData.bonusPrizes?.map((prize, index) => (
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
                              {prices?.[
                                getTokenSymbol(
                                  selectedChainConfig.chainId ?? "",
                                  prize.token.address
                                ) ?? ""
                              ] &&
                                `~$${(
                                  prize.amount *
                                  (prices?.[
                                    getTokenSymbol(
                                      selectedChainConfig.chainId ?? "",
                                      prize.token.address
                                    ) ?? ""
                                  ] ?? 0)
                                ).toFixed(2)}`}
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
              disabled={!isStartTimeValid || !isDurationValid || isCreating}
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
