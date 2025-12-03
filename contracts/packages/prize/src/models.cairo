// SPDX-License-Identifier: BUSL-1.1

use budokan_token_validator::models::TokenTypeData;
use dojo::meta::introspect::Introspect;
use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Prize {
    pub id: u64,
    pub context_id: u64,
    pub payout_position: u32, // Max ~4.3B prize positions
    pub token_address: ContractAddress,
    pub token_type: TokenTypeData,
    pub sponsor_address: ContractAddress,
}

#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, PartialEq, starknet::Store, Introspect)]
pub enum Role {
    TournamentCreator,
    GameCreator,
    Position: u8,
    /// Refund role for claiming refund share for a specific game_id (token_id)
    Refund: u128,
}

#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, PartialEq, starknet::Store, Introspect)]
pub enum PrizeType {
    EntryFees: Role,
    Sponsored: u64,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct PrizeClaim {
    pub context_id: u64,
    pub prize_type: PrizeType,
    pub claimed: bool,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct PrizeMetrics {
    pub key: felt252,
    pub total_prizes: u64,
}
