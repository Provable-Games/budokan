import { defineIndexer } from "apibara/indexer";
import { useLogger } from "apibara/plugins";
import { StarknetStream } from "@apibara/starknet";
import {
  drizzle,
  drizzleStorage,
  useDrizzleStorage,
} from "@apibara/plugin-drizzle";
import { sql, eq, and } from "drizzle-orm";
import type { ApibaraRuntimeConfig } from "apibara/types";

import {
  tournaments,
  registrations,
  prizes,
  rewardClaims,
  qualificationEntries,
  platformStats,
  tournamentEvents,
} from "../src/lib/schema.js";
import {
  getEventSelectors,
  decodeTournamentCreated,
  decodeTournamentRegistration,
  decodeTournamentEntryStateChanged,
  decodePrizeAdded,
  decodeRewardClaimed,
  decodeQualificationEntriesUpdated,
  stringifyWithBigInt,
} from "../src/lib/decoder.js";

// ---------------------------------------------------------------------------
// Selector constants (computed once at module level, as BigInt for reliable comparison)
// DNA stream may zero-pad hex strings differently from getSelectorFromName()
// ---------------------------------------------------------------------------
const RAW_SELECTORS = getEventSelectors();
const SELECTORS = {
  TournamentCreated: BigInt(RAW_SELECTORS.TournamentCreated),
  TournamentRegistration: BigInt(RAW_SELECTORS.TournamentRegistration),
  TournamentEntryStateChanged: BigInt(RAW_SELECTORS.TournamentEntryStateChanged),
  PrizeAdded: BigInt(RAW_SELECTORS.PrizeAdded),
  RewardClaimed: BigInt(RAW_SELECTORS.RewardClaimed),
  QualificationEntriesUpdated: BigInt(RAW_SELECTORS.QualificationEntriesUpdated),
};

