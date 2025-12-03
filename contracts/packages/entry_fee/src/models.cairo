// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;
use starknet::storage_access::StorePacking;

/// Basis points constant: 10000 = 100%
pub const BASIS_POINTS: u16 = 10000;

/// Additional share configuration for entry fee distribution
/// These shares are deducted from the total pool before position-based distribution
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct AdditionalShare {
    /// Recipient address for this share
    pub recipient: ContractAddress,
    /// Share in basis points (10000 = 100%)
    pub share_bps: u16,
}

/// Entry fee configuration passed to create functions
#[derive(Drop, Serde, PartialEq)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    /// Game creator share in basis points (10000 = 100%)
    pub game_creator_share: Option<u16>,
    /// Share refunded back to each depositor in basis points
    pub refund_share: Option<u16>,
    /// Additional shares deducted before position distribution
    pub additional_shares: Span<AdditionalShare>,
}

// Constants for packing/unpacking EntryFeeData
const TWO_POW_14: u128 = 0x4000; // 2^14
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000; // 2^128
const MASK_14: u128 = 0x3FFF; // 14 bits of 1s (max 16383)

/// Packed entry fee data for storage
/// Packs: amount (128 bits) | game_creator_share (14 bits) | refund_share (14 bits)
/// Total: 128 + 14 + 14 = 156 bits fits in felt252 (252 bits)
/// Additional shares are stored separately in arrays
#[derive(Copy, Drop, Serde)]
pub struct EntryFeeData {
    pub amount: u128,
    pub game_creator_share: u16, // 14 bits, 0 = None, basis points (10000 = 100%)
    pub refund_share: u16 // 14 bits, 0 = None, basis points (10000 = 100%)
}

pub impl EntryFeeDataStorePacking of StorePacking<EntryFeeData, felt252> {
    fn pack(value: EntryFeeData) -> felt252 {
        // Layout: amount(128) | game_creator_share(14) | refund_share(14)
        let packed: felt252 = value.amount.into()
            + (value.game_creator_share.into() * TWO_POW_128)
            + (value.refund_share.into() * TWO_POW_128 * TWO_POW_14.into());
        packed
    }

    fn unpack(value: felt252) -> EntryFeeData {
        let value_u256: u256 = value.into();
        let two_pow_128_u256: u256 = TWO_POW_128.into();
        let two_pow_14_u256: u256 = TWO_POW_14.into();
        let mask_14_u256: u256 = MASK_14.into();

        let amount: u128 = (value_u256 & 0xffffffffffffffffffffffffffffffff).try_into().unwrap();
        let game_creator_share: u16 = ((value_u256 / two_pow_128_u256) & mask_14_u256)
            .try_into()
            .unwrap();
        let refund_share: u16 = ((value_u256 / (two_pow_128_u256 * two_pow_14_u256)) & mask_14_u256)
            .try_into()
            .unwrap();

        EntryFeeData { amount, game_creator_share, refund_share }
    }
}
