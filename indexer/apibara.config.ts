import { defineConfig } from "apibara/config";

export default defineConfig({
  runtimeConfig: {
    budokanContractAddress:
      (process.env.BUDOKAN_CONTRACT_ADDRESS ??
      "0x0000000000000000000000000000000000000000000000000000000000000000").trim(),
    streamUrl:
      (process.env.STREAM_URL ?? "https://mainnet.starknet.a5a.ch").trim(),
    startingBlock: (process.env.STARTING_BLOCK ?? "0").trim(),
    databaseUrl:
      (process.env.DATABASE_URL ?? "postgresql://localhost:5432/budokan").trim(),
  },
});
