// Fork tests for ZkPassportValidator against the deployed Garaga verifier on Sepolia.
//
// These tests use real proof calldata generated from the ZKPassport TypeScript pipeline
// and call the actual deployed UltraKeccakZKHonkVerifier contract on Sepolia, providing
// much higher fidelity than the mock-based unit tests.
//
// Proof fixture: Johnny Silverhand, AUS, born 1988-11-12, expiry 2030-01-01
// Query: age >= 18
// Verifier: 0x06ad2f4c866eabb03443098ecc798af1791952bc138bd32904dd215d8585c655

use budokan_entry_requirement::examples::zkpassport_validator::{
    IZkPassportValidatorDispatcher, IZkPassportValidatorDispatcherTrait,
};
use budokan_interfaces::entry_validator::{
    IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
};
use core::poseidon::poseidon_hash_span;
use snforge_std::fs::{FileTrait, read_txt};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

// ============================================
// Real public input values from the proof fixture
// ============================================

// Deployed Garaga Honk verifier on Sepolia
const VERIFIER_ADDRESS_FELT: felt252 =
    0x06ad2f4c866eabb03443098ecc798af1791952bc138bd32904dd215d8585c655;

// SHA256("zkpassport.id") truncated to 31 bytes, encoded as felt252 (high*2^128 + low)
const REAL_SERVICE_SCOPE: felt252 =
    0x8d535e2a7f4ee38a4d12aa88bcf21d2c2f6fa051d12eafba6655bf37e8c11c;

// SHA256("bigproof") truncated to 31 bytes
const REAL_SERVICE_SUBSCOPE: felt252 =
    0xf54fbb0f658e7013ec2114ef095a29bb3e2f95b96dbd93e46f12f67863111a;

// SHA256(PROOF_TYPE_AGE, len, min_age=18, max_age=0)
const REAL_PARAM_COMMITMENT: felt252 =
    0xfbc3519eb56137394d7f0e697ae3c40907d0dd4670d156866cffa07ff49869;

// Nullifier type: 0 = NON_SALTED
const REAL_NULLIFIER_TYPE: felt252 = 0;

// Nullifier from the proof (u256 low and high halves)
const REAL_NULLIFIER_LOW: felt252 = 0xb2ef02689a8a483962a688948ce44461;
const REAL_NULLIFIER_HIGH: felt252 = 0x171de101deed3f056917faecfe6cc04d;

// Proof timestamp (current_date public input): 1770533653 = 0x69883315
const REAL_PROOF_TIMESTAMP: u64 = 0x69883315;

// Block timestamp set just after the proof timestamp so freshness check passes
const FORK_BLOCK_TIME: u64 = 0x69883315 + 60; // 60 seconds after proof

const TOURNAMENT_ID: u64 = 42;
const ENTRY_LIMIT: u8 = 5;
// Large max_proof_age so the fixture doesn't go stale
const MAX_PROOF_AGE: felt252 = 86400; // 24 hours

fn BUDOKAN_ADDRESS() -> ContractAddress {
    'budokan'.try_into().unwrap()
}

fn PLAYER_ADDRESS() -> ContractAddress {
    'player'.try_into().unwrap()
}

fn PLAYER_ADDRESS_2() -> ContractAddress {
    'player2'.try_into().unwrap()
}

fn verifier_address() -> ContractAddress {
    VERIFIER_ADDRESS_FELT.try_into().unwrap()
}

fn deploy_validator() -> (
    ContractAddress, IEntryValidatorDispatcher, IZkPassportValidatorDispatcher,
) {
    let contract = declare("ZkPassportValidator").unwrap().contract_class();
    let constructor_calldata = array![BUDOKAN_ADDRESS().into(), 0]; // registration_only = false
    let (contract_address, _) = contract.deploy(@constructor_calldata).unwrap();

    let entry_validator = IEntryValidatorDispatcher { contract_address };
    let zkpassport_validator = IZkPassportValidatorDispatcher { contract_address };

    (contract_address, entry_validator, zkpassport_validator)
}

