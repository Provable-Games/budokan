// SPDX-License-Identifier: BUSL-1.1

use budokan_token_validator::models::{Token, TokenTypeData};
use starknet::ContractAddress;

/// Interface ID for ITokenValidator
pub const ITOKEN_VALIDATOR_ID: felt252 =
    0x01234567890abcdef01234567890abcdef01234567890abcdef01234567890ab;

#[starknet::interface]
pub trait ITokenValidator<TState> {
    fn get_token(self: @TState, address: ContractAddress) -> Token;
    fn is_token_registered(self: @TState, address: ContractAddress) -> bool;
    fn register_token(ref self: TState, address: ContractAddress, token_type: TokenTypeData);
}
