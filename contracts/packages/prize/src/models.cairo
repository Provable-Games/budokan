// SPDX-License-Identifier: BUSL-1.1

use budokan_distribution::models::Distribution;
use starknet::ContractAddress;
use starknet::storage_access::StorePacking;

// Packing constants for StoredERC20Data into felt252
// Layout: [amount: 128 bits][payout_type: 8 bits][param: 16 bits] = 152 bits
// payout_type: 0 = Position (single recipient), 1+ = Distribution type (param is weight)
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const TWO_POW_136: felt252 = 0x10000000000000000000000000000000000;
const MASK_128: u256 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
const MASK_8: u256 = 0xFF;
const MASK_16: u256 = 0xFFFF;

/// Number of custom shares (u16) packed per storage slot
/// Each share = 16 bits, felt252 = 252 bits, so we can fit 15 shares per slot (15 * 16 = 240 bits)
pub const CUSTOM_SHARES_PER_SLOT: u8 = 15;

// Payout type constants for storage
pub const PAYOUT_TYPE_POSITION: u8 = 0;
pub const PAYOUT_TYPE_LINEAR: u8 = 1;
pub const PAYOUT_TYPE_EXPONENTIAL: u8 = 2;
pub const PAYOUT_TYPE_UNIFORM: u8 = 3;
pub const PAYOUT_TYPE_CUSTOM: u8 = 4;

/// ERC20 prize data with amount and optional distribution
/// If distribution is None, the full amount goes to a single position (specified at claim time)
/// If distribution is Some, the amount is distributed across positions based on the distribution
/// type
#[derive(Drop, Serde)]
pub struct ERC20Data {
    pub amount: u128,
    /// Optional distribution config. None = single position payout, Some = distributed payout
    pub distribution: Option<Distribution>,
}

/// ERC721 prize data - position specified at claim time
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct ERC721Data {
    pub id: u128,
}

/// Token type for API input
#[allow(starknet::store_no_default_variant)]
#[derive(Drop, Serde)]
pub enum TokenTypeData {
    erc20: ERC20Data,
    erc721: ERC721Data,
}

/// Stored ERC20 data - packs amount + payout config into felt252
/// Layout: [amount: 128 bits][payout_type: 8 bits][param: 16 bits] = 152 bits
/// For Position: payout_type=0, param=0
/// For Distributed: payout_type=1-4 (dist type), param=weight
#[derive(Copy, Drop, Serde)]
pub struct StoredERC20Data {
    pub amount: u128,
    pub payout_type: u8,
    pub param: u16,
}

pub impl StoredERC20DataPacking of StorePacking<StoredERC20Data, felt252> {
    fn pack(value: StoredERC20Data) -> felt252 {
        value.amount.into()
            + (value.payout_type.into() * TWO_POW_128)
            + (value.param.into() * TWO_POW_136)
    }

    fn unpack(value: felt252) -> StoredERC20Data {
        let value_u256: u256 = value.into();
        let amount: u128 = (value_u256 & MASK_128).try_into().unwrap();
        let payout_type: u8 = ((value_u256 / TWO_POW_128.into()) & MASK_8).try_into().unwrap();
        let param: u16 = ((value_u256 / TWO_POW_136.into()) & MASK_16).try_into().unwrap();
        StoredERC20Data { amount, payout_type, param }
    }
}

/// Token type for storage
#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, starknet::Store)]
pub enum StoredTokenTypeData {
    erc20: StoredERC20Data,
    erc721: ERC721Data,
}

/// Stored prize data (without redundant id field)
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct StoredPrize {
    pub context_id: u64,
    pub token_address: ContractAddress,
    pub token_type: StoredTokenTypeData,
    pub sponsor_address: ContractAddress,
}

/// Prize model returned from API - includes id for convenience
#[derive(Drop, Serde)]
pub struct Prize {
    pub id: u64,
    pub context_id: u64,
    pub token_address: ContractAddress,
    pub token_type: TokenTypeData,
    pub sponsor_address: ContractAddress,
}

