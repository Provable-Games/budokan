/**
 * Hooks for waiting on transaction confirmation side effects.
 * These are simple delay-based waits now that Torii subscriptions have been removed.
 */

const CONFIRMATION_DELAY_MS = 5000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useEntityUpdates = () => {
  const waitForTournamentCreation = async (_totalTournaments: number) => {
    await wait(CONFIRMATION_DELAY_MS);
  };

  const waitForTournamentEntry = async (
    _tournamentId: import("starknet").BigNumberish,
    _entryCount: number
  ) => {
    await wait(CONFIRMATION_DELAY_MS);
  };

  const waitForAddPrizes = async (_prizeCount: number) => {
    await wait(CONFIRMATION_DELAY_MS);
  };

  const waitForSubmitScores = async (
    _tournamentId: import("starknet").BigNumberish
  ) => {
    await wait(CONFIRMATION_DELAY_MS);
  };

  const waitForBannedEntry = async (
    _tournamentId: import("starknet").BigNumberish,
    _gameTokenId: import("starknet").BigNumberish
  ) => {
    await wait(CONFIRMATION_DELAY_MS);
  };

  return {
    waitForTournamentCreation,
    waitForTournamentEntry,
    waitForAddPrizes,
    waitForSubmitScores,
    waitForBannedEntry,
  };
};
