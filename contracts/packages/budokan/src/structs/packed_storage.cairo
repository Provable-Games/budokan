// SPDX-License-Identifier: BUSL-1.1
//
// Packed storage structs for gas optimization
// These structs implement StorePacking to pack multiple fields into single storage slots

// Re-export component package packed storage for convenience
pub use game_components_metagame::entry_fee::structs::{EntryFeeData, EntryFeeDataStorePacking};
pub use game_components_metagame::entry_requirement::structs::{
    EntryRequirementMeta, EntryRequirementMetaStorePacking,
};
pub use game_components_metagame::registration::structs::{
    RegistrationEntryData, RegistrationEntryDataStorePacking,
};
use starknet::storage_access::StorePacking;

// Constants for packing/unpacking
const TWO_POW_1: u128 = 0x2; // 2^1
const TWO_POW_2: u128 = 0x4; // 2^2
const TWO_POW_8: u128 = 0x100; // 2^8
const TWO_POW_16: u128 = 0x10000; // 2^16
const TWO_POW_24: u128 = 0x1000000; // 2^24
const TWO_POW_25: u128 = 0x2000000; // 2^25
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_34: u128 = 0x400000000; // 2^34
const TWO_POW_35: u128 = 0x800000000; // 2^35
const TWO_POW_59: u128 = 0x800000000000000; // 2^59
const TWO_POW_64: u128 = 0x10000000000000000;
const TWO_POW_69: u128 = 0x200000000000000000; // 2^69
const TWO_POW_100: u128 = 0x10000000000000000000000000; // 2^100
const TWO_POW_101: u128 = 0x20000000000000000000000000; // 2^101

const MASK_1: u128 = 0x1; // 1 bit
const MASK_8: u128 = 0xFF; // 8 bits of 1s
const MASK_16: u128 = 0xFFFF; // 16 bits of 1s
const MASK_25: u128 = 0x1FFFFFF; // 25 bits of 1s
const MASK_32: u128 = 0xffffffff;
const MASK_35: u128 = 0x7FFFFFFFF; // 35 bits of 1s
const MASK_64: u128 = 0xffffffffffffffff;

/// TournamentConfig packs schedule delays + flags + created_at into felt252 (1 storage slot).
/// This replaces BOTH TournamentMeta AND ScheduleStorePacking.
///
/// Layout (196 bits total, fits in felt252's 251-bit capacity):
///
/// Low u128 (94 bits used):
///   [0]      paymaster                   (1 bit)
///   [1]      soulbound                   (1 bit)
///   [2..33]  settings_id                 (32 bits)
///   [34..68] created_at                  (35 bits)
///   [69..93] registration_start_delay    (25 bits)
///
/// High u128 (102 bits used):
///   [0..24]  registration_end_delay      (25 bits)
///   [25..49] game_start_delay            (25 bits)
///   [50..74] game_end_delay              (25 bits)
///   [75..99] submission_duration         (25 bits)
///   [100]    ascending                   (1 bit)
///   [101]    game_must_be_over           (1 bit)
#[derive(Copy, Drop, Serde)]
pub struct TournamentConfig {
    pub created_at: u64, // 35 bits, 0 = tournament doesn't exist
    pub settings_id: u32, // 32 bits
    pub soulbound: bool, // 1 bit
    pub paymaster: bool, // 1 bit
    pub registration_start_delay: u32, // 25 bits (max ~388 days)
    pub registration_end_delay: u32, // 25 bits
    pub game_start_delay: u32, // 25 bits
    pub game_end_delay: u32, // 25 bits
    pub submission_duration: u32, // 25 bits
    pub ascending: bool, // 1 bit
    pub game_must_be_over: bool // 1 bit
}

