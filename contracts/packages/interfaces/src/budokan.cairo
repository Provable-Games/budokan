// SPDX-License-Identifier: BUSL-1.1

// Import types from other interface packages
pub use game_components_interfaces::distribution::Distribution;
pub use game_components_interfaces::entry_requirement::{
    EntryRequirement, EntryRequirementType, ExtensionConfig, NFTQualification, QualificationProof,
};
pub use game_components_interfaces::prize::{
    ERC20Data, ERC721Data, PrizeData, PrizeType, TokenTypeData,
};
use starknet::ContractAddress;

// ==============================================
// SCHEDULE MODELS
// ==============================================

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct Schedule {
    pub registration_start_delay: u32,
    pub registration_end_delay: u32,
    pub game_start_delay: u32,
    pub game_end_delay: u32,
    pub submission_duration: u32,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum Phase {
    Scheduled,
    Registration,
    Staging,
    Live,
    Submission,
    Finalized,
}

// ==============================================
// LEADERBOARD CONFIG
// ==============================================

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct LeaderboardConfig {
    pub ascending: bool, // true = lower scores better, false = higher scores better
    pub game_must_be_over: bool // true = game_over() must return true before score submission
}

// ==============================================
// BUDOKAN CORE MODELS
// ==============================================

#[derive(Drop, Serde)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    pub tournament_creator_share: u16,
    pub game_creator_share: u16,
    pub refund_share: u16,
    pub distribution: Distribution,
    pub distribution_count: u32,
}

#[derive(Drop, Serde)]
pub struct Tournament {
    pub id: u64,
    pub created_at: u64,
    pub created_by: ContractAddress,
    pub creator_token_id: felt252,
    pub metadata: Metadata,
    pub schedule: Schedule,
    pub game_config: GameConfig,
    pub entry_fee: Option<EntryFee>,
    pub entry_requirement: Option<EntryRequirement>,
    pub leaderboard_config: LeaderboardConfig,
}

#[derive(Clone, Drop, Serde, starknet::Store)]
pub struct Metadata {
    pub name: felt252,
    pub description: ByteArray,
}

#[derive(Drop, Serde)]
pub struct GameConfig {
    pub game_address: ContractAddress,
    pub settings_id: u32,
    pub soulbound: bool,
    pub paymaster: bool,
    pub client_url: Option<ByteArray>,
    pub renderer: Option<ContractAddress>,
}

#[derive(Copy, Drop, Serde)]
pub enum EntryFeeRewardType {
    Position: u32,
    TournamentCreator,
    GameCreator,
    Refund: felt252,
}

#[derive(Copy, Drop, Serde)]
pub enum RewardType {
    Prize: PrizeType,
    EntryFee: EntryFeeRewardType,
}

// ==============================================
// INTERFACE
// ==============================================

#[starknet::interface]
pub trait IBudokan<TState> {
    // View functions
    fn total_tournaments(self: @TState) -> u64;
    fn tournament(self: @TState, tournament_id: u64) -> Tournament;
    fn tournament_entries(self: @TState, tournament_id: u64) -> u32;
    fn get_leaderboard(self: @TState, tournament_id: u64) -> Array<felt252>;
    fn current_phase(self: @TState, tournament_id: u64) -> Phase;

    // Write functions
    fn create_tournament(
        ref self: TState,
        creator_rewards_address: ContractAddress,
        metadata: Metadata,
        schedule: Schedule,
        game_config: GameConfig,
        entry_fee: Option<EntryFee>,
        entry_requirement: Option<EntryRequirement>,
        leaderboard_config: LeaderboardConfig,
    ) -> Tournament;

    fn enter_tournament(
        ref self: TState,
        tournament_id: u64,
        player_name: felt252,
        player_address: ContractAddress,
        qualification: Option<QualificationProof>,
    ) -> (felt252, u32);

    fn ban_entry(
        ref self: TState, tournament_id: u64, game_token_id: felt252, proof: Span<felt252>,
    );

    fn submit_score(ref self: TState, tournament_id: u64, token_id: felt252, position: u32);

    fn claim_reward(ref self: TState, tournament_id: u64, reward_type: RewardType);

    fn add_prize(
        ref self: TState,
        tournament_id: u64,
        token_address: ContractAddress,
        token_type: TokenTypeData,
        position: Option<u32>,
    ) -> PrizeData;
}
