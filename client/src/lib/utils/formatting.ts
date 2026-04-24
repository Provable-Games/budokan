import { TournamentFormData } from "@/containers/CreateTournament";
import { bigintToHex, indexAddress, stringToFelt, calculateDistribution } from "@/lib/utils";
import { DisplayPrize, TokenMetadata } from "@/lib/types";
import {
  addAddressPadding,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
  BigNumberish,
} from "starknet";
import {
  Prize,
  Tournament,
  EntryFee,
  RewardClaim,
  Leaderboard,
  QualificationProofEnum,
  ERC20Data,
  ERC721Data,
} from "@/generated/models.gen";
import { PositionPrizes, TokenPrizes } from "@/lib/types";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import type { Schedule } from "@/generated/models.gen";

/**
 * Compute absolute timestamps from a tournament's created_at and delay-based schedule.
 */
export function computeAbsoluteTimes(createdAt: BigNumberish, schedule: Schedule) {
  const base = Number(createdAt);
  const regStart = base + Number(schedule.registration_start_delay);
  const regEnd = regStart + Number(schedule.registration_end_delay);
  const gameStart = base + Number(schedule.game_start_delay);
  const gameEnd = gameStart + Number(schedule.game_end_delay);
  const submissionEnd = gameEnd + Number(schedule.submission_duration);
  return {
    registrationStartTime: regStart,
    registrationEndTime: regEnd,
    gameStartTime: gameStart,
    gameEndTime: gameEnd,
    submissionEndTime: submissionEnd,
  };
}

