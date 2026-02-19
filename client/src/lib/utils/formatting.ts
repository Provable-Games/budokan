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
  GameMetadata,
  ERC20Data,
  ERC721Data,
} from "@/generated/models.gen";
import { PositionPrizes, TokenPrizes } from "@/lib/types";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import { getExtensionProof } from "@/lib/extensionConfig";

export const processTournamentData = (
  formData: TournamentFormData,
  address: string,
  tournamentCount: number,
  tournamentValidatorAddress?: string
): Tournament => {
  const startTimestamp = Math.floor(
    Date.UTC(
      formData.startTime.getUTCFullYear(),
      formData.startTime.getUTCMonth(),
      formData.startTime.getUTCDate(),
      formData.startTime.getUTCHours(),
      formData.startTime.getUTCMinutes(),
      formData.startTime.getUTCSeconds()
    ) / 1000
  );

  // End time is start time + duration in seconds
  const endTimestamp = startTimestamp + formData.duration;

  // Calculate registration times for fixed tournaments
  let registrationStartTimestamp = Math.floor(Date.now() / 1000) + 60;
  let registrationEndTimestamp = startTimestamp;

  if (formData.type === "fixed" && formData.registrationStartTime) {
    registrationStartTimestamp = Math.floor(
      Date.UTC(
        formData.registrationStartTime.getUTCFullYear(),
        formData.registrationStartTime.getUTCMonth(),
        formData.registrationStartTime.getUTCDate(),
        formData.registrationStartTime.getUTCHours(),
        formData.registrationStartTime.getUTCMinutes(),
        formData.registrationStartTime.getUTCSeconds()
      ) / 1000
    );
  }

  if (formData.type === "fixed" && formData.registrationEndTime) {
    registrationEndTimestamp = Math.floor(
      Date.UTC(
        formData.registrationEndTime.getUTCFullYear(),
        formData.registrationEndTime.getUTCMonth(),
        formData.registrationEndTime.getUTCDate(),
        formData.registrationEndTime.getUTCHours(),
        formData.registrationEndTime.getUTCMinutes(),
        formData.registrationEndTime.getUTCSeconds()
      ) / 1000
    );
  }

  // Process entry requirement based on type and requirement
  let entryRequirementType;
  if (formData.enableGating && formData.gatingOptions?.type) {
    switch (formData.gatingOptions.type) {
      case "token":
        entryRequirementType = new CairoCustomEnum({
          token: formData.gatingOptions.token?.address,
          tournament: undefined,
          allowlist: undefined,
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
          tournament: undefined,
          allowlist: undefined,
          extension: {
            address: tournamentValidatorAddress || "",
            config: tournamentConfig,
          },
        });
        break;
      case "addresses":
        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          tournament: undefined,
          allowlist: formData.gatingOptions.addresses,
          extension: undefined,
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
          tournament: undefined,
          allowlist: undefined,
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
      registration:
        formData.type === "fixed"
          ? new CairoOption(CairoOptionVariant.Some, {
              start: registrationStartTimestamp,
              end: registrationEndTimestamp,
            })
          : new CairoOption(CairoOptionVariant.None),
      game: {
        start: startTimestamp,
        end: endTimestamp,
      },
      submission_duration: Number(formData.submissionPeriod),
    },
    game_config: {
      address: addAddressPadding(formData.game),
      settings_id: formData.settings,
      soulbound: formData.soulbound,
      play_url: formData.play_url || "",
    },
    entry_fee: formData.enableEntryFees
      ? new CairoOption(CairoOptionVariant.Some, {
          token_address: formData.entryFees?.token?.address!,
          amount: addAddressPadding(
            bigintToHex(
              formData.entryFees?.amount! *
                10 ** (formData.entryFees?.tokenDecimals || 18)
            )
          ),
          distribution: (() => {
            const distributionType = formData.entryFees?.distributionType ?? "exponential";
            const weight = formData.entryFees?.distributionWeight ?? 1;
            // Weight is scaled by 10 for the contract (e.g., 1.0 in UI = 10 in contract)
            const scaledWeight = Math.round(weight * 10);

            if (distributionType === "linear") {
              return new CairoCustomEnum({
                Linear: scaledWeight,
                Exponential: undefined,
                Uniform: undefined,
                Custom: undefined,
              });
            } else if (distributionType === "exponential") {
              return new CairoCustomEnum({
                Linear: undefined,
                Exponential: scaledWeight,
                Uniform: undefined,
                Custom: undefined,
              });
            } else {
              // uniform
              return new CairoCustomEnum({
                Linear: undefined,
                Exponential: undefined,
                Uniform: undefined,
                Custom: undefined,
              });
            }
          })(),
          tournament_creator_share:
            (formData.entryFees?.creatorFeePercentage ?? 0) > 0
              ? new CairoOption(
                  CairoOptionVariant.Some,
                  Math.round(
                    (formData.entryFees?.creatorFeePercentage ?? 0) * 100
                  ) // Convert to basis points
                )
              : new CairoOption(CairoOptionVariant.None),
          game_creator_share: new CairoOption(
            CairoOptionVariant.Some,
            Math.round((formData.entryFees?.gameFeePercentage ?? 1) * 100) // Convert to basis points (default 1%)
          ),
          refund_share:
            (formData.entryFees?.refundSharePercentage ?? 0) > 0
              ? new CairoOption(
                  CairoOptionVariant.Some,
                  Math.round(
                    (formData.entryFees?.refundSharePercentage ?? 0) * 100
                  ) // Convert to basis points
                )
              : new CairoOption(CairoOptionVariant.None),
          distribution_positions:
            formData.entryFees?.prizePoolPayoutCount
              ? new CairoOption(
                  CairoOptionVariant.Some,
                  formData.entryFees.prizePoolPayoutCount
                )
              : new CairoOption(CairoOptionVariant.None),
        })
      : new CairoOption(CairoOptionVariant.None),
    entry_requirement: formData.enableGating
      ? new CairoOption(CairoOptionVariant.Some, entryRequirement)
      : new CairoOption(CairoOptionVariant.None),
    soulbound: false,
    play_url: "",
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
    .filter((game) => !submittedTokenIdSet.has(game.token_id.toString()))
    .map((game) => ({
      tokenId: game.token_id,
      position: game.position, // Keep the original position based on score ranking
    }));

  return newSubmissions;
};

export const extractEntryFeePrizes = (
  tournamentId: BigNumberish,
  entryFee: CairoOption<EntryFee>,
  entryCount: BigNumberish,
  distributionPositions?: number
): {
  tournamentCreatorShare: DisplayPrize[];
  gameCreatorShare: DisplayPrize[];
  distributionPrizes: DisplayPrize[];
} => {
  if (!entryFee?.isSome()) {
    return {
      tournamentCreatorShare: [],
      gameCreatorShare: [],
      distributionPrizes: [],
    };
  }
  const totalFeeAmount = BigInt(entryFee.Some?.amount!) * BigInt(entryCount);

  // Get distribution positions from entry fee if not provided
  const winnersCount = distributionPositions ??
    (entryFee.Some?.distribution_positions?.isSome()
      ? Number(entryFee.Some.distribution_positions.Some)
      : 3);

  if (totalFeeAmount === 0n) {
    return {
      tournamentCreatorShare: [],
      gameCreatorShare: [],
      distributionPrizes: [],
    };
  }

  const gameCreatorShareAmount = entryFee.Some?.game_creator_share?.isSome()
    ? (totalFeeAmount * BigInt(entryFee?.Some.game_creator_share?.Some!)) / 10000n
    : 0n;

  const gameCreatorShare = gameCreatorShareAmount > 0n
    ? [
        {
          id: 0,
          context_id: tournamentId, // Changed from tournament_id
          position: 0, // Virtual position for display
          token_address: entryFee.Some?.token_address!,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: gameCreatorShareAmount.toString(), // Shares are in basis points (10000 = 100%)
              distribution: new CairoOption(CairoOptionVariant.None),
              distribution_count: new CairoOption(CairoOptionVariant.None),
            } as ERC20Data,
            erc721: undefined,
          }),
          sponsor_address: "0x0", // Placeholder
          type: "entry_fee_game_creator",
        } as DisplayPrize,
      ]
    : [];

  const tournamentCreatorShareAmount = entryFee.Some?.tournament_creator_share?.isSome()
    ? (totalFeeAmount * BigInt(entryFee?.Some.tournament_creator_share?.Some!)) / 10000n
    : 0n;

  const tournamentCreatorShare = tournamentCreatorShareAmount > 0n
    ? [
        {
          id: 0,
          context_id: tournamentId, // Changed from tournament_id
          position: 0, // Virtual position for display
          token_address: entryFee.Some?.token_address!,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: tournamentCreatorShareAmount.toString(), // Shares are in basis points (10000 = 100%)
              distribution: new CairoOption(CairoOptionVariant.None),
              distribution_count: new CairoOption(CairoOptionVariant.None),
            } as ERC20Data,
            erc721: undefined,
          }),
          sponsor_address: "0x0", // Placeholder
          type: "entry_fee_tournament_creator",
        } as DisplayPrize,
      ]
    : [];

  // Calculate distribution prizes based on the distribution enum
  const calculateDistributionPrizes = (): DisplayPrize[] => {
    if (!entryFee.Some?.distribution) return [];

    const dist = entryFee.Some.distribution;
    let distributionPercentages: number[] = [];

    // Extract distribution type and calculate percentages
    if (dist.activeVariant() === "Linear") {
      const weight = (dist.unwrap() as number) / 10; // Convert from u16 to decimal
      distributionPercentages = calculateDistribution(
        winnersCount,
        weight,
        0, 0, 0,
        "linear"
      );
    } else if (dist.activeVariant() === "Exponential") {
      const weight = (dist.unwrap() as number) / 10; // Convert from u16 to decimal
      distributionPercentages = calculateDistribution(
        winnersCount,
        weight,
        0, 0, 0,
        "exponential"
      );
    } else if (dist.activeVariant() === "Uniform") {
      distributionPercentages = calculateDistribution(
        winnersCount,
        1,
        0, 0, 0,
        "uniform"
      );
    } else if (dist.activeVariant() === "Custom") {
      // Custom distribution array comes directly as percentages
      distributionPercentages = (dist.unwrap() as number[]).map(v => v / 100);
    }

    // Calculate actual prize pool after fees
    // Shares are in basis points (10000 = 100%)
    const creatorSharePercent = entryFee.Some?.tournament_creator_share?.isSome()
      ? Number(entryFee.Some.tournament_creator_share.Some)
      : 0;
    const gameSharePercent = entryFee.Some?.game_creator_share?.isSome()
      ? Number(entryFee.Some.game_creator_share.Some)
      : 0;
    const refundSharePercent = entryFee.Some?.refund_share?.isSome()
      ? Number(entryFee.Some.refund_share.Some)
      : 0;

    const prizePoolPercent = 10000 - creatorSharePercent - gameSharePercent - refundSharePercent;
    const prizePoolAmount = (totalFeeAmount * BigInt(prizePoolPercent)) / 10000n;

    // Create prize objects from percentages
    return distributionPercentages
      .map((percentage, index) => {
        if (percentage === 0) return null;

        // percentage is 0-100 (e.g., 50 = 50%), convert to basis points by multiplying by 100
        const amount = (prizePoolAmount * BigInt(Math.floor(percentage * 100))) / 10000n;

        // Skip prizes with 0 amount (now accurately reflects contract calculation)
        if (amount === 0n) return null;

        return {
          id: 0,
          context_id: tournamentId, // Changed from tournament_id
          position: index + 1, // Virtual position for display
          token_address: entryFee.Some?.token_address!,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: amount.toString(),
              distribution: new CairoOption(CairoOptionVariant.None),
              distribution_count: new CairoOption(CairoOptionVariant.None),
            } as ERC20Data,
            erc721: undefined,
          }),
          sponsor_address: "0x0", // Placeholder
          type: "entry_fee",
        } as DisplayPrize;
      })
      .filter((prize) => prize !== null);
  };

  const distrbutionPrizes = calculateDistributionPrizes();

  return {
    tournamentCreatorShare,
    gameCreatorShare,
    distributionPrizes: distrbutionPrizes,
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

  // Add entry fee distribution positions
  if (entryFee?.isSome() && entryFee.Some?.distribution_positions?.isSome()) {
    const distributionCount = Number(entryFee.Some.distribution_positions.Some);
    for (let i = 1; i <= distributionCount; i++) {
      positions.add(i);
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

export const processTournamentFromSql = (tournament: any): Tournament => {
  let entryRequirement;
  if (tournament["entry_requirement"] === "Some") {
    let entryRequirementType: CairoCustomEnum;

    switch (tournament["entry_requirement.Some.entry_requirement_type"]) {
      case "token":
        entryRequirementType = new CairoCustomEnum({
          token:
            tournament["entry_requirement.Some.entry_requirement_type.token"],
          tournament: undefined,
          allowlist: undefined,
          extension: undefined,
        });
        break;
      case "tournament":
        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          tournament: new CairoCustomEnum({
            winners:
              tournament[
                "entry_requirement.Some.entry_requirement_type.tournament"
              ] === "winners"
                ? tournament[
                    "entry_requirement.Some.entry_requirement_type.tournament.winners"
                  ]
                : undefined,
            participants:
              tournament[
                "entry_requirement.Some.entry_requirement_type.tournament"
              ] === "participants"
                ? tournament[
                    "entry_requirement.Some.entry_requirement_type.tournament.participants"
                  ]
                : undefined,
          }),
          allowlist: undefined,
          extension: undefined,
        });
        break;
      case "allowlist":
        const allowlistData =
          tournament["entry_requirement.Some.entry_requirement_type.allowlist"];
        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          tournament: undefined,
          allowlist:
            typeof allowlistData === "string"
              ? JSON.parse(allowlistData)
              : allowlistData,
          extension: undefined,
        });
        break;
      case "extension":
        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          tournament: undefined,
          allowlist: undefined,
          extension: {
            address:
              tournament[
                "entry_requirement.Some.entry_requirement_type.extension.address"
              ],
            config: tournament[
              "entry_requirement.Some.entry_requirement_type.extension.config"
            ]
              ? JSON.parse(
                  tournament[
                    "entry_requirement.Some.entry_requirement_type.extension.config"
                  ]
                )
              : [],
          },
        });
        break;
      default:
        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          tournament: undefined,
          allowlist: [],
          extension: undefined,
        });
    }

    entryRequirement = {
      entry_limit: tournament["entry_requirement.Some.entry_limit"],
      entry_requirement_type: entryRequirementType,
    };
  }

  // Parse distribution from SQL
  // Torii creates separate columns for each enum variant:
  // - entry_fee.Some.distribution (TEXT): the active variant name
  // - entry_fee.Some.distribution.Linear (INTEGER): value if Linear is active
  // - entry_fee.Some.distribution.Exponential (INTEGER): value if Exponential is active
  // - entry_fee.Some.distribution.Custom (TEXT): JSON array if Custom is active
  const parseDistribution = (tournament: any): CairoCustomEnum => {
    const activeVariant = tournament["entry_fee.Some.distribution"];

    if (activeVariant === "Linear") {
      return new CairoCustomEnum({
        Linear: tournament["entry_fee.Some.distribution.Linear"],
        Exponential: undefined,
        Uniform: undefined,
        Custom: undefined,
      });
    } else if (activeVariant === "Exponential") {
      return new CairoCustomEnum({
        Linear: undefined,
        Exponential: tournament["entry_fee.Some.distribution.Exponential"],
        Uniform: undefined,
        Custom: undefined,
      });
    } else if (activeVariant === "Custom") {
      const customArray = JSON.parse(tournament["entry_fee.Some.distribution.Custom"]);
      return new CairoCustomEnum({
        Linear: undefined,
        Exponential: undefined,
        Uniform: undefined,
        Custom: customArray,
      });
    } else {
      // Uniform or fallback
      return new CairoCustomEnum({
        Linear: undefined,
        Exponential: undefined,
        Uniform: {},
        Custom: undefined,
      });
    }
  };

  return {
    id: tournament.id,
    created_at: tournament.created_at,
    created_by: tournament.created_by,
    creator_token_id: tournament.creator_token_id,
    metadata: {
      name: tournament["metadata.name"],
      description: tournament["metadata.description"],
    },
    schedule: {
      registration:
        tournament["schedule.registration"] === "Some"
          ? new CairoOption(CairoOptionVariant.Some, {
              start: tournament["schedule.registration.Some.start"],
              end: tournament["schedule.registration.Some.end"],
            })
          : new CairoOption(CairoOptionVariant.None),
      game: {
        start: tournament["schedule.game.start"],
        end: tournament["schedule.game.end"],
      },
      submission_duration: tournament["schedule.submission_duration"],
    },
    game_config: {
      address: tournament["game_config.address"],
      settings_id: tournament["game_config.settings_id"],
      soulbound: tournament["game_config.soulbound"] ?? false,
      play_url: tournament["game_config.play_url"] ?? "",
    },
    entry_fee:
      tournament["entry_fee"] === "Some"
        ? new CairoOption(CairoOptionVariant.Some, {
            token_address: tournament["entry_fee.Some.token_address"],
            amount: tournament["entry_fee.Some.amount"],
            distribution: parseDistribution(tournament),
            tournament_creator_share:
              tournament["entry_fee.Some.tournament_creator_share"] === "Some"
                ? new CairoOption(
                    CairoOptionVariant.Some,
                    tournament["entry_fee.Some.tournament_creator_share.Some"]
                  )
                : new CairoOption(CairoOptionVariant.None),
            game_creator_share:
              tournament["entry_fee.Some.game_creator_share"] === "Some"
                ? new CairoOption(
                    CairoOptionVariant.Some,
                    tournament["entry_fee.Some.game_creator_share.Some"]
                  )
                : new CairoOption(CairoOptionVariant.None),
            refund_share:
              tournament["entry_fee.Some.refund_share"] === "Some"
                ? new CairoOption(
                    CairoOptionVariant.Some,
                    tournament["entry_fee.Some.refund_share.Some"]
                  )
                : new CairoOption(CairoOptionVariant.None),
            distribution_positions:
              tournament["entry_fee.Some.distribution_positions"] === "Some"
                ? new CairoOption(
                    CairoOptionVariant.Some,
                    tournament["entry_fee.Some.distribution_positions.Some"]
                  )
                : new CairoOption(CairoOptionVariant.None),
          })
        : new CairoOption(CairoOptionVariant.None),
    entry_requirement:
      tournament["entry_requirement"] === "Some"
        ? new CairoOption(CairoOptionVariant.Some, entryRequirement)
        : new CairoOption(CairoOptionVariant.None),
    soulbound: tournament.soulbound ?? false,
    play_url: tournament.play_url ?? "",
  };
};

