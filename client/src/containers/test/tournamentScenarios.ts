/**
 * Hardcoded scenarios for the Tournament detail design tests.
 *
 * Each scenario holds everything needed to render the new layout
 * (Header / Hero / Info / Timeline / Description / Entrants) without touching
 * any live SDK endpoint.
 */

import type { PositionPrizeDisplay } from "@/components/tournament/EntrantsTable";
import type { TournamentStatus } from "@/components/tournament/TournamentDetailHeader";

const NOW = Math.floor(Date.now() / 1000);
const HOUR = 3600;
const DAY = 86400;

const ETH = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export interface MockEntrant {
  tokenId: string;
  owner: string;
  playerName: string;
  score: number;
  gameOver: boolean;
  isBanned?: boolean;
  hasSubmitted?: boolean;
}

export interface MockMyEntry {
  tokenId: string;
  entryNumber: number;
  playerName: string;
  score: number;
  gameOver: boolean;
  hasSubmitted?: boolean;
  /** Current rank in the leaderboard (1-indexed). Undefined = pre-start. */
  rank?: number;
}

export interface HeroToken {
  symbol: string;
  logoUrl?: string;
}

export interface ScenarioData {
  id: string;
  title: string;

  // --- Header ---
  status: TournamentStatus;
  gameName: string;
  gameImage?: string;
  gameAddress: string;
  creatorAddress: string;
  creatorUsername?: string;

  // --- Hero ---
  name: string;
  totalPrizeUsd: number;
  uniquePrizeTokens: HeroToken[];
  paidPlaces: number;

  // --- Info ---
  settingsName?: string | null;
  registrationType: "open" | "fixed";
  entryCount: number;
  entryFeeInfo:
    | { type: "free"; display: "Free" }
    | { type: "token"; display: string }
    | { type: "usd"; display: string };
  entryFeeTokenLogo?: string;
  entryFeeTokenSymbol?: string;
  /** Refund share in basis points (0-10000). Optional; omit or 0 = no refund. */
  refundBps?: number;
  /** Pre-formatted net fee display (e.g. "$6.25"). Shown only when refundBps > 0. */
  netFeeDisplay?: string;

  // --- Timeline ---
  timeline: {
    createdTime: number;
    startTime: number;
    duration: number;
    submissionPeriod: number;
    registrationStartTime: number;
    registrationEndTime: number;
  };

  // --- Description ---
  description: string;

  // --- Entrants + prizes ---
  prizesByPosition: Array<[number, PositionPrizeDisplay]>;
  entrants: MockEntrant[];
  myEntries: MockMyEntry[];

  // --- Header state flags ---
  isStarted: boolean;
  isEnded: boolean;
  isSubmitted: boolean;
  isInPreparationPeriod: boolean;
  allSubmitted: boolean;
  allClaimed: boolean;
  claimablePrizesCount: number;
}

const ethLogo =
  "https://static.cartridge.gg/presets/loot-survivor/eth.png";
const strkLogo =
  "https://static.cartridge.gg/presets/loot-survivor/strk.png";
const lordsLogo =
  "https://static.cartridge.gg/presets/loot-survivor/lords.png";

const sampleEntrants = (
  count: number,
  withScores = true,
): MockEntrant[] => {
  const names = [
    "Tarrence",
    "Bal7hazar",
    "SharkO",
    "LoafOfBread",
    "RobotAtBar",
    "Starkiller",
    "Doge9",
    "Mistral",
    "Claude",
    "Opus",
    "Haiku",
    "Sonnet",
    "Luna",
    "Zephyr",
    "Axiom",
  ];
  return Array.from({ length: count }).map((_, i) => ({
    tokenId: `0x${(i + 1).toString(16).padStart(8, "0")}`,
    owner: `0x0${(1234 + i).toString(16).padStart(63, "0")}`,
    playerName: names[i % names.length] + (i > names.length - 1 ? i : ""),
    score: withScores ? Math.max(0, 9800 - i * (380 + (i % 7) * 43)) : 0,
    gameOver: withScores ? i < 6 : false,
    isBanned: i === 4 && count > 6,
    hasSubmitted: withScores && i < 3,
  }));
};

const sampleMyEntries: MockMyEntry[] = [
  {
    tokenId: "0x00001001",
    entryNumber: 1,
    playerName: "you",
    score: 7420,
    gameOver: true,
    hasSubmitted: true,
    rank: 4,
  },
  {
    tokenId: "0x00001002",
    entryNumber: 2,
    playerName: "you-2",
    score: 3100,
    gameOver: false,
    rank: 9,
  },
];

