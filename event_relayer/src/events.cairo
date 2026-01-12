// SPDX-License-Identifier: BUSL-1.1

use budokan_event_relayer::models::{
    EntryFee, EntryRequirement, GameConfig, Metadata, QualificationProof, RewardType, Schedule,
    TokenTypeData,
};
use starknet::ContractAddress;

// ============ Tournament Events ============

/// Emitted when a new tournament is created
/// Mirrors the Tournament dojo model
#[derive(Drop, Serde)]
#[dojo::event]
pub struct Tournament {
    #[key]
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

// ============ Registration Events ============

/// Emitted when a player registers for a tournament or when registration is updated
/// Mirrors the Registration dojo model (includes is_banned, no separate RegistrationBanned needed)
#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct Registration {
    #[key]
    pub game_address: ContractAddress,
    #[key]
    pub game_token_id: u64,
    pub tournament_id: u64,
    pub entry_number: u32,
    pub has_submitted: bool,
    pub is_banned: bool,
}

/// Emitted when qualification entries are tracked for extension-based entry requirements
/// Mirrors the QualificationEntries dojo model
#[derive(Drop, Serde)]
#[dojo::event]
pub struct QualificationEntries {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub qualification_proof: QualificationProof,
    pub entry_count: u32,
}

// ============ Leaderboard Events ============

/// Emitted when the leaderboard is updated (score submission)
/// Mirrors the Leaderboard dojo model
#[derive(Drop, Serde)]
#[dojo::event]
pub struct Leaderboard {
    #[key]
    pub tournament_id: u64,
    pub token_ids: Span<u64>,
}

// ============ Prize Events ============

/// Emitted when a prize is added to a tournament
/// Mirrors the Prize dojo model
#[derive(Drop, Serde)]
#[dojo::event]
pub struct Prize {
    #[key]
    pub id: u64,
    pub tournament_id: u64,
    pub payout_position: u32,
    pub token_address: ContractAddress,
    pub token_type: TokenTypeData,
    pub sponsor_address: ContractAddress,
}

/// Emitted when a reward is claimed (prizes or entry fees)
/// Mirrors the RewardClaim dojo model
#[derive(Drop, Serde)]
#[dojo::event]
pub struct RewardClaim {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub reward_type: RewardType,
    pub claimed: bool,
}

// ============ Metrics Events ============

/// Emitted when platform metrics are updated
/// Mirrors the PlatformMetrics dojo model
#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct PlatformMetrics {
    #[key]
    pub key: felt252,
    pub total_tournaments: u64,
}

/// Emitted when prize metrics are updated
/// Mirrors the PrizeMetrics dojo model
#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct PrizeMetrics {
    #[key]
    pub key: felt252,
    pub total_prizes: u64,
}

/// Emitted when entry count for a tournament changes
/// Mirrors the EntryCount dojo model
#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct EntryCount {
    #[key]
    pub tournament_id: u64,
    pub count: u32,
}
