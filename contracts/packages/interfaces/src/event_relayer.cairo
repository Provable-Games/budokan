// SPDX-License-Identifier: BUSL-1.1

use budokan::models::budokan::{
    EntryFee, EntryRequirement, PrizeType, QualificationProof, TokenTypeData,
};
use budokan::models::schedule::Schedule;
use starknet::ContractAddress;

/// Metadata for tournament events
#[derive(Drop, Serde)]
pub struct EventMetadata {
    pub name: felt252,
    pub description: ByteArray,
}

/// GameConfig for tournament events
#[derive(Drop, Serde)]
pub struct EventGameConfig {
    pub address: ContractAddress,
    pub settings_id: u32,
    pub soulbound: bool,
    pub play_url: ByteArray,
}

#[starknet::interface]
pub trait IBudokanEventRelayer<TState> {
    // ============ Tournament Events ============

    /// Emit when a tournament is created
    fn emit_tournament(
        ref self: TState,
        id: u64,
        created_at: u64,
        created_by: ContractAddress,
        creator_token_id: u64,
        metadata: EventMetadata,
        schedule: Schedule,
        game_config: EventGameConfig,
        entry_fee: Option<EntryFee>,
        entry_requirement: Option<EntryRequirement>,
    );

    // ============ Registration Events ============

    /// Emit when a registration is created or updated
    fn emit_registration(
        ref self: TState,
        game_address: ContractAddress,
        game_token_id: u64,
        tournament_id: u64,
        entry_number: u32,
        has_submitted: bool,
        is_banned: bool,
    );

    /// Emit when qualification entries are updated
    fn emit_qualification_entries(
        ref self: TState,
        tournament_id: u64,
        qualification_proof: QualificationProof,
        entry_count: u8,
    );

    // ============ Leaderboard Events ============

    /// Emit when the leaderboard is updated
    fn emit_leaderboard(ref self: TState, tournament_id: u64, token_ids: Span<u64>);

    // ============ Prize Events ============

    /// Emit when a prize is added
    fn emit_prize(
        ref self: TState,
        id: u64,
        tournament_id: u64,
        payout_position: u32,
        token_address: ContractAddress,
        token_type: TokenTypeData,
        sponsor_address: ContractAddress,
    );

    /// Emit when a prize is claimed
    fn emit_prize_claim(ref self: TState, tournament_id: u64, prize_type: PrizeType, claimed: bool);

    // ============ Metrics Events ============

    /// Emit when platform metrics are updated
    fn emit_platform_metrics(ref self: TState, key: felt252, total_tournaments: u64);

    /// Emit when prize metrics are updated
    fn emit_prize_metrics(ref self: TState, key: felt252, total_prizes: u64);

    /// Emit when entry count changes
    fn emit_entry_count(ref self: TState, tournament_id: u64, count: u32);
}
