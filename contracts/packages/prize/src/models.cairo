// SPDX-License-Identifier: BUSL-1.1

use budokan_distribution::models::Distribution;
use starknet::ContractAddress;
use starknet::storage_access::StorePacking;

// Packing constants for PackedERC20Data into felt252
// Layout: [amount: 128 bits][payout_type: 8 bits][param: 16 bits][count: 32 bits] = 184 bits
// payout_type: 0 = Position (single recipient), 1+ = Distribution type (param is weight)
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const TWO_POW_136: felt252 = 0x10000000000000000000000000000000000;
const TWO_POW_152: felt252 = 0x1000000000000000000000000000000000000000;
const MASK_128: u256 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
const MASK_8: u256 = 0xFF;
const MASK_16: u256 = 0xFFFF;
const MASK_32: u256 = 0xFFFFFFFF;

// Re-export SHARES_PER_SLOT as CUSTOM_SHARES_PER_SLOT for backward compatibility
pub use budokan_prize::libs::share_math::SHARES_PER_SLOT as CUSTOM_SHARES_PER_SLOT;

// Payout type constants for storage
pub const PAYOUT_TYPE_POSITION: u8 = 0;
pub const PAYOUT_TYPE_LINEAR: u8 = 1;
pub const PAYOUT_TYPE_EXPONENTIAL: u8 = 2;
pub const PAYOUT_TYPE_UNIFORM: u8 = 3;
pub const PAYOUT_TYPE_CUSTOM: u8 = 4;

/// ERC20 prize data with amount and optional distribution
/// If distribution is None, the full amount goes to a single recipient (specified at claim time)
/// If distribution is Some, the amount is distributed across recipients based on the distribution
/// type
#[derive(Drop, Serde)]
pub struct ERC20Data {
    pub amount: u128,
    /// Optional distribution config. None = single recipient payout, Some = distributed payout
    pub distribution: Option<Distribution>,
    /// Number of recipients for distribution calculation. None = dynamic (determined at claim time)
    pub distribution_count: Option<u32>,
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

/// Prize model with all data
/// When stored, the id field is omitted and managed separately by the component
#[derive(Drop, Serde)]
pub struct Prize {
    pub id: u64,
    pub context_id: u64,
    pub token_address: ContractAddress,
    pub token_type: TokenTypeData,
    pub sponsor_address: ContractAddress,
}

/// Internal packed representation for ERC20 data storage
/// Layout: [amount: 128 bits][payout_type: 8 bits][param: 16 bits][count: 32 bits] = 184 bits
/// This is used internally by StorePacking and not exposed in the API
#[derive(Copy, Drop)]
struct PackedERC20Data {
    amount: u128,
    payout_type: u8,
    param: u16,
    count: u32,
}

impl PackedERC20DataPacking of StorePacking<PackedERC20Data, felt252> {
    fn pack(value: PackedERC20Data) -> felt252 {
        value.amount.into()
            + (value.payout_type.into() * TWO_POW_128)
            + (value.param.into() * TWO_POW_136)
            + (value.count.into() * TWO_POW_152)
    }

