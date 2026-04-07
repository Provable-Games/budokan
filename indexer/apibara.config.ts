import { defineConfig } from "apibara/config";

export default defineConfig({
  runtimeConfig: {
    // Budokan tournament contract address
    budokanContractAddress: (
      process.env.BUDOKAN_CONTRACT_ADDRESS ?? "0x0"
    ).trim(),
    // Starknet DNA stream URL (mainnet or sepolia)
    streamUrl: (
      process.env.STREAM_URL ?? "https://mainnet.starknet.a5a.ch"
    ).trim(),
    // Starting block - set to contract deployment block for full history
    startingBlock: (process.env.STARTING_BLOCK ?? "0").trim(),
    // PostgreSQL connection string
    databaseUrl: (
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/budokan"
    ).trim(),
  },
});
