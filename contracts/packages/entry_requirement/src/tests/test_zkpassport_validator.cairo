use budokan_entry_requirement::examples::zkpassport_validator::{
    IZkPassportValidatorDispatcher, IZkPassportValidatorDispatcherTrait,
};
use budokan_interfaces::entry_validator::{IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait};
use core::poseidon::poseidon_hash_span;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, start_mock_call,
};
use starknet::ContractAddress;

// Test constants
const TOURNAMENT_ID: u64 = 1;
const TOURNAMENT_ID_2: u64 = 2;
const ENTRY_LIMIT: u8 = 3;
const SERVICE_SCOPE: felt252 = 'zkpassport_scope';
const SERVICE_SUBSCOPE: felt252 = 'bigproof_subscope';
const PARAM_COMMITMENT: felt252 = 'age_commitment';
const MAX_PROOF_AGE: felt252 = 3600; // 1 hour
const NULLIFIER_TYPE: felt252 = 0; // NON_SALTED
const NULLIFIER_LOW: felt252 = 0x1234;
const NULLIFIER_HIGH: felt252 = 0x5678;
const BLOCK_TIME: u64 = 1000000;
const PROOF_TIME: u64 = 999900; // 100 seconds before block time

fn BUDOKAN_ADDRESS() -> ContractAddress {
    'budokan'.try_into().unwrap()
}

fn VERIFIER_ADDRESS() -> ContractAddress {
    'verifier'.try_into().unwrap()
}

fn PLAYER_ADDRESS() -> ContractAddress {
    'player'.try_into().unwrap()
}

fn PLAYER_ADDRESS_2() -> ContractAddress {
    'player2'.try_into().unwrap()
}

fn deploy_validator() -> (ContractAddress, IEntryValidatorDispatcher, IZkPassportValidatorDispatcher) {
    let contract = declare("ZkPassportValidator").unwrap().contract_class();
    let constructor_calldata = array![BUDOKAN_ADDRESS().into(), 0]; // registration_only = false
    let (contract_address, _) = contract.deploy(@constructor_calldata).unwrap();

    let entry_validator = IEntryValidatorDispatcher { contract_address };
    let zkpassport_validator = IZkPassportValidatorDispatcher { contract_address };

    (contract_address, entry_validator, zkpassport_validator)
}

fn config_span() -> Span<felt252> {
    array![
        VERIFIER_ADDRESS().into(),
        SERVICE_SCOPE,
        SERVICE_SUBSCOPE,
        PARAM_COMMITMENT,
        MAX_PROOF_AGE,
        NULLIFIER_TYPE,
    ]
        .span()
}

fn mock_public_inputs() -> Array<u256> {
    // public_inputs[0]: comm_in (unused in validation, arbitrary)
    // public_inputs[1]: current_date (proof timestamp)
    // public_inputs[2]: service_scope
    // public_inputs[3]: service_subscope
    // public_inputs[4]: param_commitment
    // public_inputs[5]: nullifier_type
    // public_inputs[6]: nullifier
    let nullifier = u256 {
        low: NULLIFIER_LOW.try_into().unwrap(), high: NULLIFIER_HIGH.try_into().unwrap(),
    };
    array![
        0_u256,
        PROOF_TIME.into(),
        SERVICE_SCOPE.into(),
        SERVICE_SUBSCOPE.into(),
        PARAM_COMMITMENT.into(),
        NULLIFIER_TYPE.into(),
        nullifier,
    ]
}

fn qualification_span() -> Span<felt252> {
    // qualification[0]: nullifier_low
    // qualification[1]: nullifier_high
    // qualification[2..]: proof data (dummy)
    array![NULLIFIER_LOW, NULLIFIER_HIGH, 'proof_data_1', 'proof_data_2'].span()
}

fn setup_valid_scenario(
    contract_address: ContractAddress,
    entry_validator: IEntryValidatorDispatcher,
) {
    // Cheat block timestamp
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);

    // Cheat caller to budokan for config
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    // Add config
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    // Mock the verifier call to return Ok(public_inputs)
    let inputs = mock_public_inputs();
    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(inputs),
    );
}

// ============================================
// Test 1: Happy path - valid proof
// ============================================
#[test]
fn test_happy_path_valid_proof() {
    let (contract_address, entry_validator, _) = deploy_validator();
    setup_valid_scenario(contract_address, entry_validator);

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(result, "Valid proof should be accepted");
}

// ============================================
// Test 2: Proof verification fails
// ============================================
#[test]
fn test_proof_verification_fails() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    // Mock verifier to return Err
    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Err('proof_invalid'),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Failed proof should be rejected");
}

