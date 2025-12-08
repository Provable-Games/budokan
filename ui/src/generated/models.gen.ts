import type { SchemaType as ISchemaType } from "@dojoengine/sdk";
import {
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  BigNumberish,
  Uint256,
} from "starknet";

type WithFieldOrder<T> = T & { fieldOrder: string[] };

// Type definition for `tournaments::components::models::game::GameCount` struct
export interface GameCounter {
  key: BigNumberish;
  count: BigNumberish;
}

// Type definition for `tournaments::components::models::game::GameCountValue` struct
export interface GameCounterValue {
  count: BigNumberish;
}

// Type definition for `tournaments::components::models::game::GameMetadata` struct
export interface GameMetadata {
  contract_address: string;
  creator_address: string;
  name: BigNumberish;
  description: string;
  developer: BigNumberish;
  publisher: BigNumberish;
  genre: BigNumberish;
  image: string;
}

// Type definition for `tournaments::components::models::game::GameMetadataValue` struct
export interface GameMetadataValue {
  creator_address: string;
  name: BigNumberish;
  description: string;
  developer: BigNumberish;
  publisher: BigNumberish;
  genre: BigNumberish;
  image: string;
}

// Type definition for `tournaments::components::models::game::Score` struct
export interface Score {
  game_id: BigNumberish;
  score: BigNumberish;
}

// Type definition for `tournaments::components::models::game::ScoreValue` struct
export interface ScoreValue {
  score: BigNumberish;
}

// Type definition for `tournaments::components::models::game::SettingsDetails` struct
export interface SettingsDetails {
  id: BigNumberish;
  name: BigNumberish;
  description: string;
  exists: boolean;
}

// Type definition for `tournaments::components::models::game::SettingsDetailsValue` struct
export interface SettingsDetailsValue {
  name: BigNumberish;
  description: string;
  exists: boolean;
}

// Type definition for `tournaments::components::models::game::Settings` struct
export interface Settings {
  id: BigNumberish;
  name: BigNumberish;
  value: BigNumberish;
}

// Type definition for `tournaments::components::models::game::SettingsValue` struct
export interface SettingsValue {
  name: BigNumberish;
  value: BigNumberish;
}

// Type definition for `tournaments::components::models::game::TokenMetadata` struct
export interface TokenMetadata {
  token_id: BigNumberish;
  minted_by: string;
  player_name: BigNumberish;
  settings_id: BigNumberish;
  lifecycle: Lifecycle;
}

export interface Lifecycle {
  mint: BigNumberish;
  start: CairoOption<BigNumberish>;
  end: CairoOption<BigNumberish>;
}

