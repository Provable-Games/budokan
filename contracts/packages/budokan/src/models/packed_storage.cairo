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
const TWO_POW_25: u128 = 0x2000000; // 2^25
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_35: u128 = 0x800000000; // 2^35
const TWO_POW_64: u128 = 0x10000000000000000;

const MASK_25: u128 = 0x1FFFFFF; // 25 bits of 1s
const MASK_32: u128 = 0xffffffff;
const MASK_35: u128 = 0x7FFFFFFFF; // 35 bits of 1s
const MASK_64: u128 = 0xffffffffffffffff;

/// Tournament metadata (small fields packed together)
/// Packs: created_at (u64/35 bits) | creator_token_id (u64) | settings_id (u32) | prize_spots (u32)
/// | soulbound (bool)
/// Total: 35 + 64 + 32 + 32 + 1 = 164 bits -> fits in u256
/// created_at uses 35 bits (valid until year ~3059), also serves as exists check (0 = not exists)
#[derive(Copy, Drop, Serde)]
pub struct TournamentMeta {
    pub created_at: u64, // 35 bits, 0 = tournament doesn't exist
    pub creator_token_id: u64, // 64 bits
    pub settings_id: u32, // 32 bits
    pub prize_spots: u32, // 32 bits, max ~4.3B prize positions
    pub soulbound: bool // 1 bit
}

pub impl TournamentMetaStorePacking of StorePacking<TournamentMeta, u256> {
    fn pack(value: TournamentMeta) -> u256 {
        let soulbound_u256: u256 = if value.soulbound {
            1
        } else {
            0
        };
        // Layout: created_at(35) | creator_token_id(64) | settings_id(32) | prize_spots(32) |
        // soulbound(1)
        let packed: u256 = value.created_at.into()
            + (value.creator_token_id.into() * TWO_POW_35.into())
            + (value.settings_id.into() * TWO_POW_35.into() * TWO_POW_64.into())
            + (value.prize_spots.into() * TWO_POW_35.into() * TWO_POW_64.into() * TWO_POW_32.into())
            + (soulbound_u256
                * TWO_POW_35.into()
                * TWO_POW_64.into()
                * TWO_POW_32.into()
                * TWO_POW_32.into());
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
        let prize_spots: u32 = ((value / (two_pow_35_u256 * TWO_POW_64.into() * TWO_POW_32.into()))
            & MASK_32.into())
            .try_into()
            .unwrap();
        let soulbound_val = (value
            / (two_pow_35_u256 * TWO_POW_64.into() * TWO_POW_32.into() * TWO_POW_32.into()))
            & 1;
        let soulbound = soulbound_val == 1;

        TournamentMeta { created_at, creator_token_id, settings_id, prize_spots, soulbound }
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