export const processTournamentData = (
  formData: TournamentFormData,
  address: string,
  tournamentCount: number,
  tournamentValidatorAddress?: string
): Tournament => {
  // All schedule fields are now delays (seconds from created_at).
  // The contract computes absolute times as created_at + delay.
  const now = Math.floor(Date.now() / 1000);

  const gameStartTimestamp = Math.floor(
    Date.UTC(
      formData.startTime.getUTCFullYear(),
      formData.startTime.getUTCMonth(),
      formData.startTime.getUTCDate(),
      formData.startTime.getUTCHours(),
      formData.startTime.getUTCMinutes(),
      formData.startTime.getUTCSeconds()
    ) / 1000
  );

  // Delays relative to "now" (will be relative to created_at on-chain)
  // game_start_delay: offset from created_at to game start
  // game_end_delay: duration of game (offset from game_start to game_end)
  const gameStartDelay = Math.max(0, gameStartTimestamp - now);
  const gameEndDelay = formData.duration;

  // Registration delays - 0 means "open" (no registration period)
  let registrationStartDelay = 0;
  let registrationEndDelay = 0;

  if (formData.type === "fixed" && formData.registrationStartTime) {
    const regStartTimestamp = Math.floor(
      Date.UTC(
        formData.registrationStartTime.getUTCFullYear(),
        formData.registrationStartTime.getUTCMonth(),
        formData.registrationStartTime.getUTCDate(),
        formData.registrationStartTime.getUTCHours(),
        formData.registrationStartTime.getUTCMinutes(),
        formData.registrationStartTime.getUTCSeconds()
      ) / 1000
    );
    registrationStartDelay = Math.max(0, regStartTimestamp - now);

    if (formData.registrationEndTime) {
      const regEndTimestamp = Math.floor(
        Date.UTC(
          formData.registrationEndTime.getUTCFullYear(),
          formData.registrationEndTime.getUTCMonth(),
          formData.registrationEndTime.getUTCDate(),
          formData.registrationEndTime.getUTCHours(),
          formData.registrationEndTime.getUTCMinutes(),
          formData.registrationEndTime.getUTCSeconds()
        ) / 1000
      );
      // registration_end_delay is duration from reg_start, not absolute offset
      registrationEndDelay = Math.max(0, regEndTimestamp - (now + registrationStartDelay));
    }
  }

  // Process entry requirement based on type and requirement
  let entryRequirementType;
  if (formData.enableGating && formData.gatingOptions?.type) {
    switch (formData.gatingOptions.type) {
      case "token":
        entryRequirementType = new CairoCustomEnum({
          token: formData.gatingOptions.token?.address,
          extension: undefined,
        });
        break;
      case "tournament":
        // Tournaments are now validated as extensions
        // Config format: [qualifier_type, qualifying_mode, top_positions, ...tournament_ids]
        // qualifier_type: 0 = QUALIFIER_TYPE_PARTICIPANTS, 1 = QUALIFIER_TYPE_WINNERS
        // qualifying_mode: 0 = ANY, 1 = ANY_PER_TOURNAMENT, 2 = ALL, 3 = PER_ENTRY, 4 = ALL_PARTICIPATE_ANY_WIN, 5 = ALL_WITH_CUMULATIVE_ENTRIES
        // top_positions: for winners, how many top positions count (0 = all positions)
        const qualifierType =
          formData.gatingOptions.tournament?.requirement === "won" ? "1" : "0";
        const qualifyingMode = String(formData.gatingOptions.tournament?.qualifying_mode ?? 0);
        // For participated, use 0 (all positions). For won/top position, use the selected value (1-200)
        const topPositions = formData.gatingOptions.tournament?.requirement === "won"
          ? String(formData.gatingOptions.tournament?.top_positions ?? 1)
          : "0";
        const tournamentIds =
          formData.gatingOptions.tournament?.tournaments.map((t) => String(t.id)) || [];
        const tournamentConfig = [qualifierType, qualifyingMode, topPositions, ...tournamentIds];

        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          extension: {
            address: tournamentValidatorAddress || "",
            config: tournamentConfig,
          },
        });
        break;
      case "extension":
        const configString = formData.gatingOptions.extension?.config || "";
        const configArray = configString
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v !== "");

        console.log("Extension config parsing:", {
          extensionAddress: formData.gatingOptions.extension?.address,
          configString,
          configArrayBeforeFilter: configString.split(","),
          configArrayAfterTrim: configString.split(",").map((v) => v.trim()),
          configArrayFinal: configArray,
        });

        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          extension: {
            address: formData.gatingOptions.extension?.address,
            config: configArray,
          },
        });
        break;
    }
  }

  let entryRequirement;
  if (formData.enableGating && entryRequirementType) {
    entryRequirement = {
      entry_limit:
        formData.gatingOptions?.type === "extension"
          ? 0 // Extensions handle their own entry limits
          : formData.enableEntryLimit
          ? formData.gatingOptions?.entry_limit ?? 0
          : 0,
      entry_requirement_type: entryRequirementType,
    };
  }

  return {
    id: tournamentCount + 1,
    created_at: 0,
    created_by: addAddressPadding(address),
    creator_token_id: 0,
    metadata: {
      name: addAddressPadding(bigintToHex(stringToFelt(formData.name))),
      description: formData.description,
    },
    schedule: {
      registration_start_delay: registrationStartDelay,
      registration_end_delay: registrationEndDelay,
      game_start_delay: gameStartDelay,
      game_end_delay: gameEndDelay,
      submission_duration: Number(formData.submissionPeriod),
    },
    game_config: {
      game_address: addAddressPadding(formData.game),
      settings_id: formData.settings,
      soulbound: formData.soulbound,
      paymaster: false,
      client_url: formData.play_url
        ? new CairoOption(CairoOptionVariant.Some, formData.play_url)
        : new CairoOption(CairoOptionVariant.None),
      renderer: new CairoOption(CairoOptionVariant.None),
    },
    entry_fee: formData.enableEntryFees
      ? new CairoOption(
          CairoOptionVariant.Some,
          (() => {
            const tournamentCreatorBps = Math.round(
              (formData.entryFees?.creatorFeePercentage ?? 0) * 100
            );
            const gameCreatorBps = Math.round(
              (formData.entryFees?.gameFeePercentage ?? 1) * 100
            );
            const refundBps = Math.round(
              (formData.entryFees?.refundSharePercentage ?? 0) * 100
            );
            // No pool left for position payouts → force distribution to
            // Uniform with count 0 so downstream (indexer / claim UIs /
            // on-chain reads) see an unambiguous "no positions" signal.
            const hasPrizePool =
              10000 - tournamentCreatorBps - gameCreatorBps - refundBps > 0;
            const formPayoutCount =
              formData.entryFees?.prizePoolPayoutCount ?? 0;

            let distribution: CairoCustomEnum;
            let distributionCount: number;
            if (!hasPrizePool) {
              distribution = new CairoCustomEnum({
                Linear: undefined,
                Exponential: undefined,
                Uniform: {},
                Custom: undefined,
              });
              distributionCount = 0;
            } else {
              const distributionType =
                formData.entryFees?.distributionType ?? "exponential";
              const weight = formData.entryFees?.distributionWeight ?? 1;
              const scaledWeight = Math.round(weight * 10);
              if (distributionType === "linear") {
                distribution = new CairoCustomEnum({
                  Linear: scaledWeight,
                  Exponential: undefined,
                  Uniform: undefined,
                  Custom: undefined,
                });
              } else if (distributionType === "exponential") {
                distribution = new CairoCustomEnum({
                  Linear: undefined,
                  Exponential: scaledWeight,
                  Uniform: undefined,
                  Custom: undefined,
                });
              } else if (distributionType === "custom") {
                // The contract enforces sum == 10000 and length ==
                // distribution_count. Validation at the form boundary
                // should have already caught violations, but we guard here
                // too so a malformed payload never reaches the chain.
                const rawShares =
                  (formData.entryFees?.customShares ?? []).slice(0, formPayoutCount);
                const sum = rawShares.reduce((a, b) => a + (b || 0), 0);
                if (
                  rawShares.length !== formPayoutCount ||
                  sum !== 10000
                ) {
                  throw new Error(
                    `Custom distribution shares invalid: length ${rawShares.length}/${formPayoutCount}, sum ${sum}/10000`,
                  );
                }
                distribution = new CairoCustomEnum({
                  Linear: undefined,
                  Exponential: undefined,
                  Uniform: undefined,
                  Custom: rawShares,
                });
              } else {
                distribution = new CairoCustomEnum({
                  Linear: undefined,
                  Exponential: undefined,
                  Uniform: {},
                  Custom: undefined,
                });
              }
              distributionCount = formPayoutCount;
            }

            return {
              token_address: formData.entryFees?.token?.address!,
              amount: addAddressPadding(
                bigintToHex(
                  formData.entryFees?.amount! *
                    10 ** (formData.entryFees?.tokenDecimals || 18)
                )
              ),
              tournament_creator_share: tournamentCreatorBps,
              game_creator_share: gameCreatorBps,
              refund_share: refundBps,
              distribution,
              distribution_count: distributionCount,
            };
          })()
        )
      : new CairoOption(CairoOptionVariant.None),
    entry_requirement: formData.enableGating
      ? new CairoOption(CairoOptionVariant.Some, entryRequirement)
      : new CairoOption(CairoOptionVariant.None),
    leaderboard_config: {
      ascending: false,
      game_must_be_over: false,
    },
  };
};

