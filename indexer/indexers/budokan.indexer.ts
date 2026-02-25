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
  leaderboards,
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
  decodeLeaderboardUpdated,
  decodePrizeAdded,
  decodeRewardClaimed,
  decodeQualificationEntriesUpdated,
  stringifyWithBigInt,
} from "../src/lib/decoder.js";

// ---------------------------------------------------------------------------
// Selector constants (computed once at module level)
// ---------------------------------------------------------------------------
const SELECTORS = getEventSelectors();

// ---------------------------------------------------------------------------
// Indexer definition
// ---------------------------------------------------------------------------
export default async function (runtimeConfig: ApibaraRuntimeConfig) {
  const contractAddress = runtimeConfig.budokanContractAddress as `0x${string}`;
  const streamUrl = runtimeConfig.streamUrl as string;
  const startingBlock = BigInt(runtimeConfig.startingBlock as string);
  const databaseUrl = runtimeConfig.databaseUrl as string;

  const database = drizzle({
    connectionString: databaseUrl,
    schema: {
      tournaments,
      registrations,
      leaderboards,
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
          leaderboards: "id",
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
          keys: [SELECTORS.TournamentCreated],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [SELECTORS.TournamentRegistration],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [SELECTORS.LeaderboardUpdated],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [SELECTORS.PrizeAdded],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [SELECTORS.RewardClaimed],
          includeTransaction: true,
        },
        {
          address: contractAddress,
          keys: [SELECTORS.QualificationEntriesUpdated],
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

      // Accumulate rows per table for batch inserts
      const tournamentRows: (typeof tournaments.$inferInsert)[] = [];
      const registrationRows: (typeof registrations.$inferInsert)[] = [];
      const prizeRows: (typeof prizes.$inferInsert)[] = [];
      const rewardClaimRows: (typeof rewardClaims.$inferInsert)[] = [];
      const qualificationEntryRows: (typeof qualificationEntries.$inferInsert)[] = [];
      const eventLogRows: (typeof tournamentEvents.$inferInsert)[] = [];

      // Leaderboard updates need special handling (delete+insert per tournament)
      const leaderboardUpdates = new Map<bigint, bigint[]>();

      // Track affected tournament IDs for idempotent counter recomputation
      const affectedTournamentIds = new Set<bigint>();

      // Track stats deltas for this block
      let newTournaments = 0;
      let newRegistrations = 0;
      let newPrizes = 0;
      let newSubmissions = 0;

      for (const event of events) {
        const selector = event.keys[0];
        const txHash = event.transactionHash ?? null;
        const eventIdx = event.eventIndex ?? null;

        // -----------------------------------------------------------------
        // TournamentCreated
        // -----------------------------------------------------------------
        if (selector === SELECTORS.TournamentCreated) {
          try {
            const decoded = decodeTournamentCreated(
              event.keys as string[],
              event.data as string[],
            );

            tournamentRows.push({
              tournamentId: decoded.tournamentId,
              gameAddress: decoded.gameAddress,
              createdAt: decoded.createdAt,
              createdBy: decoded.createdBy,
              creatorTokenId: decoded.creatorTokenId,
              name: decoded.name,
              description: decoded.description,
              schedule: decoded.schedule,
              gameConfig: decoded.gameConfig,
              entryFee: decoded.entryFee,
              entryRequirement: decoded.entryRequirement,
              leaderboardConfig: decoded.leaderboardConfig,
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
          } catch (err) {
            logger.warn(
              `Failed to decode TournamentCreated at block ${blockNumber}: ${err}`,
            );
          }
        }

        // -----------------------------------------------------------------
        // TournamentRegistration
        // -----------------------------------------------------------------
        else if (selector === SELECTORS.TournamentRegistration) {
          try {
            const decoded = decodeTournamentRegistration(
              event.keys as string[],
              event.data as string[],
            );

            registrationRows.push({
              tournamentId: decoded.tournamentId,
              gameTokenId: decoded.gameTokenId,
              gameAddress: decoded.gameAddress,
              playerAddress: decoded.playerAddress,
              entryNumber: decoded.entryNumber,
              hasSubmitted: decoded.hasSubmitted,
              isBanned: decoded.isBanned,
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

            // Track as new registration only if not a ban/submission update
            if (!decoded.isBanned && !decoded.hasSubmitted) {
              newRegistrations++;
            }

            // Track submission updates for stats
            if (decoded.hasSubmitted) {
              newSubmissions++;
            }
          } catch (err) {
            logger.warn(
              `Failed to decode TournamentRegistration at block ${blockNumber}: ${err}`,
            );
          }
        }

        // -----------------------------------------------------------------
        // LeaderboardUpdated
        // -----------------------------------------------------------------
        else if (selector === SELECTORS.LeaderboardUpdated) {
          try {
            const decoded = decodeLeaderboardUpdated(
              event.keys as string[],
              event.data as string[],
            );

            // Store the latest leaderboard state per tournament
            // (multiple updates in one block should use the last one)
            leaderboardUpdates.set(decoded.tournamentId, decoded.tokenIds);

            eventLogRows.push({
              eventType: "LeaderboardUpdated",
              tournamentId: decoded.tournamentId,
              data: JSON.parse(stringifyWithBigInt(decoded)),
              blockNumber,
              txHash: txHash!,
              eventIndex: eventIdx!,
            });
          } catch (err) {
            logger.warn(
              `Failed to decode LeaderboardUpdated at block ${blockNumber}: ${err}`,
            );
          }
        }

        // -----------------------------------------------------------------
        // PrizeAdded
        // -----------------------------------------------------------------
        else if (selector === SELECTORS.PrizeAdded) {
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
              tokenType: decoded.tokenType,
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
        else if (selector === SELECTORS.RewardClaimed) {
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
        else if (selector === SELECTORS.QualificationEntriesUpdated) {
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
        // Upsert registrations to handle updates (ban, submission)
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
                gameAddress: row.gameAddress,
                playerAddress: row.playerAddress,
                entryNumber: row.entryNumber,
                hasSubmitted: row.hasSubmitted,
                isBanned: row.isBanned,
              },
            });
        }
        logger.info(
          `  Upserted ${registrationRows.length} registration(s)`,
        );
      }

      // Leaderboard updates: replace entire leaderboard per tournament (atomic)
      for (const [tournamentId, tokenIds] of leaderboardUpdates) {
        await db.transaction(async (tx) => {
          // Delete existing leaderboard rows for this tournament
          await tx
            .delete(leaderboards)
            .where(sql`${leaderboards.tournamentId} = ${tournamentId}`);

          // Insert new leaderboard rows
          if (tokenIds.length > 0) {
            const leaderboardRows: (typeof leaderboards.$inferInsert)[] =
              tokenIds.map((tokenId, index) => ({
                tournamentId,
                position: index + 1,
                tokenId,
              }));

            await tx.insert(leaderboards).values(leaderboardRows);
          }
        });
        logger.info(
          `  Rebuilt leaderboard for tournament ${tournamentId} (${tokenIds.length} entries)`,
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
    },
  });
}
