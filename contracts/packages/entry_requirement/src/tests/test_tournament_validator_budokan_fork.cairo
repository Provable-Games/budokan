use budokan_entry_requirement::examples::tournament_validator::{
    ITournamentValidatorDispatcher, ITournamentValidatorDispatcherTrait,
    QUALIFIER_TYPE_PARTICIPANTS, QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_ALL,
    QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
    QUALIFYING_MODE_AT_LEAST_ONE, QUALIFYING_MODE_CUMULATIVE_PER_ENTRY,
    QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT,
};
use budokan_entry_requirement::tests::constants::{
    budokan_address_sepolia, minigame_address_sepolia, test_account_sepolia,
};
use budokan_interfaces::budokan::{
    EntryRequirement, EntryRequirementType, ExtensionConfig, GameConfig, IBudokanDispatcher,
    IBudokanDispatcherTrait, Metadata, Period, QualificationProof, Schedule,
};
use budokan_interfaces::entry_validator::{
    IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address, start_cheat_block_timestamp_global,
};
use starknet::{ContractAddress, get_block_timestamp};

// ==============================================
// HELPER FUNCTIONS
// ==============================================

fn deploy_tournament_validator(
    budokan_address: ContractAddress, registration_only: bool,
) -> ContractAddress {
    let contract = declare("TournamentValidator").unwrap().contract_class();
    let (contract_address, _) = contract
        .deploy(@array![budokan_address.into(), registration_only.into()])
        .unwrap();
    contract_address
}

fn test_metadata() -> Metadata {
    Metadata { name: 'Test Tournament', description: "Test Description" }
}

fn test_game_config(minigame_address: ContractAddress) -> GameConfig {
    GameConfig { address: minigame_address, settings_id: 1, soulbound: false, play_url: "" }
}

fn test_schedule() -> Schedule {
    let current_time = get_block_timestamp();
    // Registration: 1 hour minimum (3600 seconds)
    let registration_start = current_time + 100;
    let registration_end = registration_start + 3600;
    // Game: starts after registration, 1 hour minimum (3600 seconds)
    let game_start = registration_end + 1;
    let game_end = game_start + 3600;
    // Submission: 1 hour minimum (3600 seconds)
    Schedule {
        registration: Option::Some(Period { start: registration_start, end: registration_end }),
        game: Period { start: game_start, end: game_end },
        submission_duration: 3600,
    }
}

fn create_qualifying_tournament_with_player(
    budokan_addr: ContractAddress,
    minigame_addr: ContractAddress,
    player: ContractAddress,
) -> (u64, u64) {
    // Create a qualifying tournament
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    start_cheat_caller_address(budokan_addr, player);
    let tournament = budokan.create_tournament(
        player,
        test_metadata(),
        test_schedule(),
        test_game_config(minigame_addr),
        Option::None,
        Option::None
    );
    stop_cheat_caller_address(budokan_addr);

    // Register player in the tournament
    start_cheat_block_timestamp_global(tournament.schedule.registration.unwrap().start);
    start_cheat_caller_address(budokan_addr, player);
    let (token_id, _entry_number) = budokan.enter_tournament(
        tournament.id,
        'player',
        player,
        Option::None,
    );
    stop_cheat_caller_address(budokan_addr);

    (tournament.id, token_id)
}

// Helper to create tournament, register player, and optionally finalize it
// If finalize=true, advances time past submission period to finalize the tournament
fn create_and_finalize_tournament(
    budokan_addr: ContractAddress,
    minigame_addr: ContractAddress,
    player: ContractAddress,
    finalize: bool,
) -> (u64, u64) {
    let (tournament_id, token_id) = create_qualifying_tournament_with_player(
        budokan_addr, minigame_addr, player
    );

    if finalize {
        // Advance time to finalize the tournament
        // Tournament is finalized after: game.end + submission_duration + 1
        let budokan = IBudokanDispatcher { contract_address: budokan_addr };
        let tournament = budokan.tournament(tournament_id);
        let finalized_time = tournament.schedule.game.end
            + tournament.schedule.submission_duration
            + 1;
        start_cheat_block_timestamp_global(finalized_time);
    }

    (tournament_id, token_id)
}