export const processPrizes = (
  formData: TournamentFormData,
  tournamentCount: number,
  prizeCount: number
): DisplayPrize[] => {
  return formData.prizes.map((prize, index) => {
    let token_type;

    if (prize.type === "ERC20") {
      // Map distribution string to CairoCustomEnum
      // Weight is scaled by 10 for the contract (e.g., 1.0 in UI = 10 in contract)
      const scaledWeight = Math.round((prize.distributionWeight ?? 1) * 10);

      let distribution: CairoOption<CairoCustomEnum>;
      if (prize.distribution === "linear") {
        distribution = new CairoOption(
          CairoOptionVariant.Some,
          new CairoCustomEnum({
            Linear: scaledWeight,
            Exponential: undefined,
            Uniform: undefined,
            Custom: undefined,
          })
        );
      } else if (prize.distribution === "exponential") {
        distribution = new CairoOption(
          CairoOptionVariant.Some,
          new CairoCustomEnum({
            Linear: undefined,
            Exponential: scaledWeight,
            Uniform: undefined,
            Custom: undefined,
          })
        );
      } else if (prize.distribution === "uniform") {
        distribution = new CairoOption(
          CairoOptionVariant.Some,
          new CairoCustomEnum({
            Linear: undefined,
            Exponential: undefined,
            Uniform: {},
            Custom: undefined,
          })
        );
      } else if (prize.distribution === "custom") {
        const expectedLen = prize.distributionCount ?? 0;
        const rawShares = (prize.customShares ?? []).slice(0, expectedLen);
        const sum = rawShares.reduce((a: number, b: number) => a + (b || 0), 0);
        if (rawShares.length !== expectedLen || sum !== 10000) {
          throw new Error(
            `Custom distribution shares invalid on prize: length ${rawShares.length}/${expectedLen}, sum ${sum}/10000`,
          );
        }
        distribution = new CairoOption(
          CairoOptionVariant.Some,
          new CairoCustomEnum({
            Linear: undefined,
            Exponential: undefined,
            Uniform: undefined,
            Custom: rawShares,
          })
        );
      } else {
        distribution = new CairoOption(CairoOptionVariant.None);
      }

      // Create distribution_count as CairoOption
      const distribution_count: CairoOption<BigNumberish> = prize.distributionCount
        ? new CairoOption(CairoOptionVariant.Some, prize.distributionCount)
        : new CairoOption(CairoOptionVariant.None);

      const erc20Data: ERC20Data = {
        amount: BigInt(prize.amount! * 10 ** (prize.tokenDecimals || 18)).toString(),
        distribution,
        distribution_count,
      };

      token_type = new CairoCustomEnum({
        erc20: erc20Data,
        erc721: undefined,
      });
    } else {
      const erc721Data: ERC721Data = {
        id: BigInt(prize.tokenId!).toString(),
      };

      token_type = new CairoCustomEnum({
        erc20: undefined,
        erc721: erc721Data,
      });
    }

    return {
      id: prizeCount + index + 1,
      context_id: tournamentCount + 1,
      token_address: prize.token.address,
      token_type,
      sponsor_address: "0x0", // Placeholder for bonus prizes
      position: prize.position, // Position for display/sorting
    };
  });
};

export const getSubmittableScores = (
  currentLeaderboard: any[],
  leaderboard: Leaderboard
) => {
  const submittedTokenIds = leaderboard?.token_ids ?? [];

  // Create a Set of submitted token IDs for O(1) lookup
  const submittedTokenIdSet = new Set(
    submittedTokenIds.map((id) => id.toString())
  );

  // Map the current leaderboard with positions based on their current order
  // This assumes currentLeaderboard is already sorted by score (highest to lowest)
  const leaderboardWithPositions = currentLeaderboard.map((game, index) => ({
    ...game,
    position: index + 1,
  }));

  // Filter out already submitted scores but keep their positions intact
  // Only return scores that haven't been submitted yet
  const newSubmissions = leaderboardWithPositions
    .filter((game) => !submittedTokenIdSet.has(game.tokenId.toString()))
    .map((game) => ({
      tokenId: game.tokenId,
      position: game.position, // Keep the original position based on score ranking
    }));

  return newSubmissions;
};

/**
 * Accepts either SDK entry fee data (plain object with camelCase fields)
 * or null/undefined. Constructs DisplayPrize objects for the prize display system.
 */
