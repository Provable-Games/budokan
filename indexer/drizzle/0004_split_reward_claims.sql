-- Split reward_claims.reward_type JSONB into structured columns.
--
-- Schema change:
--   - Drop the JSONB `reward_type` column.
--   - Add structured columns: claim_kind (NOT NULL + CHECK), prize_id,
--     payout_index, position, refund_token_id.
--   - Add a multi-column index for the typical access pattern
--     (reward_claims_lookup_idx).
--   - Update notify_reward_claimed() to rebuild the legacy JSONB shape
--     from the new columns so WebSocket consumers see no change.
--
-- See indexer/src/lib/decoder.ts → RewardClaimKind for the discriminator
-- values. The six terminal RewardType variants from the Cairo enum each
-- map to one claim_kind string; nullable columns are populated only when
-- the variant carries that field.

-- 1. Add structured columns (nullable for backfill).
ALTER TABLE "reward_claims"
  ADD COLUMN "claim_kind" text,
  ADD COLUMN "prize_id" bigint,
  ADD COLUMN "payout_index" integer,
  ADD COLUMN "position" integer,
  ADD COLUMN "refund_token_id" text;

-- 2. Backfill from existing JSONB. Untranslatable rows (unknown variant or
-- malformed JSON) are left with claim_kind NULL so the NOT NULL alteration
-- below surfaces them; in practice the indexer only emits the six known
-- variants.
UPDATE "reward_claims"
SET
  "claim_kind" = CASE
    WHEN "reward_type"->>'type' = 'Prize'
      AND "reward_type"->'prize_type'->>'type' = 'Single'
      THEN 'prize_single'
    WHEN "reward_type"->>'type' = 'Prize'
      AND "reward_type"->'prize_type'->>'type' = 'Distributed'
      THEN 'prize_distributed'
    WHEN "reward_type"->>'type' = 'EntryFee'
      AND "reward_type"->'entry_fee_type'->>'type' = 'Position'
      THEN 'entry_fee_position'
    WHEN "reward_type"->>'type' = 'EntryFee'
      AND "reward_type"->'entry_fee_type'->>'type' = 'TournamentCreator'
      THEN 'entry_fee_tournament_creator'
    WHEN "reward_type"->>'type' = 'EntryFee'
      AND "reward_type"->'entry_fee_type'->>'type' = 'GameCreator'
      THEN 'entry_fee_game_creator'
    WHEN "reward_type"->>'type' = 'EntryFee'
      AND "reward_type"->'entry_fee_type'->>'type' = 'Refund'
      THEN 'entry_fee_refund'
  END,
  "prize_id" = CASE
    WHEN "reward_type"->>'type' = 'Prize'
      THEN ("reward_type"->'prize_type'->>'prize_id')::bigint
  END,
  "payout_index" = CASE
    WHEN "reward_type"->>'type' = 'Prize'
      AND "reward_type"->'prize_type'->>'type' = 'Distributed'
      THEN ("reward_type"->'prize_type'->>'payout_index')::integer
  END,
  "position" = CASE
    WHEN "reward_type"->>'type' = 'EntryFee'
      AND "reward_type"->'entry_fee_type'->>'type' = 'Position'
      THEN ("reward_type"->'entry_fee_type'->>'position')::integer
  END,
  "refund_token_id" = CASE
    WHEN "reward_type"->>'type' = 'EntryFee'
      AND "reward_type"->'entry_fee_type'->>'type' = 'Refund'
      THEN ("reward_type"->'entry_fee_type'->>'token_id')
  END;

-- 3. Enforce NOT NULL + CHECK on the discriminator.
ALTER TABLE "reward_claims" ALTER COLUMN "claim_kind" SET NOT NULL;
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_claim_kind_check"
  CHECK ("claim_kind" IN (
    'prize_single',
    'prize_distributed',
    'entry_fee_position',
    'entry_fee_tournament_creator',
    'entry_fee_game_creator',
    'entry_fee_refund'
  ));

-- 4. Drop the JSONB column.
ALTER TABLE "reward_claims" DROP COLUMN "reward_type";

-- 5. Index for the typical access pattern: per-tournament rollups grouped
-- by (claim_kind, prize_id, payout_index).
CREATE INDEX IF NOT EXISTS "reward_claims_lookup_idx"
  ON "reward_claims" ("tournament_id", "claim_kind", "prize_id", "payout_index");

-- 6. Rebuild notify_reward_claimed() so WS consumers still receive the
-- legacy JSONB shape — keeps the wire contract unchanged. The previous
-- definition referenced NEW.reward_type, which no longer exists.
CREATE OR REPLACE FUNCTION notify_reward_claimed()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
  reward_type jsonb;
BEGIN
  reward_type := CASE NEW.claim_kind
    WHEN 'prize_single' THEN jsonb_build_object(
      'type', 'Prize',
      'prize_type', jsonb_build_object(
        'type', 'Single',
        'prize_id', NEW.prize_id::text
      )
    )
    WHEN 'prize_distributed' THEN jsonb_build_object(
      'type', 'Prize',
      'prize_type', jsonb_build_object(
        'type', 'Distributed',
        'prize_id', NEW.prize_id::text,
        'payout_index', NEW.payout_index
      )
    )
    WHEN 'entry_fee_position' THEN jsonb_build_object(
      'type', 'EntryFee',
      'entry_fee_type', jsonb_build_object(
        'type', 'Position',
        'position', NEW.position
      )
    )
    WHEN 'entry_fee_tournament_creator' THEN jsonb_build_object(
      'type', 'EntryFee',
      'entry_fee_type', jsonb_build_object('type', 'TournamentCreator')
    )
    WHEN 'entry_fee_game_creator' THEN jsonb_build_object(
      'type', 'EntryFee',
      'entry_fee_type', jsonb_build_object('type', 'GameCreator')
    )
    WHEN 'entry_fee_refund' THEN jsonb_build_object(
      'type', 'EntryFee',
      'entry_fee_type', jsonb_build_object(
        'type', 'Refund',
        'token_id', NEW.refund_token_id
      )
    )
  END;

  payload := jsonb_build_object(
    'tournament_id',    NEW.tournament_id,
    'reward_type',      reward_type,
    'claimed',          NEW.claimed,
    'created_at_block', NEW.created_at_block,
    'tx_hash',          NEW.tx_hash,
    'event_index',      NEW.event_index
  );
  PERFORM pg_notify('reward_claim_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