// Type definition for `tournaments::components::models::game::TokenMetadataValue` struct
export interface TokenMetadataValue {
  minted_by: string;
  player_name: BigNumberish;
  settings_id: BigNumberish;
  minted_at: BigNumberish;
  available_at: BigNumberish;
  expires_at: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::ERC20Data` struct
export interface ERC20Data {
  amount: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::ERC721Data` struct
export interface ERC721Data {
  id: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::EntryCount` struct
export interface EntryCount {
  tournament_id: BigNumberish;
  count: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::EntryCountValue` struct
export interface EntryCountValue {
  count: BigNumberish;
}

// Type definition for `budokan_distribution::models::Distribution` enum
export type Distribution = {
  Linear: number; // u16 weight
  Exponential: number; // u16 weight
  Uniform: undefined;
  Custom: Array<number>; // Array of u16 values
};
export type DistributionEnum = CairoCustomEnum;

// Type definition for `tournaments::components::models::tournament::EntryFee` struct
export interface EntryFee {
  token_address: string;
  amount: BigNumberish;
  distribution: DistributionEnum;
  tournament_creator_share: CairoOption<BigNumberish>;
  game_creator_share: CairoOption<BigNumberish>;
  refund_share: CairoOption<BigNumberish>;
}

// Type definition for `tournaments::components::models::tournament::GameConfig` struct
export interface GameConfig {
  address: string;
  settings_id: BigNumberish;
  soulbound: boolean;
  play_url: string;
}

// Type definition for `tournaments::components::models::tournament::Leaderboard` struct
export interface Leaderboard {
  tournament_id: BigNumberish;
  token_ids: Array<BigNumberish>;
}

// Type definition for `tournaments::components::models::tournament::LeaderboardValue` struct
export interface LeaderboardValue {
  token_ids: Array<BigNumberish>;
}

// Type definition for `tournaments::components::models::tournament::Metadata` struct
export interface Metadata {
  name: BigNumberish;
  description: string;
}

// Type definition for `tournaments::components::models::tournament::Period` struct
export interface Period {
  start: BigNumberish;
  end: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::PlatformMetrics` struct
export interface PlatformMetrics {
  key: BigNumberish;
  total_tournaments: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::PlatformMetricsValue` struct
export interface PlatformMetricsValue {
  total_tournaments: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::Prize` struct
export interface Prize {
  id: BigNumberish;
  tournament_id: BigNumberish;
  payout_position: BigNumberish;
  token_address: string;
  token_type: TokenTypeDataEnum;
}

// Type definition for `tournaments::components::models::tournament::PrizeClaim` struct
export interface PrizeClaim {
  tournament_id: BigNumberish;
  prize_type: PrizeTypeEnum;
  claimed: boolean;
}

// Type definition for `tournaments::components::models::tournament::PrizeClaimValue` struct
export interface PrizeClaimValue {
  claimed: boolean;
}

// Type definition for `tournaments::components::models::tournament::PrizeMetrics` struct
export interface PrizeMetrics {
  key: BigNumberish;
  total_prizes: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::PrizeMetricsValue` struct
export interface PrizeMetricsValue {
  total_prizes: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::PrizeValue` struct
export interface PrizeValue {
  tournament_id: BigNumberish;
  payout_position: BigNumberish;
  token_address: string;
  token_type: TokenTypeEnum;
}

// Type definition for `tournaments::components::models::tournament::Registration` struct
export interface Registration {
  tournament_id: BigNumberish;
  game_token_id: BigNumberish;
  entry_number: BigNumberish;
  has_submitted: boolean;
}

// Type definition for `tournaments::components::models::tournament::RegistrationValue` struct
export interface RegistrationValue {
  entry_number: BigNumberish;
  has_submitted: boolean;
}

// Type definition for `tournaments::components::models::tournament::Schedule` struct
export interface Schedule {
  registration: CairoOption<Period>;
  game: Period;
  submission_duration: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::Token` struct
export interface Token {
  address: string;
  name: string;
  symbol: string;
  token_type: string;
  is_registered: boolean;
}

// Type definition for `tournaments::components::models::tournament::TokenValue` struct
export interface TokenValue {
  name: string;
  symbol: string;
  token_type: string;
  is_registered: boolean;
}

// Type definition for `tournaments::components::models::tournament::Tournament` struct
export interface Tournament {
  id: BigNumberish;
  created_at: BigNumberish;
  created_by: string;
  creator_token_id: BigNumberish;
  metadata: Metadata;
  schedule: Schedule;
  game_config: GameConfig;
  entry_fee: CairoOption<EntryFee>;
  entry_requirement: CairoOption<EntryRequirement>;
}

// Type definition for `tournaments::components::models::tournament::TournamentConfig` struct
export interface TournamentConfig {
  key: BigNumberish;
  safe_mode: boolean;
  test_mode: boolean;
}

// Type definition for `tournaments::components::models::tournament::TournamentConfigValue` struct
export interface TournamentConfigValue {
  safe_mode: boolean;
  test_mode: boolean;
}

// Type definition for `tournaments::components::models::tournament::TournamentTokenMetrics` struct
export interface TournamentTokenMetrics {
  key: BigNumberish;
  total_supply: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::TournamentTokenMetricsValue` struct
export interface TournamentTokenMetricsValue {
  total_supply: BigNumberish;
}

// Type definition for `tournaments::components::models::tournament::TournamentValue` struct
export interface TournamentValue {
  creator: string;
  metadata: Metadata;
  schedule: Schedule;
  game_config: GameConfig;
  entry_fee: CairoOption<EntryFee>;
  entry_requirement: CairoOption<EntryRequirement>;
}

export type EntryRequirement = {
  entry_limit: BigNumberish;
  entry_requirement_type: EntryRequirementTypeEnum;
};

// Type definition for `tournaments::components::models::tournament::EntryRequirementType` enum
export type EntryRequirementType = {
  token: string;
  tournament: TournamentType;
  allowlist: Array<string>;
};
export type EntryRequirementTypeEnum = CairoCustomEnum;

// Type definition for `tournaments::components::models::tournament::PrizeType` enum
export type PrizeType = {
  EntryFees: Role;
  Sponsored: BigNumberish;
};
export type PrizeTypeEnum = CairoCustomEnum;

// Type definition for `tournaments::components::models::tournament::Role` enum
export enum Role {
  TournamentCreator,
  GameCreator,
  Position,
}

// Type definition for `budokan::models::budokan::TokenType` enum
export const tokenType = ["erc20", "erc721"] as const;
export type TokenType = { [key in (typeof tokenType)[number]]: string };
export type TokenTypeEnum = CairoCustomEnum;

// Type definition for `budokan::models::budokan::TokenTypeData` enum
export const tokenTypeData = ["erc20", "erc721"] as const;
export type TokenTypeData = {
  erc20: ERC20Data;
  erc721: ERC721Data;
};
export type TokenTypeDataEnum = CairoCustomEnum;

// Type definition for `tournaments::components::models::tournament::TournamentType` enum
export enum TournamentType {
  winners,
  participants,
}

// Type definition for `tournaments::components::models::tournament::QualidicationProof` struct
export type QualificationProof = {
  // For qualifying via previous tournament
  Tournament: TournamentQualification;
  // For qualifying via NFT ownership
  NFT: NFTQualification;
  // For qualifying via allowlist
  Address: string;
};
export type QualificationProofEnum = CairoCustomEnum;

// Type definition for `tournaments::components::models::tournament::TournamentQualification` struct
export type TournamentQualification = {
  tournament_id: BigNumberish;
  token_id: BigNumberish;
  position: BigNumberish;
};

export type NFTQualification = {
  token_id: Uint256;
};

export interface SchemaType extends ISchemaType {
  [namespace: string]: {
    GameCounter: WithFieldOrder<GameCounter>;
    GameCounterValue: WithFieldOrder<GameCounterValue>;
    GameMetadata: WithFieldOrder<GameMetadata>;
    GameMetadataValue: WithFieldOrder<GameMetadataValue>;
    Score: WithFieldOrder<Score>;
    ScoreValue: WithFieldOrder<ScoreValue>;
    SettingsDetails: WithFieldOrder<SettingsDetails>;
    SettingsDetailsValue: WithFieldOrder<SettingsDetailsValue>;
    Settings: WithFieldOrder<Settings>;
    SettingsValue: WithFieldOrder<SettingsValue>;
    TokenMetadata: WithFieldOrder<TokenMetadata>;
    TokenMetadataValue: WithFieldOrder<TokenMetadataValue>;
    ERC20Data: WithFieldOrder<ERC20Data>;
    ERC721Data: WithFieldOrder<ERC721Data>;
    EntryCount: WithFieldOrder<EntryCount>;
    EntryCountValue: WithFieldOrder<EntryCountValue>;
    EntryFee: WithFieldOrder<EntryFee>;
    GameConfig: WithFieldOrder<GameConfig>;
    Leaderboard: WithFieldOrder<Leaderboard>;
    LeaderboardValue: WithFieldOrder<LeaderboardValue>;
    Metadata: WithFieldOrder<Metadata>;
    Period: WithFieldOrder<Period>;
    PlatformMetrics: WithFieldOrder<PlatformMetrics>;
    PlatformMetricsValue: WithFieldOrder<PlatformMetricsValue>;
    Prize: WithFieldOrder<Prize>;
    PrizeClaim: WithFieldOrder<PrizeClaim>;
    PrizeClaimValue: WithFieldOrder<PrizeClaimValue>;
    PrizeMetrics: WithFieldOrder<PrizeMetrics>;
    PrizeMetricsValue: WithFieldOrder<PrizeMetricsValue>;
    PrizeValue: WithFieldOrder<PrizeValue>;
    Registration: WithFieldOrder<Registration>;
    RegistrationValue: WithFieldOrder<RegistrationValue>;
    Schedule: WithFieldOrder<Schedule>;
    Token: WithFieldOrder<Token>;
    TokenValue: WithFieldOrder<TokenValue>;
    Tournament: WithFieldOrder<Tournament>;
    TournamentConfig: WithFieldOrder<TournamentConfig>;
    TournamentConfigValue: WithFieldOrder<TournamentConfigValue>;
    TournamentTokenMetrics: WithFieldOrder<TournamentTokenMetrics>;
    TournamentTokenMetricsValue: WithFieldOrder<TournamentTokenMetricsValue>;
    TournamentValue: WithFieldOrder<TournamentValue>;
  };
}

export function getSchemaWithnamespace(namespace: string): SchemaType {
  return {
    [namespace]: schemaTemplate,
  };
}

export const schemaTemplate: {
  [K in keyof SchemaType[string]]: SchemaType[string][K];
} = {
  GameCounter: {
    fieldOrder: ["key", "count"],
    key: 0,
    count: 0,
  },
  GameCounterValue: {
    fieldOrder: ["count"],
    count: 0,
  },
  GameMetadata: {
    fieldOrder: [
      "contract_address",
      "creator_address",
      "name",
      "description",
      "developer",
      "publisher",
      "genre",
      "image",
    ],
    contract_address: "",
    creator_address: "",
    name: 0,
    description: "",
    developer: 0,
    publisher: 0,
    genre: 0,
    image: "",
  },
  GameMetadataValue: {
    fieldOrder: [
      "creator_address",
      "name",
      "description",
      "developer",
      "publisher",
      "genre",
      "image",
    ],
    creator_address: "",
    name: 0,
    description: "",
    developer: 0,
    publisher: 0,
    genre: 0,
    image: "",
  },
  Score: {
    fieldOrder: ["game_id", "score"],
    game_id: 0,
    score: 0,
  },
  ScoreValue: {
    fieldOrder: ["score"],
    score: 0,
  },
  SettingsDetails: {
    fieldOrder: ["id", "name", "description", "exists"],
    id: 0,
    name: 0,
    description: "",
    exists: false,
  },
  SettingsDetailsValue: {
    fieldOrder: ["name", "description", "exists"],
    name: 0,
    description: "",
    exists: false,
  },
  Settings: {
    fieldOrder: ["id", "name", "value"],
    id: 0,
    name: 0,
    value: 0,
  },
  SettingsValue: {
    fieldOrder: ["name", "value"],
    name: 0,
    value: 0,
  },
  TokenMetadata: {
    fieldOrder: [
      "token_id",
      "minted_by",
      "player_name",
      "settings_id",
      "lifecycle",
    ],
    token_id: 0,
    minted_by: "",
    player_name: 0,
    settings_id: 0,
    lifecycle: {
      mint: 0,
      start: new CairoOption(CairoOptionVariant.None),
      end: new CairoOption(CairoOptionVariant.None),
    },
  },
  TokenMetadataValue: {
    fieldOrder: [
      "minted_by",
      "player_name",
      "settings_id",
      "minted_at",
      "available_at",
      "expires_at",
    ],
    minted_by: "",
    player_name: 0,
    settings_id: 0,
    minted_at: 0,
    available_at: 0,
    expires_at: 0,
  },
  ERC20Data: {
    fieldOrder: ["amount"],
    amount: 0,
  },
  ERC721Data: {
    fieldOrder: ["id"],
    id: 0,
  },
  EntryCount: {
    fieldOrder: ["tournament_id", "count"],
    tournament_id: 0,
    count: 0,
  },
  EntryCountValue: {
    fieldOrder: ["count"],
    count: 0,
  },
  EntryFee: {
    fieldOrder: [
      "token_address",
      "amount",
      "distribution",
      "tournament_creator_share",
      "game_creator_share",
      "refund_share",
    ],
    token_address: "",
    amount: 0,
    distribution: new CairoCustomEnum({
      Linear: undefined,
      Exponential: 10, // Default weight 10 = 1.0
      Uniform: undefined,
      Custom: undefined,
    }),
    tournament_creator_share: new CairoOption(CairoOptionVariant.None),
    game_creator_share: new CairoOption(CairoOptionVariant.None),
    refund_share: new CairoOption(CairoOptionVariant.None),
  },
  GameConfig: {
    fieldOrder: [
      "address",
      "settings_id",
      "prize_spots",
      "soulbound",
      "play_url",
    ],
    address: "",
    settings_id: 0,
    soulbound: false,
    play_url: "",
  },
  Leaderboard: {
    fieldOrder: ["tournament_id", "token_ids"],
    tournament_id: 0,
    token_ids: [0],
  },
  LeaderboardValue: {
    fieldOrder: ["token_ids"],
    token_ids: [0],
  },
  Metadata: {
    fieldOrder: ["name", "description"],
    name: 0,
    description: "",
  },
  Period: {
    fieldOrder: ["start", "end"],
    start: 0,
    end: 0,
  },
  PlatformMetrics: {
    fieldOrder: ["key", "total_tournaments"],
    key: 0,
    total_tournaments: 0,
  },
  PlatformMetricsValue: {
    fieldOrder: ["total_tournaments"],
    total_tournaments: 0,
  },
  Prize: {
    fieldOrder: [
      "id",
      "tournament_id",
      "payout_position",
      "token_address",
      "token_type",
    ],
    id: 0,
    tournament_id: 0,
    payout_position: 0,
    token_address: "",
    token_type: new CairoCustomEnum({
      erc20: { fieldOrder: ["amount"], amount: 0 },
      erc721: undefined,
    }),
  },
  PrizeClaim: {
    fieldOrder: ["tournament_id", "prize_type", "claimed"],
    tournament_id: 0,
    prize_type: new CairoCustomEnum({
      EntryFees: Role.TournamentCreator,
      sponsored: undefined,
    }),
    claimed: false,
  },
  PrizeClaimValue: {
    fieldOrder: ["claimed"],
    claimed: false,
  },
  PrizeMetrics: {
    fieldOrder: ["key", "total_prizes"],
    key: 0,
    total_prizes: 0,
  },
  PrizeMetricsValue: {
    fieldOrder: ["total_prizes"],
    total_prizes: 0,
  },
  PrizeValue: {
    fieldOrder: [
      "tournament_id",
      "payout_position",
      "token_address",
      "token_type",
    ],
    tournament_id: 0,
    payout_position: 0,
    token_address: "",
    token_type: new CairoCustomEnum({
      erc20: { fieldOrder: ["amount"], amount: 0 },
      erc721: undefined,
    }),
  },
  Registration: {
    fieldOrder: [
      "tournament_id",
      "game_token_id",
      "entry_number",
      "has_submitted",
    ],
    tournament_id: 0,
    game_token_id: 0,
    entry_number: 0,
    has_submitted: false,
  },
  RegistrationValue: {
    fieldOrder: ["entry_number", "has_submitted"],
    entry_number: 0,
    has_submitted: false,
  },
  Schedule: {
    fieldOrder: ["registration", "game", "submission_duration"],
    registration: new CairoOption(CairoOptionVariant.None),
    game: { start: 0, end: 0 },
    submission_duration: 0,
  },
  Token: {
    fieldOrder: ["address", "name", "symbol", "token_type", "is_registered"],
    address: "",
    name: "",
    symbol: "",
    token_type: "",
    is_registered: false,
  },
  TokenValue: {
    fieldOrder: ["name", "symbol", "token_type", "is_registered"],
    name: "",
    symbol: "",
    token_type: "",
    is_registered: false,
  },
  Tournament: {
    fieldOrder: [
      "id",
      "created_at",
      "created_by",
      "creator_token_id",
      "metadata",
      "schedule",
      "game_config",
      "entry_fee",
      "entry_requirement",
      "soulbound",
      "play_url",
    ],
    id: 0,
    created_at: 0,
    created_by: "",
    creator_token_id: 0,
    metadata: { name: 0, description: "" },
    schedule: {
      registration: new CairoOption(CairoOptionVariant.None),
      game: { start: 0, end: 0 },
      submission_duration: 0,
    },
    game_config: {
      address: "",
      settings_id: 0,
      soulbound: false,
      play_url: "",
    },
    entry_fee: new CairoOption(CairoOptionVariant.None),
    entry_requirement: new CairoOption(CairoOptionVariant.None),
  },
  TournamentConfig: {
    fieldOrder: ["key", "safe_mode", "test_mode"],
    key: 0,
    safe_mode: false,
    test_mode: false,
  },
  TournamentConfigValue: {
    fieldOrder: ["safe_mode", "test_mode"],
    safe_mode: false,
    test_mode: false,
  },
  TournamentTokenMetrics: {
    fieldOrder: ["key", "total_supply"],
    key: 0,
    total_supply: 0,
  },
  TournamentTokenMetricsValue: {
    fieldOrder: ["total_supply"],
    total_supply: 0,
  },
  TournamentValue: {
    fieldOrder: [
      "creator",
      "metadata",
      "schedule",
      "game_config",
      "entry_fee",
      "entry_requirement",
      "soulbound",
      "play_url",
    ],
    creator: "",
    metadata: {
      name: 0,
      description: "",
    },
    schedule: {
      registration: new CairoOption(CairoOptionVariant.None),
      game: { start: 0, end: 0 },
      submission_duration: 0,
    },
    game_config: {
      address: "",
      settings_id: 0,
      soulbound: false,
      play_url: "",
    },
    entry_fee: new CairoOption(CairoOptionVariant.None),
    entry_requirement: new CairoOption(CairoOptionVariant.None),
  },
};

export function getModelsMapping(namespace: string) {
  return {
    GameCounter: `${namespace}-GameCounter` as const,
    GameCounterValue: `${namespace}-GameCounterValue` as const,
    GameMetadata: `${namespace}-GameMetadata` as const,
    GameMetadataValue: `${namespace}-GameMetadataValue` as const,
    Score: `${namespace}-Score` as const,
    ScoreValue: `${namespace}-ScoreValue` as const,
    SettingsDetails: `${namespace}-SettingsDetails` as const,
    SettingsDetailsValue: `${namespace}-SettingsDetailsValue` as const,
    Settings: `${namespace}-Settings` as const,
    SettingsValue: `${namespace}-SettingsValue` as const,
    TokenMetadata: `${namespace}-TokenMetadata` as const,
    TokenMetadataValue: `${namespace}-TokenMetadataValue` as const,
    ERC20Data: `${namespace}-ERC20Data` as const,
    ERC721Data: `${namespace}-ERC721Data` as const,
    EntryCount: `${namespace}-EntryCount` as const,
    EntryCountValue: `${namespace}-EntryCountValue` as const,
    EntryFee: `${namespace}-EntryFee` as const,
    EntryRequirement: `${namespace}-EntryRequirement` as const,
    GameConfig: `${namespace}-GameConfig` as const,
    Leaderboard: `${namespace}-Leaderboard` as const,
    LeaderboardValue: `${namespace}-LeaderboardValue` as const,
    Metadata: `${namespace}-Metadata` as const,
    Period: `${namespace}-Period` as const,
    PlatformMetrics: `${namespace}-PlatformMetrics` as const,
    PlatformMetricsValue: `${namespace}-PlatformMetricsValue` as const,
    Prize: `${namespace}-Prize` as const,
    PrizeClaim: `${namespace}-PrizeClaim` as const,
    PrizeClaimValue: `${namespace}-PrizeClaimValue` as const,
    PrizeMetrics: `${namespace}-PrizeMetrics` as const,
    PrizeMetricsValue: `${namespace}-PrizeMetricsValue` as const,
    PrizeType: `${namespace}-PrizeType` as const,
    PrizeValue: `${namespace}-PrizeValue` as const,
    Registration: `${namespace}-Registration` as const,
    RegistrationValue: `${namespace}-RegistrationValue` as const,
    Role: `${namespace}-Role` as const,
    Schedule: `${namespace}-Schedule` as const,
    Token: `${namespace}-Token` as const,
    TokenType: `${namespace}-TokenType` as const,
    TokenValue: `${namespace}-TokenValue` as const,
    Tournament: `${namespace}-Tournament` as const,
    TournamentConfig: `${namespace}-TournamentConfig` as const,
    TournamentConfigValue: `${namespace}-TournamentConfigValue` as const,
    TournamentTokenMetrics: `${namespace}-TournamentTokenMetrics` as const,
    TournamentTokenMetricsValue:
      `${namespace}-TournamentTokenMetricsValue` as const,
    TournamentType: `${namespace}-TournamentType` as const,
    TournamentValue: `${namespace}-TournamentValue` as const,
  };
}