export const processPrizesFromSql = (
  prizes: any,
  tournamentId: BigNumberish
): Prize[] | null => {
  return prizes
    ? prizes
        .split("|")
        .map((prizeStr: string) => {
          const prize = JSON.parse(prizeStr);
          return {
            id: prize.prizeId,
            tournament_id: tournamentId,
            payout_position: prize.position,
            token_address: prize.tokenAddress,
            token_type:
              prize.tokenType === "erc20"
                ? new CairoCustomEnum({
                    erc20: {
                      amount: prize.amount.toString(),
                      distribution: new CairoOption(CairoOptionVariant.None),
                      distribution_count: new CairoOption(CairoOptionVariant.None),
                    } as ERC20Data,
                    erc721: undefined,
                  })
                : new CairoCustomEnum({
                    erc20: undefined,
                    erc721: {
                      id: prize.amount.toString(),
                    } as ERC721Data,
                  }),
          };
        })
        .sort(
          (a: DisplayPrize, b: DisplayPrize) =>
            Number(a.position ?? 0) - Number(b.position ?? 0) // Use position field
        )
    : null;
};

/**
 * Processes a single Prize object from SQL query result
 * Converts plain SQL object to proper Prize with CairoCustomEnum structures
 */
export const processPrizeFromSql = (prize: any): Prize => {
  // Parse distribution if present
  let distribution: CairoOption<CairoCustomEnum>;
  const hasDistribution = prize["token_type.erc20.distribution"] === "Some";
  const distributionVariant = prize["token_type.erc20.distribution.Some"];

  if (hasDistribution && distributionVariant === "Linear") {
    distribution = new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        Linear: prize["token_type.erc20.distribution.Some.Linear"],
        Exponential: undefined,
        Uniform: undefined,
        Custom: undefined,
      })
    );
  } else if (hasDistribution && distributionVariant === "Exponential") {
    distribution = new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        Linear: undefined,
        Exponential: prize["token_type.erc20.distribution.Some.Exponential"],
        Uniform: undefined,
        Custom: undefined,
      })
    );
  } else if (hasDistribution && distributionVariant === "Uniform") {
    distribution = new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        Linear: undefined,
        Exponential: undefined,
        Uniform: {},
        Custom: undefined,
      })
    );
  } else if (hasDistribution && distributionVariant === "Custom") {
    const customArray = JSON.parse(prize["token_type.erc20.distribution.Some.Custom"]);
    distribution = new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        Linear: undefined,
        Exponential: undefined,
        Uniform: undefined,
        Custom: customArray,
      })
    );
  } else {
    distribution = new CairoOption(CairoOptionVariant.None);
  }

  // Parse distribution_count if present
  const distributionCount =
    prize["token_type.erc20.distribution_count"] === "Some"
      ? new CairoOption(
          CairoOptionVariant.Some,
          prize["token_type.erc20.distribution_count.Some"]
        )
      : new CairoOption(CairoOptionVariant.None);

  const tokenType =
    prize.token_type === "erc20"
      ? new CairoCustomEnum({
          erc20: {
            amount: prize["token_type.erc20.amount"],
            distribution,
            distribution_count: distributionCount,
          } as ERC20Data,
          erc721: undefined,
        })
      : new CairoCustomEnum({
          erc20: undefined,
          erc721: {
            id: prize["token_type.erc721.id"],
          } as ERC721Data,
        });

  return {
    id: prize.id,
    context_id: prize.context_id,
    token_address: prize.token_address,
    token_type: tokenType,
    sponsor_address: prize.sponsor_address,
  };
};