export const extractEntryFeePrizes = (
  tournamentId: BigNumberish,
  entryFee: any,
  entryCount: BigNumberish,
  distributionPositions?: number,
  entryTokenIds: BigNumberish[] = []
): {
  tournamentCreatorShare: DisplayPrize[];
  gameCreatorShare: DisplayPrize[];
  distributionPrizes: DisplayPrize[];
  refundShares: DisplayPrize[];
} => {
  // Support both SDK shape (entryFee as plain object) and absence
  const fee = entryFee;
  const tokenAddress = fee?.tokenAddress ?? fee?.token_address;
  const amount = fee?.amount;
  if (!fee || !tokenAddress || !amount) {
    return {
      tournamentCreatorShare: [],
      gameCreatorShare: [],
      distributionPrizes: [],
      refundShares: [],
    };
  }
  const totalFeeAmount = BigInt(amount) * BigInt(entryCount);

  // Get distribution positions from entry fee if not provided
  const distCount = Number(fee.distributionCount ?? fee.distribution_count ?? 0);
  const winnersCount = distributionPositions ?? (distCount > 0 ? distCount : 3);

  if (totalFeeAmount === 0n) {
    return {
      tournamentCreatorShare: [],
      gameCreatorShare: [],
      distributionPrizes: [],
      refundShares: [],
    };
  }

  const gameCreatorShareBps = Number(fee.gameCreatorShare ?? fee.game_creator_share ?? 0);
  const gameCreatorShareAmount = gameCreatorShareBps > 0
    ? (totalFeeAmount * BigInt(gameCreatorShareBps)) / 10000n
    : 0n;

  const gameCreatorShare = gameCreatorShareAmount > 0n
    ? [
        {
          id: 0,
          context_id: tournamentId,
          position: 0,
          token_address: tokenAddress,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: gameCreatorShareAmount.toString(),
              distribution: new CairoOption(CairoOptionVariant.None),
              distribution_count: new CairoOption(CairoOptionVariant.None),
            } as ERC20Data,
            erc721: undefined,
          }),
          sponsor_address: "0x0",
          type: "entry_fee_game_creator",
        } as DisplayPrize,
      ]
    : [];

  const tournamentCreatorShareBps = Number(fee.tournamentCreatorShare ?? fee.tournament_creator_share ?? 0);
  const tournamentCreatorShareAmount = tournamentCreatorShareBps > 0
    ? (totalFeeAmount * BigInt(tournamentCreatorShareBps)) / 10000n
    : 0n;

  const tournamentCreatorShare = tournamentCreatorShareAmount > 0n
    ? [
        {
          id: 0,
          context_id: tournamentId,
          position: 0,
          token_address: tokenAddress,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: tournamentCreatorShareAmount.toString(),
              distribution: new CairoOption(CairoOptionVariant.None),
              distribution_count: new CairoOption(CairoOptionVariant.None),
            } as ERC20Data,
            erc721: undefined,
          }),
          sponsor_address: "0x0",
          type: "entry_fee_tournament_creator",
        } as DisplayPrize,
      ]
    : [];

  // Calculate distribution prizes
  const calculateDistributionPrizes = (): DisplayPrize[] => {
    const dist = fee.distribution;
    if (!dist) return [];

    let distributionPercentages: number[] = [];

    // Detect distribution type: SDK stores as { type, weight } or similar
    const distType = typeof dist === "object" && dist !== null
      ? (dist.activeVariant?.() ?? dist.type ?? "uniform")
      : "uniform";
    const distWeight = typeof dist === "object" && dist !== null
      ? (dist.unwrap?.() ?? dist.weight ?? 1)
      : 1;

    if (distType === "Linear" || distType === "linear") {
      distributionPercentages = calculateDistribution(
        winnersCount, Number(distWeight) / 10, 0, 0, 0, "linear"
      );
    } else if (distType === "Exponential" || distType === "exponential") {
      distributionPercentages = calculateDistribution(
        winnersCount, Number(distWeight) / 10, 0, 0, 0, "exponential"
      );
    } else if (distType === "Uniform" || distType === "uniform") {
      distributionPercentages = calculateDistribution(
        winnersCount, 1, 0, 0, 0, "uniform"
      );
    } else if (distType === "Custom" || distType === "custom") {
      const customValues = dist.unwrap?.() ?? dist.values ?? [];
      distributionPercentages = (customValues as number[]).map(v => v / 100);
    }

    // Calculate actual prize pool after fees
    const creatorSharePercent = tournamentCreatorShareBps;
    const gameSharePercent = gameCreatorShareBps;
    const refundSharePercent = Number(fee.refundShare ?? fee.refund_share ?? 0);

    const prizePoolPercent = 10000 - creatorSharePercent - gameSharePercent - refundSharePercent;
    const prizePoolAmount = (totalFeeAmount * BigInt(prizePoolPercent)) / 10000n;

    return distributionPercentages
      .map((percentage, index) => {
        if (percentage === 0) return null;
        const prizeAmount = (prizePoolAmount * BigInt(Math.floor(percentage * 100))) / 10000n;
        if (prizeAmount === 0n) return null;

        return {
          id: 0,
          context_id: tournamentId,
          position: index + 1,
          token_address: tokenAddress,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: prizeAmount.toString(),
              distribution: new CairoOption(CairoOptionVariant.None),
              distribution_count: new CairoOption(CairoOptionVariant.None),
            } as ERC20Data,
            erc721: undefined,
          }),
          sponsor_address: "0x0",
          type: "entry_fee",
        } as DisplayPrize;
      })
      .filter((prize) => prize !== null);
  };

  const distrbutionPrizes = calculateDistributionPrizes();

  // Per-token refund shares. The contract computes the refund per token as
  // (refund_share_bps / total_entries) * total_pool, which mathematically
  // simplifies to (refund_share_bps * per_entry_amount) / 10000 — so each
  // token gets back refundShareBps% of a single entry's fee, regardless of
  // how many total entries there are.
  const refundShareBps = Number(fee.refundShare ?? fee.refund_share ?? 0);
  const perEntryAmount = BigInt(amount);
  const refundPerToken =
    refundShareBps > 0
      ? (perEntryAmount * BigInt(refundShareBps)) / 10000n
      : 0n;

  const refundShares: DisplayPrize[] =
    refundPerToken > 0n && entryTokenIds.length > 0
      ? entryTokenIds.map((tokenId) => {
          const tokenIdStr = BigInt(tokenId).toString();
          return {
            // `id` doubles as the token_id carrier for refund claims
            id: tokenIdStr,
            context_id: tournamentId,
            position: 0,
            token_address: tokenAddress,
            token_type: new CairoCustomEnum({
              erc20: {
                amount: refundPerToken.toString(),
                distribution: new CairoOption(CairoOptionVariant.None),
                distribution_count: new CairoOption(CairoOptionVariant.None),
              } as ERC20Data,
              erc721: undefined,
            }),
            sponsor_address: "0x0",
            type: "entry_fee_refund",
          } as unknown as DisplayPrize;
        })
      : [];

  return {
    tournamentCreatorShare,
    gameCreatorShare,
    distributionPrizes: distrbutionPrizes,
    refundShares,
  };
};