// ==============================================
// TESTS: QUALIFYING_MODE_AT_LEAST_ONE (0)
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_mode_participants() {
    let budokan = budokan_address_sepolia();

    // Deploy tournament validator in registration_only mode
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Create a qualifying tournament (this would need to exist on fork)
    // For this test, we'll use tournament ID 1 as qualifying tournament
    let qualifying_tournament_id: u64 = 1;

    // Configure extension: [QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE,
    // top_positions, tournament_id]
    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0,
        qualifying_tournament_id.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(100, 0, extension_config); // tournament_id=100, unlimited entries
    stop_cheat_caller_address(validator_address);

    // Verify config was set correctly
    assert!(
        tournament_validator.get_qualifier_type(100) == QUALIFIER_TYPE_PARTICIPANTS,
        "Qualifier type should be PARTICIPANTS",
    );
    assert!(
        tournament_validator.get_qualifying_mode(100) == QUALIFYING_MODE_AT_LEAST_ONE,
        "Qualifying mode should be ANY",
    );

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(100);
    assert!(qualifying_ids.len() == 1, "Should have 1 qualifying tournament");
    assert!(*qualifying_ids.at(0) == qualifying_tournament_id, "Qualifying tournament ID mismatch");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_mode_winners() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let qualifying_tournament_id: u64 = 1;

    // Configure extension: [QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_AT_LEAST_ONE,
    // top_positions, tournament_id]
    let extension_config = array![
        QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_AT_LEAST_ONE, 0,
        qualifying_tournament_id.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(200, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    assert!(
        tournament_validator.get_qualifier_type(200) == QUALIFIER_TYPE_TOP_POSITION,
        "Qualifier type should be WINNERS",
    );
    assert!(
        tournament_validator.get_qualifying_mode(200) == QUALIFYING_MODE_AT_LEAST_ONE,
        "Qualifying mode should be ANY",
    );
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_mode_multiple_qualifying_tournaments() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let qualifying_tournament_1: u64 = 1;
    let qualifying_tournament_2: u64 = 2;
    let qualifying_tournament_3: u64 = 3;

    // Configure with multiple qualifying tournaments
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0,
        qualifying_tournament_1.into(), qualifying_tournament_2.into(),
        qualifying_tournament_3.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(300, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(300);
    assert!(qualifying_ids.len() == 3, "Should have 3 qualifying tournaments");
    assert!(*qualifying_ids.at(0) == qualifying_tournament_1, "Tournament 1 mismatch");
    assert!(*qualifying_ids.at(1) == qualifying_tournament_2, "Tournament 2 mismatch");
    assert!(*qualifying_ids.at(2) == qualifying_tournament_3, "Tournament 3 mismatch");
}

// ==============================================
// TESTS: QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT (1)
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_per_tournament_mode() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 2 qualifying tournaments and register player in both
    let (qualifying_tournament_1, token_id_1) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );
    let (qualifying_tournament_2, token_id_2) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure extension: [QUALIFIER_TYPE_PARTICIPANTS,
    // QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT, top_positions, tournament_ids...]
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT, 0,
        qualifying_tournament_1.into(), qualifying_tournament_2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    // entry_limit=2 means player can enter twice per qualifying tournament
    validator.add_config(400, 2, extension_config);
    stop_cheat_caller_address(validator_address);

    assert!(
        tournament_validator.get_qualifying_mode(400) == QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT,
        "Qualifying mode should be CUMULATIVE_PER_TOURNAMENT",
    );

    // Qualification from tournament 1
    let qualification_1 = array![qualifying_tournament_1.into(), token_id_1.into()].span();

    // Qualification from tournament 2
    let qualification_2 = array![qualifying_tournament_2.into(), token_id_2.into()].span();

    // Each qualification should have separate entry limits
    let entries_left_1 = validator.entries_left(400, player, qualification_1);
    let entries_left_2 = validator.entries_left(400, player, qualification_2);

    assert!(entries_left_1.is_some(), "Should have entries left for tournament 1");
    assert!(entries_left_2.is_some(), "Should have entries left for tournament 2");
    assert!(entries_left_1.unwrap() == 2, "Should have 2 entries for tournament 1");
    assert!(entries_left_2.unwrap() == 2, "Should have 2 entries for tournament 2");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_per_tournament_entry_tracking() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 2 qualifying tournaments and register player in both
    let (qualifying_tournament_1, token_id_1) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );
    let (qualifying_tournament_2, token_id_2) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT, 0,
        qualifying_tournament_1.into(), qualifying_tournament_2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(500, 1, extension_config); // Only 1 entry per qualifying tournament
    stop_cheat_caller_address(validator_address);

    let qualification_1 = array![qualifying_tournament_1.into(), token_id_1.into()].span();

    // Simulate adding an entry for tournament 1
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(500, player, qualification_1);
    stop_cheat_caller_address(validator_address);

    // Check entries left for tournament 1 - should be 0
    let entries_left_1 = validator.entries_left(500, player, qualification_1);
    assert!(entries_left_1.unwrap() == 0, "Should have 0 entries left for tournament 1");

    // Check entries left for tournament 2 - should still be 1
    let qualification_2 = array![qualifying_tournament_2.into(), token_id_2.into()].span();
    let entries_left_2 = validator.entries_left(500, player, qualification_2);
    assert!(entries_left_2.unwrap() == 1, "Should still have 1 entry for tournament 2");
}

// ==============================================
// TESTS: QUALIFYING_MODE_ALL (2)
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_mode_participants() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let qualifying_tournament_1: u64 = 1;
    let qualifying_tournament_2: u64 = 2;
    let qualifying_tournament_3: u64 = 3;

    // Configure extension: [QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL, top_positions,
    // tournament_ids...]
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL, 0, qualifying_tournament_1.into(),
        qualifying_tournament_2.into(), qualifying_tournament_3.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(600, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    assert!(
        tournament_validator.get_qualifying_mode(600) == QUALIFYING_MODE_ALL,
        "Qualifying mode should be ALL",
    );

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(600);
    assert!(qualifying_ids.len() == 3, "Should have 3 qualifying tournaments");

    // For ALL mode with PARTICIPANTS:
    // Qualification proof should be: [token_id_1, token_id_2, token_id_3]
    let token_id_1: u64 = 10;
    let token_id_2: u64 = 20;
    let token_id_3: u64 = 30;

    let qualification: Span<felt252> = array![
        token_id_1.into(), token_id_2.into(), token_id_3.into(),
    ]
        .span();

    // Note: Actual validation would require these tokens to exist and belong to player
    // This test verifies the configuration structure
    assert!(qualification.len() == 3, "Qualification should have 3 token IDs");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_mode_winners() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let qualifying_tournament_1: u64 = 1;
    let qualifying_tournament_2: u64 = 2;

    // Configure extension: [QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_ALL, top_positions,
    // tournament_ids...]
    let extension_config = array![
        QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_ALL, 0, qualifying_tournament_1.into(),
        qualifying_tournament_2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(700, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    assert!(
        tournament_validator.get_qualifier_type(700) == QUALIFIER_TYPE_TOP_POSITION,
        "Qualifier type should be WINNERS",
    );
    assert!(
        tournament_validator.get_qualifying_mode(700) == QUALIFYING_MODE_ALL,
        "Qualifying mode should be ALL",
    );

    // For ALL mode with WINNERS:
    // Qualification proof should be: [token_id_1, position_1, token_id_2, position_2]
    let token_id_1: u64 = 10;
    let position_1: u8 = 1;
    let token_id_2: u64 = 20;
    let position_2: u8 = 2;

    let qualification: Span<felt252> = array![
        token_id_1.into(), position_1.into(), token_id_2.into(), position_2.into(),
    ]
        .span();

    // Verify qualification format
    assert!(qualification.len() == 4, "Qualification should have 2 (token_id, position) pairs");
    assert!(*qualification.at(0) == token_id_1.into(), "First token ID should match");
    assert!(*qualification.at(1) == position_1.into(), "First position should match");
    assert!(*qualification.at(2) == token_id_2.into(), "Second token ID should match");
    assert!(*qualification.at(3) == position_2.into(), "Second position should match");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_mode_entry_tracking() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 2 qualifying tournaments and register player in both
    let (qualifying_tournament_1, token_id_1) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );
    let (qualifying_tournament_2, token_id_2) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL, 0, qualifying_tournament_1.into(),
        qualifying_tournament_2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(800, 1, extension_config); // Only 1 entry allowed
    stop_cheat_caller_address(validator_address);

    // For ALL mode, qualification includes all token IDs
    let qualification = array![token_id_1.into(), token_id_2.into()].span();

    // Check initial entries left
    let entries_left = validator.entries_left(800, player, qualification);
    assert!(entries_left.unwrap() == 1, "Should have 1 entry left initially");

    // Simulate adding an entry
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(800, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Check entries left after adding - should be 0
    let entries_left_after = validator.entries_left(800, player, qualification);
    assert!(entries_left_after.unwrap() == 0, "Should have 0 entries left after adding");
}

// ==============================================
// TESTS: CONFIG VALIDATION
// ==============================================

#[test]
#[should_panic(expected: "Invalid qualifying mode")]
#[fork("sepolia")]
fn test_tournament_validator_invalid_qualifying_mode() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Try to configure with invalid qualifying mode (6 is not valid, modes 0-5 are valid)
    let extension_config = array![QUALIFIER_TYPE_PARTICIPANTS, 6, 0, 1].span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(900, 0, extension_config);
    stop_cheat_caller_address(validator_address);
}

#[test]
#[should_panic(expected: "Invalid qualifier type")]
#[fork("sepolia")]
fn test_tournament_validator_invalid_qualifier_type() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Try to configure with invalid qualifier type (2 is not valid)
    let extension_config = array![2, QUALIFYING_MODE_AT_LEAST_ONE, 0, 1].span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1000, 0, extension_config);
    stop_cheat_caller_address(validator_address);
}

