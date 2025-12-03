// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;
use starknet::storage_access::StorePacking;

// Registration with is_banned field included
// game_address and game_token_id stored as map key (ContractAddress, u64)
// Remaining fields packed efficiently into RegistrationData
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Registration {
    pub game_address: ContractAddress,
    pub game_token_id: u64,
    pub context_id: u64,
    pub entry_number: u32,
    pub has_submitted: bool,
    pub is_banned: bool,
}

// Constants for packing/unpacking
const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const MASK_32: u128 = 0xffffffff;
const MASK_64: u128 = 0xffffffffffffffff;

/// Registration metadata (numeric fields packed together)
/// game_address and game_token_id stored in map key: Map<(ContractAddress, u64), RegistrationData>
/// Packs: context_id (u64) | entry_number (u32) | has_submitted (bool) | is_banned (bool)
/// Total: 64 + 32 + 1 + 1 = 98 bits -> fits in u128
#[derive(Copy, Drop, Serde)]
pub struct RegistrationData {
    pub context_id: u64,
    pub entry_number: u32,
    pub has_submitted: bool,
    pub is_banned: bool,
}

pub impl RegistrationDataStorePacking of StorePacking<RegistrationData, u128> {
    fn pack(value: RegistrationData) -> u128 {
        let has_submitted_u128: u128 = if value.has_submitted {
            1
        } else {
            0
        };
        let is_banned_u128: u128 = if value.is_banned {
            1
        } else {
            0
        };
        // Layout: context_id(64) | entry_number(32) | has_submitted(1) | is_banned(1)
        let packed: u128 = value.context_id.into()
            + (value.entry_number.into() * TWO_POW_64)
            + (has_submitted_u128 * TWO_POW_64 * TWO_POW_32)
            + (is_banned_u128 * TWO_POW_64 * TWO_POW_32 * 2);
        packed
    }

    fn unpack(value: u128) -> RegistrationData {
        let context_id: u64 = (value & MASK_64).try_into().unwrap();
        let entry_number: u32 = ((value / TWO_POW_64) & MASK_32).try_into().unwrap();
        let has_submitted_val = (value / (TWO_POW_64 * TWO_POW_32)) & 1;
        let is_banned_val = (value / (TWO_POW_64 * TWO_POW_32 * 2)) & 1;
        let has_submitted = has_submitted_val == 1;
        let is_banned = is_banned_val == 1;

        RegistrationData { context_id, entry_number, has_submitted, is_banned }
    }
}
