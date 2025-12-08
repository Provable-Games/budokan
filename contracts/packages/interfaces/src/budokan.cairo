// SPDX-License-Identifier: BUSL-1.1

// Import types from component packages
// Import budokan-specific types
use budokan::models::budokan::{EntryFee, GameConfig, Metadata, RewardType, Tournament};
use budokan::models::schedule::{Phase, Schedule};
use budokan_entry_requirement::models::{EntryRequirement, QualificationProof};
use budokan_prize::models::{Prize, TokenTypeData};
use starknet::ContractAddress;

#[starknet::interface]
pub trait IBudokan<TState> {
    // View functions
    // Note: get_registration, get_registration_banned, get_entry_count, registration_exists,
    // get_tournament_id_for_token are exposed via IRegistration
    // Note: get_entry_fee is exposed via IEntryFee
    // Note: get_entry_requirement, get_qualification_entries are exposed via IEntryRequirement
    // Note: get_prize, get_total_prizes, is_prize_claimed are exposed via IPrize
    fn total_tournaments(self: @TState) -> u64;
    fn tournament(self: @TState, tournament_id: u64) -> Tournament;
    fn tournament_entries(self: @TState, tournament_id: u64) -> u32;
    fn get_leaderboard(self: @TState, tournament_id: u64) -> Array<u64>;
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
    ) -> (u64, u32);

    fn validate_entry(
        ref self: TState, tournament_id: u64, game_token_id: u64, proof: Span<felt252>,
    );

    fn submit_score(ref self: TState, tournament_id: u64, token_id: u64, position: u8);

    /// Claim a reward from a tournament
    /// reward_type specifies what to claim:
    /// - Prize: sponsored prizes (Single or Distributed)
    /// - EntryFee: entry fee shares (Position, GameCreator, Refund, AdditionalShare)
    fn claim_reward(ref self: TState, tournament_id: u64, reward_type: RewardType);

    /// Add a sponsored prize to a tournament
    /// @param tournament_id The tournament to add the prize to
    /// @param token_address The token address for the prize
    /// @param token_type The token type data (ERC20 with amount/distribution, or ERC721 with id)
    /// @param position Position for Single prizes (None for Distributed prizes)
    fn add_prize(
        ref self: TState,
        tournament_id: u64,
        token_address: ContractAddress,
        token_type: TokenTypeData,
        position: Option<u32>,
    ) -> Prize;
}
