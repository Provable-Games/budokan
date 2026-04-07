use budokan::structs::constants::{
    MIN_REGISTRATION_PERIOD, MIN_SUBMISSION_PERIOD, MIN_TOURNAMENT_LENGTH,
};
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

/// Registration start delay (offset from created_at)
pub fn TEST_REGISTRATION_START_DELAY() -> u32 {
    100
}

/// Registration end delay (duration of registration period)
pub fn TEST_REGISTRATION_END_DELAY() -> u32 {
    MIN_REGISTRATION_PERIOD
}

/// Game start delay (offset from created_at)
pub fn TEST_GAME_START_DELAY() -> u32 {
    100 + MIN_REGISTRATION_PERIOD + 100
}

/// Game end delay (duration of game period)
pub fn TEST_GAME_END_DELAY() -> u32 {
    MIN_TOURNAMENT_LENGTH
}

/// Submission duration
pub fn TEST_SUBMISSION_DURATION() -> u32 {
    MIN_SUBMISSION_PERIOD
}
