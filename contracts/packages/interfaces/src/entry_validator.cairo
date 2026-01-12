// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;

// Interface ID for entry validator - derived from selector
pub const IENTRY_VALIDATOR_ID: felt252 =
    0x01158754d5cc62137c4de2cbd0e65cbd163990af29f0182006f26fe0cac00bb6;

#[starknet::interface]
pub trait IEntryValidator<TState> {
    /// Get the budokan contract address
    fn budokan_address(self: @TState) -> ContractAddress;

    /// Returns true if this validator only validates during registration period
    fn registration_only(self: @TState) -> bool;

    /// Check if a player's entry is valid for a tournament (used at registration time)
    fn valid_entry(
        self: @TState,
        tournament_id: u64,
        player_address: ContractAddress,
        qualification: Span<felt252>,
    ) -> bool;

    /// Check if an existing entry should be banned
    /// Returns true if the entry should be banned, false if it should remain valid
    /// Called by Budokan's ban_entry function to determine if an entry should be removed
    fn should_ban(
        self: @TState,
        tournament_id: u64,
        game_token_id: u64,
        current_owner: ContractAddress,
        qualification: Span<felt252>,
    ) -> bool;

    /// Check how many entries are left for a player
    fn entries_left(
        self: @TState,
        tournament_id: u64,
        player_address: ContractAddress,
        qualification: Span<felt252>,
    ) -> Option<u8>;

    /// Add configuration for a tournament
    fn add_config(ref self: TState, tournament_id: u64, entry_limit: u8, config: Span<felt252>);

    /// Add an entry for a player in a tournament
    /// game_token_id is tracked to support per-entry banning decisions
    fn add_entry(
        ref self: TState,
        tournament_id: u64,
        game_token_id: u64,
        player_address: ContractAddress,
        qualification: Span<felt252>,
    );

    /// Remove an entry for a player in a tournament (called when entry is banned)
    fn remove_entry(
        ref self: TState,
        tournament_id: u64,
        game_token_id: u64,
        player_address: ContractAddress,
        qualification: Span<felt252>,
    );
}
