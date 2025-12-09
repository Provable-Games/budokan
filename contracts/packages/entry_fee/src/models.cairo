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
const TWO_POW_1: u128 = 0x2; // 2^1
const TWO_POW_8: u128 = 0x100; // 2^8
const TWO_POW_14: u128 = 0x4000; // 2^14
const TWO_POW_15: u128 = 0x8000; // 2^15
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000; // 2^128
const MASK_1: u128 = 0x1; // 1 bit
const MASK_8: u128 = 0xFF; // 8 bits
const MASK_14: u128 = 0x3FFF; // 14 bits of 1s (max 16383)
const MASK_15: u128 = 0x7FFF; // 15 bits of 1s

// Re-export SHARES_PER_SLOT for backward compatibility
pub use budokan_entry_fee::libs::share_math::SHARES_PER_SLOT;
use budokan_entry_fee::libs::share_math::{get_packed_share, set_packed_share};

/// Packed entry fee data for storage
/// Packs: amount (128) | game_creator_share (14) | refund_share (14) | game_creator_claimed (1) |
/// additional_count (8)
/// Total: 128 + 14 + 14 + 1 + 8 = 165 bits fits in felt252 (252 bits)
/// Additional shares are stored separately in arrays
#[derive(Copy, Drop, Serde)]
pub struct EntryFeeData {
    pub amount: u128,
    pub game_creator_share: u16, // 14 bits, 0 = None, basis points (10000 = 100%)
    pub refund_share: u16, // 14 bits, 0 = None, basis points (10000 = 100%)
    pub game_creator_claimed: bool, // 1 bit
    pub additional_count: u8 // 8 bits, number of additional shares
}

pub impl EntryFeeDataStorePacking of StorePacking<EntryFeeData, felt252> {
    fn pack(value: EntryFeeData) -> felt252 {
        // Layout: amount(128) | game_creator_share(14) | refund_share(14) |
        // game_creator_claimed(1) | additional_count(8)
        let game_creator_claimed_u128: u128 = if value.game_creator_claimed {
            1
        } else {
            0
        };
        let packed: felt252 = value.amount.into()
            + (value.game_creator_share.into() * TWO_POW_128)
            + (value.refund_share.into() * TWO_POW_128 * TWO_POW_14.into())
            + (game_creator_claimed_u128.into()
                * TWO_POW_128
                * TWO_POW_14.into()
                * TWO_POW_14.into())
            + (value.additional_count.into()
                * TWO_POW_128
                * TWO_POW_14.into()
                * TWO_POW_14.into()
                * TWO_POW_1.into());
        packed
    }

    fn unpack(value: felt252) -> EntryFeeData {
        let value_u256: u256 = value.into();
        let two_pow_128_u256: u256 = TWO_POW_128.into();
        let two_pow_14_u256: u256 = TWO_POW_14.into();
        let two_pow_1_u256: u256 = TWO_POW_1.into();
        let mask_14_u256: u256 = MASK_14.into();
        let mask_1_u256: u256 = MASK_1.into();
        let mask_8_u256: u256 = MASK_8.into();

        let amount: u128 = (value_u256 & 0xffffffffffffffffffffffffffffffff).try_into().unwrap();
        let game_creator_share: u16 = ((value_u256 / two_pow_128_u256) & mask_14_u256)
            .try_into()
            .unwrap();
        let refund_share: u16 = ((value_u256 / (two_pow_128_u256 * two_pow_14_u256)) & mask_14_u256)
            .try_into()
            .unwrap();
        let game_creator_claimed_u8: u8 = ((value_u256
            / (two_pow_128_u256 * two_pow_14_u256 * two_pow_14_u256))
            & mask_1_u256)
            .try_into()
            .unwrap();
        let game_creator_claimed: bool = game_creator_claimed_u8 == 1;
        let additional_count: u8 = ((value_u256
            / (two_pow_128_u256 * two_pow_14_u256 * two_pow_14_u256 * two_pow_1_u256))
            & mask_8_u256)
            .try_into()
            .unwrap();

        EntryFeeData {
            amount, game_creator_share, refund_share, game_creator_claimed, additional_count,
        }
    }
}

/// Stored additional share data with claim status
/// Packs: share_bps (14 bits) | claimed (1 bit) = 15 bits
#[derive(Copy, Drop, Serde)]
pub struct StoredAdditionalShare {
    pub share_bps: u16, // 14 bits, basis points (10000 = 100%)
    pub claimed: bool // 1 bit
}

/// Packed additional shares - stores up to 16 shares in a single felt252
/// Each share = 15 bits (14 bits share_bps + 1 bit claimed)
/// Layout: [share0(15)] | [share1(15)] | ... | [share15(15)] = 240 bits fits in felt252 (252 bits)
/// This reduces storage operations from 2*N reads to 1 read + N recipient reads
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct PackedAdditionalShares {
    pub packed: felt252,
}

/// Helper functions for packing/unpacking additional shares
#[generate_trait]
pub impl PackedAdditionalSharesImpl of PackedAdditionalSharesTrait {
    /// Create an empty packed shares struct
    fn new() -> PackedAdditionalShares {
        PackedAdditionalShares { packed: 0 }
    }

    /// Get a single share from the packed value at the given index (0-15)
    fn get_share(self: @PackedAdditionalShares, index: u8) -> StoredAdditionalShare {
        let (share_bps, claimed) = get_packed_share((*self.packed).into(), index);
        StoredAdditionalShare { share_bps, claimed }
    }

    /// Set a single share in the packed value at the given index (0-15)
    fn set_share(ref self: PackedAdditionalShares, index: u8, share: StoredAdditionalShare) {
        let new_packed = set_packed_share(
            self.packed.into(), index, share.share_bps, share.claimed,
        );
        self.packed = new_packed.try_into().unwrap();
    }

    /// Pack an array of shares (up to 16) into a PackedAdditionalShares
    fn from_array(shares: Span<StoredAdditionalShare>) -> PackedAdditionalShares {
        let mut packed = PackedAdditionalSharesImpl::new();
        let len: u32 = if shares.len() > SHARES_PER_SLOT.into() {
            SHARES_PER_SLOT.into()
        } else {
            shares.len()
        };
        let mut i: u32 = 0;
        while i < len {
            packed.set_share(i.try_into().unwrap(), *shares.at(i));
            i += 1;
        }
        packed
    }

    /// Unpack shares to an array (returns shares up to count)
    fn to_array(self: @PackedAdditionalShares, count: u8) -> Array<StoredAdditionalShare> {
        let mut result = ArrayTrait::new();
        let len: u8 = if count > SHARES_PER_SLOT {
            SHARES_PER_SLOT
        } else {
            count
        };
        let mut i: u8 = 0;
        while i < len {
            result.append(self.get_share(i));
            i += 1;
        }
        result
    }
}

/// Entry fee claim types for non-position-based shares
/// Position-based distribution claims are handled separately in budokan
#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, PartialEq, starknet::Store)]
pub enum EntryFeeClaimType {
    /// Claim the game creator's share
    GameCreator,
    /// Claim refund share for a specific token_id
    Refund: u64,
    /// Claim an additional share by index
    AdditionalShare: u8,
}
