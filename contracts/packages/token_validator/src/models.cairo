// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct ERC20Data {
    pub amount: u128,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct ERC721Data {
    pub id: u128,
}

#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, PartialEq, starknet::Store)]
pub enum TokenType {
    erc20,
    erc721,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct TokenData {
    pub token_address: ContractAddress,
    pub token_type: TokenType,
}

#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, starknet::Store)]
pub enum TokenTypeData {
    erc20: ERC20Data,
    erc721: ERC721Data,
}

// Token model - address is the map key, name and symbol fetched on-chain by client via ERC20/ERC721
// interfaces
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Token {
    pub token_type: TokenType,
    pub is_registered: bool,
}

// Constants
pub const SEPOLIA_CHAIN_ID: felt252 = 0x534e5f5345504f4c4941; // 'SN_SEPOLIA'
// We use max u128 value as a practical upper limit for total supply checks
pub const TWO_POW_128: u256 = 340282366920938463463374607431768211456; // 2^128
