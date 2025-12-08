use budokan_interfaces::entry_validator::{
    IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address, start_mock_call,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Mock budokan/tournament address used across tests
fn budokan_address() -> ContractAddress {
    0x1234.try_into().unwrap()
}

fn deploy_governance_validator() -> ContractAddress {
    let contract = declare("governance_validator_mock").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![budokan_address().into()]).unwrap();
    contract_address
}

fn configure_governance_validator(
    validator_address: ContractAddress,
    tournament_id: u64,
    entry_limit: u8,
    governor_address: ContractAddress,
    governance_token_address: ContractAddress,
    balance_threshold: u256,
    proposal_id: felt252,
    check_voted: bool,
    votes_threshold: u256,
    votes_per_entry: u256,
) {
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let config = array![
        governor_address.into(), governance_token_address.into(), balance_threshold.low.into(),
        proposal_id, if check_voted {
            1
        } else {
            0
        }, votes_threshold.low.into(),
        votes_per_entry.low.into(),
    ];
    // Set caller to budokan address to pass assert_only_budokan check
    start_cheat_caller_address(validator_address, budokan_address());
    validator.add_config(tournament_id, entry_limit, config.span());
    stop_cheat_caller_address(validator_address);
}

// Helper function to create mock addresses
fn mock_address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

// ========================================
// Basic Validation Tests
// ========================================

#[test]
fn test_valid_entry_with_balance_above_threshold() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    // Configure validator with balance threshold of 1000, no voting check
    configure_governance_validator(
        validator_address,
        tournament_id,
        0, // entry_limit
        governor,
        governance_token,
        1000, // balance_threshold
        0, // proposal_id
        false, // check_voted
        0, // votes_threshold
        0 // votes_per_entry
    );

    // Mock the ERC20 balance_of call to return 1500 (above threshold)
    let balance_selector = selector!("balance_of");
    start_mock_call(governance_token, balance_selector, 1500_u256);

    // Mock the delegates call to return non-zero address (has delegated)
    let delegate: ContractAddress = mock_address(0x456);
    let delegates_selector = selector!("delegates");
    start_mock_call(governance_token, delegates_selector, delegate);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(can_enter, 'Should enter with high balance');
}

#[test]
fn test_invalid_entry_with_balance_below_threshold_no_delegate() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    // Configure validator with balance threshold of 1000, no voting check
    configure_governance_validator(
        validator_address,
        tournament_id,
        0,
        governor,
        governance_token,
        1000, // balance_threshold
        0,
        false,
        0,
        0,
    );

    // Mock the ERC20 balance_of call to return 500 (below threshold)
    let balance_selector = selector!("balance_of");
    start_mock_call(governance_token, balance_selector, 500_u256);

    // Mock the delegates call to return zero address (no delegation)
    let delegates_selector = selector!("delegates");
    start_mock_call(governance_token, delegates_selector, 0);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(!can_enter, 'Should reject low balance');
}

#[test]
fn test_valid_entry_with_delegation() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let delegate: ContractAddress = mock_address(0x456);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    // Configure validator with balance threshold of 1000, no voting check
    configure_governance_validator(
        validator_address, tournament_id, 0, governor, governance_token, 1000, 0, false, 0, 0,
    );

    // Mock the ERC20 balance_of call to return 1500 (above threshold)
    let balance_selector = selector!("balance_of");
    start_mock_call(governance_token, balance_selector, 1500_u256);

    // Mock the delegates call to return non-zero address (has delegation)
    let delegates_selector = selector!("delegates");
    start_mock_call(governance_token, delegates_selector, delegate);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(can_enter, 'Should enter with delegation');
}

// ========================================
// Voting Requirement Tests
// ========================================

