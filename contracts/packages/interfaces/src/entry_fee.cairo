// SPDX-License-Identifier: BUSL-1.1

use budokan_entry_fee::models::EntryFee;

#[starknet::interface]
pub trait IEntryFee<TState> {
    /// Get entry fee configuration for a context
    /// Returns None if no entry fee is set
    fn get_entry_fee(self: @TState, context_id: u64) -> Option<EntryFee>;
}
