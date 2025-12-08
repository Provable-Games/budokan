// SPDX-License-Identifier: BUSL-1.1

use starknet::storage_access::StorePacking;

/// Basis points constant: 10000 = 100%
pub const BASIS_POINTS: u16 = 10000;

// Distribution type constants for storage packing
pub const DIST_TYPE_LINEAR: u8 = 0;
pub const DIST_TYPE_EXPONENTIAL: u8 = 1;
pub const DIST_TYPE_UNIFORM: u8 = 2;
pub const DIST_TYPE_CUSTOM: u8 = 3;

// Constants for packing/unpacking Distribution
const TWO_POW_8: u128 = 0x100; // 2^8
const MASK_8: u128 = 0xFF; // 8 bits of 1s
const MASK_16: u128 = 0xFFFF; // 16 bits of 1s

/// Distribution type for asset payouts
/// Determines how shares are calculated across positions
#[derive(Drop, Copy, Serde, PartialEq)]
pub enum Distribution {
    /// Linear decreasing distribution with configurable weight
    /// Position i gets weight * (n - i + 1) / sum(weight * 1..n) of available share
    /// Weight is 10-1000 (scaled by 10 for 1 decimal place)
    /// E.g. 10 = 1.0, 15 = 1.5, 25 = 2.5, 100 = 10.0
    /// Higher weight = steeper drop from 1st to last
    /// Example with weight=10 (1.0) and 3 positions: 1st=50%, 2nd=33%, 3rd=17%
    /// Example with weight=100 (10.0) and 3 positions: 1st=~69%, 2nd=~23%, 3rd=~8%
    Linear: u16,
    /// Exponential distribution with configurable steepness
    /// Uses formula: share = (1 - (i-1)/n)^weight, then normalized
    /// Weight is 10-1000 (scaled by 10 for 1 decimal place)
    /// E.g. 10 = 1.0, 15 = 1.5, 25 = 2.5, 100 = 10.0
    /// Higher weight = steeper curve toward top positions
    Exponential: u16,
    /// Uniform distribution - all positions get equal share
    /// Each position gets available_share / total_positions
    /// Useful for quests, airdrops, participation rewards
    Uniform,
    /// Custom distribution with user-defined shares per position
    /// Span contains the share (in basis points) for each position
    /// Shares should sum to available_share (will be normalized with dust if not exact)
    Custom: Span<u16>,
}

/// StorePacking implementation for Distribution (without positions count)
/// Packs into felt252: dist_type(8) | dist_param(16)
/// Total: 24 bits fits in felt252 (251 bits)
/// Custom distributions are stored as type+empty param, with shares stored separately
pub impl DistributionStorePacking of StorePacking<Distribution, felt252> {
    fn pack(value: Distribution) -> felt252 {
        let (dist_type, dist_param) = match value {
            Distribution::Linear(weight) => (DIST_TYPE_LINEAR, weight),
            Distribution::Exponential(weight) => (DIST_TYPE_EXPONENTIAL, weight),
            Distribution::Uniform => (DIST_TYPE_UNIFORM, 0_u16),
            Distribution::Custom(_) => (DIST_TYPE_CUSTOM, 0_u16),
        };

        // Layout: dist_type(8) | dist_param(16)
        let packed: felt252 = dist_type.into() + (dist_param.into() * TWO_POW_8.into());
        packed
    }

    fn unpack(value: felt252) -> Distribution {
        let value_u128: u128 = value.try_into().unwrap();

        let dist_type: u8 = (value_u128 & MASK_8).try_into().unwrap();
        let dist_param: u16 = ((value_u128 / TWO_POW_8) & MASK_16).try_into().unwrap();

        if dist_type == DIST_TYPE_LINEAR {
            Distribution::Linear(dist_param)
        } else if dist_type == DIST_TYPE_EXPONENTIAL {
            Distribution::Exponential(dist_param)
        } else if dist_type == DIST_TYPE_UNIFORM {
            Distribution::Uniform
        } else {
            // Custom - shares must be loaded from separate storage
            Distribution::Custom(array![].span())
        }
    }
}