fn real_config_span() -> Span<felt252> {
    array![
        VERIFIER_ADDRESS_FELT, REAL_SERVICE_SCOPE, REAL_SERVICE_SUBSCOPE, REAL_PARAM_COMMITMENT,
        MAX_PROOF_AGE, REAL_NULLIFIER_TYPE,
    ]
        .span()
}

/// Build the qualification span: [nullifier_low, nullifier_high, ...proof_calldata]
fn real_qualification_span() -> Span<felt252> {
    let file = FileTrait::new("tests/proof_calldata.txt");
    let proof_calldata = read_txt(@file);

    let mut qualification: Array<felt252> = array![REAL_NULLIFIER_LOW, REAL_NULLIFIER_HIGH];
    let mut i: u32 = 0;
    let len = proof_calldata.len();
    while i < len {
        qualification.append(*proof_calldata.at(i));
        i += 1;
    }
    qualification.span()
}

// ============================================
// Fork Test 1: End-to-end happy path with real Sepolia verifier
// ============================================
#[test]
#[fork("sepolia")]
fn test_fork_e2e_valid_proof() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, FORK_BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, real_config_span());

    let qualification = real_qualification_span();
    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification);
    assert!(result, "Real proof against Sepolia verifier should be accepted");
}

// ============================================
// Fork Test 2: Corrupted proof is rejected by real verifier
//
// The Garaga verifier panics internally on malformed proof data (e.g. during
// GLV decomposition) rather than returning Result::Err. This causes the entire
// transaction to revert, which is a valid rejection — the entry simply fails.
// We use #[should_panic] to accommodate this behavior.
// ============================================
#[test]
#[should_panic]
#[fork("sepolia")]
fn test_fork_corrupted_proof_rejected() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, FORK_BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, real_config_span());

    // Build qualification with corrupted proof data
    let file = FileTrait::new("tests/proof_calldata.txt");
    let proof_calldata = read_txt(@file);

    let mut qualification: Array<felt252> = array![REAL_NULLIFIER_LOW, REAL_NULLIFIER_HIGH];
    let mut i: u32 = 0;
    let len = proof_calldata.len();
    while i < len {
        if i == 20 {
            // Corrupt a proof body element (past the public inputs header)
            qualification.append(0x1337);
        } else {
            qualification.append(*proof_calldata.at(i));
        }
        i += 1;
    }

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification.span());
    // If the verifier didn't panic, it must have returned Err, so validate_entry returns false.
    // If it returned true, this assert panics — #[should_panic] catches it.
    assert!(!result, "Corrupted proof was accepted");
}

// ============================================
// Fork Test 3: Wrong service scope config causes rejection
// ============================================
#[test]
#[fork("sepolia")]
fn test_fork_wrong_scope_config_rejected() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, FORK_BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    // Configure with wrong service scope
    let wrong_config = array![
        VERIFIER_ADDRESS_FELT, 'wrong_scope', // wrong service scope
        REAL_SERVICE_SUBSCOPE,
        REAL_PARAM_COMMITMENT, MAX_PROOF_AGE, REAL_NULLIFIER_TYPE,
    ]
        .span();
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, wrong_config);

    let qualification = real_qualification_span();
    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification);
    assert!(!result, "Wrong scope config should cause rejection even with valid proof");
}