// ---------------------------------------------------------------------------
// Indexer definition
// ---------------------------------------------------------------------------
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export default async function (runtimeConfig: ApibaraRuntimeConfig) {
  const contractAddress = runtimeConfig.budokanContractAddress as `0x${string}`;
  const streamUrl = runtimeConfig.streamUrl as string;
  const startingBlock = BigInt(runtimeConfig.startingBlock as string);
  const databaseUrl = runtimeConfig.databaseUrl as string;

  if (!contractAddress || contractAddress === "0x0" || contractAddress === ZERO_ADDRESS) {
    throw new Error(
      "BUDOKAN_CONTRACT_ADDRESS env var is required and must not be the zero address",
    );
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL env var is required");
  }

  const database = drizzle({
    connectionString: databaseUrl,
    schema: {
      tournaments,
      registrations,
      prizes,
      rewardClaims,
      qualificationEntries,
      platformStats,
      tournamentEvents,
    },
  });

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "accepted",
    startingBlock,
    plugins: [
      drizzleStorage({
        db: database,
        persistState: true,
        indexerName: "budokan-indexer",
        idColumn: {
          tournaments: "tournament_id",
          registrations: "id",
          prizes: "prize_id",
          reward_claims: "id",
          qualification_entries: "id",
          platform_stats: "key",
          tournament_events: "id",
        },
        migrate: { migrationsFolder: "./drizzle" },
      }),
    ],
    filter: {
      header: "on_data",
      events: [
        {
          address: contractAddress,
          keys: [RAW_SELECTORS.TournamentCreated],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [RAW_SELECTORS.TournamentRegistration],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [RAW_SELECTORS.TournamentEntryStateChanged],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [RAW_SELECTORS.PrizeAdded],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [RAW_SELECTORS.RewardClaimed],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [RAW_SELECTORS.QualificationEntriesUpdated],
          includeTransaction: true,
        },
      ],
    },
    hooks: {
      "connect:before": ({ request }) => {
        // Keep connection alive during quiet periods
        request.heartbeatInterval = { seconds: 30n, nanos: 0 };
      },
    },
    async transform({ block, endCursor, finality }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { events } = block;
      const blockNumber = endCursor?.orderKey ?? 0n;

      if (events.length === 0) return;

      logger.info(
        `Block ${blockNumber} | ${events.length} events | finality: ${finality}`,
      );

      try {

      // Accumulate rows per table for batch inserts
      const tournamentRows: (typeof tournaments.$inferInsert)[] = [];
      const registrationRows: (typeof registrations.$inferInsert)[] = [];
      const prizeRows: (typeof prizes.$inferInsert)[] = [];
      const rewardClaimRows: (typeof rewardClaims.$inferInsert)[] = [];
      const qualificationEntryRows: (typeof qualificationEntries.$inferInsert)[] = [];
      const eventLogRows: (typeof tournamentEvents.$inferInsert)[] = [];

      // Track affected tournament IDs for idempotent counter recomputation
      const affectedTournamentIds = new Set<bigint>();

      // Track stats deltas for this block
      let newTournaments = 0;
      let newRegistrations = 0;
      let newPrizes = 0;
      let newSubmissions = 0;

      for (const event of events) {
        // Normalize selector to BigInt for comparison — DNA stream may
        // zero-pad hex strings differently from getSelectorFromName()
        const rawSelector = event.keys[0] as string;
        const selectorBigInt = BigInt(rawSelector);
        const txHash = event.transactionHash ?? null;
        const eventIdx = event.eventIndex ?? null;

        // -----------------------------------------------------------------
        // TournamentCreated
        // -----------------------------------------------------------------
        if (selectorBigInt === SELECTORS.TournamentCreated) {
          try {
            logger.info(`  Decoding TournamentCreated: keys=${JSON.stringify(event.keys)}, data_len=${(event.data as string[]).length}`);
            const decoded = decodeTournamentCreated(
              event.keys as string[],
              event.data as string[],
            );
            logger.info(`  Decoded tournament ${decoded.tournamentId}: name="${decoded.name}", game=${decoded.gameAddress}`);

            const ef = decoded.entryFee as Record<string, unknown> | null;
            const er = decoded.entryRequirement as
              | Record<string, unknown>
              | null;

            // Entry fee fields (optional — all null when no entry fee)
            const efDist = (ef?.distribution ?? null) as
              | Record<string, unknown>
              | null;

            // Entry requirement fields (optional — all null when no requirement)
            const erType = er?.entry_requirement_type as
              | Record<string, unknown>
              | undefined;
            const erTypeDiscriminator = (erType?.type as string | undefined) ?? null;

            tournamentRows.push({
              tournamentId: decoded.tournamentId,
              gameAddress: decoded.gameAddress,
              createdAt: decoded.createdAt,
              createdBy: decoded.createdBy,
              creatorTokenId: decoded.creatorTokenId,
              name: decoded.name,
              description: decoded.description,

              scheduleRegStartDelay: decoded.registrationStartDelay,
              scheduleRegEndDelay: decoded.registrationEndDelay,
              scheduleGameStartDelay: decoded.gameStartDelay,
              scheduleGameEndDelay: decoded.gameEndDelay,
              scheduleSubmissionDuration: decoded.submissionDuration,

              gameConfigSettingsId: decoded.settingsId,
              gameConfigSoulbound: decoded.soulbound,
              gameConfigPaymaster: decoded.paymaster,
              gameConfigClientUrl: decoded.clientUrl,
              gameConfigRenderer: decoded.renderer,

              entryFeeTokenAddress: (ef?.token_address as string | null) ?? null,
              entryFeeAmount: (ef?.amount as string | null) ?? null,
              entryFeeTournamentCreatorShare:
                ef !== null ? Number(ef.tournament_creator_share ?? 0) : null,
              entryFeeGameCreatorShare:
                ef !== null ? Number(ef.game_creator_share ?? 0) : null,
              entryFeeRefundShare:
                ef !== null ? Number(ef.refund_share ?? 0) : null,
              entryFeeDistributionType:
                (efDist?.type as string | null) ?? null,
              entryFeeDistributionWeight:
                efDist && typeof efDist.weight === "number"
                  ? (efDist.weight as number)
                  : null,
              entryFeeDistributionShares:
                efDist?.type === "Custom"
                  ? ((efDist.shares as unknown[]) ?? null)
                  : null,
              entryFeeDistributionCount:
                ef !== null ? Number(ef.distribution_count ?? 0) : null,

              entryRequirementEntryLimit:
                er !== null ? Number(er.entry_limit ?? 0) : null,
              entryRequirementType: erTypeDiscriminator,
              entryRequirementTokenAddress:
                erTypeDiscriminator === "token"
                  ? ((erType?.token_address as string | null) ?? null)
                  : null,
              entryRequirementExtensionAddress:
                erTypeDiscriminator === "extension"
                  ? ((erType?.address as string | null) ?? null)
                  : null,
              entryRequirementExtensionConfig:
                erTypeDiscriminator === "extension"
                  ? ((erType?.config as unknown[]) ?? null)
                  : null,

              leaderboardAscending: decoded.ascending,
              leaderboardGameMustBeOver: decoded.gameMustBeOver,

              createdAtBlock: blockNumber,
              txHash,
            });

            eventLogRows.push({
              eventType: "TournamentCreated",
              tournamentId: decoded.tournamentId,
              data: JSON.parse(stringifyWithBigInt(decoded)),
              blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });

            newTournaments++;
            logger.info(`  TournamentCreated row queued for insert`);
          } catch (err) {
            logger.error(
              `Failed to decode TournamentCreated at block ${blockNumber}: ${err}`,
            );
            logger.error(`  Event keys: ${JSON.stringify(event.keys)}`);
            logger.error(`  Event data: ${JSON.stringify(event.data)}`);
          }
        }

        // -----------------------------------------------------------------
        // TournamentRegistration (initial registration only)
        // -----------------------------------------------------------------
        else if (selectorBigInt === SELECTORS.TournamentRegistration) {
          try {
            const decoded = decodeTournamentRegistration(
              event.keys as string[],
              event.data as string[],
            );

            registrationRows.push({
              tournamentId: decoded.tournamentId,
              gameTokenId: decoded.gameTokenId.toString(),
              entryNumber: decoded.entryNumber,
              hasSubmitted: false,
              isBanned: false,
            });

            eventLogRows.push({
              eventType: "TournamentRegistration",
              tournamentId: decoded.tournamentId,
              playerAddress: decoded.playerAddress,
              data: JSON.parse(stringifyWithBigInt(decoded)),
              blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });

            affectedTournamentIds.add(decoded.tournamentId);
            newRegistrations++;
          } catch (err) {
            logger.warn(
              `Failed to decode TournamentRegistration at block ${blockNumber}: ${err}`,
            );
          }
        }

        // -----------------------------------------------------------------
        // TournamentEntryStateChanged (ban / submit — flags only)
        // -----------------------------------------------------------------
        else if (selectorBigInt === SELECTORS.TournamentEntryStateChanged) {
          try {
            const decoded = decodeTournamentEntryStateChanged(
              event.keys as string[],
              event.data as string[],
            );

            // Push as a registration row. The upsert SET clause only touches
            // hasSubmitted/isBanned (entryNumber is populated once on the
            // initial INSERT from TournamentRegistration).
            registrationRows.push({
              tournamentId: decoded.tournamentId,
              gameTokenId: decoded.gameTokenId.toString(),
              entryNumber: null,
              hasSubmitted: decoded.hasSubmitted,
              isBanned: decoded.isBanned,
            });

            eventLogRows.push({
              eventType: "TournamentEntryStateChanged",
              tournamentId: decoded.tournamentId,
              playerAddress: null,
              data: JSON.parse(stringifyWithBigInt(decoded)),
              blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });

            affectedTournamentIds.add(decoded.tournamentId);

            if (decoded.hasSubmitted) {
              newSubmissions++;
            }
          } catch (err) {
            logger.warn(
              `Failed to decode TournamentEntryStateChanged at block ${blockNumber}: ${err}`,
            );
          }
        }

        // -----------------------------------------------------------------
        // PrizeAdded
        // -----------------------------------------------------------------
        else if (selectorBigInt === SELECTORS.PrizeAdded) {
          try {
            const decoded = decodePrizeAdded(
              event.keys as string[],
              event.data as string[],
            );

            prizeRows.push({
              prizeId: decoded.prizeId,
              tournamentId: decoded.tournamentId,
              payoutPosition: decoded.payoutPosition,
              tokenAddress: decoded.tokenAddress,
              tokenTypeName: decoded.tokenTypeName,
              amount: decoded.amount,
              tokenId: decoded.tokenId,
              distributionType: decoded.distributionType,
              distributionWeight: decoded.distributionWeight,
              distributionShares: decoded.distributionShares,
              distributionCount: decoded.distributionCount,
              sponsorAddress: decoded.sponsorAddress,
              createdAtBlock: blockNumber,
              txHash,
            });

            eventLogRows.push({
              eventType: "PrizeAdded",
              tournamentId: decoded.tournamentId,
              data: JSON.parse(stringifyWithBigInt(decoded)),
              blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });

            affectedTournamentIds.add(decoded.tournamentId);
            newPrizes++;
          } catch (err) {
            logger.warn(
              `Failed to decode PrizeAdded at block ${blockNumber}: ${err}`,
            );
          }
        }

        // -----------------------------------------------------------------
        // RewardClaimed
        // -----------------------------------------------------------------
        else if (selectorBigInt === SELECTORS.RewardClaimed) {
          try {
            const decoded = decodeRewardClaimed(
              event.keys as string[],
              event.data as string[],
            );

            rewardClaimRows.push({
              tournamentId: decoded.tournamentId,
              rewardType: decoded.rewardType,
              claimed: decoded.claimed,
              createdAtBlock: blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });

            eventLogRows.push({
              eventType: "RewardClaimed",
              tournamentId: decoded.tournamentId,
              data: JSON.parse(stringifyWithBigInt(decoded)),
              blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });
          } catch (err) {
            logger.warn(
              `Failed to decode RewardClaimed at block ${blockNumber}: ${err}`,
            );
          }
        }

        // -----------------------------------------------------------------
        // QualificationEntriesUpdated
        // -----------------------------------------------------------------
        else if (selectorBigInt === SELECTORS.QualificationEntriesUpdated) {
          try {
            const decoded = decodeQualificationEntriesUpdated(
              event.keys as string[],
              event.data as string[],
            );

            qualificationEntryRows.push({
              tournamentId: decoded.tournamentId,
              qualificationProof: decoded.qualificationProof,
              entryCount: decoded.entryCount,
              createdAtBlock: blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });

            eventLogRows.push({
              eventType: "QualificationEntriesUpdated",
              tournamentId: decoded.tournamentId,
              data: JSON.parse(stringifyWithBigInt(decoded)),
              blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });
          } catch (err) {
            logger.warn(
              `Failed to decode QualificationEntriesUpdated at block ${blockNumber}: ${err}`,
            );
          }
        }
      }

      // -------------------------------------------------------------------
      // Batch inserts with conflict handling for idempotency
      // -------------------------------------------------------------------

      if (tournamentRows.length > 0) {
        await db
          .insert(tournaments)
          .values(tournamentRows)
          .onConflictDoNothing();
        logger.info(`  Inserted ${tournamentRows.length} tournament(s)`);
      }

      if (registrationRows.length > 0) {
        // Upsert registrations. The SET clause only touches the flag bits —
        // entryNumber is populated once on the initial INSERT (from
        // TournamentRegistration). Subsequent flag-change events
        // (TournamentEntryStateChanged) carry no entryNumber and must not
        // overwrite the original.
        for (const row of registrationRows) {
          await db
            .insert(registrations)
            .values(row)
            .onConflictDoUpdate({
              target: [
                registrations.tournamentId,
                registrations.gameTokenId,
              ],
              set: {
                hasSubmitted: row.hasSubmitted,
                isBanned: row.isBanned,
              },
            });
        }
        logger.info(
          `  Upserted ${registrationRows.length} registration(s)`,
        );
      }

      if (prizeRows.length > 0) {
        await db.insert(prizes).values(prizeRows).onConflictDoNothing();
        logger.info(`  Inserted ${prizeRows.length} prize(s)`);
      }

      if (rewardClaimRows.length > 0) {
        await db
          .insert(rewardClaims)
          .values(rewardClaimRows)
          .onConflictDoNothing();
        logger.info(
          `  Inserted ${rewardClaimRows.length} reward claim(s)`,
        );
      }

      if (qualificationEntryRows.length > 0) {
        await db
          .insert(qualificationEntries)
          .values(qualificationEntryRows)
          .onConflictDoNothing();
        logger.info(
          `  Inserted ${qualificationEntryRows.length} qualification entry/entries`,
        );
      }

      if (eventLogRows.length > 0) {
        await db
          .insert(tournamentEvents)
          .values(eventLogRows)
          .onConflictDoNothing();
      }

      // -------------------------------------------------------------------
      // Recompute tournament counters from source tables (idempotent)
      // -------------------------------------------------------------------

      for (const tid of affectedTournamentIds) {
        const [entryCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(registrations)
          .where(eq(registrations.tournamentId, tid));

        const [submissionCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(registrations)
          .where(
            and(
              eq(registrations.tournamentId, tid),
              eq(registrations.hasSubmitted, true),
            ),
          );

        const [prizeCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(prizes)
          .where(eq(prizes.tournamentId, tid));

        await db
          .update(tournaments)
          .set({
            entryCount: entryCount.count,
            submissionCount: submissionCount.count,
            prizeCount: prizeCount.count,
          })
          .where(eq(tournaments.tournamentId, tid));
      }

      // -------------------------------------------------------------------
      // Update aggregated platform stats (upsert)
      // -------------------------------------------------------------------
      if (
        newTournaments > 0 ||
        newPrizes > 0 ||
        newRegistrations > 0 ||
        newSubmissions > 0
      ) {
        await db
          .insert(platformStats)
          .values({
            key: "global",
            totalTournaments: newTournaments,
            totalPrizes: newPrizes,
            totalRegistrations: newRegistrations,
            totalSubmissions: newSubmissions,
          })
          .onConflictDoUpdate({
            target: platformStats.key,
            set: {
              totalTournaments: sql`${platformStats.totalTournaments} + ${newTournaments}`,
              totalPrizes: sql`${platformStats.totalPrizes} + ${newPrizes}`,
              totalRegistrations: sql`${platformStats.totalRegistrations} + ${newRegistrations}`,
              totalSubmissions: sql`${platformStats.totalSubmissions} + ${newSubmissions}`,
            },
          });
      }
    } catch (transformErr) {
      logger.error(`Transform failed at block ${blockNumber}: ${transformErr}`);
      throw transformErr; // Re-throw so apibara knows the block failed
    }
    },
  });
}
