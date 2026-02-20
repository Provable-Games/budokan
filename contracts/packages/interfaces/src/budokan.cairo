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

#[derive(Copy, Drop, Serde, PartialEq, starknet::Store)]
pub struct Schedule {
    pub registration: Option<Period>,
    pub game: Period,
}

#[derive(Copy, Drop, Serde, PartialEq, starknet::Store)]
pub struct Period {
    pub start: u64,
    pub end: u64,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum Phase {
    Scheduled,
    Registration,
    Staging,
    Live,
    Finalized,
}

// ==============================================
// BUDOKAN CORE MODELS
// ==============================================

#[derive(Drop, Serde)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    pub distribution: Distribution,
    pub tournament_creator_share: Option<u16>,
    pub game_creator_share: Option<u16>,
    pub refund_share: Option<u16>,
    pub distribution_positions: Option<u32>,
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
}

#[derive(Clone, Drop, Serde, starknet::Store)]
pub struct Metadata {
    pub name: felt252,
    pub description: ByteArray,
}

#[derive(Drop, Serde)]
pub struct GameConfig {
    pub address: ContractAddress,
    pub settings_id: u32,
    pub soulbound: bool,
    /// When true, only entries where the game contract reports `game_over(token_id) == true`
    /// can be finalized onto the leaderboard. When false, all registered entries can be finalized.
    pub require_game_over: bool,
    pub play_url: ByteArray,
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

    fn claim_reward(ref self: TState, tournament_id: u64, reward_type: RewardType);

    fn add_prize(
        ref self: TState,
        tournament_id: u64,
        token_address: ContractAddress,
        token_type: TokenTypeData,
        position: Option<u32>,
    ) -> PrizeData;

    fn finalize_leaderboard_entry(
        ref self: TState, tournament_id: u64, token_id: felt252, position: u32,
    );

    fn finalize_leaderboard_batch(ref self: TState, tournament_id: u64, token_ids: Span<felt252>);
}
