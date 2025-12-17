// SPDX-License-Identifier: BUSL-1.1

// Re-export Distribution from budokan_interfaces
pub use budokan_interfaces::distribution::Distribution;
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
