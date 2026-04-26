// SPDX-License-Identifier: BUSL-1.1

//! Native events emitted by the rewards class. These mirror the variants
//! defined in `budokan::events` so that — regardless of whether the code
//! is executing in the main contract or via library_call into this class —
//! the on-chain event selectors and payloads are identical for indexers.

use budokan_interfaces::budokan::{RewardType, TokenTypeData};
use starknet::ContractAddress;

#[derive(Drop, starknet::Event)]
pub struct PrizeAdded {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub prize_id: u64,
    pub payout_position: u32,
    pub token_address: ContractAddress,
    pub token_type: TokenTypeData,
    pub sponsor_address: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct RewardClaimed {
    #[key]
    pub tournament_id: u64,
    pub reward_type: RewardType,
    pub claimed: bool,
}
