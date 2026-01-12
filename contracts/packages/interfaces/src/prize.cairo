// SPDX-License-Identifier: BUSL-1.1

use budokan_interfaces::distribution::Distribution;
use starknet::ContractAddress;

// ==============================================
// PRIZE MODELS
// ==============================================

#[derive(Drop, Serde)]
pub struct ERC20Data {
    pub amount: u128,
    pub distribution: Option<Distribution>,
    pub distribution_count: Option<u32>,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct ERC721Data {
    pub id: u128,
}

#[allow(starknet::store_no_default_variant)]
#[derive(Drop, Serde)]
pub enum TokenTypeData {
    erc20: ERC20Data,
    erc721: ERC721Data,
}

#[derive(Drop, Serde)]
pub struct Prize {
    pub id: u64,
    pub context_id: u64,
    pub token_address: ContractAddress,
    pub token_type: TokenTypeData,
    pub sponsor_address: ContractAddress,
}

#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, PartialEq)]
pub enum PrizeType {
    Single: u64,
    Distributed: (u64, u32),
}

// ==============================================
// INTERFACE
// ==============================================

#[starknet::interface]
pub trait IPrize<TState> {
    /// Get a prize by its ID
    fn get_prize(self: @TState, prize_id: u64) -> Prize;

    /// Get total prizes count
    fn get_total_prizes(self: @TState) -> u64;

    /// Check if a prize has been claimed
    fn is_prize_claimed(self: @TState, context_id: u64, prize_type: PrizeType) -> bool;
}