#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, Serde, PartialEq, starknet::Store)]
pub enum PrizeType {
    /// Claim a non-distributed prize by prize_id
    /// Position is determined by the caller's token on the leaderboard
    Single: u64,
    /// Claim from a distributed prize pool: (prize_id, payout_index)
    /// payout_index determines which share of the distribution is being claimed
    /// e.g., payout_index 1 claims the 1st place share, payout_index 2 claims 2nd place share
    Distributed: (u64, u32),
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

/// Packed custom shares - stores up to 15 u16 shares in a single felt252
/// Each share = 16 bits, Layout: [share0(16)] | [share1(16)] | ... | [share14(16)] = 240 bits
/// This reduces storage operations from N reads to ceil(N/15) reads
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct PackedCustomShares {
    pub packed: felt252,
}

/// Helper functions for packing/unpacking custom shares
#[generate_trait]
pub impl PackedCustomSharesImpl of PackedCustomSharesTrait {
    /// Create an empty packed shares struct
    fn new() -> PackedCustomShares {
        PackedCustomShares { packed: 0 }
    }

    /// Get a single share from the packed value at the given index (0-14)
    fn get_share(self: @PackedCustomShares, index: u8) -> u16 {
        assert!(index < CUSTOM_SHARES_PER_SLOT, "Index out of bounds");
        let packed_u256: u256 = (*self.packed).into();
        let shift: u256 = (index.into() * 16_u32).into();
        let divisor: u256 = pow_2_u256_16(shift);
        let value: u256 = (packed_u256 / divisor) & MASK_16;
        value.try_into().unwrap()
    }

    /// Set a single share in the packed value at the given index (0-14)
    fn set_share(ref self: PackedCustomShares, index: u8, share: u16) {
        assert!(index < CUSTOM_SHARES_PER_SLOT, "Index out of bounds");
        let packed_u256: u256 = self.packed.into();
        let shift: u256 = (index.into() * 16_u32).into();
        let multiplier: u256 = pow_2_u256_16(shift);
        let mask: u256 = MASK_16 * multiplier;
        let shifted_value: u256 = share.into() * multiplier;
        let new_packed: u256 = (packed_u256 & ~mask) | shifted_value;
        self.packed = new_packed.try_into().unwrap();
    }

    /// Pack an array of shares (up to 15) into a PackedCustomShares
    fn from_array(shares: Span<u16>) -> PackedCustomShares {
        let mut packed = PackedCustomSharesImpl::new();
        let len: u32 = if shares.len() > CUSTOM_SHARES_PER_SLOT.into() {
            CUSTOM_SHARES_PER_SLOT.into()
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
    fn to_array(self: @PackedCustomShares, count: u8) -> Array<u16> {
        let mut result = ArrayTrait::new();
        let len: u8 = if count > CUSTOM_SHARES_PER_SLOT {
            CUSTOM_SHARES_PER_SLOT
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

/// Power of 2 for u256 (optimized for multiples of 16 used in share packing)
fn pow_2_u256_16(exp: u256) -> u256 {
    if exp == 0 {
        return 1;
    }
    if exp == 16 {
        return 0x10000;
    }
    if exp == 32 {
        return 0x100000000;
    }
    if exp == 48 {
        return 0x1000000000000;
    }
    if exp == 64 {
        return 0x10000000000000000;
    }
    if exp == 80 {
        return 0x100000000000000000000;
    }
    if exp == 96 {
        return 0x1000000000000000000000000;
    }
    if exp == 112 {
        return 0x10000000000000000000000000000;
    }
    if exp == 128 {
        return 0x100000000000000000000000000000000;
    }
    if exp == 144 {
        return 0x1000000000000000000000000000000000000;
    }
    if exp == 160 {
        return 0x10000000000000000000000000000000000000000;
    }
    if exp == 176 {
        return 0x100000000000000000000000000000000000000000000;
    }
    if exp == 192 {
        return 0x1000000000000000000000000000000000000000000000000;
    }
    if exp == 208 {
        return 0x10000000000000000000000000000000000000000000000000000;
    }
    if exp == 224 {
        return 0x100000000000000000000000000000000000000000000000000000000;
    }
    // Fallback (should not be reached for valid indices 0-14)
    let mut result: u256 = 1;
    let mut i: u256 = 0;
    while i < exp {
        result = result * 2;
        i += 1;
    }
    result
}
