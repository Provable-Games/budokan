// SPDX-License-Identifier: BUSL-1.1

use budokan_interfaces::budokan::{
    EntryFee, EntryRequirement, Metadata, QualificationProof, RewardType, TokenTypeData,
};
use starknet::ContractAddress;

/// `config` is the packed `TournamentConfig` felt252 (see
/// `structs/packed_storage.cairo` for the bit layout). It encodes
/// `created_at`, `settings_id`, `soulbound`, `paymaster`, all five
/// schedule delays, `ascending`, and `game_must_be_over`. Indexers should
/// unpack via the same layout.
///
/// `client_url` and `renderer` from `GameConfig` are kept separate
/// because they are variable-length / Option types not in the packed
/// felt. `metadata` is kept separate (contains a ByteArray description).
#[derive(Drop, starknet::Event)]
pub struct TournamentCreated {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub game_address: ContractAddress,
    pub created_by: ContractAddress,
    pub creator_token_id: felt252,
    pub metadata: Metadata,
    pub config: felt252,
    pub client_url: Option<ByteArray>,
    pub renderer: Option<ContractAddress>,
    pub entry_fee: Option<EntryFee>,
    pub entry_requirement: Option<EntryRequirement>,
}

/// Emitted once at register time. `game_address` is omitted — derivable
/// from `tournament_id` via `TournamentCreated`. `has_submitted` and
/// `is_banned` are omitted — always `false` at register time by
/// construction (state changes flow through `TournamentEntryStateChanged`).
#[derive(Drop, starknet::Event)]
pub struct TournamentRegistration {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub game_token_id: felt252,
    pub player_address: ContractAddress,
    pub entry_number: u32,
}

/// Emitted when a registered entry's flags change (submit / ban).
/// `entry_number` is omitted — it was set at register time (see
/// `TournamentRegistration`) and is not cheaply derivable from a token_id
/// after the registration component's reverse-index redesign.
/// `game_address` is omitted — derivable from `tournament_id`.
/// `player_address` is omitted — consumers can resolve the original
/// player from the matching `TournamentRegistration` event, or look up
/// the current token owner via ERC721 if needed.
#[derive(Drop, starknet::Event)]
pub struct TournamentEntryStateChanged {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub game_token_id: felt252,
    pub has_submitted: bool,
    pub is_banned: bool,
}

#[derive(Drop, starknet::Event)]
pub struct LeaderboardUpdated {
    #[key]
    pub tournament_id: u64,
    pub token_ids: Span<felt252>,
}

#[derive(Drop, starknet::Event)]
pub struct PrizeAdded {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub prize_id: u64,
    pub payout_position: u32,
    pub token_address: ContractAddress,
    pub token_type: TokenTypeData,
    pub sponsor_address: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct RewardClaimed {
    #[key]
    pub tournament_id: u64,
    pub reward_type: RewardType,
    pub claimed: bool,
}

#[derive(Drop, starknet::Event)]
pub struct QualificationEntriesUpdated {
    #[key]
    pub tournament_id: u64,
    pub qualification_proof: QualificationProof,
    pub entry_count: u32,
}