export const processQualificationProof = (
  requirementVariant: string,
  proof: any,
  address: string,
  extensionAddress?: string,
  extensionContext?: any
): CairoOption<QualificationProofEnum> => {
  if (requirementVariant === "token") {
    return new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        Tournament: undefined,
        NFT: {
          token_id: {
            low: proof.tokenId,
            high: "0",
          },
        },
        Address: undefined,
        Extension: undefined,
      })
    );
  }

  if (requirementVariant === "allowlist") {
    return new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        Tournament: undefined,
        NFT: undefined,
        Address: address,
        Extension: undefined,
      })
    );
  }

  if (requirementVariant === "extension") {
    // Check if this is a tournament validator with tournament proof
    // Tournament validator proofs have tournamentId, tokenId, and position
    if (proof?.tournamentId && proof?.tokenId && proof?.position !== undefined) {
      // Tournament validator proof: [tournament_id, token_id, position]
      const extensionProofData = [
        proof.tournamentId.toString(),
        proof.tokenId.toString(),
        proof.position.toString(),
      ];

      return new CairoOption(
        CairoOptionVariant.Some,
        new CairoCustomEnum({
          Tournament: undefined,
          NFT: undefined,
          Address: undefined,
          Extension: extensionProofData,
        })
      );
    }

    // Generic extension - get proof from extension config
    const extensionProofData = extensionAddress
      ? getExtensionProof(extensionAddress, address, extensionContext)
      : [address]; // Fallback to address if no extension address provided

    return new CairoOption(
      CairoOptionVariant.Some,
      new CairoCustomEnum({
        Tournament: undefined,
        NFT: undefined,
        Address: undefined,
        Extension: extensionProofData,
      })
    );
  }

  // Default return for all other cases
  return new CairoOption(CairoOptionVariant.None);
};