#[test]
fn test_valid_entry_with_voting_requirement_met() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);
    let proposal_id: felt252 = 12345;

    // Configure validator with voting requirements
    configure_governance_validator(
        validator_address,
        tournament_id,
        0,
        governor,
        governance_token,
        1000, // balance_threshold
        proposal_id,
        true, // check_voted = true
        500, // votes_threshold
        0,
    );

    // Mock balance check
    let balance_selector = selector!("balance_of");
    start_mock_call(governance_token, balance_selector, 1500_u256);

    // Mock delegates (has delegated)
    let delegate: ContractAddress = mock_address(0x456);
    let delegates_selector = selector!("delegates");
    start_mock_call(governance_token, delegates_selector, delegate);

    // Mock has_voted to return true
    let has_voted_selector = selector!("has_voted");
    start_mock_call(governor, has_voted_selector, true);

    // Mock proposal_snapshot
    let snapshot_selector = selector!("proposal_snapshot");
    start_mock_call(governor, snapshot_selector, 100_u256);

    // Mock get_votes to return 600 (above threshold)
    let get_votes_selector = selector!("get_votes");
    start_mock_call(governor, get_votes_selector, 600_u256);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(can_enter, 'Should enter: voted & votes ok');
}

#[test]
fn test_invalid_entry_has_not_voted() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);
    let proposal_id: felt252 = 12345;

    // Configure validator with voting requirements
    configure_governance_validator(
        validator_address,
        tournament_id,
        0,
        governor,
        governance_token,
        1000,
        proposal_id,
        true, // check_voted = true
        500,
        0,
    );

    // Mock balance check
    start_mock_call(governance_token, selector!("balance_of"), 1500_u256);

    // Mock delegates (no delegation)
    start_mock_call(governance_token, selector!("delegates"), 0);

    // Mock has_voted to return false
    start_mock_call(governor, selector!("has_voted"), false);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(!can_enter, 'Should reject: has not voted');
}

#[test]
fn test_invalid_entry_votes_below_threshold() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);
    let proposal_id: felt252 = 12345;

    // Configure validator with voting requirements
    configure_governance_validator(
        validator_address,
        tournament_id,
        0,
        governor,
        governance_token,
        1000,
        proposal_id,
        true, // check_voted = true
        500, // votes_threshold
        0,
    );

    // Mock balance check
    start_mock_call(governance_token, selector!("balance_of"), 1500_u256);

    // Mock delegates (no delegation)
    start_mock_call(governance_token, selector!("delegates"), 0);

    // Mock has_voted to return true
    start_mock_call(governor, selector!("has_voted"), true);

    // Mock proposal_snapshot
    start_mock_call(governor, selector!("proposal_snapshot"), 100_u256);

    // Mock get_votes to return 400 (below threshold of 500)
    start_mock_call(governor, selector!("get_votes"), 400_u256);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(!can_enter, 'Should reject: votes too low');
}

// ========================================
// Entries Left Tests
// ========================================

#[test]
fn test_entries_left_unlimited() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    // Configure validator with entry_limit = 0 (unlimited) and votes_per_entry = 0
    configure_governance_validator(
        validator_address,
        tournament_id,
        0, // entry_limit = 0 means unlimited
        governor,
        governance_token,
        1000,
        0,
        false,
        0,
        0 // votes_per_entry = 0
    );

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let entries_left = validator.entries_left(tournament_id, player, array![].span());

    assert(entries_left.is_none(), 'Should be unlimited entries');
}

#[test]
fn test_entries_left_based_on_votes() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);
    let proposal_id: felt252 = 12345;

    // Configure validator with votes_per_entry = 1000
    // balance_threshold = 1000, so (vote_count - balance_threshold) / votes_per_entry
    configure_governance_validator(
        validator_address,
        tournament_id,
        0,
        governor,
        governance_token,
        1000, // balance_threshold
        proposal_id,
        false,
        0,
        1000 // votes_per_entry
    );

    // Mock proposal_snapshot
    start_mock_call(governor, selector!("proposal_snapshot"), 100_u256);

    // Mock get_votes to return 5000
    // (5000 - 1000) / 1000 = 4 total entries
    start_mock_call(governor, selector!("get_votes"), 5000_u256);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // First call - should have 4 entries left
    let entries_left = validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.is_some(), 'Should have entries');
    assert(entries_left.unwrap() == 4, 'Should have 4 entries left');
}

