/**
 * STRESS TEST CARDS - Remove before production!
 * Uses the actual TournamentCard component with mock data to test responsive layouts.
 */
import { TournamentCard } from "@/components/overview/TournamanentCard";
import { Tournament, Prize } from "@/generated/models.gen";
import { CairoOption, CairoOptionVariant, CairoCustomEnum } from "starknet";
import { stringToFelt } from "@/lib/utils";
import { TabType } from "@/components/overview/TournamentTabs";

// Helper to create CairoOption
function createSome<T>(value: T): CairoOption<T> {
  return new CairoOption(CairoOptionVariant.Some, value);
}
function createNone<T>(): CairoOption<T> {
  return new CairoOption<T>(CairoOptionVariant.None);
}

// Helper: generate a deterministic fake address from an index
const fakeAddr = (i: number) => `0x${i.toString(16).padStart(64, "0")}`;

// Create mock tournament data
const createMockTournament = (
  variant: "upcoming" | "live" | "submission" | "ended",
  options: {
    longName?: boolean;
    hasRestriction?: boolean;
    hasEntryLimit?: boolean;
    hasEntryFee?: boolean;
  } = {},
): Tournament => {
  const now = Math.floor(Date.now() / 1000);

  const {
    longName = true,
    hasRestriction = true,
    hasEntryLimit = true,
    hasEntryFee = true,
  } = options;

  let gameStart: number;
  let gameEnd: number;
  let registrationStart: number | null = null;
  let registrationEnd: number | null = null;
  let submissionDuration = 0;

  switch (variant) {
    case "upcoming":
      registrationStart = now - 3600;
      registrationEnd = now + 86400;
      gameStart = now + 86400 * 3 + 3600 * 5 + 60 * 23 + 45;
      gameEnd = gameStart + 86400 * 7;
      break;
    case "live":
      gameStart = now - 3600;
      gameEnd = now + 3600 * 2 + 60 * 15 + 30;
      break;
    case "submission":
      gameStart = now - 86400;
      gameEnd = now - 3600;
      submissionDuration = 3600 + 60 * 45 + 20;
      break;
    case "ended":
    default:
      gameStart = now - 86400 * 2;
      gameEnd = now - 86400;
      break;
  }

  const name = longName ? "SuperLongTournamentName1234" : "Short";

  const entryRequirement =
    hasRestriction || hasEntryLimit
      ? createSome({
          entry_limit: hasEntryLimit ? BigInt(3) : BigInt(0),
          entry_requirement_type: hasRestriction
            ? new CairoCustomEnum({ allowlist: ["0x123", "0x456"] })
            : new CairoCustomEnum({ allowlist: [] }),
        })
      : createNone();

  const entryFee = hasEntryFee
    ? createSome({
        token_address:
          "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        amount: BigInt("25000000000000000"),
        distribution: new CairoCustomEnum({ Linear: 100 }),
        tournament_creator_share: createSome(BigInt(5)),
        game_creator_share: createSome(BigInt(5)),
        refund_share: createNone<bigint>(),
        distribution_positions: createSome(BigInt(10)),
      })
    : createNone();

  return {
    id: BigInt(
      variant === "upcoming"
        ? 1001
        : variant === "live"
          ? 1002
          : variant === "submission"
            ? 1003
            : 1004,
    ),
    created_at: BigInt(now - 86400 * 7),
    created_by: "0x1234567890abcdef",
    creator_token_id: BigInt(1),
    metadata: {
      name: stringToFelt(name),
      description: "Stress test",
    },
    schedule: {
      registration:
        registrationStart && registrationEnd
          ? createSome({
              start: BigInt(registrationStart),
              end: BigInt(registrationEnd),
            })
          : createNone(),
      game: { start: BigInt(gameStart), end: BigInt(gameEnd) },
      submission_duration: BigInt(submissionDuration),
    },
    game_config: {
      address: "0x0",
      settings_id: BigInt(1),
      soulbound: false,
      play_url: "",
    },
    entry_fee: entryFee,
    entry_requirement: entryRequirement,
    soulbound: false,
    play_url: "",
  } as unknown as Tournament;
};

// --- Standard prizes: 2 ERC20 + 1 NFT collection (3 tokens) ---
const createMockPrizes = (): Prize[] => {
  return [
    {
      id: BigInt(1),
      context_id: BigInt(1001),
      token_address:
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      token_type: new CairoCustomEnum({
        erc20: {
          amount: BigInt("5000000000000000000"),
          distribution: createNone(),
          distribution_count: createNone(),
        },
      }),
      sponsor_address: "0x0",
    },
    {
      id: BigInt(2),
      context_id: BigInt(1001),
      token_address:
        "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
      token_type: new CairoCustomEnum({
        erc20: {
          amount: BigInt("5000000000"),
          distribution: createNone(),
          distribution_count: createNone(),
        },
      }),
      sponsor_address: "0x0",
    },
    // NFT prizes from one collection
    ...[42, 43, 44].map((tokenId, i) => ({
      id: BigInt(3 + i),
      context_id: BigInt(1001),
      token_address:
        "0x046da8955829adf2bda310099a0063451923f02e648cf25a1203aac6335cf0e4",
      token_type: new CairoCustomEnum({ erc721: { id: BigInt(tokenId) } }),
      sponsor_address: "0x0",
    })),
  ] as unknown as Prize[];
};

