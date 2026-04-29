-- Drop registrations.player_address (and its index).
--
-- Background: the column captured the original registrant address from the
-- TournamentRegistration event. Since the contract keys registrations by
-- token_id only and the underlying NFT can be transferred at any time,
-- the address held here goes stale on transfer — every consumer reading it
-- as "the current owner" produced incorrect attribution. See issue #241.
--
-- All client/API consumers have been migrated to source ownership from
-- denshokan-sdk's useTokens. The /players/:address/* endpoints are removed
-- in the same PR.

DROP INDEX IF EXISTS "registrations_player_address_idx";
ALTER TABLE "registrations" DROP COLUMN IF EXISTS "player_address";