export const processGameMetadataFromSql = (gameMetadata: any): GameMetadata => {
  return {
    contract_address: gameMetadata.contract_address,
    creator_address: gameMetadata.creator_address,
    name: gameMetadata.name,
    description: gameMetadata.description,
    developer: gameMetadata.developer,
    publisher: gameMetadata.publisher,
    genre: gameMetadata.genre,
    image: gameMetadata.image,
  };
};

export const formatGameSettingsData = (settings: any[]) => {
  if (!settings) return {};

  return settings.reduce((acc, setting) => {
    const detailsId = setting.settings_id.toString();

    // If this details ID doesn't exist yet, create it
    if (!acc[detailsId]) {
      const {
        settings_id,
        name,
        description,
        created_at,
        created_by,
        ...remainingAttributes
      } = setting;
      acc[detailsId] = {
        settings: [remainingAttributes],
        name: name,
        description: description,
        created_at: created_at,
        created_by: created_by,
        hasSettings: true,
      };
    }

    return acc;
  }, {} as Record<string, any>);
};

/**
 * Formats a settings key into spaced capitalized words
 * Example: "battle.max_hand_size" -> "Battle - Max Hand Size"
 */
export const formatSettingsKey = (key: string): string => {
  // First split by dots to get the main sections
  const sections = key.split(".");

  // Format each section (capitalize words and replace underscores with spaces)
  const formattedSections = sections.map(
    (section) =>
      section
        .split("_") // Split by underscores
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize first letter
        .join(" ") // Join with spaces
  );

  // Join the sections with " - "
  return formattedSections.join(" - ");
};

