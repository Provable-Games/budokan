// Re-export types from budokan interface
pub use budokan_interfaces::budokan::{Period, Phase, Schedule};
use starknet::storage_access::StorePacking;

// Constants for packing/unpacking Schedule
const TWO_POW_35: u128 = 0x800000000; // 2^35
const MASK_25: u128 = 0x1FFFFFF; // 25 bits of 1s
const MASK_35: u128 = 0x7FFFFFFFF; // 35 bits of 1s

/// StorePacking implementation for Schedule
/// Packs into u256: registration_start(35) | registration_end(35) | game_start(35) | game_end(35) |
/// submission_duration(25)
/// Total: 4×35 + 25 = 165 bits fits in u256
/// registration_start = 0 means no registration period
pub impl ScheduleStorePacking of StorePacking<Schedule, u256> {
    fn pack(value: Schedule) -> u256 {
        let (reg_start, reg_end) = match value.registration {
            Option::Some(reg) => (reg.start, reg.end),
            Option::None => (0, 0),
        };

        // Layout: registration_start(35) | registration_end(35) | game_start(35) | game_end(35) |
        // submission_duration(25)
        let packed: u256 = reg_start.into()
            + (reg_end.into() * TWO_POW_35.into())
            + (value.game.start.into() * TWO_POW_35.into() * TWO_POW_35.into())
            + (value.game.end.into() * TWO_POW_35.into() * TWO_POW_35.into() * TWO_POW_35.into())
            + (value.submission_duration.into()
                * TWO_POW_35.into()
                * TWO_POW_35.into()
                * TWO_POW_35.into()
                * TWO_POW_35.into());
        packed
    }

    fn unpack(value: u256) -> Schedule {
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

        let registration = if registration_start == 0 {
            Option::None
        } else {
            Option::Some(Period { start: registration_start, end: registration_end })
        };

        Schedule {
            registration, game: Period { start: game_start, end: game_end }, submission_duration,
        }
    }
}
