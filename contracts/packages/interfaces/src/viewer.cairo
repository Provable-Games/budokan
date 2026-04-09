// SPDX-License-Identifier: BUSL-1.1

use budokan_interfaces::budokan::{Phase, RewardType, Tournament};
use game_components_interfaces::prize::{PrizeData, PrizeType};
use game_components_interfaces::registration::Registration;
use starknet::ContractAddress;

// ==============================================
// VIEW RESULT TYPES
// ==============================================

#[derive(Drop, Serde)]
pub struct TournamentFilterResult {
    pub tournament_ids: Array<u64>,
    pub total: u64,
}

#[derive(Drop, Serde)]
pub struct TournamentFullState {
    pub tournament: Tournament,
    pub entry_count: u32,
    pub phase: Phase,
}

#[derive(Drop, Serde)]
pub struct RegistrationResult {
    pub entries: Array<Registration>,
    pub total: u32,
}

#[derive(Drop, Serde)]
pub struct LeaderboardEntryView {
    pub position: u32,
    pub token_id: felt252,
}

#[derive(Copy, Drop, Serde)]
pub struct RewardClaimView {
    pub reward_type: RewardType,
    pub claimed: bool,
}

#[derive(Drop, Serde)]
pub struct RewardClaimResult {
    pub claims: Array<RewardClaimView>,
    pub total: u32,
    pub total_claimed: u32,
    pub total_unclaimed: u32,
}

// ==============================================
// INTERFACE
// ==============================================

#[starknet::interface]
pub trait IBudokanViewer<TState> {
    // === TOURNAMENT LISTING (paginated, O(n) iteration over total_tournaments) ===
    fn tournaments(self: @TState, offset: u64, limit: u64) -> TournamentFilterResult;
    fn tournaments_by_game(
        self: @TState, game_address: ContractAddress, offset: u64, limit: u64,
    ) -> TournamentFilterResult;
    fn tournaments_by_creator(
        self: @TState, creator: ContractAddress, offset: u64, limit: u64,
    ) -> TournamentFilterResult;
    fn tournaments_by_phase(
        self: @TState, phase: Phase, offset: u64, limit: u64,
    ) -> TournamentFilterResult;
    fn tournaments_by_phases(
        self: @TState, phases: Array<Phase>, offset: u64, limit: u64,
    ) -> TournamentFilterResult;

    // === COUNTS (for pagination UI) ===
    fn count_tournaments(self: @TState) -> u64;
    fn count_tournaments_by_game(self: @TState, game_address: ContractAddress) -> u64;
    fn count_tournaments_by_creator(self: @TState, creator: ContractAddress) -> u64;
    fn count_tournaments_by_phase(self: @TState, phase: Phase) -> u64;
    fn count_tournaments_by_phases(self: @TState, phases: Array<Phase>) -> u64;

    // === TOURNAMENT DETAIL ===
    fn tournament_detail(self: @TState, tournament_id: u64) -> TournamentFullState;
    fn tournaments_batch(self: @TState, tournament_ids: Array<u64>) -> Array<TournamentFullState>;

    // === REGISTRATIONS (iterate entry_id 1..entry_count) ===
    fn tournament_registrations(
        self: @TState, tournament_id: u64, offset: u32, limit: u32,
    ) -> RegistrationResult;
    fn tournament_registrations_by_owner(
        self: @TState, tournament_id: u64, owner: ContractAddress, offset: u32, limit: u32,
    ) -> RegistrationResult;
    fn tournament_registrations_by_token_ids(
        self: @TState, tournament_id: u64, token_ids: Array<felt252>, offset: u32, limit: u32,
    ) -> RegistrationResult;

    // === LEADERBOARD ===
    fn leaderboard(
        self: @TState, tournament_id: u64, offset: u32, limit: u32,
    ) -> Array<LeaderboardEntryView>;

    // === PRIZES (iterate prize_id, filter by tournament) ===
    fn tournament_prizes(self: @TState, tournament_id: u64) -> Array<PrizeData>;

    // === REWARD CLAIMS (check claimed status for prizes + entry fees) ===
    fn tournament_reward_claims(
        self: @TState, tournament_id: u64, offset: u32, limit: u32,
    ) -> RewardClaimResult;

    // === PLAYER TOURNAMENTS (find tournaments a player has entered) ===
    fn player_tournaments(
        self: @TState, player_address: ContractAddress, offset: u64, limit: u64,
    ) -> TournamentFilterResult;
}