/**
 * Formats a settings value based on its type and key name
 */
export const formatSettingsValue = (value: any, key: string): any => {
  // Handle string that might be JSON
  if (
    typeof value === "string" &&
    (value.startsWith("[") || value.startsWith("{"))
  ) {
    try {
      const parsed = JSON.parse(value);

      // If it's an array of IDs, return the count
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string")
      ) {
        return `${parsed.length} items`;
      }

      // Otherwise return the formatted JSON
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, return the original string
      return value;
    }
  }

  // Handle booleans represented as 0/1
  if (
    typeof value === "number" &&
    (value === 0 || value === 1) &&
    /auto|enabled|active|toggle|flag|scaling|persistent/.test(key.toLowerCase())
  ) {
    return value === 1 ? "Enabled" : "Disabled";
  }

  // Return other values as is
  return value;
};

/**
 * Formats game settings into a more readable structure
 */
export const formatGameSettings = (settings: any[]) => {
  if (!settings || !settings.length) return [];

  // Process all settings into a single flat array
  const formattedSettings: any[] = [];

  // Process each setting object
  settings.forEach((setting) => {
    // Process each field in the setting
    Object.entries(setting).forEach(([key, value]) => {
      // Skip internal fields if needed
      if (key.includes("internal")) return;

      formattedSettings.push({
        key,
        formattedKey: formatSettingsKey(key),
        value,
        formattedValue: formatSettingsValue(value, key),
      });
    });
  });

  // Sort settings by category (battle, draft, map, etc.)
  formattedSettings.sort((a, b) => a.key.localeCompare(b.key));

  return formattedSettings;
};

