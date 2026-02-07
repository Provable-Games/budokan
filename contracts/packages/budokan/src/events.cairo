// SPDX-License-Identifier: BUSL-1.1

use budokan_interfaces::budokan::{
    EntryFee, EntryRequirement, GameConfig, Metadata, QualificationProof, RewardType, Schedule,
    TokenTypeData,
};
use starknet::ContractAddress;

#[derive(Drop, starknet::Event)]
pub struct TournamentCreated {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub game_address: ContractAddress,
    pub created_at: u64,
    pub created_by: ContractAddress,
    pub creator_token_id: u64,
    pub metadata: Metadata,
    pub schedule: Schedule,
    pub game_config: GameConfig,
    pub entry_fee: Option<EntryFee>,
    pub entry_requirement: Option<EntryRequirement>,
}

#[derive(Drop, starknet::Event)]
pub struct TournamentRegistration {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub game_token_id: u64,
    pub game_address: ContractAddress,
    pub player_address: ContractAddress,
    pub entry_number: u32,
    pub has_submitted: bool,
    pub is_banned: bool,
}

#[derive(Drop, starknet::Event)]
pub struct LeaderboardUpdated {
    #[key]
    pub tournament_id: u64,
    pub token_ids: Span<u64>,
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
