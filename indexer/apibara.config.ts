import { defineConfig } from "apibara/config";

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const budokanContractAddress = (
  process.env.BUDOKAN_CONTRACT_ADDRESS ?? ""
).trim();

if (!budokanContractAddress || budokanContractAddress === ZERO_ADDRESS) {
  throw new Error(
    "BUDOKAN_CONTRACT_ADDRESS env var is required and must not be the zero address",
  );
}

const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL env var is required");
}

export default defineConfig({
  runtimeConfig: {
    budokanContractAddress: budokanContractAddress as `0x${string}`,
    streamUrl: (
      process.env.STREAM_URL ?? "https://mainnet.starknet.a5a.ch"
    ).trim(),
    startingBlock: (process.env.STARTING_BLOCK ?? "0").trim(),
    databaseUrl,
  },
});
