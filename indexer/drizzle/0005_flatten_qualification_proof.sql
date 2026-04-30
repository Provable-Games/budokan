-- Split qualification_entries.qualification_proof JSONB into structured
-- columns (mirrors the reward_claims work in migration 0004).
--
-- Schema change:
--   - Drop the JSONB `qualification_proof` column.
--   - Add `qualification_kind` (NOT NULL + CHECK), `nft_token_id`,
--     `extension_config` (still JSONB — homogeneous variable-length list of
--     felt252 hex strings, not a discriminated union).
--   - Add a multi-column index for the typical NFT-lookup access pattern
--     (qualification_entries_nft_lookup_idx).
--   - Rebuild notify_reward_claimed() to emit the new flat reward_claims
--     shape since this PR also breaks the API wire contract for
--     /reward-claims (the SDK 0.2.0 release picks up the flat shape).
--
-- See indexer/src/lib/decoder.ts → QualificationKind for the discriminator
-- values. The two terminal QualificationProof variants (NFT, Extension)
-- map to one qualification_kind string each.

-- 1. Add structured columns (nullable for backfill).
ALTER TABLE "qualification_entries"
  ADD COLUMN "qualification_kind" text,
  ADD COLUMN "nft_token_id" text,
  ADD COLUMN "extension_config" jsonb;

-- 2. Backfill from existing JSONB. The pre-migration shape was
--    NFT       → { "type": "NFT", "token_id": "<u256 decimal>" }
--    Extension → { "type": "Extension", "data": ["0x...", "0x..."] }
UPDATE "qualification_entries"
SET
  "qualification_kind" = CASE
    WHEN "qualification_proof"->>'type' = 'NFT' THEN 'nft'
    WHEN "qualification_proof"->>'type' = 'Extension' THEN 'extension'
  END,
  "nft_token_id" = CASE
    WHEN "qualification_proof"->>'type' = 'NFT'
      THEN "qualification_proof"->>'token_id'
  END,
  "extension_config" = CASE
    WHEN "qualification_proof"->>'type' = 'Extension'
      THEN "qualification_proof"->'data'
  END;

-- Drain deferred constraint trigger events queued by the UPDATE before
-- running ALTER TABLE on the same table. See migration 0004 for context.
SET CONSTRAINTS ALL IMMEDIATE;

-- 3. Enforce NOT NULL + CHECK on the discriminator.
ALTER TABLE "qualification_entries"
  ALTER COLUMN "qualification_kind" SET NOT NULL;
ALTER TABLE "qualification_entries"
  ADD CONSTRAINT "qualification_entries_kind_check"
  CHECK ("qualification_kind" IN ('nft', 'extension'));

-- 4. Drop the JSONB column.
ALTER TABLE "qualification_entries" DROP COLUMN "qualification_proof";

-- 5. Index for the typical access pattern: per-tournament NFT lookups.
CREATE INDEX IF NOT EXISTS "qualification_entries_nft_lookup_idx"
  ON "qualification_entries" ("tournament_id", "qualification_kind", "nft_token_id");

-- 6. Rebuild notify_reward_claimed() to emit the new flat reward_claims
-- shape. The previous version (created in 0004) reconstructed the legacy
-- nested `reward_type` JSONB for SDK wire compatibility. SDK 0.2.0
-- consumes the flat shape, so the trigger now mirrors what the API
-- returns: kind, prize_id, payout_index, position, refund_token_id.
CREATE OR REPLACE FUNCTION notify_reward_claimed()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'tournament_id',    NEW.tournament_id,
    'claim_kind',       NEW.claim_kind,
    'prize_id',         NEW.prize_id,
    'payout_index',     NEW.payout_index,
    'position',         NEW.position,
    'refund_token_id',  NEW.refund_token_id,
    'claimed',          NEW.claimed,
    'created_at_block', NEW.created_at_block,
    'tx_hash',          NEW.tx_hash,
    'event_index',      NEW.event_index
  );
  PERFORM pg_notify('reward_claim_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
