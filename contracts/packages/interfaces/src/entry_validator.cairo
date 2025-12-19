// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;

// Interface ID for entry validator - derived from selector
pub const IENTRY_VALIDATOR_ID: felt252 = 0x01158754d5cc62137c4de2cbd0e65cbd163990af29f0182006f26fe0cac00bb6;

#[starknet::interface]
pub trait IEntryValidator<TState> {
    /// Get the budokan contract address
    fn budokan_address(self: @TState) -> ContractAddress;

    /// Returns true if this validator only validates during registration period
    fn registration_only(self: @TState) -> bool;

    /// Check if a player's entry is valid for a tournament
    fn valid_entry(
        self: @TState,
        tournament_id: u64,
        player_address: ContractAddress,
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
    fn add_entry(
        ref self: TState,
        tournament_id: u64,
        player_address: ContractAddress,
        qualification: Span<felt252>,
    );

    /// Remove an entry for a player in a tournament
    fn remove_entry(
        ref self: TState,
        tournament_id: u64,
        player_address: ContractAddress,
        qualification: Span<felt252>,
    );
}