pub impl TournamentConfigStorePacking of StorePacking<TournamentConfig, felt252> {
    fn pack(value: TournamentConfig) -> felt252 {
        let paymaster_val: u128 = if value.paymaster {
            1
        } else {
            0
        };
        let soulbound_val: u128 = if value.soulbound {
            1
        } else {
            0
        };

        // Low u128: paymaster(1) | soulbound(1) | settings_id(32) | created_at(35) |
        // registration_start_delay(25)
        let low: u128 = paymaster_val
            + (soulbound_val * TWO_POW_1)
            + (value.settings_id.into() * TWO_POW_2)
            + (value.created_at.into() * TWO_POW_34)
            + (value.registration_start_delay.into() * TWO_POW_69);

        let ascending_val: u128 = if value.ascending {
            1
        } else {
            0
        };
        let game_must_be_over_val: u128 = if value.game_must_be_over {
            1
        } else {
            0
        };

        // High u128: registration_end_delay(25) | game_start_delay(25) | game_end_delay(25) |
        // submission_duration(25) | ascending(1) | game_must_be_over(1)
        let high: u128 = value.registration_end_delay.into()
            + (value.game_start_delay.into() * TWO_POW_25)
            + (value.game_end_delay.into() * TWO_POW_25 * TWO_POW_25)
            + (value.submission_duration.into() * TWO_POW_25 * TWO_POW_25 * TWO_POW_25)
            + (ascending_val * TWO_POW_100)
            + (game_must_be_over_val * TWO_POW_101);

        // 196 bits fits in felt252 (251 bits), safe to convert
        let packed_u256 = u256 { low, high };
        packed_u256.try_into().unwrap()
    }

    fn unpack(value: felt252) -> TournamentConfig {
        let value_u256: u256 = value.into();
        let low = value_u256.low;
        let high = value_u256.high;

        let paymaster = (low & MASK_1) == 1;
        let soulbound = ((low / TWO_POW_1) & MASK_1) == 1;
        let settings_id: u32 = ((low / TWO_POW_2) & MASK_32).try_into().unwrap();
        let created_at: u64 = ((low / TWO_POW_34) & MASK_35).try_into().unwrap();
        let registration_start_delay: u32 = ((low / TWO_POW_69) & MASK_25).try_into().unwrap();

        let registration_end_delay: u32 = (high & MASK_25).try_into().unwrap();
        let game_start_delay: u32 = ((high / TWO_POW_25) & MASK_25).try_into().unwrap();
        let game_end_delay: u32 = ((high / (TWO_POW_25 * TWO_POW_25)) & MASK_25)
            .try_into()
            .unwrap();
        let submission_duration: u32 = ((high / (TWO_POW_25 * TWO_POW_25 * TWO_POW_25)) & MASK_25)
            .try_into()
            .unwrap();
        let ascending = ((high / TWO_POW_100) & MASK_1) == 1;
        let game_must_be_over = ((high / TWO_POW_101) & MASK_1) == 1;

        TournamentConfig {
            created_at,
            settings_id,
            soulbound,
            paymaster,
            registration_start_delay,
            registration_end_delay,
            game_start_delay,
            game_end_delay,
            submission_duration,
            ascending,
            game_must_be_over,
        }
    }
}

/// Individual TournamentConfig unpack helpers.
/// Extract single fields from packed felt252 without full struct unpacking.
pub fn unpack_paymaster(packed: felt252) -> bool {
    let packed: u256 = packed.into();
    (packed.low & MASK_1) == 1
}

pub fn unpack_soulbound(packed: felt252) -> bool {
    let packed: u256 = packed.into();
    ((packed.low / TWO_POW_1) & MASK_1) == 1
}

pub fn unpack_settings_id(packed: felt252) -> u32 {
    let packed: u256 = packed.into();
    ((packed.low / TWO_POW_2) & MASK_32).try_into().unwrap()
}

pub fn unpack_created_at(packed: felt252) -> u64 {
    let packed: u256 = packed.into();
    ((packed.low / TWO_POW_34) & MASK_35).try_into().unwrap()
}

pub fn unpack_registration_start_delay(packed: felt252) -> u32 {
    let packed: u256 = packed.into();
    ((packed.low / TWO_POW_69) & MASK_25).try_into().unwrap()
}

pub fn unpack_registration_end_delay(packed: felt252) -> u32 {
    let packed: u256 = packed.into();
    (packed.high & MASK_25).try_into().unwrap()
}

pub fn unpack_game_start_delay(packed: felt252) -> u32 {
    let packed: u256 = packed.into();
    ((packed.high / TWO_POW_25) & MASK_25).try_into().unwrap()
}

pub fn unpack_game_end_delay(packed: felt252) -> u32 {
    let packed: u256 = packed.into();
    ((packed.high / (TWO_POW_25 * TWO_POW_25)) & MASK_25).try_into().unwrap()
}

pub fn unpack_submission_duration(packed: felt252) -> u32 {
    let packed: u256 = packed.into();
    ((packed.high / (TWO_POW_25 * TWO_POW_25 * TWO_POW_25)) & MASK_25).try_into().unwrap()
}

