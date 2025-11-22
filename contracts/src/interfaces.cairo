use starknet::ContractAddress;
use budokan::models::schedule::{Phase, Schedule};
use budokan::models::budokan::{
    EntryFee, EntryRequirement, GameConfig, Metadata, PrizeType, QualificationProof, TokenTypeData,
    Tournament as TournamentModel, Registration, RegistrationBanned, Prize,
};

#[starknet::interface]
pub trait IBudokan<TState> {
    fn total_tournaments(self: @TState) -> u64;
    fn tournament(self: @TState, tournament_id: u64) -> TournamentModel;
    fn tournament_entries(self: @TState, tournament_id: u64) -> u32;
    fn get_leaderboard(self: @TState, tournament_id: u64) -> Array<u64>;
    fn current_phase(self: @TState, tournament_id: u64) -> Phase;
    fn is_token_registered(self: @TState, address: ContractAddress) -> bool;
    fn register_token(ref self: TState, address: ContractAddress, token_type: TokenTypeData);
    fn get_registration(
        self: @TState, game_address: ContractAddress, token_id: u64,
    ) -> Registration;
    fn get_registration_banned(
        self: @TState, game_address: ContractAddress, token_id: u64,
    ) -> RegistrationBanned;
    fn get_prize(self: @TState, prize_id: u64) -> Prize;
    fn get_tournament_id_for_token_id(
        self: @TState, game_address: ContractAddress, token_id: u64,
    ) -> u64;

    fn create_tournament(
        ref self: TState,
        creator_rewards_address: ContractAddress,
        metadata: Metadata,
        schedule: Schedule,
        game_config: GameConfig,
        entry_fee: Option<EntryFee>,
        entry_requirement: Option<EntryRequirement>,
        soulbound: bool,
        play_url: ByteArray,
    ) -> TournamentModel;
    fn enter_tournament(
        ref self: TState,
        tournament_id: u64,
        player_name: felt252,
        player_address: ContractAddress,
        qualification: Option<QualificationProof>,
    ) -> (u64, u32);
    fn validate_entries(ref self: TState, tournament_id: u64, game_token_ids: Span<u64>);
    fn submit_score(ref self: TState, tournament_id: u64, token_id: u64, position: u8);
    fn claim_prize(ref self: TState, tournament_id: u64, prize_type: PrizeType);
    fn add_prize(
        ref self: TState,
        tournament_id: u64,
        token_address: ContractAddress,
        token_type: TokenTypeData,
        position: u8,
    ) -> u64;
}

#[starknet::interface]
pub trait IERC20MetadataFelt<TState> {
    fn name(self: @TState) -> felt252;
    fn symbol(self: @TState) -> felt252;
}

#[starknet::interface]
pub trait IERC721MetadataFelt<TState> {
    fn name(self: @TState) -> felt252;
    fn symbol(self: @TState) -> felt252;
}