/**
 * Expands distributed prizes into individual claimable positions
 * Similar to how entry fee distributions are expanded
 */
export const expandDistributedPrizes = (
  prizes: Prize[]
): DisplayPrize[] => {
  const expanded: DisplayPrize[] = [];

  prizes.forEach((prize) => {
    const tokenType = prize.token_type;

    if (tokenType.activeVariant?.() === "erc20") {
      const erc20Data = tokenType.variant?.erc20;

      // Check if this prize has distribution_count - handle both SDK format (isSome method) and manual format (Some property)
      const hasDistributionCount = erc20Data?.distribution_count?.isSome?.() || erc20Data?.distribution_count?.Some !== undefined;
      const hasDistribution = erc20Data.distribution?.isSome?.() || erc20Data.distribution?.Some;

      if (hasDistributionCount) {
        const distributionCount = Number(erc20Data.distribution_count.Some);
        const totalAmount = BigInt(erc20Data.amount);

        // Calculate distribution percentages
        let distributionPercentages: number[] = [];

        if (hasDistribution) {
          const dist = erc20Data.distribution.Some;

          if (dist.activeVariant() === "Linear") {
            const weight = (dist.unwrap() as number) / 10;
            distributionPercentages = calculateDistribution(
              distributionCount,
              weight,
              0, 0, 0,
              "linear"
            );
          } else if (dist.activeVariant() === "Exponential") {
            const weight = (dist.unwrap() as number) / 10;
            distributionPercentages = calculateDistribution(
              distributionCount,
              weight,
              0, 0, 0,
              "exponential"
            );
          } else if (dist.activeVariant() === "Uniform") {
            distributionPercentages = calculateDistribution(
              distributionCount,
              1,
              0, 0, 0,
              "uniform"
            );
          } else if (dist.activeVariant() === "Custom") {
            distributionPercentages = (dist.unwrap() as number[]).map(v => v / 100);
          }
        } else {
          // Default to uniform if no distribution specified
          distributionPercentages = calculateDistribution(
            distributionCount,
            1,
            0, 0, 0,
            "uniform"
          );
        }

        // Create a DisplayPrize for each position
        distributionPercentages.forEach((percentage, index) => {
          if (percentage === 0) return;

          const amount = (totalAmount * BigInt(Math.floor(percentage * 100))) / 10000n;

          // Skip prizes with 0 amount (now accurately reflects contract calculation)
          if (amount === 0n) return;

          expanded.push({
            id: prize.id,
            context_id: prize.context_id,
            position: index + 1,
            token_address: prize.token_address,
            token_type: new CairoCustomEnum({
              erc20: {
                amount: amount.toString(),
                distribution: new CairoOption(CairoOptionVariant.None),
                distribution_count: new CairoOption(CairoOptionVariant.None),
              } as ERC20Data,
              erc721: undefined,
            }),
            sponsor_address: prize.sponsor_address,
            type: "sponsored_distributed",
          } as DisplayPrize);
        });
      } else {
        // Single prize, no distribution
        expanded.push({
          ...prize,
          position: 0, // Position 0 for non-distributed prizes
          type: "sponsored_single",
        } as DisplayPrize);
      }
    } else {
      // ERC721 prizes are always single
      expanded.push({
        ...prize,
        position: 0,
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