export const getClaimablePrizes = (
  prizes: any[],
  claimedRewards: RewardClaim[]
) => {
  const creatorPrizeTypes = new Set([
    "entry_fee_game_creator",
    "entry_fee_tournament_creator",
  ]);

  const creatorPrizes = prizes.filter((prize) =>
    creatorPrizeTypes.has(prize.type)
  );
  const prizesFromSubmissions = prizes.filter(
    (prize) => !creatorPrizeTypes.has(prize.type)
  );

  // Helper function to extract reward type info from both SDK and SQL formats
  const getRewardTypeInfo = (
    claimedPrize: any
  ): { type: string; role?: any; position?: any; prizeId?: any; payoutIndex?: any } => {
    // Check if it's a CairoCustomEnum (SDK format) with activeVariant method
    if (typeof claimedPrize.reward_type?.activeVariant === "function") {
      const variant = claimedPrize.reward_type.activeVariant();

      if (variant === "EntryFee") {
        const entryFeeVariant =
          claimedPrize.reward_type.variant.EntryFee?.activeVariant?.();
        return {
          type: "EntryFee",
          role: entryFeeVariant,
          position:
            entryFeeVariant === "Position"
              ? claimedPrize.reward_type.variant.EntryFee.variant.Position
              : null,
          prizeId:
            entryFeeVariant === "Refund"
              ? claimedPrize.reward_type.variant.EntryFee.variant.Refund
              : undefined,
        };
      } else if (variant === "Prize") {
        const prizeVariant =
          claimedPrize.reward_type.variant.Prize?.activeVariant?.();

        if (prizeVariant === "Single") {
          return {
            type: "Prize",
            role: "Single",
            prizeId: claimedPrize.reward_type.variant.Prize.variant.Single,
          };
        } else if (prizeVariant === "Distributed") {
          const distributed = claimedPrize.reward_type.variant.Prize.variant.Distributed;
          return {
            type: "Prize",
            role: "Distributed",
            prizeId: distributed?.["0"] || distributed?.[0],
            payoutIndex: distributed?.["1"] || distributed?.[1],
          };
        }
      }
    }

    // SQL format - reward_type is a string like "EntryFee" or "Prize"
    if (typeof claimedPrize.reward_type === "string") {
      const rewardType = claimedPrize.reward_type.toLowerCase();

      if (rewardType === "entryfee") {
        // Check the inner enum field
        const roleVariant = claimedPrize["reward_type.EntryFee"];

        if (roleVariant === "GameCreator") {
          return { type: "EntryFee", role: "GameCreator", position: null };
        } else if (roleVariant === "TournamentCreator") {
          return {
            type: "EntryFee",
            role: "TournamentCreator",
            position: null,
          };
        } else if (roleVariant === "Position") {
          const position = claimedPrize["reward_type.EntryFee.Position"];
          return {
            type: "EntryFee",
            role: "Position",
            position: Number(position),
          };
        } else if (roleVariant === "Refund") {
          const tokenId = claimedPrize["reward_type.EntryFee.Refund"];
          return {
            type: "EntryFee",
            role: "Refund",
            position: null,
            prizeId: Number(tokenId),
          };
        }
      } else if (rewardType === "prize") {
        const prizeVariant = claimedPrize["reward_type.Prize"];

        if (prizeVariant === "Single") {
          const prizeId = claimedPrize["reward_type.Prize.Single"];
          return {
            type: "Prize",
            role: "Single",
            prizeId: Number(prizeId),
          };
        } else if (prizeVariant === "Distributed") {
          const prizeId = claimedPrize["reward_type.Prize.Distributed.0"];
          const payoutIndex = claimedPrize["reward_type.Prize.Distributed.1"];
          return {
            type: "Prize",
            role: "Distributed",
            prizeId: Number(prizeId),
            payoutIndex: Number(payoutIndex),
          };
        }
      }
    }

    return { type: "null" };
  };

  const claimedEntryFeePositions = claimedRewards
    .map((reward) => {
      const info = getRewardTypeInfo(reward);
      return info.type === "EntryFee" && info.role === "Position"
        ? info.position
        : null;
    })
    .filter((pos) => pos !== null);

  // Extract claimed prizes (both single and distributed)
  const claimedPrizeInfo = claimedRewards
    .map((reward) => {
      const info = getRewardTypeInfo(reward);
      if (info.type === "Prize") {
        return {
          prizeId: info.prizeId,
          payoutIndex: info.payoutIndex,
          role: info.role,
        };
      }
      return null;
    })
    .filter((info) => info !== null);

  const allPrizes = [...creatorPrizes, ...prizesFromSubmissions];

  const unclaimedPrizes = allPrizes.filter((prize) => {
    if (prize.type === "entry_fee_game_creator") {
      return !claimedRewards.some((claimedReward) => {
        const info = getRewardTypeInfo(claimedReward);
        return info.type === "EntryFee" && info.role === "GameCreator";
      });
    } else if (prize.type === "entry_fee_tournament_creator") {
      return !claimedRewards.some((claimedReward) => {
        const info = getRewardTypeInfo(claimedReward);
        return info.type === "EntryFee" && info.role === "TournamentCreator";
      });
    } else if (prize.type === "entry_fee") {
      return !claimedEntryFeePositions.includes(prize.position ?? 0);
    } else if (prize.type === "entry_fee_refund") {
      const tokenIdStr = String(prize.id);
      return !claimedRewards.some((claimedReward) => {
        const info = getRewardTypeInfo(claimedReward);
        return (
          info.type === "EntryFee" &&
          info.role === "Refund" &&
          String(info.prizeId) === tokenIdStr
        );
      });
    } else if (prize.type === "sponsored_distributed") {
      // For distributed prizes, check if this specific (prize_id, payout_index) combo is claimed
      const prizeIdNum =
        typeof prize.id === "string"
          ? parseInt(prize.id, 16)
          : Number(prize.id);
      const position = prize.position ?? 0;

      return !claimedPrizeInfo.some(
        (info: any) =>
          info?.prizeId === prizeIdNum &&
          info?.role === "Distributed" &&
          info?.payoutIndex === position
      );
    } else if (prize.type === "sponsored_single") {
      // Single sponsored prize
      const prizeIdNum =
        typeof prize.id === "string"
          ? parseInt(prize.id, 16)
          : Number(prize.id);
      return !claimedPrizeInfo.some(
        (info: any) =>
          info?.prizeId === prizeIdNum &&
          info?.role === "Single"
      );
    } else {
      // Fallback for any other prize types (legacy support)
      const prizeIdNum =
        typeof prize.id === "string"
          ? parseInt(prize.id, 16)
          : Number(prize.id);
      return !claimedPrizeInfo.some((info: any) => info?.prizeId === prizeIdNum);
    }
  });
  const unclaimedPrizeTypes = unclaimedPrizes.map((prize) => {
    if (prize.type === "entry_fee_game_creator") {
      return new CairoCustomEnum({
        EntryFees: new CairoCustomEnum({
          TournamentCreator: undefined,
          GameCreator: {},
          Position: undefined,
        }),
        Sponsored: undefined,
      });
    } else if (prize.type === "entry_fee_tournament_creator") {
      return new CairoCustomEnum({
        EntryFees: new CairoCustomEnum({
          TournamentCreator: {},
          GameCreator: undefined,
          Position: undefined,
        }),
        Sponsored: undefined,
      });
    } else if (prize.type === "entry_fee") {
      return new CairoCustomEnum({
        EntryFees: new CairoCustomEnum({
          TournamentCreator: undefined,
          GameCreator: undefined,
          Position: prize.position ?? 0,
        }),
        Sponsored: undefined,
      });
    } else {
      return new CairoCustomEnum({
        EntryFees: undefined,
        Sponsored: prize.id,
      });
    }
  });
  return {
    claimablePrizes: unclaimedPrizes,
    claimablePrizeTypes: unclaimedPrizeTypes,
  };
};

