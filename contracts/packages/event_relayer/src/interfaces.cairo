// SPDX-License-Identifier: BUSL-1.1

use budokan::models::budokan::PrizeType;
use starknet::ContractAddress;

#[starknet::interface]
pub trait IBudokanEventRelayer<TState> {
    // Tournament events
    fn emit_tournament_created(
        ref self: TState,
        tournament_id: u64,
        created_at: u64,
        created_by: ContractAddress,
        creator_token_id: u64,
        name: felt252,
        description: ByteArray,
        game_address: ContractAddress,
        settings_id: u32,
        prize_spots: u8,
        soulbound: bool,
    );

    fn emit_registration(
        ref self: TState,
        game_address: ContractAddress,
        game_token_id: u64,
        tournament_id: u64,
        entry_number: u32,
        is_banned: bool,
    );

    fn emit_score_submitted(ref self: TState, tournament_id: u64, game_token_id: u64, position: u8);

    fn emit_leaderboard_update(ref self: TState, tournament_id: u64, token_ids: Span<u64>);

    fn emit_prize_added(
        ref self: TState,
        prize_id: u64,
        tournament_id: u64,
        token_address: ContractAddress,
        payout_position: u8,
        sponsor_address: ContractAddress,
    );

    fn emit_prize_claimed(ref self: TState, tournament_id: u64, prize_type: PrizeType);

    fn emit_token_registered(
        ref self: TState, token_address: ContractAddress, name: ByteArray, symbol: ByteArray,
    );
}