// ============================================
// Test 3: Service scope mismatch
// ============================================
#[test]
fn test_scope_mismatch() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    let mut inputs = mock_public_inputs();
    // Tamper with service scope
    let mut tampered: Array<u256> = array![];
    tampered.append(*inputs.at(0));
    tampered.append(*inputs.at(1));
    tampered.append(0xBAD_u256); // wrong scope
    tampered.append(*inputs.at(3));
    tampered.append(*inputs.at(4));
    tampered.append(*inputs.at(5));
    tampered.append(*inputs.at(6));

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(tampered),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Scope mismatch should be rejected");
}

// ============================================
// Test 4: Service subscope mismatch
// ============================================
#[test]
fn test_subscope_mismatch() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    let inputs = mock_public_inputs();
    let mut tampered: Array<u256> = array![];
    tampered.append(*inputs.at(0));
    tampered.append(*inputs.at(1));
    tampered.append(*inputs.at(2));
    tampered.append(0xBAD_u256); // wrong subscope
    tampered.append(*inputs.at(4));
    tampered.append(*inputs.at(5));
    tampered.append(*inputs.at(6));

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(tampered),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Subscope mismatch should be rejected");
}

// ============================================
// Test 5: Param commitment mismatch
// ============================================
#[test]
fn test_param_commitment_mismatch() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    let inputs = mock_public_inputs();
    let mut tampered: Array<u256> = array![];
    tampered.append(*inputs.at(0));
    tampered.append(*inputs.at(1));
    tampered.append(*inputs.at(2));
    tampered.append(*inputs.at(3));
    tampered.append(0xBAD_u256); // wrong param commitment
    tampered.append(*inputs.at(5));
    tampered.append(*inputs.at(6));

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(tampered),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Param commitment mismatch should be rejected");
}

// ============================================
// Test 6: Nullifier type mismatch
// ============================================
#[test]
fn test_nullifier_type_mismatch() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    let inputs = mock_public_inputs();
    let mut tampered: Array<u256> = array![];
    tampered.append(*inputs.at(0));
    tampered.append(*inputs.at(1));
    tampered.append(*inputs.at(2));
    tampered.append(*inputs.at(3));
    tampered.append(*inputs.at(4));
    tampered.append(99_u256); // wrong nullifier type
    tampered.append(*inputs.at(6));

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(tampered),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Nullifier type mismatch should be rejected");
}

// ============================================
// Test 7: Nullifier consistency - claimed != proof
// ============================================
#[test]
fn test_nullifier_consistency_mismatch() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    let inputs = mock_public_inputs();
    let mut tampered: Array<u256> = array![];
    tampered.append(*inputs.at(0));
    tampered.append(*inputs.at(1));
    tampered.append(*inputs.at(2));
    tampered.append(*inputs.at(3));
    tampered.append(*inputs.at(4));
    tampered.append(*inputs.at(5));
    tampered.append(u256 { low: 0xDEAD, high: 0xBEEF }); // different nullifier

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(tampered),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Nullifier mismatch should be rejected");
}

// ============================================
// Test 8: Stale proof (too old)
// ============================================
#[test]
fn test_stale_proof() {
    let (contract_address, entry_validator, _) = deploy_validator();
    // Set block timestamp far in the future so proof is stale
    start_cheat_block_timestamp(contract_address, BLOCK_TIME + 7200); // 2 hours later
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(mock_public_inputs()),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Stale proof should be rejected");
}

// ============================================
// Test 9: Future proof (timestamp ahead of block)
// ============================================
#[test]
fn test_future_proof() {
    let (contract_address, entry_validator, _) = deploy_validator();
    // Set block timestamp before the proof timestamp
    start_cheat_block_timestamp(contract_address, PROOF_TIME - 100);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(mock_public_inputs()),
    );

    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "Future proof should be rejected");
}

// ============================================
// Test 10: Duplicate nullifier (same tournament)
// ============================================
#[test]
fn test_duplicate_nullifier_same_tournament() {
    let (contract_address, entry_validator, _) = deploy_validator();
    setup_valid_scenario(contract_address, entry_validator);

    // First entry should succeed
    let result = entry_validator.valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(result, "First entry should be valid");

    // Record the entry
    entry_validator
        .add_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification_span());

    // Re-mock the verifier (start_mock_call persists but let's be explicit)
    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(mock_public_inputs()),
    );

    // Second entry with same nullifier should fail
    let result2 = entry_validator
        .valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS_2(), qualification_span());
    assert!(!result2, "Duplicate nullifier should be rejected");
}

// ============================================
// Test 11: Cross-tournament - same nullifier, different tournaments
// ============================================
#[test]
fn test_cross_tournament_same_nullifier() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_block_timestamp(contract_address, BLOCK_TIME);
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    // Configure both tournaments
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());
    entry_validator.add_config(TOURNAMENT_ID_2, ENTRY_LIMIT, config_span());

    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(mock_public_inputs()),
    );

    // Enter tournament 1
    let result1 = entry_validator
        .valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(result1, "Tournament 1 entry should be valid");

    entry_validator
        .add_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification_span());

    // Re-mock
    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(mock_public_inputs()),
    );

    // Enter tournament 2 with same nullifier should succeed
    let result2 = entry_validator
        .valid_entry(TOURNAMENT_ID_2, PLAYER_ADDRESS(), qualification_span());
    assert!(result2, "Same nullifier in different tournament should be valid");
}