export const groupPrizesByPositions = (prizes: DisplayPrize[], tokens: TokenMetadata[]) => {
  return prizes
    .filter((prize) => (prize.position ?? 0) !== 0) // Use position field instead of payout_position
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .reduce((acc, prize) => {
      const position = (prize.position ?? 0).toString();
      const tokenModel = tokens.find(
        (t) => indexAddress(t.token_address) === indexAddress(prize.token_address)
      );

      if (!tokenModel?.symbol) {
        console.warn(`No token model found for address ${prize.token_address}`);
        return acc;
      }

      const tokenSymbol = tokenModel.symbol;

      if (!acc[position]) {
        acc[position] = {};
      }

      if (!acc[position][tokenSymbol]) {
        acc[position][tokenSymbol] = {
          type: prize.token_type.activeVariant() as "erc20" | "erc721",
          payout_position: position,
          address: prize.token_address,
          value: prize.token_type.activeVariant() === "erc721" ? [] : 0n,
        };
      }

      if (prize.token_type.activeVariant() === "erc721") {
        (acc[position][tokenSymbol].value as bigint[]).push(
          BigInt(prize.token_type.variant.erc721.id!)
        );
      } else if (prize.token_type.activeVariant() === "erc20") {
        const currentAmount = acc[position][tokenSymbol].value as bigint;
        const newAmount = BigInt(prize.token_type.variant.erc20.amount);
        acc[position][tokenSymbol].value = currentAmount + newAmount;
      }

      return acc;
    }, {} as PositionPrizes);
};

export const groupPrizesByTokens = (prizes: Prize[], tokens: TokenMetadata[]) => {
  return prizes.reduce((acc, prize) => {
    const tokenModel = tokens.find((t) => indexAddress(t.token_address) === indexAddress(prize.token_address));
    const tokenSymbol = tokenModel?.symbol;

    if (!tokenSymbol) {
      console.warn(`No token model found for address ${prize.token_address}`);
      return acc;
    }

    if (!acc[tokenSymbol]) {
      acc[tokenSymbol] = {
        type: prize.token_type.activeVariant() as "erc20" | "erc721",
        address: prize.token_address,
        value: prize.token_type.activeVariant() === "erc721" ? [] : 0n,
      };
    }

    if (prize.token_type.activeVariant() === "erc721") {
      // For ERC721, push the token ID to the array
      (acc[tokenSymbol].value as bigint[]).push(
        BigInt(prize.token_type.variant.erc721.id!)
      );
    } else if (prize.token_type.activeVariant() === "erc20") {
      // For ERC20, sum up the values
      const currentAmount = acc[tokenSymbol].value as bigint;
      const newAmount = BigInt(prize.token_type.variant.erc20.amount);
      acc[tokenSymbol].value = currentAmount + newAmount;
    }

    return acc;
  }, {} as TokenPrizes);
};

export const getErc20TokenSymbols = (
  groupedPrizes: Record<
    string,
    { type: "erc20" | "erc721"; value: bigint | bigint[] }
  >
) => {
  return Object.entries(groupedPrizes)
    .filter(([_, prize]) => prize.type === "erc20")
    .map(([symbol, _]) => symbol);
};

/**
 * Converts a token amount from its smallest unit to human-readable format
 * Preserves precision for very large amounts while handling decimals correctly
 *
 * @param amount - Token amount in smallest unit (e.g., wei)
 * @param decimals - Number of decimals for the token
 * @param price - Optional price per token to calculate USD value
 * @returns The calculated amount as a number
 */
export const convertTokenAmount = (
  amount: bigint,
  decimals: number,
  price?: number
): number => {
  const divisor = 10n ** BigInt(decimals);

  // Split into integer and fractional parts using BigInt
  const integerPart = amount / divisor; // BigInt division (safe, no precision loss)
  const fractionalPart = amount % divisor; // Remainder (always < divisor)

  // Convert to decimal: integer part + (fractional / divisor)
  // Fractional part is safe to convert since it's always < 10^decimals
  const humanAmount =
    Number(integerPart) + Number(fractionalPart) / Number(divisor);

  // Multiply by price if provided
  return price ? humanAmount * price : humanAmount;
};

export const calculatePrizeValue = (
  prize: {
    type: "erc20" | "erc721";
    value: bigint[] | bigint;
    address?: string;
  },
  tokenAddress: string,
  prices: Record<string, number | undefined>,
  tokenDecimals?: Record<string, number>
): number => {
  if (prize.type !== "erc20") return 0;

  const normalizedAddress = indexAddress(tokenAddress);
  const price = prices[normalizedAddress];
  const decimals = tokenDecimals?.[normalizedAddress] || 18;
  // Handle array or single bigint value
  const amount = Array.isArray(prize.value) ? prize.value[0] : prize.value;

  // Use precision-safe conversion
  return convertTokenAmount(amount, decimals, price);
};

export const calculateTotalValue = (
  groupedPrizes: TokenPrizes,
  prices: TokenPrices,
  tokenDecimals?: Record<string, number>
) => {
  return Object.entries(groupedPrizes)
    .filter(([_, prize]) => prize.type === "erc20")
    .reduce((total, [_symbol, prize]) => {
      // Use normalized prize address to look up price
      const normalizedAddress = prize.address
        ? indexAddress(prize.address)
        : "";
      const price = normalizedAddress ? prices[normalizedAddress] : undefined;
      const decimals = tokenDecimals?.[normalizedAddress] || 18;
      // Handle array or single bigint value
      const amount = Array.isArray(prize.value) ? prize.value[0] : prize.value;

      if (price === undefined) return total;

      // Use precision-safe conversion
      return total + convertTokenAmount(amount, decimals, price);
    }, 0);
};

export const countTotalNFTs = (groupedPrizes: TokenPrizes) => {
  return Object.entries(groupedPrizes)
    .filter(([_, prize]) => prize.type === "erc721")
    .reduce((total, [_, prize]) => {
      return total + (Array.isArray(prize.value) ? prize.value.length : 1);
    }, 0);
};

/**
 * Calculate the total number of paid places in a tournament
 * This includes:
 * 1. Entry fee distribution positions
 * 2. Bonus prize positions (considering distribution_count for ERC20 prizes)
 */
