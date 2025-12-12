// SPDX-License-Identifier: BUSL-1.1

use budokan::models::schedule::Schedule;

// Re-export types from component packages for convenience
pub use budokan_distribution::models::Distribution;
// Re-export storage EntryFee as StoredEntryFee for internal use
pub use budokan_entry_fee::models::{AdditionalShare, EntryFee as StoredEntryFee, EntryFeeClaimType};
pub use budokan_entry_requirement::models::{
    EntryRequirement, EntryRequirementType, ExtensionConfig, NFTQualification, QualificationEntries,
    QualificationProof,
};
pub use budokan_prize::models::{
    ERC20Data, ERC721Data, Prize, PrizeClaim, PrizeMetrics, PrizeType, TokenTypeData,
};
pub use budokan_registration::models::Registration;
use starknet::ContractAddress;

/// Entry fee configuration for tournament creation (includes distribution)
/// This is the input struct used in create_tournament API
#[derive(Drop, Serde)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    /// Distribution type for prize pool allocation
    pub distribution: Distribution,
    /// Tournament creator share in basis points (10000 = 100%)
    pub tournament_creator_share: Option<u16>,
    /// Game creator share in basis points (10000 = 100%)
    pub game_creator_share: Option<u16>,
    /// Share refunded back to each depositor in basis points
    pub refund_share: Option<u16>,
    /// Optional fixed number of positions for distribution calculation.
    /// If None, uses actual leaderboard size (dynamic).
    /// If Some(n), distribution is calculated for exactly n positions,
    /// allowing prizes to be defined for a fixed range regardless of participation.
    pub distribution_positions: Option<u32>,
}

#[derive(Drop, Serde)]
pub struct Tournament {
    pub id: u64,
    pub created_at: u64,
    pub created_by: ContractAddress,
    pub creator_token_id: u64,
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

/// Game configuration for tournament creation
/// Note: soulbound and play_url are stored separately for storage efficiency
#[derive(Drop, Serde)]
pub struct GameConfig {
    pub address: ContractAddress,
    pub settings_id: u32,
    pub soulbound: bool,
    pub play_url: ByteArray,
}

#[derive(Drop, Serde)]
pub struct Leaderboard {
    pub tournament_id: u64,
    pub token_ids: Array<u64>,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct PlatformMetrics {
    pub key: felt252,
    pub total_tournaments: u64,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct EntryCount {
    pub tournament_id: u64,
    pub count: u32,
}

/// Entry fee reward subtypes for claiming entry fee shares
#[derive(Copy, Drop, Serde)]
pub enum EntryFeeRewardType {
    /// Claim entry fee position-based distribution
    Position: u32,
    /// Claim tournament creator's entry fee share
    TournamentCreator,
    /// Claim game creator's entry fee share
    GameCreator,
    /// Claim refund share for a specific token_id
    Refund: u64,
}

/// Unified reward type for claiming both prizes and entry fee shares
#[derive(Copy, Drop, Serde)]
pub enum RewardType {
    /// Claim a sponsored prize (Single or Distributed)
    Prize: PrizeType,
    /// Claim entry fee share
    EntryFee: EntryFeeRewardType,
}
