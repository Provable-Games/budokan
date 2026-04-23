-- Add Custom-distribution shares column to sponsored prizes.
-- Sponsored ERC20 prizes can declare their own payout distribution
-- (Linear / Exponential / Uniform / Custom). The Custom variant carries
-- a u16 basis-point shares array summing to 10000, one entry per paid
-- position. Prior to this migration that array was decoded by the
-- indexer but had no column to land in and was silently dropped.
--
-- Backfill is a no-op: existing rows will have this column NULL. Prize
-- shares are only emitted by the PrizeAdded event at creation time, so
-- there is no on-chain call to reconstruct missed values from — operators
-- who need the data for older prizes must re-run the indexer from the
-- affected Budokan contract's deploy block.

ALTER TABLE prizes
  ADD COLUMN IF NOT EXISTS distribution_shares jsonb;