// ============================================
// Test 12: Entry removal releases nullifier for re-entry
// ============================================
#[test]
fn test_entry_removal_releases_nullifier() {
    let (contract_address, entry_validator, zkp_validator) = deploy_validator();
    setup_valid_scenario(contract_address, entry_validator);

    // First entry
    let result1 = entry_validator
        .valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(result1, "First entry should be valid");
    entry_validator
        .add_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification_span());

    // Nullifier should be used
    let nullifier_hash = poseidon_hash_span(array![NULLIFIER_LOW, NULLIFIER_HIGH].span());
    assert!(zkp_validator.is_nullifier_used(TOURNAMENT_ID, nullifier_hash), "Nullifier should be used");

    // Remove entry (ban)
    entry_validator
        .remove_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification_span());

    // Nullifier should be released
    assert!(
        !zkp_validator.is_nullifier_used(TOURNAMENT_ID, nullifier_hash),
        "Nullifier should be released after removal",
    );

    // Re-mock verifier
    start_mock_call(
        VERIFIER_ADDRESS(),
        selector!("verify_ultra_keccak_zk_honk_proof"),
        Result::<Array<u256>, felt252>::Ok(mock_public_inputs()),
    );

    // Re-entry should now work
    let result2 = entry_validator
        .valid_entry(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(result2, "Re-entry after removal should be valid");
}

// ============================================
// Test 13: Config validation - wrong config length
// ============================================
#[test]
#[should_panic(expected: "ZkPassportValidator: config must have at least 6 elements")]
fn test_config_wrong_length() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, array!['too', 'few'].span());
}

// ============================================
// Test 13b: Config with >6 elements succeeds (extended config)
// ============================================
#[test]
fn test_config_extended_elements() {
    let (contract_address, entry_validator, zkp_validator) = deploy_validator();
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    // Config with extra elements (e.g. serialized query config)
    let extended_config = array![
        VERIFIER_ADDRESS().into(),
        SERVICE_SCOPE,
        SERVICE_SUBSCOPE,
        PARAM_COMMITMENT,
        MAX_PROOF_AGE,
        NULLIFIER_TYPE,
        42, // byte length
        'chunk1',
        'chunk2',
    ]
        .span();

    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, extended_config);

    // Core config should be stored correctly
    assert!(
        zkp_validator.get_verifier_address(TOURNAMENT_ID) == VERIFIER_ADDRESS(),
        "Verifier address should be set",
    );
    assert!(
        zkp_validator.get_expected_service_scope(TOURNAMENT_ID) == SERVICE_SCOPE,
        "Service scope should be set",
    );
    assert!(
        zkp_validator.get_expected_param_commitment(TOURNAMENT_ID) == PARAM_COMMITMENT,
        "Param commitment should be set",
    );
}

// ============================================
// Test 14: Config validation - zero verifier address
// ============================================
#[test]
#[should_panic(expected: "ZkPassportValidator: verifier address cannot be zero")]
fn test_config_zero_verifier_address() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator
        .add_config(
            TOURNAMENT_ID,
            ENTRY_LIMIT,
            array![
                0, // zero verifier address
                SERVICE_SCOPE,
                SERVICE_SUBSCOPE,
                PARAM_COMMITMENT,
                MAX_PROOF_AGE,
                NULLIFIER_TYPE,
            ]
                .span(),
        );
}

// ============================================
// Test 15: should_ban always returns false
// ============================================
#[test]
fn test_should_ban_always_false() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());

    let result = entry_validator
        .should_ban(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification_span());
    assert!(!result, "should_ban should always return false");
}

// ============================================
// Test 16: entries_left tracks correctly with entry_limit
// ============================================
#[test]
fn test_entries_left_tracking() {
    let (contract_address, entry_validator, _) = deploy_validator();
    start_cheat_caller_address(contract_address, BUDOKAN_ADDRESS());
    entry_validator.add_config(TOURNAMENT_ID, ENTRY_LIMIT, config_span());

    // Initially should have full entries left
    let left = entry_validator
        .entries_left(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(left == Option::Some(ENTRY_LIMIT), "Should start with full entries");

    // After adding one entry
    entry_validator
        .add_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification_span());
    let left2 = entry_validator
        .entries_left(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(left2 == Option::Some(ENTRY_LIMIT - 1), "Should have one less entry");

    // After removing entry
    entry_validator
        .remove_entry(TOURNAMENT_ID, 1, PLAYER_ADDRESS(), qualification_span());
    let left3 = entry_validator
        .entries_left(TOURNAMENT_ID, PLAYER_ADDRESS(), qualification_span());
    assert!(left3 == Option::Some(ENTRY_LIMIT), "Should restore entry after removal");
}