#[test]
fn test_entries_left_with_fixed_limit() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    // Configure validator with fixed entry_limit = 3 and votes_per_entry = 0
    configure_governance_validator(
        validator_address,
        tournament_id,
        3, // entry_limit = 3
        governor,
        governance_token,
        1000,
        0,
        false,
        0,
        0 // votes_per_entry = 0
    );

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Should have 3 entries left initially
    let entries_left = validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.is_some(), 'Should have entries');
    assert(entries_left.unwrap() == 3, 'Should have 3 entries left');

    // Simulate one entry used
    start_cheat_caller_address(validator_address, budokan_address());
    validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Should have 2 entries left
    let entries_left = validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.unwrap() == 2, 'Should have 2 entries left');

    // Simulate another entry used
    start_cheat_caller_address(validator_address, budokan_address());
    validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Should have 1 entry left
    let entries_left = validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.unwrap() == 1, 'Should have 1 entry left');
}

// ========================================
// Multiple Tournament Tests
// ========================================

#[test]
fn test_multiple_tournaments_independent_configs() {
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    // Configure tournament 1 with threshold 1000
    configure_governance_validator(
        validator_address, 1, 0, governor, governance_token, 1000, 0, false, 0, 0,
    );

    // Configure tournament 2 with threshold 2000
    configure_governance_validator(
        validator_address, 2, 0, governor, governance_token, 2000, 0, false, 0, 0,
    );

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Mock balance of 1500 (above tournament 1 threshold, below tournament 2)
    start_mock_call(governance_token, selector!("balance_of"), 1500_u256);
    // Mock delegation
    let delegate: ContractAddress = mock_address(0x456);
    start_mock_call(governance_token, selector!("delegates"), delegate);

    // Should pass tournament 1
    let can_enter_t1 = validator.valid_entry(1, player, array![].span());
    assert(can_enter_t1, 'Should enter tournament 1');

    // Should fail tournament 2
    let can_enter_t2 = validator.valid_entry(2, player, array![].span());
    assert(!can_enter_t2, 'Should not enter tournament 2');
}

// ========================================
// Edge Cases
// ========================================

#[test]
fn test_zero_balance_with_delegation() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let delegate: ContractAddress = mock_address(0x456);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    configure_governance_validator(
        validator_address, tournament_id, 0, governor, governance_token, 1000, 0, false, 0, 0,
    );

    // Mock zero balance (below threshold of 1000)
    start_mock_call(governance_token, selector!("balance_of"), 0_u256);

    // Mock with delegation
    start_mock_call(governance_token, selector!("delegates"), delegate);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    // Should fail because balance is below threshold, even with delegation
    assert(!can_enter, 'Zero bal should fail');
}

#[test]
fn test_exact_threshold_balance() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    configure_governance_validator(
        validator_address, tournament_id, 0, governor, governance_token, 1000, 0, false, 0, 0,
    );

    // Mock balance exactly at threshold
    start_mock_call(governance_token, selector!("balance_of"), 1000_u256);
    start_mock_call(governance_token, selector!("delegates"), 0);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(!can_enter, 'Exact threshold should fail');
}

#[test]
fn test_just_above_threshold_balance() {
    let tournament_id: u64 = 1;
    let validator_address = deploy_governance_validator();
    let player: ContractAddress = mock_address(0x123);
    let governance_token: ContractAddress = mock_address(0x999);
    let governor: ContractAddress = mock_address(0x888);

    configure_governance_validator(
        validator_address, tournament_id, 0, governor, governance_token, 1000, 0, false, 0, 0,
    );

    // Mock balance just above threshold
    start_mock_call(governance_token, selector!("balance_of"), 1001_u256);
    // Mock delegation
    let delegate: ContractAddress = mock_address(0x456);
    start_mock_call(governance_token, selector!("delegates"), delegate);

    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let can_enter = validator.valid_entry(tournament_id, player, array![].span());

    assert(can_enter, 'Just above threshold passes');
}