pub fn unpack_ascending(packed: felt252) -> bool {
    let packed: u256 = packed.into();
    ((packed.high / TWO_POW_100) & MASK_1) == 1
}

pub fn unpack_game_must_be_over(packed: felt252) -> bool {
    let packed: u256 = packed.into();
    ((packed.high / TWO_POW_101) & MASK_1) == 1
}

/// Grouped helper: returns (created_at, game_start_delay, game_end_delay)
pub fn unpack_game_schedule(packed: felt252) -> (u64, u32, u32) {
    (unpack_created_at(packed), unpack_game_start_delay(packed), unpack_game_end_delay(packed))
}

/// Grouped helper: returns (created_at, registration_start_delay, registration_end_delay)
pub fn unpack_registration_schedule(packed: felt252) -> (u64, u32, u32) {
    (
        unpack_created_at(packed),
        unpack_registration_start_delay(packed),
        unpack_registration_end_delay(packed),
    )
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
    use super::{
        PackedDistribution, PackedDistributionStorePacking, TournamentConfig,
        TournamentConfigStorePacking, unpack_ascending, unpack_created_at, unpack_game_end_delay,
        unpack_game_must_be_over, unpack_game_schedule, unpack_game_start_delay, unpack_paymaster,
        unpack_registration_end_delay, unpack_registration_schedule,
        unpack_registration_start_delay, unpack_settings_id, unpack_soulbound,
        unpack_submission_duration,
    };

    #[test]
    fn test_tournament_config_roundtrip() {
        let original = TournamentConfig {
            created_at: 1700000000,
            settings_id: 42,
            soulbound: true,
            paymaster: false,
            registration_start_delay: 100,
            registration_end_delay: 3600,
            game_start_delay: 5000,
            game_end_delay: 7200,
            submission_duration: 3600,
            ascending: false,
            game_must_be_over: false,
        };

        let packed = TournamentConfigStorePacking::pack(original);
        let unpacked = TournamentConfigStorePacking::unpack(packed);

        assert!(unpacked.created_at == 1700000000, "created_at mismatch");
        assert!(unpacked.settings_id == 42, "settings_id mismatch");
        assert!(unpacked.soulbound == true, "soulbound mismatch");
        assert!(unpacked.paymaster == false, "paymaster mismatch");
        assert!(unpacked.registration_start_delay == 100, "reg_start_delay mismatch");
        assert!(unpacked.registration_end_delay == 3600, "reg_end_delay mismatch");
        assert!(unpacked.game_start_delay == 5000, "game_start_delay mismatch");
        assert!(unpacked.game_end_delay == 7200, "game_end_delay mismatch");
        assert!(unpacked.submission_duration == 3600, "submission_duration mismatch");
        assert!(unpacked.ascending == false, "ascending mismatch");
        assert!(unpacked.game_must_be_over == false, "game_must_be_over mismatch");
    }

    #[test]
    fn test_tournament_config_max_values() {
        // Test with max values for each field
        let original = TournamentConfig {
            created_at: 0x7FFFFFFFF, // max 35 bits
            settings_id: 0xFFFFFFFF, // max 32 bits
            soulbound: true,
            paymaster: true,
            registration_start_delay: 0x1FFFFFF, // max 25 bits
            registration_end_delay: 0x1FFFFFF,
            game_start_delay: 0x1FFFFFF,
            game_end_delay: 0x1FFFFFF,
            submission_duration: 0x1FFFFFF,
            ascending: true,
            game_must_be_over: true,
        };

        let packed = TournamentConfigStorePacking::pack(original);
        let unpacked = TournamentConfigStorePacking::unpack(packed);

        assert!(unpacked.created_at == 0x7FFFFFFFF, "max created_at mismatch");
        assert!(unpacked.settings_id == 0xFFFFFFFF, "max settings_id mismatch");
        assert!(unpacked.soulbound == true, "max soulbound mismatch");
        assert!(unpacked.paymaster == true, "max paymaster mismatch");
        assert!(unpacked.registration_start_delay == 0x1FFFFFF, "max reg_start mismatch");
        assert!(unpacked.registration_end_delay == 0x1FFFFFF, "max reg_end mismatch");
        assert!(unpacked.game_start_delay == 0x1FFFFFF, "max game_start mismatch");
        assert!(unpacked.game_end_delay == 0x1FFFFFF, "max game_end mismatch");
        assert!(unpacked.submission_duration == 0x1FFFFFF, "max sub_duration mismatch");
        assert!(unpacked.ascending == true, "max ascending mismatch");
        assert!(unpacked.game_must_be_over == true, "max game_must_be_over mismatch");
    }

    #[test]
    fn test_tournament_config_zero_values() {
        let original = TournamentConfig {
            created_at: 0,
            settings_id: 0,
            soulbound: false,
            paymaster: false,
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: 0,
            submission_duration: 0,
            ascending: false,
            game_must_be_over: false,
        };

        let packed = TournamentConfigStorePacking::pack(original);
        let unpacked = TournamentConfigStorePacking::unpack(packed);

        assert!(unpacked.created_at == 0, "zero created_at mismatch");
        assert!(unpacked.settings_id == 0, "zero settings_id mismatch");
        assert!(unpacked.soulbound == false, "zero soulbound mismatch");
        assert!(unpacked.paymaster == false, "zero paymaster mismatch");
        assert!(unpacked.registration_start_delay == 0, "zero reg_start mismatch");
        assert!(unpacked.registration_end_delay == 0, "zero reg_end mismatch");
        assert!(unpacked.game_start_delay == 0, "zero game_start mismatch");
        assert!(unpacked.game_end_delay == 0, "zero game_end mismatch");
        assert!(unpacked.submission_duration == 0, "zero sub_duration mismatch");
        assert!(unpacked.ascending == false, "zero ascending mismatch");
        assert!(unpacked.game_must_be_over == false, "zero game_must_be_over mismatch");
    }

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

    // --- Individual TournamentConfig unpack helper tests ---

    #[test]
    fn test_unpack_paymaster() {
        let with_paymaster = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: true,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_paymaster(with_paymaster) == true, "paymaster should be true");

        let without_paymaster = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_paymaster(without_paymaster) == false, "paymaster should be false");
    }

    #[test]
    fn test_unpack_soulbound() {
        let with_soulbound = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: true,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_soulbound(with_soulbound) == true, "soulbound should be true");

        let without_soulbound = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_soulbound(without_soulbound) == false, "soulbound should be false");
    }

    #[test]
    fn test_unpack_settings_id() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 12345678,
                soulbound: true,
                paymaster: true,
                registration_start_delay: 500,
                registration_end_delay: 600,
                game_start_delay: 700,
                game_end_delay: 800,
                submission_duration: 900,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_settings_id(packed) == 12345678, "settings_id mismatch");
    }

    #[test]
    fn test_unpack_created_at() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 1700000000,
                settings_id: 42,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 100,
                registration_end_delay: 200,
                game_start_delay: 300,
                game_end_delay: 400,
                submission_duration: 500,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_created_at(packed) == 1700000000, "created_at mismatch");
    }

    #[test]
    fn test_unpack_registration_start_delay() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 86400,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(
            unpack_registration_start_delay(packed) == 86400, "registration_start_delay mismatch",
        );
    }

    #[test]
    fn test_unpack_high_fields() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 3600,
                game_start_delay: 5000,
                game_end_delay: 7200,
                submission_duration: 1800,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_registration_end_delay(packed) == 3600, "registration_end_delay mismatch");
        assert!(unpack_game_start_delay(packed) == 5000, "game_start_delay mismatch");
        assert!(unpack_game_end_delay(packed) == 7200, "game_end_delay mismatch");
        assert!(unpack_submission_duration(packed) == 1800, "submission_duration mismatch");
    }

    #[test]
    fn test_unpack_game_schedule() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 1700000000,
                settings_id: 10,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 100,
                registration_end_delay: 200,
                game_start_delay: 5000,
                game_end_delay: 7200,
                submission_duration: 900,
                ascending: false,
                game_must_be_over: false,
            },
        );
        let (created_at, game_start, game_end) = unpack_game_schedule(packed);
        assert!(created_at == 1700000000, "game_schedule created_at mismatch");
        assert!(game_start == 5000, "game_schedule game_start mismatch");
        assert!(game_end == 7200, "game_schedule game_end mismatch");
    }

    #[test]
    fn test_unpack_registration_schedule() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 1700000000,
                settings_id: 10,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 3600,
                registration_end_delay: 7200,
                game_start_delay: 500,
                game_end_delay: 600,
                submission_duration: 700,
                ascending: false,
                game_must_be_over: false,
            },
        );
        let (created_at, reg_start, reg_end) = unpack_registration_schedule(packed);
        assert!(created_at == 1700000000, "reg_schedule created_at mismatch");
        assert!(reg_start == 3600, "reg_schedule reg_start mismatch");
        assert!(reg_end == 7200, "reg_schedule reg_end mismatch");
    }

    #[test]
    fn test_individual_unpack_max_values() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 0x7FFFFFFFF, // max 35 bits
                settings_id: 0xFFFFFFFF, // max 32 bits
                soulbound: true,
                paymaster: true,
                registration_start_delay: 0x1FFFFFF, // max 25 bits
                registration_end_delay: 0x1FFFFFF,
                game_start_delay: 0x1FFFFFF,
                game_end_delay: 0x1FFFFFF,
                submission_duration: 0x1FFFFFF,
                ascending: true,
                game_must_be_over: true,
            },
        );
        assert!(unpack_paymaster(packed) == true, "max paymaster mismatch");
        assert!(unpack_soulbound(packed) == true, "max soulbound mismatch");
        assert!(unpack_settings_id(packed) == 0xFFFFFFFF, "max settings_id mismatch");
        assert!(unpack_created_at(packed) == 0x7FFFFFFFF, "max created_at mismatch");
        assert!(
            unpack_registration_start_delay(packed) == 0x1FFFFFF, "max reg_start_delay mismatch",
        );
        assert!(unpack_registration_end_delay(packed) == 0x1FFFFFF, "max reg_end_delay mismatch");
        assert!(unpack_game_start_delay(packed) == 0x1FFFFFF, "max game_start_delay mismatch");
        assert!(unpack_game_end_delay(packed) == 0x1FFFFFF, "max game_end_delay mismatch");
        assert!(
            unpack_submission_duration(packed) == 0x1FFFFFF, "max submission_duration mismatch",
        );
        assert!(unpack_ascending(packed) == true, "max ascending mismatch");
        assert!(unpack_game_must_be_over(packed) == true, "max game_must_be_over mismatch");
    }

    #[test]
    fn test_individual_unpack_zero_values() {
        let packed = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 0,
                settings_id: 0,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_paymaster(packed) == false, "zero paymaster mismatch");
        assert!(unpack_soulbound(packed) == false, "zero soulbound mismatch");
        assert!(unpack_settings_id(packed) == 0, "zero settings_id mismatch");
        assert!(unpack_created_at(packed) == 0, "zero created_at mismatch");
        assert!(unpack_registration_start_delay(packed) == 0, "zero reg_start_delay mismatch");
        assert!(unpack_registration_end_delay(packed) == 0, "zero reg_end_delay mismatch");
        assert!(unpack_game_start_delay(packed) == 0, "zero game_start_delay mismatch");
        assert!(unpack_game_end_delay(packed) == 0, "zero game_end_delay mismatch");
        assert!(unpack_submission_duration(packed) == 0, "zero submission_duration mismatch");
        assert!(unpack_ascending(packed) == false, "zero ascending mismatch");
        assert!(unpack_game_must_be_over(packed) == false, "zero game_must_be_over mismatch");
    }

    #[test]
    fn test_individual_unpack_consistency_with_full_unpack() {
        let original = TournamentConfig {
            created_at: 1700000000,
            settings_id: 42,
            soulbound: true,
            paymaster: false,
            registration_start_delay: 100,
            registration_end_delay: 3600,
            game_start_delay: 5000,
            game_end_delay: 7200,
            submission_duration: 3600,
            ascending: true,
            game_must_be_over: false,
        };

        let packed = TournamentConfigStorePacking::pack(original);
        let full = TournamentConfigStorePacking::unpack(packed);

        assert!(unpack_paymaster(packed) == full.paymaster, "paymaster inconsistent");
        assert!(unpack_soulbound(packed) == full.soulbound, "soulbound inconsistent");
        assert!(unpack_settings_id(packed) == full.settings_id, "settings_id inconsistent");
        assert!(unpack_created_at(packed) == full.created_at, "created_at inconsistent");
        assert!(
            unpack_registration_start_delay(packed) == full.registration_start_delay,
            "reg_start inconsistent",
        );
        assert!(
            unpack_registration_end_delay(packed) == full.registration_end_delay,
            "reg_end inconsistent",
        );
        assert!(
            unpack_game_start_delay(packed) == full.game_start_delay, "game_start inconsistent",
        );
        assert!(unpack_game_end_delay(packed) == full.game_end_delay, "game_end inconsistent");
        assert!(
            unpack_submission_duration(packed) == full.submission_duration,
            "sub_duration inconsistent",
        );
        assert!(unpack_ascending(packed) == full.ascending, "ascending inconsistent");
        assert!(
            unpack_game_must_be_over(packed) == full.game_must_be_over,
            "game_must_be_over inconsistent",
        );
    }

    #[test]
    fn test_unpack_ascending() {
        let with_ascending = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: true,
                game_must_be_over: false,
            },
        );
        assert!(unpack_ascending(with_ascending) == true, "ascending should be true");

        let without_ascending = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(unpack_ascending(without_ascending) == false, "ascending should be false");
    }

    #[test]
    fn test_unpack_game_must_be_over() {
        let with_gmbo = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: true,
            },
        );
        assert!(unpack_game_must_be_over(with_gmbo) == true, "game_must_be_over should be true");

        let without_gmbo = TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 100,
                settings_id: 1,
                soulbound: false,
                paymaster: false,
                registration_start_delay: 0,
                registration_end_delay: 0,
                game_start_delay: 0,
                game_end_delay: 0,
                submission_duration: 0,
                ascending: false,
                game_must_be_over: false,
            },
        );
        assert!(
            unpack_game_must_be_over(without_gmbo) == false, "game_must_be_over should be false",
        );
    }

    // =====================================================================
    // Gas benchmarks: full unpack vs selective unpack for each optimized path
    // =====================================================================
    // Compare l2_gas in test output to measure savings.
    // Each test uses the same packed value to ensure fair comparison.

    fn _bench_packed() -> felt252 {
        TournamentConfigStorePacking::pack(
            TournamentConfig {
                created_at: 1700000000,
                settings_id: 42,
                soulbound: true,
                paymaster: false,
                registration_start_delay: 3600,
                registration_end_delay: 7200,
                game_start_delay: 14400,
                game_end_delay: 86400,
                submission_duration: 3600,
                ascending: false,
                game_must_be_over: false,
            },
        )
    }

    // --- current_phase: full unpack (needs all 5 schedule fields + created_at) ---
    #[test]
    fn bench_current_phase_full_unpack() {
        let packed = _bench_packed();
        let config = TournamentConfigStorePacking::unpack(packed);
        // Use all schedule fields + created_at (same as current_phase does)
        let _ = config.registration_start_delay
            + config.registration_end_delay
            + config.game_start_delay
            + config.game_end_delay
            + config.submission_duration;
        let _ = config.created_at;
    }

    // --- add_prize: full unpack vs unpack_game_schedule (3 fields) ---
    #[test]
    fn bench_add_prize_full_unpack() {
        let packed = _bench_packed();
        let config = TournamentConfigStorePacking::unpack(packed);
        let _ = config.created_at;
        let _ = config.game_start_delay;
        let _ = config.game_end_delay;
    }

    #[test]
    fn bench_add_prize_selective_unpack() {
        let packed = _bench_packed();
        let (created_at, game_start_delay, game_end_delay) = unpack_game_schedule(packed);
        let _ = created_at;
        let _ = game_start_delay;
        let _ = game_end_delay;
    }

    // --- ban_entry: full unpack vs 4 individual helpers ---
    #[test]
    fn bench_ban_entry_full_unpack() {
        let packed = _bench_packed();
        let config = TournamentConfigStorePacking::unpack(packed);
        let _ = config.created_at;
        let _ = config.registration_start_delay;
        let _ = config.registration_end_delay;
        let _ = config.game_start_delay;
    }

    #[test]
    fn bench_ban_entry_selective_unpack() {
        let packed = _bench_packed();
        let _ = unpack_created_at(packed);
        let _ = unpack_registration_start_delay(packed);
        let _ = unpack_registration_end_delay(packed);
        let _ = unpack_game_start_delay(packed);
    }

    // --- submit_score: full unpack (needs all schedule fields for phase check) ---
    // submit_score uses full unpack same as current_phase, so same as
    // bench_current_phase_full_unpack.
    // The savings come from avoiding a second _get_tournament call in _mark_score_submitted.
    // We benchmark the _mark_score_submitted path: full unpack just for game_address vs passing it.
    #[test]
    fn bench_mark_submitted_full_unpack() {
        let packed = _bench_packed();
        // Simulates what old _mark_score_submitted did: full unpack just to get one field
        let config = TournamentConfigStorePacking::unpack(packed);
        let _ = config.settings_id; // stand-in for game_address (not in packed config)
    }

    #[test]
    fn bench_mark_submitted_no_unpack() {
        // New path: game_address passed as parameter, no unpack needed at all
        let _game_address: felt252 = 0x1234;
    }
}
