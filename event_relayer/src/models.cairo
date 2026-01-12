// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;

// ============ Schedule Models ============

#[derive(Copy, Drop, Serde, Introspect)]
pub struct Period {
    pub start: u64,
    pub end: u64,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub struct Schedule {
    pub registration: Option<Period>,
    pub game: Period,
    pub submission_duration: u64,
}

// ============ Distribution Models ============

#[derive(Copy, Drop, Serde, Introspect)]
pub enum Distribution {
    /// Linear decreasing distribution with configurable weight
    /// Position i gets (n - i + 1)^weight shares
    /// Weight is 10-1000 (scaled by 10 for 1 decimal place)
    Linear: u16,
    /// Exponential distribution with configurable steepness
    /// Weight is 10-1000 (scaled by 10 for 1 decimal place)
    Exponential: u16,
    /// Uniform distribution - all positions get equal share
    Uniform,
    /// Custom distribution with user-defined shares per position
    /// Span contains the share (in basis points) for each position
    Custom: Span<u16>,
}

// ============ Entry Fee Models ============

#[derive(Copy, Drop, Serde, Introspect)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    pub distribution: Distribution,
    pub tournament_creator_share: Option<u16>,
    pub game_creator_share: Option<u16>,
    pub refund_share: Option<u16>,
    pub distribution_positions: Option<u32>,
}

// ============ Entry Requirement Models ============

#[derive(Copy, Drop, Serde, Introspect)]
pub struct EntryRequirement {
    pub entry_limit: u32,
    pub entry_requirement_type: EntryRequirementType,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub enum EntryRequirementType {
    token: ContractAddress,
    allowlist: Span<ContractAddress>,
    extension: ExtensionConfig,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub struct ExtensionConfig {
    pub address: ContractAddress,
    pub config: Span<felt252>,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub enum QualificationProof {
    NFT: NFTQualification,
    Address: ContractAddress,
    Extension: Span<felt252>,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub struct NFTQualification {
    pub token_id: u256,
}

// ============ Token/Prize Models ============

#[derive(Copy, Drop, Serde, Introspect)]
pub struct ERC20Data {
    pub amount: u128,
    pub distribution: Option<Distribution>,
    pub distribution_count: Option<u32>,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub struct ERC721Data {
    pub id: u128,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub enum TokenTypeData {
    erc20: ERC20Data,
    erc721: ERC721Data,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub enum PrizeType {
    /// Claim a non-distributed prize by prize_id
    /// Position is determined by the caller's token on the leaderboard
    Single: u64,
    /// Claim from a distributed prize pool: (prize_id, payout_index)
    /// payout_index determines which share of the distribution is being claimed
    Distributed: (u64, u32),
}

/// Entry fee reward subtypes for claiming entry fee shares
#[derive(Copy, Drop, Serde, Introspect)]
pub enum EntryFeeRewardType {
    /// Claim entry fee position-based distribution
    Position: u32,
    /// Claim tournament creator's entry fee share
    TournamentCreator,
    /// Claim game creator's entry fee share
    GameCreator,
    /// Claim refund for a specific token_id
    Refund: u64,
}

/// Unified reward type for claiming both prizes and entry fee shares
#[derive(Copy, Drop, Serde, Introspect)]
pub enum RewardType {
    /// Claim a sponsored prize (Single or Distributed)
    Prize: PrizeType,
    /// Claim entry fee share
    EntryFee: EntryFeeRewardType,
}

// ============ Game Config Models ============

#[derive(Drop, Serde, Introspect)]
pub struct GameConfig {
    pub address: ContractAddress,
    pub settings_id: u32,
    pub soulbound: bool,
    pub play_url: ByteArray,
}

// ============ Metadata Models ============

#[derive(Drop, Serde, Introspect)]
pub struct Metadata {
    pub name: felt252,
    pub description: ByteArray,
}
