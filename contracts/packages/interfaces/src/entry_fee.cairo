// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;

// ==============================================
// ENTRY FEE MODELS
// ==============================================

/// Additional share configuration for entry fee distribution
/// These shares are deducted from the total pool before position-based distribution
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct AdditionalShare {
    /// Recipient address for this share
    pub recipient: ContractAddress,
    /// Share in basis points (10000 = 100%)
    pub share_bps: u16,
}

/// Entry fee configuration passed to create functions
#[derive(Drop, Serde, PartialEq)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    /// Game creator share in basis points (10000 = 100%)
    pub game_creator_share: Option<u16>,
    /// Share refunded back to each depositor in basis points
    pub refund_share: Option<u16>,
    /// Additional shares deducted before position distribution
    pub additional_shares: Span<AdditionalShare>,
}

// ==============================================
// INTERFACE
// ==============================================

#[starknet::interface]
pub trait IEntryFee<TState> {
    /// Get entry fee configuration for a context
    /// Returns None if no entry fee is set
    fn get_entry_fee(self: @TState, context_id: u64) -> Option<EntryFee>;
}
