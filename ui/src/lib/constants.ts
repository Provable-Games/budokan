import { ETH, LORDS } from "@/components/Icons";

export const TOURNAMENT_VERSION_KEY: string =
  "0x000000000000000000000000000000000000000000000000006275646f6b616e";

export const SECONDS_IN_DAY = 86400;
export const SECONDS_IN_HOUR = 3600;

export const TOKEN_ICONS: Record<string, React.ComponentType> = {
  ETH: ETH,
  USDC: ETH,
  LORDS: LORDS,
  STRK: ETH,
};

// Optional: Add token addresses if needed
export const TOKEN_ADDRESSES: Record<string, string> = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  USDC: "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  LORDS: "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
};

export const ADMIN_ADDRESS =
  "0x077b8ed8356a7c1f0903fc4ba6e15f9b09cf437ce04f21b2cbf32dc2790183d0";

export const STARTING_TOURNAMENT_ID = 2;

// Tournament IDs to exclude from display
export const EXCLUDED_TOURNAMENT_IDS: number[] = [
  // Add tournament IDs here that you want to hide
  // Example: 1, 2, 3
];
