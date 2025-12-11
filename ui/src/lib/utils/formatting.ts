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
  PrizeClaim,
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
  tournamentCount: number
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
        entryRequirementType = new CairoCustomEnum({
          token: undefined,
          tournament: new CairoCustomEnum({
            winners:
              formData.gatingOptions.tournament?.requirement === "won"
                ? formData.gatingOptions.tournament.tournaments.map((t) => t.id)
                : undefined,
            participants:
              formData.gatingOptions.tournament?.requirement === "participated"
                ? formData.gatingOptions.tournament.tournaments.map((t) => t.id)
                : undefined,
          }),
          allowlist: undefined,
          extension: undefined,
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
  if (!formData.enableBonusPrizes || !formData.bonusPrizes?.length) {
    return [];
  }

  return formData.bonusPrizes.map((prize, index) => {
    let token_type;

    if (prize.type === "ERC20") {
      // Map distribution string to CairoCustomEnum
      let distribution: CairoOption<CairoCustomEnum>;
      if (prize.distribution === "linear") {
        distribution = new CairoOption(
          CairoOptionVariant.Some,
          new CairoCustomEnum({
            Linear: 100,
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
            Exponential: 100,
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

  const gameCreatorShare = entryFee.Some?.game_creator_share?.isSome()
    ? [
        {
          id: 0,
          context_id: tournamentId, // Changed from tournament_id
          position: 0, // Virtual position for display
          token_address: entryFee.Some?.token_address!,
          token_type: new CairoCustomEnum({
            erc20: {
              amount: ((totalFeeAmount *
                BigInt(entryFee?.Some.game_creator_share?.Some!)) /
                10000n).toString(), // Shares are in basis points (10000 = 100%)
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

  const tournamentCreatorShare =
    entryFee.Some?.tournament_creator_share?.isSome()
      ? [
          {
            id: 0,
            context_id: tournamentId, // Changed from tournament_id
            position: 0, // Virtual position for display
            token_address: entryFee.Some?.token_address!,
            token_type: new CairoCustomEnum({
              erc20: {
                amount: ((totalFeeAmount *
                  BigInt(entryFee?.Some.tournament_creator_share?.Some!)) /
                  10000n).toString(), // Shares are in basis points (10000 = 100%)
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
  claimedPrizes: PrizeClaim[]
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

  // Helper function to extract prize type info from both SDK and SQL formats
  const getPrizeTypeInfo = (
    claimedPrize: any
  ): { type: string; role?: any; position?: any; prizeId?: any } => {
    // Check if it's a CairoCustomEnum (SDK format) with activeVariant method
    if (typeof claimedPrize.prize_type?.activeVariant === "function") {
      const variant = claimedPrize.prize_type.activeVariant();
      if (variant === "EntryFees") {
        const entryFeesVariant =
          claimedPrize.prize_type.variant.EntryFees?.activeVariant?.();
        return {
          type: "EntryFees",
          role: entryFeesVariant,
          position:
            entryFeesVariant === "Position"
              ? claimedPrize.prize_type.variant.EntryFees.variant.Position
              : null,
        };
      } else if (variant === "Sponsored") {
        return {
          type: "Sponsored",
          prizeId: claimedPrize.prize_type.variant.Sponsored,
        };
      }
    }

    // SQL format - prize_type is a string like "EntryFees" or "Sponsored"
    if (typeof claimedPrize.prize_type === "string") {
      const prizeType = claimedPrize.prize_type.toLowerCase();
      if (prizeType === "entryfees") {
        // Check the inner enum field - note the fields use different casing
        const roleVariant = claimedPrize["prize_type.EntryFees"];
        if (roleVariant === "GameCreator") {
          return { type: "EntryFees", role: "GameCreator", position: null };
        } else if (roleVariant === "TournamentCreator") {
          return {
            type: "EntryFees",
            role: "TournamentCreator",
            position: null,
          };
        } else if (roleVariant === "Position") {
          // The actual position value is in prize_type.EntryFees.Position
          const position = claimedPrize["prize_type.EntryFees.Position"];
          return {
            type: "EntryFees",
            role: "Position",
            position: Number(position),
          };
        }
      } else if (prizeType === "sponsored") {
        // For sponsored, the prize ID is directly in the variant field
        return {
          type: "Sponsored",
          prizeId: Number(claimedPrize["prize_type.Sponsored"]),
        };
      }
    }

    return { type: "null" };
  };

  const claimedEntryFeePositions = claimedPrizes
    .map((prize) => {
      const info = getPrizeTypeInfo(prize);
      return info.type === "EntryFees" && info.role === "Position"
        ? info.position
        : null;
    })
    .filter((pos) => pos !== null);

  const claimedSponsoredPrizeKeys = claimedPrizes
    .map((prize) => {
      const info = getPrizeTypeInfo(prize);
      return info.type === "Sponsored" ? info.prizeId : null;
    })
    .filter((id) => id !== null);

  const allPrizes = [...creatorPrizes, ...prizesFromSubmissions];

  const unclaimedPrizes = allPrizes.filter((prize) => {
    if (prize.type === "entry_fee_game_creator") {
      return !claimedPrizes.some((claimedPrize) => {
        const info = getPrizeTypeInfo(claimedPrize);
        return info.type === "EntryFees" && info.role === "GameCreator";
      });
    } else if (prize.type === "entry_fee_tournament_creator") {
      return !claimedPrizes.some((claimedPrize) => {
        const info = getPrizeTypeInfo(claimedPrize);
        return info.type === "EntryFees" && info.role === "TournamentCreator";
      });
    } else if (prize.type === "entry_fee") {
      return !claimedEntryFeePositions.includes(prize.position ?? 0);
    } else {
      // Normalize prize.id to number for comparison (it might be hex string or number)
      const prizeIdNum =
        typeof prize.id === "string"
          ? parseInt(prize.id, 16)
          : Number(prize.id);
      return !claimedSponsoredPrizeKeys.includes(prizeIdNum);
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

  const price = prices[tokenAddress];
  const decimals = tokenDecimals?.[prize.address || ""] || 18;
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
      // Use prize address to look up price (prices are now keyed by address)
      const price = prize.address ? prices[prize.address] : undefined;
      const decimals = tokenDecimals?.[prize.address || ""] || 18;
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

export const processQualificationProof = (
  requirementVariant: string,
  proof: any,
  address: string,
  extensionAddress?: string,
  extensionContext?: any
): CairoOption<QualificationProofEnum> => {
  if (requirementVariant === "tournament") {
    const qualificationProof = new CairoCustomEnum({
      Tournament: {
        tournament_id: proof.tournamentId,
        token_id: proof.tokenId,
        position: proof.position,
      },
      NFT: undefined,
      Address: undefined,
      Extension: undefined,
    }) as QualificationProofEnum;
    return new CairoOption(CairoOptionVariant.Some, qualificationProof);
  }

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
    // Get proof data from extension config
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