export const calculatePaidPlaces = (
  entryFee: CairoOption<EntryFee> | undefined,
  prizes: Prize[] | DisplayPrize[]
): number => {
  const positions = new Set<number>();

  // Add entry fee distribution positions — only when the prize pool actually
  // has a non-zero share. Otherwise every distribution slot computes to 0.
  if (entryFee?.isSome() && Number(entryFee.Some?.distribution_count ?? 0) > 0) {
    const tournamentCreatorBps = Number(
      entryFee.Some?.tournament_creator_share ?? 0,
    );
    const gameCreatorBps = Number(entryFee.Some?.game_creator_share ?? 0);
    const refundBps = Number(entryFee.Some?.refund_share ?? 0);
    const prizePoolBps =
      10000 - tournamentCreatorBps - gameCreatorBps - refundBps;
    if (prizePoolBps > 0) {
      const distributionCount = Number(entryFee.Some?.distribution_count);
      for (let i = 1; i <= distributionCount; i++) {
        positions.add(i);
      }
    }
  }

  // Add bonus prize positions
  prizes.forEach((prize: any) => {
    if (prize.token_type) {
      const tokenType = prize.token_type;

      // For ERC721, just add the position if it exists
      if (tokenType.activeVariant && tokenType.activeVariant() === "erc721") {
        if (prize.position && prize.position !== 0) {
          positions.add(Number(prize.position));
        }
      }
      // For ERC20, check if there's a distribution_count
      else if (tokenType.activeVariant && tokenType.activeVariant() === "erc20") {
        const erc20Data = tokenType.variant?.erc20;
        if (erc20Data?.distribution_count?.isSome && erc20Data.distribution_count.isSome()) {
          const distributionCount = Number(erc20Data.distribution_count.Some);
          // If there's a starting position, add from that position
          const startPosition = prize.position ? Number(prize.position) : 1;
          for (let i = 0; i < distributionCount; i++) {
            positions.add(startPosition + i);
          }
        } else if (prize.position && prize.position !== 0) {
          // Single position prize
          positions.add(Number(prize.position));
        }
      }
    }
  });

  return positions.size;
};

export const processQualificationProof = (
  requirementVariant: string,
  proof: any,
  _address?: string,
  _extensionAddress?: string,
  _extensionContext?: unknown,
): CairoOption<QualificationProofEnum> => {
  if (requirementVariant === "token") {
    return new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        NFT: {
          token_id: {
            low: proof.tokenId,
            high: "0",
          },
        },
        Extension: undefined,
      })
    );
  }


  if (requirementVariant === "extension") {
    // Extension proof data — encoded by the extension's own logic
    const extensionProofData: string[] = proof?.extensionProof ?? [];

    return new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        NFT: undefined,
        Extension: extensionProofData,
      })
    );
  }

  // Default return for all other cases
  return new CairoOption(CairoOptionVariant.None);
};

/**
 * Expands distributed prizes into individual claimable positions
 * Similar to how entry fee distributions are expanded
 */
export const expandDistributedPrizes = (
  prizes: any[]
): DisplayPrize[] => {
  const expanded: DisplayPrize[] = [];

  prizes.forEach((prize) => {
    // Support both CairoCustomEnum (token_type with .activeVariant()) and SDK plain objects (tokenType)
    const tokenType = prize.token_type ?? prize.tokenType;
    if (!tokenType) {
      expanded.push({ ...prize, position: prize.position ?? prize.payoutPosition ?? 0, type: "sponsored_single" } as DisplayPrize);
      return;
    }

    // SDK flat format: tokenType is a plain string
    if (typeof tokenType === "string") {
      const isErc20 = tokenType === "erc20";
      if (!isErc20) {
        expanded.push({
          ...prize,
          id: prize.id ?? prize.prizeId,
          context_id: prize.context_id ?? prize.tournamentId,
          position: prize.position ?? prize.payoutPosition ?? 0,
          token_address: prize.token_address ?? prize.tokenAddress,
          sponsor_address: prize.sponsor_address ?? prize.sponsorAddress,
          type: "sponsored_single",
        } as DisplayPrize);
        return;
      }

      const distCount = Number(prize.distributionCount ?? prize.distribution_count ?? 0);
      if (distCount <= 0) {
        expanded.push({
          ...prize,
          id: prize.id ?? prize.prizeId,
          context_id: prize.context_id ?? prize.tournamentId,
          position: prize.position ?? prize.payoutPosition ?? 0,
          token_address: prize.token_address ?? prize.tokenAddress,
          sponsor_address: prize.sponsor_address ?? prize.sponsorAddress,
          type: "sponsored_single",
        } as DisplayPrize);
        return;
      }

      const totalAmount = BigInt(prize.amount ?? 0);
      const distType = (prize.distributionType ?? prize.distribution_type ?? "uniform").toLowerCase();
      const weight = Number(prize.distributionWeight ?? prize.distribution_weight ?? 100);

      let distributionPercentages: number[];
      if (distType === "custom") {
        // SDK flat format carries the raw basis-point shares on the prize
        // record itself (JSON-serialised from the Cairo Span<u16>). The
        // canonical field name in @provable-games/budokan-sdk is
        // `distributionShares`; we also accept legacy / snake_case variants
        // for robustness across SDK versions. Convert bp → percentage
        // (bp / 100) when available; only fall back to a uniform split if
        // the shares array is missing or length-mismatched.
        const rawShares: unknown =
          prize.distributionShares ??
          prize.distribution_shares ??
          prize.customShares ??
          prize.custom_shares ??
          prize.distributionCustom ??
          prize.distribution_custom ??
          [];
        const sharesArr = Array.isArray(rawShares)
          ? rawShares.map((v) => Number(v)).filter((v) => Number.isFinite(v))
          : [];
        if (sharesArr.length === distCount) {
          distributionPercentages = sharesArr.map((bp) => bp / 100);
        } else {
          distributionPercentages = calculateDistribution(distCount, 1, 0, 0, 0, "uniform");
        }
      } else {
        distributionPercentages = calculateDistribution(
          distCount,
          weight / 10,
          0, 0, 0,
          distType as "linear" | "exponential" | "uniform"
        );
      }

      distributionPercentages.forEach((percentage, index) => {
        if (percentage === 0) return;
        const amount = (totalAmount * BigInt(Math.floor(percentage * 100))) / 10000n;
        if (amount === 0n) return;

        expanded.push({
          id: prize.id ?? prize.prizeId,
          context_id: prize.context_id ?? prize.tournamentId,
          position: index + 1,
          token_address: prize.token_address ?? prize.tokenAddress,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: amount.toString(),
              distribution: new CairoOption(CairoOptionVariant.None),
              distribution_count: new CairoOption(CairoOptionVariant.None),
            } as ERC20Data,
            erc721: undefined,
          }),
          sponsor_address: prize.sponsor_address ?? prize.sponsorAddress,
          type: "sponsored_distributed",
        } as DisplayPrize);
      });
      return;
    }

    // Detect if ERC20: CairoCustomEnum uses .activeVariant(), SDK uses plain object keys
    const isErc20 = typeof tokenType.activeVariant === "function"
      ? tokenType.activeVariant() === "erc20"
      : !!(tokenType.erc20 || tokenType.type === "erc20");

    if (isErc20) {
      const erc20Data = tokenType.variant?.erc20 ?? tokenType.erc20 ?? tokenType;
      if (!erc20Data?.amount) {
        expanded.push({ ...prize, position: prize.position ?? prize.payoutPosition ?? 0, type: "sponsored_single" } as DisplayPrize);
        return;
      }

      // Get distribution count from various formats
      const rawDistCount = erc20Data.distribution_count ?? erc20Data.distributionCount;
      const distributionCount = typeof rawDistCount === "object" && rawDistCount !== null
        ? (rawDistCount.isSome?.() ? Number(rawDistCount.Some) : (rawDistCount.Some !== undefined ? Number(rawDistCount.Some) : 0))
        : Number(rawDistCount ?? 0);

      if (distributionCount > 0) {
        const totalAmount = BigInt(erc20Data.amount);

        // Get distribution type from various formats
        const rawDist = erc20Data.distribution;
        let distributionPercentages: number[] = [];

        if (rawDist) {
          const distType = typeof rawDist === "object" && rawDist !== null
            ? (rawDist.activeVariant?.() ?? rawDist.type ?? (rawDist.Some?.activeVariant?.() ? rawDist.Some.activeVariant() : null))
            : rawDist;
          const distValue = typeof rawDist === "object" && rawDist !== null
            ? (rawDist.unwrap?.() ?? rawDist.weight ?? rawDist.Some?.unwrap?.() ?? rawDist.Some)
            : undefined;

          if (distType === "Linear" || distType === "linear") {
            distributionPercentages = calculateDistribution(distributionCount, Number(distValue ?? 10) / 10, 0, 0, 0, "linear");
          } else if (distType === "Exponential" || distType === "exponential") {
            distributionPercentages = calculateDistribution(distributionCount, Number(distValue ?? 10) / 10, 0, 0, 0, "exponential");
          } else if (distType === "Uniform" || distType === "uniform") {
            distributionPercentages = calculateDistribution(distributionCount, 1, 0, 0, 0, "uniform");
          } else if (distType === "Custom" || distType === "custom") {
            distributionPercentages = ((distValue ?? []) as number[]).map(v => v / 100);
          } else {
            distributionPercentages = calculateDistribution(distributionCount, 1, 0, 0, 0, "uniform");
          }
        } else {
          distributionPercentages = calculateDistribution(distributionCount, 1, 0, 0, 0, "uniform");
        }

        distributionPercentages.forEach((percentage, index) => {
          if (percentage === 0) return;
          const amount = (totalAmount * BigInt(Math.floor(percentage * 100))) / 10000n;
          if (amount === 0n) return;

          expanded.push({
            id: prize.id ?? prize.prizeId,
            context_id: prize.context_id ?? prize.tournamentId,
            position: index + 1,
            token_address: prize.token_address ?? prize.tokenAddress,
            token_type: new CairoCustomEnum({
              erc20: {
                amount: amount.toString(),
                distribution: new CairoOption(CairoOptionVariant.None),
                distribution_count: new CairoOption(CairoOptionVariant.None),
              } as ERC20Data,
              erc721: undefined,
            }),
            sponsor_address: prize.sponsor_address ?? prize.sponsorAddress,
            type: "sponsored_distributed",
          } as DisplayPrize);
        });
      } else {
        expanded.push({
          ...prize,
          position: prize.position ?? prize.payoutPosition ?? 0,
          token_address: prize.token_address ?? prize.tokenAddress,
          type: "sponsored_single",
        } as DisplayPrize);
      }
    } else {
      expanded.push({
        ...prize,
        position: prize.position ?? prize.payoutPosition ?? 0,
        token_address: prize.token_address ?? prize.tokenAddress,
        type: "sponsored_single",
      } as DisplayPrize);
    }
  });

  return expanded;
};

