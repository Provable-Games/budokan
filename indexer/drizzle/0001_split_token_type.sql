-- Migration: Split prizes.token_type JSONB into typed columns
-- Replaces the untyped JSONB column with explicit columns for ERC20/ERC721 data.

-- Step 1: Add new columns
ALTER TABLE prizes ADD COLUMN token_type_name TEXT;
ALTER TABLE prizes ADD COLUMN amount TEXT;
ALTER TABLE prizes ADD COLUMN token_id TEXT;
ALTER TABLE prizes ADD COLUMN distribution_type TEXT;
ALTER TABLE prizes ADD COLUMN distribution_weight INTEGER;
ALTER TABLE prizes ADD COLUMN distribution_count INTEGER;

-- Step 2: Migrate existing data from JSONB
UPDATE prizes SET
  token_type_name = token_type->>'type',
  amount = CASE WHEN token_type->>'type' = 'erc20' THEN token_type->>'amount' ELSE NULL END,
  token_id = CASE WHEN token_type->>'type' = 'erc721' THEN token_type->>'id' ELSE NULL END,
  distribution_type = CASE WHEN token_type->>'type' = 'erc20' THEN token_type->'distribution'->>'type' ELSE NULL END,
  distribution_weight = CASE WHEN token_type->>'type' = 'erc20' THEN (token_type->'distribution'->>'weight')::integer ELSE NULL END,
  distribution_count = CASE WHEN token_type->>'type' = 'erc20' THEN (token_type->>'distribution_count')::integer ELSE NULL END
WHERE token_type IS NOT NULL;

-- Step 3: Default any remaining NULL token_type_name rows and set NOT NULL
UPDATE prizes SET token_type_name = 'erc20' WHERE token_type_name IS NULL;
ALTER TABLE prizes ALTER COLUMN token_type_name SET NOT NULL;

-- Step 4: Drop the old JSONB column
ALTER TABLE prizes DROP COLUMN token_type;

-- Step 5: Recreate the notify function with new column references
CREATE OR REPLACE FUNCTION notify_prize_added()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'prize_id',          NEW.prize_id,
    'tournament_id',     NEW.tournament_id,
    'payout_position',   NEW.payout_position,
    'token_address',     NEW.token_address,
    'token_type_name',   NEW.token_type_name,
    'amount',            NEW.amount,
    'token_id',          NEW.token_id,
    'distribution_type', NEW.distribution_type,
    'distribution_count', NEW.distribution_count,
    'sponsor_address',   NEW.sponsor_address,
    'created_at_block',  NEW.created_at_block,
    'tx_hash',           NEW.tx_hash
  );
  PERFORM pg_notify('prize_updates', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