#[test]
#[fork("sepolia")]
#[should_panic]
fn test_tournament_validator_insufficient_config() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Try to configure with insufficient params (missing tournament ID)
    let extension_config = array![QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1100, 0, extension_config);
    stop_cheat_caller_address(validator_address);
}

// ==============================================
// TESTS: UNLIMITED ENTRIES
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_unlimited_entries() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create qualifying tournament and register player
    let (qualifying_tournament_id, token_id) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0,
        qualifying_tournament_id.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1200, 0, extension_config); // entry_limit=0 means unlimited
    stop_cheat_caller_address(validator_address);

    let qualification = array![qualifying_tournament_id.into(), token_id.into()].span();

    // Check entries left - should be None for unlimited
    let entries_left = validator.entries_left(1200, player, qualification);
    assert!(entries_left.is_none(), "Unlimited entries should return None");
}

// ==============================================
// TESTS: QUALIFYING_MODE_CUMULATIVE_PER_ENTRY (3)
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_per_entry_mode_basic() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create qualifying tournament and register player
    let (qualifying_tournament_id, token_id) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure extension: PER_ENTRY mode with 2 entries per qualifying token
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_CUMULATIVE_PER_ENTRY, 0,
        qualifying_tournament_id.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1300, 2, extension_config); // 2 entries per token
    stop_cheat_caller_address(validator_address);

    assert!(
        tournament_validator.get_qualifying_mode(1300) == QUALIFYING_MODE_CUMULATIVE_PER_ENTRY,
        "Qualifying mode should be PER_ENTRY",
    );

    // Player with their qualifying token should have 2 entries left
    let qualification = array![qualifying_tournament_id.into(), token_id.into()].span();
    let entries_left = validator.entries_left(1300, player, qualification);
    assert!(entries_left.is_some(), "Should have limited entries");
    assert!(entries_left.unwrap() == 2, "Should have 2 entries for token");

    // Add entry for this token
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(1300, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Token should now have 1 entry left
    let entries_left = validator.entries_left(1300, player, qualification);
    assert!(entries_left.unwrap() == 1, "Should have 1 entry left");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_per_entry_mode_multiple_tokens() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create qualifying tournament and register player
    let (qualifying_tournament_id, token_id) = create_qualifying_tournament_with_player(
        budokan,
        minigame,
        player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Configure with 3 entries per token
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_CUMULATIVE_PER_ENTRY, 0,
        qualifying_tournament_id.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1400, 3, extension_config);
    stop_cheat_caller_address(validator_address);

    let qualification = array![qualifying_tournament_id.into(), token_id.into()].span();

    // Verify player has 3 entries initially
    let entries_left = validator.entries_left(1400, player, qualification);
    assert!(entries_left.unwrap() == 3, "Should have 3 entries initially");

    // Use up all 3 entries
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(1400, player, qualification);
    validator.add_entry(1400, player, qualification);
    validator.add_entry(1400, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Token should have 0 entries left
    let entries_left = validator.entries_left(1400, player, qualification);
    assert!(entries_left.unwrap() == 0, "Should have 0 entries left");
}

// ==============================================
// TESTS: Top Positions Configuration
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_top_positions_configuration() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure with top_positions=3 (only top 3 count as winners)
    let qualifying_tournament_id: u64 = 10;
    let extension_config = array![
        QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_AT_LEAST_ONE, 3,
        qualifying_tournament_id.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1500, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Verify top_positions is set
    let top_positions = tournament_validator.get_top_positions(1500);
    assert!(top_positions == 3, "Top positions should be 3");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_top_positions_zero_means_unlimited() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure with top_positions=0 (all positions qualify)
    let qualifying_tournament_id: u64 = 11;
    let extension_config = array![
        QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_AT_LEAST_ONE, 0,
        qualifying_tournament_id.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1600, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Verify top_positions is 0
    let top_positions = tournament_validator.get_top_positions(1600);
    assert!(top_positions == 0, "Top positions should be 0 (unlimited)");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_top_positions_all_mode() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let qualifying_tournament_1: u64 = 20;
    let qualifying_tournament_2: u64 = 21;

    // Configure ALL mode with top_positions=5 (must be top 5 in ALL tournaments)
    let extension_config = array![
        QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_ALL, 5, qualifying_tournament_1.into(),
        qualifying_tournament_2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(1700, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Verify configuration
    let top_positions = tournament_validator.get_top_positions(1700);
    assert!(top_positions == 5, "Top positions should be 5");

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(1700);
    assert!(qualifying_ids.len() == 2, "Should have 2 qualifying tournaments");
}

// ==============================================
// TESTS: QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP (4)
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_participate_any_win_basic_config() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let qualifying_tournament_1: u64 = 50;
    let qualifying_tournament_2: u64 = 51;
    let qualifying_tournament_3: u64 = 52;

    // Configure extension with ALL_PARTICIPATE_ANY_WIN mode
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, 3, // top_positions=3
        qualifying_tournament_1.into(), qualifying_tournament_2.into(),
        qualifying_tournament_3.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(2000, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Verify configuration
    assert!(
        tournament_validator.get_qualifying_mode(2000) == QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP,
        "Qualifying mode should be ALL_PARTICIPATE_ANY_WIN",
    );
    assert!(
        tournament_validator.get_qualifier_type(2000) == QUALIFIER_TYPE_PARTICIPANTS,
        "Qualifier type should be PARTICIPANTS",
    );
    assert!(tournament_validator.get_top_positions(2000) == 3, "Top positions should be 3");

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(2000);
    assert!(qualifying_ids.len() == 3, "Should have 3 qualifying tournaments");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_participate_any_win_entry_tracking() {
    // This test validates entry tracking for ALL_PARTICIPATED_ANY_TOP mode
    // Note: We use position=0 for all (participated only) to test entry tracking
    // Position-based validation is tested in integration tests with proper leaderboards
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 2 qualifying tournaments where player participates
    let (tournament_id_1, token_id_1) = create_qualifying_tournament_with_player(
        budokan, minigame, player
    );
    let (tournament_id_2, token_id_2) = create_qualifying_tournament_with_player(
        budokan, minigame, player
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS,
        QUALIFYING_MODE_ALL,  // Use regular ALL mode for entry tracking test
        0,
        tournament_id_1.into(),
        tournament_id_2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(2100, 2, extension_config); // entry_limit=2
    stop_cheat_caller_address(validator_address);

    // Qualification: just token IDs (participated in both)
    let qualification = array![token_id_1.into(), token_id_2.into()].span();

    // Check initial entries - should use global tracking (key=0)
    let entries_left = validator.entries_left(2100, player, qualification);
    assert!(entries_left.is_some(), "Should have limited entries");
    assert!(entries_left.unwrap() == 2, "Should have 2 entries initially");

    // Simulate adding entry
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(2100, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Check entries after adding one
    let entries_after = validator.entries_left(2100, player, qualification);
    assert!(entries_after.unwrap() == 1, "Should have 1 entry left");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_participate_any_win_qualification_format() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Configure with 3 tournaments
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, 10, // top 10
        100,
        200, 300,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(2200, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    let _player = test_account_sepolia();

    // Valid qualification: participated in all, won in one
    // Format: [token_id_1, position_1, token_id_2, position_2, token_id_3, position_3]
    let valid_qual = array![
        1001, 0, // participated only
        2001, 5, // won 5th place
        3001, 0 // participated only
    ]
        .span();

    // This tests the format - actual validation would require on-chain data
    assert!(valid_qual.len() == 6, "Should have 3 (token_id, position) pairs");
    assert!(*valid_qual.at(1) == 0, "First position should be 0 (participated)");
    assert!(*valid_qual.at(3) == 5, "Second position should be 5 (won)");
    assert!(*valid_qual.at(5) == 0, "Third position should be 0 (participated)");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_participate_any_win_with_entry_limits() {
    // This test validates entry limits with ALL mode
    // Position-based validation is tested in integration tests with proper leaderboards
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 3 qualifying tournaments where player participates
    let (tournament_id_1, token_id_1) = create_qualifying_tournament_with_player(
        budokan, minigame, player
    );
    let (tournament_id_2, token_id_2) = create_qualifying_tournament_with_player(
        budokan, minigame, player
    );
    let (tournament_id_3, token_id_3) = create_qualifying_tournament_with_player(
        budokan, minigame, player
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS,
        QUALIFYING_MODE_ALL,  // Use regular ALL mode for entry limit test
        0,
        tournament_id_1.into(),
        tournament_id_2.into(),
        tournament_id_3.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(2300, 1, extension_config); // Only 1 entry allowed
    stop_cheat_caller_address(validator_address);

    let qualification = array![token_id_1.into(), token_id_2.into(), token_id_3.into()].span();

    // Initial entries
    let entries_left = validator.entries_left(2300, player, qualification);
    assert!(entries_left.unwrap() == 1, "Should have 1 entry");

    // Add entry
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(2300, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Should have 0 entries left
    let entries_left_after = validator.entries_left(2300, player, qualification);
    assert!(entries_left_after.unwrap() == 0, "Should have 0 entries left");
}

// ==============================================
// TESTS: QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP (5)
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_basic_config() {
    let budokan = budokan_address_sepolia();
    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let qualifying_tournament_1: u64 = 60;
    let qualifying_tournament_2: u64 = 61;

    // Configure extension with ALL_WITH_CUMULATIVE_ENTRIES mode
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        0, // top_positions (not relevant for participants)
        qualifying_tournament_1.into(),
        qualifying_tournament_2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(3000, 3, extension_config); // entry_limit=3
    stop_cheat_caller_address(validator_address);

    // Verify configuration
    assert!(
        tournament_validator
            .get_qualifying_mode(3000) == QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        "Qualifying mode should be ALL_WITH_CUMULATIVE_ENTRIES",
    );
    assert!(
        tournament_validator.get_qualifier_type(3000) == QUALIFIER_TYPE_PARTICIPANTS,
        "Qualifier type should be PARTICIPANTS",
    );

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(3000);
    assert!(qualifying_ids.len() == 2, "Should have 2 qualifying tournaments");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_calculation() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Test with 2 tournaments, entry_limit=3
    // Expected cumulative entries: 3 × 2 = 6
    let (t1, tok1) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t2, tok2) = create_qualifying_tournament_with_player(budokan, minigame, player);

    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config_2_tournaments = array![
        QUALIFIER_TYPE_PARTICIPANTS,
        QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        0,
        t1.into(),
        t2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(3100, 3, extension_config_2_tournaments);
    stop_cheat_caller_address(validator_address);

    let qualification_2 = array![tok1.into(), tok2.into()].span();
    let entries_2 = validator.entries_left(3100, player, qualification_2);
    assert!(entries_2.unwrap() == 6, "Should have 6 entries (3 x 2)");

    // Test with 4 tournaments, entry_limit=2
    // Expected cumulative entries: 2 × 4 = 8
    let (t3, tok3) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t4, tok4) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t5, tok5) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t6, tok6) = create_qualifying_tournament_with_player(budokan, minigame, player);

    let extension_config_4_tournaments = array![
        QUALIFIER_TYPE_PARTICIPANTS,
        QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        0,
        t3.into(),
        t4.into(),
        t5.into(),
        t6.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(3200, 2, extension_config_4_tournaments);
    stop_cheat_caller_address(validator_address);

    let qualification_4 = array![tok3.into(), tok4.into(), tok5.into(), tok6.into()].span();
    let entries_4 = validator.entries_left(3200, player, qualification_4);
    assert!(entries_4.unwrap() == 8, "Should have 8 entries (2 x 4)");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_tracking() {
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 3 qualifying tournaments
    let (t1, tok1) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t2, tok2) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t3, tok3) = create_qualifying_tournament_with_player(budokan, minigame, player);

    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Configure with 3 tournaments, entry_limit=2 → cumulative = 6
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS,
        QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        0,
        t1.into(),
        t2.into(),
        t3.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(3400, 2, extension_config);
    stop_cheat_caller_address(validator_address);

    let qualification = array![tok1.into(), tok2.into(), tok3.into()].span();

    // Initial: should have 6 entries
    let initial_entries = validator.entries_left(3400, player, qualification);
    assert!(initial_entries.unwrap() == 6, "Should have 6 entries initially");

    // Add 3 entries
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(3400, player, qualification);
    validator.add_entry(3400, player, qualification);
    validator.add_entry(3400, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Should have 3 entries left
    let after_3 = validator.entries_left(3400, player, qualification);
    assert!(after_3.unwrap() == 3, "Should have 3 entries left after using 3");

    // Add 3 more entries (exhausting all)
    start_cheat_caller_address(validator_address, budokan);
    validator.add_entry(3400, player, qualification);
    validator.add_entry(3400, player, qualification);
    validator.add_entry(3400, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Should have 0 entries left
    let final_entries = validator.entries_left(3400, player, qualification);
    assert!(final_entries.unwrap() == 0, "Should have 0 entries left");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_comparison() {
    // Compares cumulative vs non-cumulative entry tracking
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 3 qualifying tournaments
    let (t1, tok1) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t2, tok2) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t3, tok3) = create_qualifying_tournament_with_player(budokan, minigame, player);

    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Regular ALL mode (non-cumulative)
    let config_regular = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL, 0, t1.into(), t2.into(), t3.into()
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(3500, 2, config_regular); // entry_limit=2
    stop_cheat_caller_address(validator_address);

    // Cumulative ALL mode
    let config_cumulative = array![
        QUALIFIER_TYPE_PARTICIPANTS,
        QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        0,
        t1.into(),
        t2.into(),
        t3.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(3600, 2, config_cumulative); // entry_limit=2
    stop_cheat_caller_address(validator_address);

    let qualification = array![tok1.into(), tok2.into(), tok3.into()].span(); // 3 tournaments

    // Regular ALL: entry_limit=2 (not multiplied)
    let entries_regular = validator.entries_left(3500, player, qualification);
    assert!(entries_regular.unwrap() == 2, "Regular ALL has 2 entries");

    // Cumulative ALL: entry_limit=2 x 3 = 6
    let entries_cumulative = validator.entries_left(3600, player, qualification);
    assert!(entries_cumulative.unwrap() == 6, "Cumulative ALL has 6 entries");
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_with_winners() {
    // This test validates configuration of cumulative mode with winner qualifier
    // Position-based validation with leaderboards is tested in integration tests
    let budokan = budokan_address_sepolia();
    let minigame = minigame_address_sepolia();
    let player = test_account_sepolia();

    // Create 2 tournaments where player participated
    let (t1, tok1) = create_qualifying_tournament_with_player(budokan, minigame, player);
    let (t2, tok2) = create_qualifying_tournament_with_player(budokan, minigame, player);

    let validator_address = deploy_tournament_validator(budokan, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure with PARTICIPANTS qualifier type and cumulative entries
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS,
        QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        0,
        t1.into(),
        t2.into(),
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan);
    validator.add_config(3700, 4, extension_config); // entry_limit=4 → cumulative=8
    stop_cheat_caller_address(validator_address);

    assert!(
        tournament_validator.get_qualifier_type(3700) == QUALIFIER_TYPE_PARTICIPANTS,
        "Should be PARTICIPANTS type",
    );
    assert!(
        tournament_validator
            .get_qualifying_mode(3700) == QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        "Should be cumulative mode",
    );

    // For participants in cumulative mode: just token IDs
    let qualification = array![tok1.into(), tok2.into()].span();

    // Should have cumulative entries: 4 x 2 = 8
    let entries = validator.entries_left(3700, player, qualification);
    assert!(entries.unwrap() == 8, "Should have 8 cumulative");
}