export const scenarios: ScenarioData[] = [
  {
    id: "1",
    title: "1. Live tournament — mixed ERC20 prizes, paid entry, active scores",
    status: "live",
    gameName: "Loot Survivor",
    gameAddress: ETH,
    creatorAddress:
      "0x01a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890",
    creatorUsername: "gladiator",

    name: "Tournament of Champions",
    totalPrizeUsd: 2840.5,
    uniquePrizeTokens: [
      { symbol: "ETH", logoUrl: ethLogo },
      { symbol: "STRK", logoUrl: strkLogo },
      { symbol: "LORDS", logoUrl: lordsLogo },
    ],
    paidPlaces: 5,

    settingsName: "Hardcore",
    registrationType: "open",
    entryCount: 47,
    entryFeeInfo: { type: "usd", display: "$12.50" },
    entryFeeTokenLogo: ethLogo,
    entryFeeTokenSymbol: "ETH",
    refundBps: 5000,
    netFeeDisplay: "$6.25",

    timeline: {
      createdTime: NOW - 3 * DAY,
      startTime: NOW - 6 * HOUR,
      duration: 2 * DAY,
      submissionPeriod: DAY,
      registrationStartTime: NOW - 3 * DAY,
      registrationEndTime: NOW - 6 * HOUR,
    },

    description:
      "Enter the **Tournament of Champions** and prove your worth against the fiercest beasts in the realm. Only the strongest adventurers will survive the gauntlet of challenges ahead.\n\n## Rules\n- Each player gets one life\n- Must defeat the final boss to qualify\n- Top 3 finishers split the prize pool\n\nGood luck, adventurer.",

    prizesByPosition: [
      [1, { usd: 1500, tokenSymbol: "ETH", tokenLogo: ethLogo }],
      [2, { usd: 700, tokenSymbol: "ETH", tokenLogo: ethLogo }],
      [3, { usd: 400, tokenSymbol: "STRK", tokenLogo: strkLogo }],
      [4, { usd: 150, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
      [5, { usd: 90.5, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
    ],
    entrants: sampleEntrants(12),
    myEntries: sampleMyEntries,

    isStarted: true,
    isEnded: false,
    isSubmitted: false,
    isInPreparationPeriod: false,
    allSubmitted: false,
    allClaimed: false,
    claimablePrizesCount: 0,
  },

  {
    id: "2",
    title: "2. Upcoming — free entry, fixed registration window, no entries yet",
    status: "registration",
    gameName: "Dark Shuffle",
    gameAddress: STRK,
    creatorAddress:
      "0x0987654321098765432109876543210987654321098765432109876543210987",
    creatorUsername: "mosey",

    name: "First Steps",
    totalPrizeUsd: 0,
    uniquePrizeTokens: [],
    paidPlaces: 0,

    settingsName: "Default",
    registrationType: "fixed",
    entryCount: 0,
    entryFeeInfo: { type: "free", display: "Free" },

    timeline: {
      createdTime: NOW - HOUR,
      startTime: NOW + 3 * DAY,
      duration: 2 * DAY,
      submissionPeriod: DAY,
      registrationStartTime: NOW - HOUR,
      registrationEndTime: NOW + 2 * DAY,
    },

    description: "A simple introductory tournament. No entry fee, anyone welcome.",

    prizesByPosition: [],
    entrants: [],
    myEntries: [],

    isStarted: false,
    isEnded: false,
    isSubmitted: false,
    isInPreparationPeriod: false,
    allSubmitted: false,
    allClaimed: false,
    claimablePrizesCount: 0,
  },

  {
    id: "3",
    title: "3. Finalized — claimable prizes, mixed submitted/banned rows",
    status: "finalized",
    gameName: "Loot Survivor",
    gameAddress: ETH,
    creatorAddress:
      "0x05555555555555555555555555555555555555555555555555555555555555555",
    creatorUsername: "overlord",

    name: "Dragon Slayer Finals",
    totalPrizeUsd: 1220,
    uniquePrizeTokens: [
      { symbol: "ETH", logoUrl: ethLogo },
      { symbol: "LORDS", logoUrl: lordsLogo },
    ],
    paidPlaces: 3,

    settingsName: "Normal",
    registrationType: "fixed",
    entryCount: 22,
    entryFeeInfo: { type: "usd", display: "$5.00" },
    entryFeeTokenLogo: ethLogo,
    entryFeeTokenSymbol: "ETH",

    timeline: {
      createdTime: NOW - 10 * DAY,
      startTime: NOW - 7 * DAY,
      duration: 3 * DAY,
      submissionPeriod: DAY,
      registrationStartTime: NOW - 10 * DAY,
      registrationEndTime: NOW - 7 * DAY,
    },

    description: "Defeat the ancient dragon. This tournament has **ended** — top 3 split the pot.",

    prizesByPosition: [
      [1, { usd: 800, tokenSymbol: "ETH", tokenLogo: ethLogo }],
      [2, { usd: 300, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
      [3, { usd: 120, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
    ],
    entrants: sampleEntrants(8).map((e, i) => ({
      ...e,
      gameOver: true,
      hasSubmitted: i < 6,
    })),
    myEntries: [
      {
        tokenId: "0x00003001",
        entryNumber: 1,
        playerName: "you",
        score: 8900,
        gameOver: true,
        hasSubmitted: true,
        rank: 2,
      },
    ],

    isStarted: true,
    isEnded: true,
    isSubmitted: true,
    isInPreparationPeriod: false,
    allSubmitted: true,
    allClaimed: false,
    claimablePrizesCount: 3,
  },

  {
    id: "4",
    title: "4. Long markdown description — triggers 'Read more' dialog",
    status: "preparation",
    gameName: "Loot Survivor",
    gameAddress: STRK,
    creatorAddress:
      "0x0777777777777777777777777777777777777777777777777777777777777777",

    name: "The Grand Expedition",
    totalPrizeUsd: 8940,
    uniquePrizeTokens: [
      { symbol: "ETH", logoUrl: ethLogo },
      { symbol: "STRK", logoUrl: strkLogo },
      { symbol: "LORDS", logoUrl: lordsLogo },
    ],
    paidPlaces: 8,

    settingsName: "Extreme",
    registrationType: "fixed",
    entryCount: 156,
    entryFeeInfo: { type: "usd", display: "$25.00" },
    entryFeeTokenLogo: strkLogo,
    entryFeeTokenSymbol: "STRK",

    timeline: {
      createdTime: NOW - 5 * DAY,
      startTime: NOW + 6 * HOUR,
      duration: 4 * DAY,
      submissionPeriod: 2 * DAY,
      registrationStartTime: NOW - 5 * DAY,
      registrationEndTime: NOW - HOUR,
    },

    description: `# The Grand Expedition

Embark on the most ambitious tournament in **Loot Survivor** history. This multi-stage challenge will test every aspect of your skills.

## Stage 1: The Descent
Navigate through the treacherous upper levels of the dungeon. Watch out for traps and ambushes from lesser beasts.

## Stage 2: The Gauntlet
Face increasingly powerful enemies as you descend deeper. Resource management becomes critical here — every health potion and weapon upgrade counts.

## Stage 3: The Abyss
The final stretch. Floors 80-100 contain the most dangerous creatures in the game. Only the most skilled and well-prepared adventurers will survive.

### Prize Distribution
- **1st Place**: 1 ETH + 5000 STRK + 10000 LORDS
- **2nd Place**: 0.5 ETH
- **3rd-8th Place**: Proportional STRK distribution

### Rules
1. Each player may enter once
2. Soulbound completion token — non-transferable proof of achievement
3. Gasless execution via paymaster
4. Must complete all 3 prerequisite quests before entering

*May the odds be ever in your favor.*`,

    prizesByPosition: [
      [1, { usd: 4500, tokenSymbol: "ETH", tokenLogo: ethLogo }],
      [2, { usd: 2000, tokenSymbol: "ETH", tokenLogo: ethLogo }],
      [3, { usd: 1100, tokenSymbol: "STRK", tokenLogo: strkLogo }],
      [4, { usd: 600, tokenSymbol: "STRK", tokenLogo: strkLogo }],
      [5, { usd: 350, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
      [6, { usd: 200, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
      [7, { usd: 120, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
      [8, { usd: 70, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
    ],
    entrants: sampleEntrants(15, false),
    myEntries: [],

    isStarted: false,
    isEnded: false,
    isSubmitted: false,
    isInPreparationPeriod: true,
    allSubmitted: false,
    allClaimed: false,
    claimablePrizesCount: 0,
  },

  {
    id: "5",
    title: "5. Submission phase — games over, awaiting submits",
    status: "submission",
    gameName: "Dark Shuffle",
    gameAddress: STRK,
    creatorAddress:
      "0x0333333333333333333333333333333333333333333333333333333333333333",

    name: "Weekly Arena #42",
    totalPrizeUsd: 320,
    uniquePrizeTokens: [{ symbol: "LORDS", logoUrl: lordsLogo }],
    paidPlaces: 3,

    settingsName: "Standard",
    registrationType: "open",
    entryCount: 18,
    entryFeeInfo: { type: "token", display: "10" },
    entryFeeTokenLogo: lordsLogo,
    entryFeeTokenSymbol: "LORDS",

    timeline: {
      createdTime: NOW - 4 * DAY,
      startTime: NOW - 3 * DAY,
      duration: 2 * DAY,
      submissionPeriod: DAY,
      registrationStartTime: NOW - 4 * DAY,
      registrationEndTime: NOW - 3 * DAY,
    },

    description:
      "Prove you deck-building prowess. Top 3 take home LORDS prizes.",

    prizesByPosition: [
      [1, { usd: 200, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
      [2, { usd: 80, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
      [3, { usd: 40, tokenSymbol: "LORDS", tokenLogo: lordsLogo }],
    ],
    entrants: sampleEntrants(10).map((e, i) => ({
      ...e,
      gameOver: true,
      hasSubmitted: i < 4,
    })),
    myEntries: [
      {
        tokenId: "0x00005001",
        entryNumber: 1,
        playerName: "you",
        score: 5200,
        gameOver: true,
        hasSubmitted: false,
        rank: 5,
      },
    ],

    isStarted: true,
    isEnded: true,
    isSubmitted: false,
    isInPreparationPeriod: false,
    allSubmitted: false,
    allClaimed: false,
    claimablePrizesCount: 0,
  },
];

export const scenariosById: Record<string, ScenarioData> = Object.fromEntries(
  scenarios.map((s) => [s.id, s]),
);