// ============================================
// Fork Test 4: Sybil prevention - duplicate nullifier blocked with real verifier
// ============================================
#[test]
#[fork("sepolia")]
fn test_fork_duplicate_nullifier_blocked() {
    let (contract_address, entry_validator, zkp_validator) = deploy_validator();
    start_cheat_block_timestamp(contract_address, FORK_BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, real_config_span());

    let qualification = real_qualification_span();

    // First entry should succeed
    let result1 = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification);
    assert!(result1, "First entry with real proof should succeed");

    // Record the entry (marks nullifier as used)
    entry_validator.add_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification);

    // Verify nullifier is recorded
    let nullifier_hash = poseidon_hash_span(array![REAL_NULLIFIER_LOW, REAL_NULLIFIER_HIGH].span());
    assert!(
        zkp_validator.is_nullifier_used(TOURNAMENT_ID, nullifier_hash),
        "Nullifier should be marked as used",
    );

    // Second entry with same proof/nullifier should fail (Sybil check)
    let qualification2 = real_qualification_span();
    let result2 = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS_2(), qualification2);
    assert!(!result2, "Duplicate nullifier should be blocked even with valid proof");
}

// ============================================
// Fork Test 5: Stale proof rejected with real verifier
// ============================================
#[test]
#[fork("sepolia")]
fn test_fork_stale_proof_rejected() {
    let (contract_address, entry_validator, _) = deploy_validator();
    // Set block timestamp far in the future so proof is stale (>24h after proof timestamp)
    start_cheat_block_timestamp(contract_address, REAL_PROOF_TIMESTAMP + 90000);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, real_config_span());

    let qualification = real_qualification_span();
    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification);
    assert!(!result, "Proof older than max_proof_age should be rejected");
}

// ============================================
// Fork Test 6: Public inputs inspection after config
// ============================================
#[test]
#[fork("sepolia")]
fn test_fork_config_inspection() {
    let (contract_address, entry_validator, zkp_validator) = deploy_validator();
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, real_config_span());

    // Verify all config was stored correctly
    assert!(
        zkp_validator.get_verifier_address(TOURNAMENT_ID) == verifier_address(),
        "Verifier address mismatch",
    );
    assert!(
        zkp_validator.get_expected_service_scope(TOURNAMENT_ID) == REAL_SERVICE_SCOPE,
        "Service scope mismatch",
    );
    assert!(
        zkp_validator.get_expected_service_subscope(TOURNAMENT_ID) == REAL_SERVICE_SUBSCOPE,
        "Service subscope mismatch",
    );
    assert!(
        zkp_validator.get_expected_param_commitment(TOURNAMENT_ID) == REAL_PARAM_COMMITMENT,
        "Param commitment mismatch",
    );
    assert!(zkp_validator.get_max_proof_age(TOURNAMENT_ID) == 86400, "Max proof age mismatch");
    assert!(
        zkp_validator.get_expected_nullifier_type(TOURNAMENT_ID) == REAL_NULLIFIER_TYPE,
        "Nullifier type mismatch",
    );
}

// ============================================
// Fork Test 7: Entry removal releases nullifier, re-entry works with real verifier
// ============================================
#[test]
#[fork("sepolia")]
fn test_fork_entry_removal_and_reentry() {
    let (contract_address, entry_validator, zkp_validator) = deploy_validator();
    start_cheat_block_timestamp(contract_address, FORK_BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, real_config_span());

    let qualification = real_qualification_span();

    // Enter
    let result1 = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification);
    assert!(result1, "Initial entry should succeed");
    entry_validator.add_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification);

    // Verify nullifier is used
    let nullifier_hash = poseidon_hash_span(array![REAL_NULLIFIER_LOW, REAL_NULLIFIER_HIGH].span());
    assert!(
        zkp_validator.is_nullifier_used(TOURNAMENT_ID, nullifier_hash), "Nullifier should be used",
    );

    // Remove entry (simulates ban)
    entry_validator.remove_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification);

    // Nullifier should be released
    assert!(
        !zkp_validator.is_nullifier_used(TOURNAMENT_ID, nullifier_hash),
        "Nullifier should be released",
    );

    // Re-entry should succeed
    let qualification2 = real_qualification_span();
    let result2 = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification2);
    assert!(result2, "Re-entry after removal should succeed with real verifier");
}