// --- Mass prizes: 6 ERC20 + 4 NFT collections (12 NFTs) ---
const createManyTokenPrizes = (): Prize[] => {
  const prizes: unknown[] = [];
  for (let i = 0; i < 6; i++) {
    prizes.push({
      id: BigInt(100 + i),
      context_id: BigInt(1001),
      token_address: fakeAddr(0xeee0 + i),
      token_type: new CairoCustomEnum({
        erc20: {
          amount: BigInt("1000000000000000000"),
          distribution: createNone(),
          distribution_count: createNone(),
        },
      }),
      sponsor_address: "0x0",
    });
  }
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      prizes.push({
        id: BigInt(200 + i * 10 + j),
        context_id: BigInt(1001),
        token_address: fakeAddr(0xfff0 + i),
        token_type: new CairoCustomEnum({ erc721: { id: BigInt(j + 1) } }),
        sponsor_address: "0x0",
      });
    }
  }
  return prizes as Prize[];
};

// Token names for mass stress test
const EXTRA_ERC20 = ["STRK", "DAI", "WBTC", "LUSD", "UNI", "AAVE"];
const EXTRA_NFT = ["BEAST", "BLOBERT", "LOOT", "HELM"];

// Mock token metadata (includes standard + mass tokens)
const mockTokens = [
  {
    token_address:
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    token_type: "erc20" as const,
  },
  {
    token_address:
      "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    token_type: "erc20" as const,
  },
  {
    token_address: fakeAddr(0xbeef01),
    symbol: "SURVIVOR",
    name: "Survivor NFT",
    decimals: 0,
    token_type: "erc721" as const,
  },
  ...EXTRA_ERC20.map((sym, i) => ({
    token_address: fakeAddr(0xeee0 + i),
    symbol: sym,
    name: sym,
    decimals: 18,
    token_type: "erc20" as const,
  })),
  ...EXTRA_NFT.map((sym, i) => ({
    token_address: fakeAddr(0xfff0 + i),
    symbol: sym,
    name: sym + " NFT",
    decimals: 0,
    token_type: "erc721" as const,
  })),
];

// Use normalized addresses (without leading zeros) to match indexAddress() lookups
const mockTokenPrices: Record<string, number> = {
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": 2500,
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": 1,
  ...Object.fromEntries(EXTRA_ERC20.map((_, i) => [fakeAddr(0xeee0 + i), 10])),
};

const mockTokenDecimals: Record<string, number> = {
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": 18,
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": 6,
  ...Object.fromEntries(EXTRA_ERC20.map((_, i) => [fakeAddr(0xeee0 + i), 18])),
};

const mockAggregations = {
  token_totals: [
    {
      tokenAddress:
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      tokenType: "erc20",
      totalAmount: Number(BigInt("5000000000000000000")),
    },
    {
      tokenAddress:
        "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
      tokenType: "erc20",
      totalAmount: 5000000000,
    },
  ],
};

const manyTokenAggregations = {
  token_totals: EXTRA_ERC20.map((_, i) => ({
    tokenAddress: fakeAddr(0xeee0 + i),
    tokenType: "erc20",
    totalAmount: Number(BigInt("1000000000000000000")),
  })),
};

// --- Wrapper component ---
interface StressTestCardWrapperProps {
  variant: "upcoming" | "live" | "submission" | "ended" | "many-tokens";
  label: string;
}

const StressTestCardWrapper = ({
  variant,
  label,
}: StressTestCardWrapperProps) => {
  const isManyTokens = variant === "many-tokens";
  const baseVariant = isManyTokens ? "live" : variant;
  const tournament = createMockTournament(
    baseVariant as "upcoming" | "live" | "submission" | "ended",
  );
  const prizes = isManyTokens ? createManyTokenPrizes() : createMockPrizes();

  const statusMap: Record<string, TabType> = {
    upcoming: "upcoming",
    live: "live",
    submission: "live",
    ended: "ended",
    "many-tokens": "live",
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 border-2 border-dashed border-yellow-500 rounded-lg pointer-events-none z-10" />
      <div className="absolute -top-2 left-2 bg-yellow-500 text-black text-[10px] px-1 rounded z-20 font-bold">
        TEST: {label}
      </div>
      <TournamentCard
        tournament={tournament}
        index={0}
        status={statusMap[variant]}
        prizes={prizes}
        entryCount={999}
        tokens={mockTokens}
        tokenPrices={mockTokenPrices}
        pricesLoading={false}
        tokenDecimals={mockTokenDecimals}
        aggregations={isManyTokens ? manyTokenAggregations : mockAggregations}
      />
    </div>
  );
};

/**
 * Renders stress test cards for all tournament states + edge cases.
 */
export const StressTestCards = () => {
  return (
    <>
      <StressTestCardWrapper variant="upcoming" label="UPCOMING" />
      <StressTestCardWrapper variant="live" label="LIVE" />
      <StressTestCardWrapper variant="submission" label="SUBMISSION" />
      <StressTestCardWrapper variant="ended" label="ENDED" />
      <StressTestCardWrapper variant="many-tokens" label="10 TOKENS" />
    </>
  );
};

export default StressTestCards;
