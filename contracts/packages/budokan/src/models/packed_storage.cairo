// SPDX-License-Identifier: BUSL-1.1
//
// Packed storage structs for gas optimization
// These structs implement StorePacking to pack multiple fields into single storage slots

// Re-export component package packed storage for convenience
pub use budokan_entry_fee::models::{EntryFeeData, EntryFeeDataStorePacking};
pub use budokan_entry_requirement::models::{EntryRequirementMeta, EntryRequirementMetaStorePacking};
pub use budokan_registration::models::{RegistrationData, RegistrationDataStorePacking};
use starknet::storage_access::StorePacking;

// Constants for packing/unpacking
const TWO_POW_8: u128 = 0x100; // 2^8
const TWO_POW_16: u128 = 0x10000; // 2^16
const TWO_POW_24: u128 = 0x1000000; // 2^24
const TWO_POW_25: u128 = 0x2000000; // 2^25
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_35: u128 = 0x800000000; // 2^35
const TWO_POW_64: u128 = 0x10000000000000000;

const MASK_8: u128 = 0xFF; // 8 bits of 1s
const MASK_16: u128 = 0xFFFF; // 16 bits of 1s
const MASK_25: u128 = 0x1FFFFFF; // 25 bits of 1s
const MASK_32: u128 = 0xffffffff;
const MASK_35: u128 = 0x7FFFFFFFF; // 35 bits of 1s
const MASK_64: u128 = 0xffffffffffffffff;

/// Tournament metadata (small fields packed together)
/// Packs: created_at (u64/35 bits) | creator_token_id (u64) | settings_id (u32) | soulbound (bool)
/// Total: 35 + 64 + 32 + 1 = 132 bits -> fits in u256
/// created_at uses 35 bits (valid until year ~3059), also serves as exists check (0 = not exists)
#[derive(Copy, Drop, Serde)]
pub struct TournamentMeta {
    pub created_at: u64, // 35 bits, 0 = tournament doesn't exist
    pub creator_token_id: u64, // 64 bits
    pub settings_id: u32, // 32 bits
    pub soulbound: bool // 1 bit
}

pub impl TournamentMetaStorePacking of StorePacking<TournamentMeta, u256> {
    fn pack(value: TournamentMeta) -> u256 {
        let soulbound_u256: u256 = if value.soulbound {
            1
        } else {
            0
        };
        // Layout: created_at(35) | creator_token_id(64) | settings_id(32) | soulbound(1)
        let packed: u256 = value.created_at.into()
            + (value.creator_token_id.into() * TWO_POW_35.into())
            + (value.settings_id.into() * TWO_POW_35.into() * TWO_POW_64.into())
            + (soulbound_u256 * TWO_POW_35.into() * TWO_POW_64.into() * TWO_POW_32.into());
        packed
    }

    fn unpack(value: u256) -> TournamentMeta {
        let mask_35_u256: u256 = MASK_35.into();
        let two_pow_35_u256: u256 = TWO_POW_35.into();

        let created_at: u64 = (value & mask_35_u256).try_into().unwrap();
        let creator_token_id: u64 = ((value / two_pow_35_u256) & MASK_64.into())
            .try_into()
            .unwrap();
        let settings_id: u32 = ((value / (two_pow_35_u256 * TWO_POW_64.into())) & MASK_32.into())
            .try_into()
            .unwrap();
        let soulbound_val = (value / (two_pow_35_u256 * TWO_POW_64.into() * TWO_POW_32.into())) & 1;
        let soulbound = soulbound_val == 1;

        TournamentMeta { created_at, creator_token_id, settings_id, soulbound }
    }
}

/// Complete schedule packed into u256
/// Packs: registration_start | registration_end | game_start | game_end | submission_duration
/// Timestamps use 35 bits (valid until year ~3059), submission_duration uses 25 bits (up to ~388
/// days)
/// Total: 4×35 + 25 = 165 bits fits in u256
/// registration_start = 0 means no registration period.
#[derive(Copy, Drop, Serde)]
// TODO: offseting the timestamps from the created_at time to save bits? created_at currently in
// TournamentMeta
pub struct PackedSchedule {
    // TODO: add period for where the tournament can be reconfigured? This would also allow for
    // extra prize additions etc before registration starts.
    pub registration_start: u64, // 35 bits, 0 = no registration period
    pub registration_end: u64, // 35 bits
    pub game_start: u64, // 35 bits
    pub game_end: u64, // 35 bits
    pub submission_duration: u64 // 25 bits (max ~388 days)
}

