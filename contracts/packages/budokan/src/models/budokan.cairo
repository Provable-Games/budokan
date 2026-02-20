// SPDX-License-Identifier: BUSL-1.1

// Re-export all public API types from budokan_interfaces::budokan
pub use budokan_interfaces::budokan::{
    Distribution, ERC20Data, ERC721Data, EntryFee, EntryFeeRewardType, EntryRequirement,
    EntryRequirementType, ExtensionConfig, GameConfig, Metadata, Phase, PrizeData, PrizeType,
    QualificationProof, RewardType, Schedule, TokenTypeData, Tournament,
};

// Re-export internal types from component packages
pub use game_components_interfaces::entry_fee::{AdditionalShare};
pub use game_components_interfaces::entry_requirement::QualificationEntries;
pub use game_components_interfaces::registration::Registration;
pub use game_components_metagame::entry_fee::models::EntryFeeClaimType;
/// Storage format for entry fees (used internally by components)
/// This is an alias to the entry_fee component's EntryFeeConfig type
pub use game_components_metagame::entry_fee::models::EntryFeeConfig as StoredEntryFee;

// Internal storage types (not part of public API)
#[derive(Drop, Serde)]
pub struct Leaderboard {
    pub tournament_id: u64,
    pub token_ids: Array<felt252>,
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
