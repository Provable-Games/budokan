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

// ============ Entry Fee Models ============

#[derive(Copy, Drop, Serde, Introspect)]
pub enum Distribution {
    /// Linear decreasing distribution with configurable weight
    /// Position i gets (n - i + 1)^weight shares
    /// Weight is 1-1000 where higher = steeper drop from 1st to last
    Linear: u16,
    /// Exponential distribution with configurable steepness
    /// Weight is 1-1000 where higher = steeper curve toward top positions
    Exponential: u16,
    /// Uniform distribution - all positions get equal share
    Uniform,
    /// Custom distribution with user-defined shares per position
    /// Span contains the share (in basis points) for each position
    Custom: Span<u16>,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    pub distribution: Distribution,
    pub tournament_creator_share: Option<u16>,
    pub game_creator_share: Option<u16>,
    pub refund_share: Option<u16>,
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
    pub token_address: ContractAddress,
    pub token_id: u256,
}

// ============ Token/Prize Models ============

#[derive(Copy, Drop, Serde, Introspect)]
pub struct ERC20Data {
    pub amount: u128,
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
pub enum Role {
    TournamentCreator,
    GameCreator,
    Position: u32,
    Refund: u128,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub enum PrizeType {
    EntryFees: Role,
    Sponsored: u64,
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
