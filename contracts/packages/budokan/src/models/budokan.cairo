// SPDX-License-Identifier: BUSL-1.1

use budokan::models::schedule::Schedule;

// Re-export types from component packages for convenience
pub use budokan_distribution::models::Distribution;
// Re-export storage EntryFee as StoredEntryFee for internal use
pub use budokan_entry_fee::models::{AdditionalShare, EntryFee as StoredEntryFee};
pub use budokan_entry_requirement::models::{
    ContextProof, ContextQualification, EntryRequirement, EntryRequirementType, ExtensionConfig,
    NFTQualification, QualificationEntries, QualificationProof,
};

// Tournament-specific type aliases for backward compatibility and clarity
pub type TournamentType = ContextQualification;
pub type TournamentQualification = ContextProof;

// Tournament qualifier type constants
pub const QUALIFIER_TYPE_WINNERS: u8 = 0;
pub const QUALIFIER_TYPE_PARTICIPANTS: u8 = 1;
pub use budokan_prize::models::{Prize, PrizeClaim, PrizeMetrics, PrizeType, Role};
pub use budokan_registration::models::Registration;
pub use budokan_token_validator::models::{ERC20Data, ERC721Data, TokenTypeData};
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
    pub context_creator_share: Option<u16>,
    /// Game creator share in basis points (10000 = 100%)
    pub game_creator_share: Option<u16>,
    /// Share refunded back to each depositor in basis points
    pub refund_share: Option<u16>,
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
    pub soulbound: bool,
    pub play_url: ByteArray,
}

#[derive(Drop, Serde, starknet::Store)]
pub struct Metadata {
    pub name: felt252,
    pub description: ByteArray,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct GameConfig {
    pub address: ContractAddress,
    pub settings_id: u32,
    pub prize_spots: u32 // Max ~4.3B prize positions
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
pub struct TournamentTokenMetrics {
    pub key: felt252,
    pub total_supply: u64,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct EntryCount {
    pub tournament_id: u64,
    pub count: u32,
}