pub impl PackedScheduleStorePacking of StorePacking<PackedSchedule, u256> {
    fn pack(value: PackedSchedule) -> u256 {
        // Layout: registration_start(35) | registration_end(35) | game_start(35) | game_end(35) |
        // submission_duration(25)
        let packed: u256 = value.registration_start.into()
            + (value.registration_end.into() * TWO_POW_35.into())
            + (value.game_start.into() * TWO_POW_35.into() * TWO_POW_35.into())
            + (value.game_end.into() * TWO_POW_35.into() * TWO_POW_35.into() * TWO_POW_35.into())
            + (value.submission_duration.into()
                * TWO_POW_35.into()
                * TWO_POW_35.into()
                * TWO_POW_35.into()
                * TWO_POW_35.into());
        packed
    }

    fn unpack(value: u256) -> PackedSchedule {
        let mask_25_u256: u256 = MASK_25.into();
        let mask_35_u256: u256 = MASK_35.into();
        let two_pow_35_u256: u256 = TWO_POW_35.into();

        let registration_start: u64 = (value & mask_35_u256).try_into().unwrap();
        let registration_end: u64 = ((value / two_pow_35_u256) & mask_35_u256).try_into().unwrap();
        let game_start: u64 = ((value / (two_pow_35_u256 * two_pow_35_u256)) & mask_35_u256)
            .try_into()
            .unwrap();
        let game_end: u64 = ((value / (two_pow_35_u256 * two_pow_35_u256 * two_pow_35_u256))
            & mask_35_u256)
            .try_into()
            .unwrap();
        let submission_duration: u64 = ((value
            / (two_pow_35_u256 * two_pow_35_u256 * two_pow_35_u256 * two_pow_35_u256))
            & mask_25_u256)
            .try_into()
            .unwrap();

        PackedSchedule {
            registration_start, registration_end, game_start, game_end, submission_duration,
        }
    }
}

/// Distribution configuration packed into felt252
/// Packs: dist_type (8 bits) | dist_param (16 bits) | positions (32 bits)
/// Total: 8 + 16 + 32 = 56 bits fits in felt252 (251 bits)
/// positions = 0 means use actual leaderboard size (dynamic)
#[derive(Copy, Drop, Serde)]
pub struct PackedDistribution {
    pub dist_type: u8, // 8 bits - distribution type enum value
    pub dist_param: u16, // 16 bits - weight parameter for Linear/Exponential
    pub positions: u32 // 32 bits - fixed positions count, 0 = dynamic
}

pub impl PackedDistributionStorePacking of StorePacking<PackedDistribution, felt252> {
    fn pack(value: PackedDistribution) -> felt252 {
        // Layout: dist_type(8) | dist_param(16) | positions(32)
        let packed: felt252 = value.dist_type.into()
            + (value.dist_param.into() * TWO_POW_8.into())
            + (value.positions.into() * TWO_POW_24.into());
        packed
    }

    fn unpack(value: felt252) -> PackedDistribution {
        let value_u128: u128 = value.try_into().unwrap();

        let dist_type: u8 = (value_u128 & MASK_8).try_into().unwrap();
        let dist_param: u16 = ((value_u128 / TWO_POW_8) & MASK_16).try_into().unwrap();
        let positions: u32 = ((value_u128 / TWO_POW_24) & MASK_32).try_into().unwrap();

        PackedDistribution { dist_type, dist_param, positions }
    }
}

#[cfg(test)]
mod tests {
    use starknet::storage_access::StorePacking;
    use super::{PackedDistribution, PackedDistributionStorePacking};

    #[test]
    fn test_packed_distribution_roundtrip() {
        // Test exponential with weight 15 and no fixed positions
        let original = PackedDistribution { dist_type: 1, dist_param: 15, positions: 0 };

        let packed = PackedDistributionStorePacking::pack(original);
        let unpacked = PackedDistributionStorePacking::unpack(packed);

        assert!(unpacked.dist_type == 1, "dist_type should be 1 (exponential)");
        assert!(unpacked.dist_param == 15, "dist_param should be 15");
        assert!(unpacked.positions == 0, "positions should be 0");
    }

    #[test]
    fn test_packed_distribution_with_positions() {
        // Test linear with weight 10 and 5 fixed positions
        let original = PackedDistribution { dist_type: 0, dist_param: 10, positions: 5 };

        let packed = PackedDistributionStorePacking::pack(original);
        let unpacked = PackedDistributionStorePacking::unpack(packed);

        assert!(unpacked.dist_type == 0, "dist_type should be 0 (linear)");
        assert!(unpacked.dist_param == 10, "dist_param should be 10");
        assert!(unpacked.positions == 5, "positions should be 5");
    }

    #[test]
    fn test_packed_distribution_max_values() {
        // Test with maximum values
        let original = PackedDistribution {
            dist_type: 255, // max u8
            dist_param: 65535, // max u16
            positions: 4294967295 // max u32
        };

        let packed = PackedDistributionStorePacking::pack(original);
        let unpacked = PackedDistributionStorePacking::unpack(packed);

        assert!(unpacked.dist_type == 255, "dist_type should be 255");
        assert!(unpacked.dist_param == 65535, "dist_param should be 65535");
        assert!(unpacked.positions == 4294967295, "positions should be max u32");
    }
}