    fn unpack(value: felt252) -> PackedERC20Data {
        let value_u256: u256 = value.into();
        let amount: u128 = (value_u256 & MASK_128).try_into().unwrap();
        let payout_type: u8 = ((value_u256 / TWO_POW_128.into()) & MASK_8).try_into().unwrap();
        let param: u16 = ((value_u256 / TWO_POW_136.into()) & MASK_16).try_into().unwrap();
        let count: u32 = ((value_u256 / TWO_POW_152.into()) & MASK_32).try_into().unwrap();
        PackedERC20Data { amount, payout_type, param, count }
    }
}

/// Internal enum for storing TokenTypeData with packing
#[allow(starknet::store_no_default_variant)]
#[derive(Copy, Drop, starknet::Store)]
enum PackedTokenTypeData {
    erc20: felt252, // Packed ERC20Data
    erc721: ERC721Data,
}

/// Prize storage packing - stores Prize without the id field
/// The id is managed separately by the prize component as the map key
pub impl PrizeStorePacking of StorePacking<Prize, (u64, ContractAddress, PackedTokenTypeData, ContractAddress)> {
    fn pack(value: Prize) -> (u64, ContractAddress, PackedTokenTypeData, ContractAddress) {
        // Pack token_type
        let packed_token_type = match value.token_type {
            TokenTypeData::erc20(erc20_data) => {
                // Convert ERC20Data to packed format
                let (payout_type, param) = match erc20_data.distribution {
                    Option::None => (PAYOUT_TYPE_POSITION, 0_u16),
                    Option::Some(dist) => {
                        match dist {
                            budokan_distribution::models::Distribution::Linear(w) => (PAYOUT_TYPE_LINEAR, w),
                            budokan_distribution::models::Distribution::Exponential(w) => (PAYOUT_TYPE_EXPONENTIAL, w),
                            budokan_distribution::models::Distribution::Uniform => (PAYOUT_TYPE_UNIFORM, 0_u16),
                            budokan_distribution::models::Distribution::Custom(_) => (PAYOUT_TYPE_CUSTOM, 0_u16),
                        }
                    },
                };
                let count = match erc20_data.distribution_count {
                    Option::Some(c) => c,
                    Option::None => 0_u32,
                };
                let packed = PackedERC20Data { amount: erc20_data.amount, payout_type, param, count };
                PackedTokenTypeData::erc20(PackedERC20DataPacking::pack(packed))
            },
            TokenTypeData::erc721(erc721_data) => PackedTokenTypeData::erc721(erc721_data),
        };

        (value.context_id, value.token_address, packed_token_type, value.sponsor_address)
    }

    fn unpack(value: (u64, ContractAddress, PackedTokenTypeData, ContractAddress)) -> Prize {
        let (context_id, token_address, packed_token_type, sponsor_address) = value;

        // Unpack token_type
        let token_type = match packed_token_type {
            PackedTokenTypeData::erc20(packed_felt) => {
                let packed = PackedERC20DataPacking::unpack(packed_felt);

                // Reconstruct distribution
                let distribution = if packed.payout_type == PAYOUT_TYPE_POSITION {
                    Option::None
                } else if packed.payout_type == PAYOUT_TYPE_LINEAR {
                    Option::Some(budokan_distribution::models::Distribution::Linear(packed.param))
                } else if packed.payout_type == PAYOUT_TYPE_EXPONENTIAL {
                    Option::Some(budokan_distribution::models::Distribution::Exponential(packed.param))
                } else if packed.payout_type == PAYOUT_TYPE_UNIFORM {
                    Option::Some(budokan_distribution::models::Distribution::Uniform)
                } else {
                    Option::Some(budokan_distribution::models::Distribution::Custom(array![].span()))
                };

                // Reconstruct distribution_count
                let distribution_count = if packed.count == 0 {
                    Option::None
                } else {
                    Option::Some(packed.count)
                };

                TokenTypeData::erc20(ERC20Data { amount: packed.amount, distribution, distribution_count })
            },
            PackedTokenTypeData::erc721(erc721_data) => TokenTypeData::erc721(erc721_data),
        };

        Prize {
            id: 0, // Will be set by the component when reading
            context_id,
            token_address,
            token_type,
            sponsor_address,
        }
    }
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

use budokan_prize::libs::share_math::{get_packed_share, set_packed_share, SHARES_PER_SLOT};

/// Custom shares - stores up to 15 u16 shares in a single felt252
/// Each share = 16 bits, Layout: [share0(16)] | [share1(16)] | ... | [share14(16)] = 240 bits
/// This reduces storage operations from N reads to ceil(N/15) reads
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct CustomShares {
    pub packed: felt252,
}

/// Helper functions for packing/unpacking custom shares
#[generate_trait]
pub impl CustomSharesImpl of CustomSharesTrait {
    /// Create an empty packed shares struct
    fn new() -> CustomShares {
        CustomShares { packed: 0 }
    }

    /// Get a single share from the packed value at the given index (0-14)
    fn get_share(self: @CustomShares, index: u8) -> u16 {
        get_packed_share((*self.packed).into(), index)
    }

    /// Set a single share in the packed value at the given index (0-14)
    fn set_share(ref self: CustomShares, index: u8, share: u16) {
        let new_packed = set_packed_share(self.packed.into(), index, share);
        self.packed = new_packed.try_into().unwrap();
    }

    /// Pack an array of shares (up to 15) into a CustomShares
    fn from_array(shares: Span<u16>) -> CustomShares {
        let mut packed = CustomSharesImpl::new();
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
    fn to_array(self: @CustomShares, count: u8) -> Array<u16> {
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
