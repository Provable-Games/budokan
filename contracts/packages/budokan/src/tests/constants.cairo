use budokan::models::constants::{MIN_REGISTRATION_PERIOD, MIN_TOURNAMENT_LENGTH};
use starknet::ContractAddress;

pub const ADMIN: ContractAddress = 'ADMIN'.try_into().unwrap();
pub const AUTHORIZED: ContractAddress = 'AUTHORIZED'.try_into().unwrap();
pub const ZERO_ADDR: ContractAddress = 0.try_into().unwrap();
pub const CALLER: ContractAddress = 'CALLER'.try_into().unwrap();
pub const OWNER: ContractAddress = 'OWNER'.try_into().unwrap();
pub const NEW_OWNER: ContractAddress = 'NEW_OWNER'.try_into().unwrap();
pub const OTHER: ContractAddress = 'OTHER'.try_into().unwrap();
pub const OTHER_ADMIN: ContractAddress = 'OTHER_ADMIN'.try_into().unwrap();
pub const SPENDER: ContractAddress = 'SPENDER'.try_into().unwrap();
pub const RECIPIENT: ContractAddress = 'RECIPIENT'.try_into().unwrap();
pub const OPERATOR: ContractAddress = 'OPERATOR'.try_into().unwrap();
pub const BRIDGE: ContractAddress = 'BRIDGE'.try_into().unwrap();
pub const GAME: ContractAddress = 'GAME'.try_into().unwrap();

pub fn GAME_NAME() -> felt252 {
    ('Game')
}

pub fn GAME_SYMBOL() -> ByteArray {
    ("GAME")
}

pub fn BASE_URI() -> ByteArray {
    ("https://game.io")
}

pub fn TOURNAMENT_NAME() -> felt252 {
    ('Genesis Tournament')
}

pub fn TOURNAMENT_DESCRIPTION() -> ByteArray {
    ("Genesis Tournament")
}

pub fn SETTINGS_NAME() -> felt252 {
    ('Test Settings')
}

pub fn SETTINGS_DESCRIPTION() -> ByteArray {
    ("Test Settings")
}

pub const STARTING_BALANCE: u256 = 1000000000000000000000;

pub fn TEST_REGISTRATION_START_TIME() -> u64 {
    1
}

pub fn TEST_REGISTRATION_END_TIME() -> u64 {
    TEST_REGISTRATION_START_TIME() + MIN_REGISTRATION_PERIOD
}

pub fn TEST_START_TIME() -> u64 {
    1 + MIN_REGISTRATION_PERIOD
}

pub fn TEST_END_TIME() -> u64 {
    TEST_START_TIME() + MIN_TOURNAMENT_LENGTH
}
