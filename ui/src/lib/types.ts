import { Prize } from "@/generated/models.gen";
import { BigNumberish } from "starknet";

export interface TableData {
  id: number;
  name: string;
  email: string;
}

// TokenMetadata represents token information from mainnetTokens/sepoliaTokens lists
export interface TokenMetadata {
  name: string;
  symbol: string;
  token_address: string;
  decimals: number;
  token_type?: "erc20" | "erc721";
  logo_url?: string;
  total_supply?: number | null;
  sort_order?: number;
}

// DisplayPrize extends Prize with additional virtual fields for UI display
// These prizes may come from entry fees or other sources and include
// extra metadata like position (for display) and type categorization
export type DisplayPrize = Prize & {
  position?: number | BigNumberish; // Virtual position for display purposes
  type?: "entry_fee" | "entry_fee_game_creator" | "entry_fee_tournament_creator" | string;
};

export type TokenPrizes = Record<
  string,
  {
    type: "erc20" | "erc721";
    address: string;
    value: bigint[] | bigint;
  }
>;

export type PositionPrizes = Record<
  string,
  Record<
    string,
    {
      type: "erc20" | "erc721";
      payout_position: string;
      address: string;
      value: bigint[] | bigint;
    }
  >
>;

export interface NewPrize {
  tokenAddress: string;
  tokenType: "ERC20" | "ERC721" | "";
  // ERC20 fields
  amount?: number;
  value?: number;
  distribution?: "linear" | "exponential" | "uniform";
  distribution_count?: number;
  // ERC721 fields
  tokenId?: number;
  position?: number;
  hasPrice?: boolean;
}

export type TokenUri = {
  name: string;
  description: string;
  attributes: {
    trait_type: string;
    value: string;
  }[];
  image: string;
};

export type FormToken = {
  address: string;
  name: string;
  symbol: string;
  token_type: "erc20" | "erc721";
  is_registered?: boolean;
  image?: string;
};