/**
 * Formats prizes into the new RewardType structure for claim_reward
 * RewardType::Prize for sponsored prizes
 * RewardType::EntryFee for entry fee prizes
 */
export const formatRewardTypes = (prizes: DisplayPrize[]): CairoCustomEnum[] => {
  return prizes.map((prize) => {
    if (prize.type === "entry_fee") {
      // Entry fee distribution position
      return new CairoCustomEnum({
        Prize: undefined,
        EntryFee: new CairoCustomEnum({
          Position: prize.position,
          TournamentCreator: undefined,
          GameCreator: undefined,
          Refund: undefined,
        }),
      });
    } else if (prize.type === "entry_fee_game_creator") {
      // Game creator share
      return new CairoCustomEnum({
        Prize: undefined,
        EntryFee: new CairoCustomEnum({
          Position: undefined,
          TournamentCreator: undefined,
          GameCreator: {},
          Refund: undefined,
        }),
      });
    } else if (prize.type === "entry_fee_tournament_creator") {
      // Tournament creator share
      return new CairoCustomEnum({
        Prize: undefined,
        EntryFee: new CairoCustomEnum({
          Position: undefined,
          TournamentCreator: {},
          GameCreator: undefined,
          Refund: undefined,
        }),
      });
    } else if (prize.type === "entry_fee_refund") {
      // Per-token refund — `prize.id` carries the game token_id
      return new CairoCustomEnum({
        Prize: undefined,
        EntryFee: new CairoCustomEnum({
          Position: undefined,
          TournamentCreator: undefined,
          GameCreator: undefined,
          Refund: prize.id,
        }),
      });
    } else if (prize.type === "sponsored_distributed") {
      // Distributed sponsored prize (prize_id, payout_index) as tuple
      return new CairoCustomEnum({
        Prize: new CairoCustomEnum({
          Single: undefined,
          Distributed: {
            "0": prize.id,        // u64: prize_id
            "1": prize.position,  // u32: payout_index
          },
        }),
        EntryFee: undefined,
      });
    } else {
      // Single sponsored prize (prize_id)
      return new CairoCustomEnum({
        Prize: new CairoCustomEnum({
          Single: prize.id,
          Distributed: undefined,
        }),
        EntryFee: undefined,
      });
    }
  });
};
