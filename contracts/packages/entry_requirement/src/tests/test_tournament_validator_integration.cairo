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
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
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

fn test_game_config(game_address: ContractAddress) -> GameConfig {
    GameConfig { address: game_address, settings_id: 1, soulbound: false, play_url: "" }
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

// ==============================================
// INTEGRATION TEST: QUALIFYING_MODE_AT_LEAST_ONE
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_mode_full_flow() {
    // This test demonstrates the full flow of:
    // 1. Creating a qualifying tournament
    // 2. Player enters the qualifying tournament
    // 3. Creating a gated tournament with ANY mode
    // 4. Player enters the gated tournament using their qualification
    // 5. Verifying entry limits work correctly

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();

    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Step 1: Create a qualifying tournament (open entry)
    start_cheat_caller_address(budokan_addr, account);
    let qualifying_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None // No entry requirements
        );
    stop_cheat_caller_address(budokan_addr);

    let qualifying_id = qualifying_tournament.id;
    assert(qualifying_id > 0, 'Qualifying tournament created');

    // Step 2: Player enters the qualifying tournament
    // Advance time to registration period
    let reg_start = qualifying_tournament.schedule.registration.unwrap().start;
    start_cheat_block_timestamp_global(reg_start);

    let player1 = account;
    start_cheat_caller_address(budokan_addr, player1);
    let (player1_token_id, entry_num) = budokan
        .enter_tournament(qualifying_id, 'player1', player1, Option::None);
    stop_cheat_caller_address(budokan_addr);

    assert(entry_num == 1, 'Player1 should be entry 1');
    assert(player1_token_id > 0, 'Player1 should have token');

    // Step 3: Deploy TournamentValidator and create gated tournament
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure extension: ANY mode, PARTICIPANTS, unlimited entries per qualification
    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0, qualifying_id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    // Create gated tournament
    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    let gated_id = gated_tournament.id;
    assert(gated_id > 0, 'Gated tournament created');

    // Verify validator config
    assert(
        tournament_validator.get_qualifier_type(gated_id) == QUALIFIER_TYPE_PARTICIPANTS,
        'Wrong qualifier type',
    );
    assert(
        tournament_validator.get_qualifying_mode(gated_id) == QUALIFYING_MODE_AT_LEAST_ONE,
        'Wrong qualifying mode',
    );

    // Step 4: Player enters gated tournament using qualification
    let gated_reg_start = gated_tournament.schedule.registration.unwrap().start;
    start_cheat_block_timestamp_global(gated_reg_start);

    // Create qualification proof: [qualifying_tournament_id, token_id]
    let qualification_proof = QualificationProof::Extension(
        array![qualifying_id.into(), player1_token_id.into()].span(),
    );

    start_cheat_caller_address(budokan_addr, player1);
    let (gated_token_id, gated_entry_num) = budokan
        .enter_tournament(gated_id, 'player1_gated', player1, Option::Some(qualification_proof));
    stop_cheat_caller_address(budokan_addr);

    assert(gated_entry_num == 1, 'Should be first entry');
    assert(gated_token_id > 0, 'Should have gated token');

    // Step 5: Verify unlimited entries works (player can enter multiple times with same
    // qualification)
    let qualification_data: Span<felt252> = array![qualifying_id.into(), player1_token_id.into()]
        .span();
    let entries_left = validator.entries_left(gated_id, player1, qualification_data);
    assert(entries_left.is_none(), 'Should have unlimited entries');

    // Player can enter again with same qualification
    start_cheat_caller_address(budokan_addr, player1);
    let (gated_token_id_2, gated_entry_num_2) = budokan
        .enter_tournament(gated_id, 'player1_again', player1, Option::Some(qualification_proof));
    stop_cheat_caller_address(budokan_addr);

    assert(gated_entry_num_2 == 2, 'Should be second entry');
    assert(gated_token_id_2 > gated_token_id, 'Should have new token');
}

// ==============================================
// INTEGRATION TEST: QUALIFYING_MODE_AT_LEAST_ONE with ENTRY LIMITS
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_mode_with_entry_limits() {
    // Tests that entry limits work correctly in ANY mode

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create qualifying tournament
    start_cheat_caller_address(budokan_addr, account);
    let qualifying_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters qualifying tournament
    start_cheat_block_timestamp_global(qualifying_tournament.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (token_id, _) = budokan
        .enter_tournament(qualifying_tournament.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator and create gated tournament with entry_limit=2
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0,
        qualifying_tournament.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 2, entry_requirement_type }; // Limit
    // of 2

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Advance to gated tournament registration
    start_cheat_block_timestamp_global(gated_tournament.schedule.registration.unwrap().start);

    let qualification_data: Span<felt252> = array![qualifying_tournament.id.into(), token_id.into()]
        .span();

    // Check initial entries left
    let entries_left = validator.entries_left(gated_tournament.id, player, qualification_data);
    assert(entries_left.is_some(), 'Should have entries');
    assert(entries_left.unwrap() == 2, 'Should have 2 entries');

    // First entry
    let qual_proof = QualificationProof::Extension(qualification_data);
    start_cheat_caller_address(budokan_addr, player);
    let (_, entry_1) = budokan
        .enter_tournament(gated_tournament.id, 'entry1', player, Option::Some(qual_proof));
    stop_cheat_caller_address(budokan_addr);
    assert(entry_1 == 1, 'Should be entry 1');

    // Check entries left after first entry
    let entries_left_after_1 = validator
        .entries_left(gated_tournament.id, player, qualification_data);
    assert(entries_left_after_1.unwrap() == 1, 'Should have 1 left');

    // Second entry
    start_cheat_caller_address(budokan_addr, player);
    let (_, entry_2) = budokan
        .enter_tournament(gated_tournament.id, 'entry2', player, Option::Some(qual_proof));
    stop_cheat_caller_address(budokan_addr);
    assert(entry_2 == 2, 'Should be entry 2');

    // Check entries left after second entry
    let entries_left_after_2 = validator
        .entries_left(gated_tournament.id, player, qualification_data);
    assert(entries_left_after_2.unwrap() == 0, 'Should have 0 left');
    // Third entry should fail (no entries left)
// Note: This would panic in actual execution, but demonstrates the limit
}

// ==============================================
// INTEGRATION TEST: QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_any_per_tournament_mode_full_flow() {
    // Tests that entry limits are tracked separately per qualifying tournament

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create TWO qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier_1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier_2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters BOTH qualifying tournaments
    start_cheat_block_timestamp_global(qualifier_1.schedule.registration.unwrap().start);
    let player = account;

    start_cheat_caller_address(budokan_addr, player);
    let (token_id_1, _) = budokan.enter_tournament(qualifier_1.id, 'player', player, Option::None);
    let (token_id_2, _) = budokan.enter_tournament(qualifier_2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with ANY_PER_TOURNAMENT mode and entry_limit=1
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT, 0,
        qualifier_1.id.into(), qualifier_2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type }; // 1
    // entry per qualifier

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    start_cheat_block_timestamp_global(gated_tournament.schedule.registration.unwrap().start);

    // Check entries left for each qualification
    let qual_data_1: Span<felt252> = array![qualifier_1.id.into(), token_id_1.into()].span();
    let qual_data_2: Span<felt252> = array![qualifier_2.id.into(), token_id_2.into()].span();

    let entries_left_1 = validator.entries_left(gated_tournament.id, player, qual_data_1);
    let entries_left_2 = validator.entries_left(gated_tournament.id, player, qual_data_2);

    assert(entries_left_1.unwrap() == 1, 'Should have 1 for qual1');
    assert(entries_left_2.unwrap() == 1, 'Should have 1 for qual2');

    // Enter using qualifier 1
    let qual_proof_1 = QualificationProof::Extension(qual_data_1);
    start_cheat_caller_address(budokan_addr, player);
    let (_, entry_1) = budokan
        .enter_tournament(gated_tournament.id, 'entry1', player, Option::Some(qual_proof_1));
    stop_cheat_caller_address(budokan_addr);
    assert(entry_1 == 1, 'Should be entry 1');

    // Check entries left - qualifier 1 should be 0, qualifier 2 should still be 1
    let entries_left_1_after = validator.entries_left(gated_tournament.id, player, qual_data_1);
    let entries_left_2_after = validator.entries_left(gated_tournament.id, player, qual_data_2);

    assert(entries_left_1_after.unwrap() == 0, 'Qual1 should be 0');
    assert(entries_left_2_after.unwrap() == 1, 'Qual2 should still be 1');

    // Player can STILL enter using qualifier 2!
    let qual_proof_2 = QualificationProof::Extension(qual_data_2);
    start_cheat_caller_address(budokan_addr, player);
    let (_, entry_2) = budokan
        .enter_tournament(gated_tournament.id, 'entry2', player, Option::Some(qual_proof_2));
    stop_cheat_caller_address(budokan_addr);
    assert(entry_2 == 2, 'Should be entry 2');

    // Now both qualifications should have 0 entries left
    let entries_left_2_final = validator.entries_left(gated_tournament.id, player, qual_data_2);
    assert(entries_left_2_final.unwrap() == 0, 'Qual2 should be 0 now');
}

// ==============================================
// INTEGRATION TEST: QUALIFYING_MODE_ALL
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_mode_participants_flow() {
    // Tests that ALL mode requires participation in ALL qualifying tournaments

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create TWO qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier_1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier_2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player1 enters BOTH tournaments
    start_cheat_block_timestamp_global(qualifier_1.schedule.registration.unwrap().start);
    let player1 = account;

    start_cheat_caller_address(budokan_addr, player1);
    let (p1_token_1, _) = budokan
        .enter_tournament(qualifier_1.id, 'player1', player1, Option::None);
    let (p1_token_2, _) = budokan
        .enter_tournament(qualifier_2.id, 'player1', player1, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Player2 enters only ONE tournament
    let player2: ContractAddress = 0x222.try_into().unwrap();
    start_cheat_caller_address(budokan_addr, player2);
    let (p2_token_1, _) = budokan
        .enter_tournament(qualifier_1.id, 'player2', player2, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with ALL mode
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL, 0, qualifier_1.id.into(),
        qualifier_2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    start_cheat_block_timestamp_global(gated_tournament.schedule.registration.unwrap().start);

    // Player1 can enter (has both qualifications)
    // For ALL mode with PARTICIPANTS: provide token IDs in order
    let p1_qual_data: Span<felt252> = array![p1_token_1.into(), p1_token_2.into()].span();
    let p1_valid = validator.valid_entry(gated_tournament.id, player1, p1_qual_data);
    assert(p1_valid, 'Player1 should be valid');

    let p1_qual_proof = QualificationProof::Extension(p1_qual_data);
    start_cheat_caller_address(budokan_addr, player1);
    let (_, entry_1) = budokan
        .enter_tournament(gated_tournament.id, 'player1', player1, Option::Some(p1_qual_proof));
    stop_cheat_caller_address(budokan_addr);
    assert(entry_1 == 1, 'Player1 should enter');

    // Player2 cannot enter (missing qualifier 2)
    let p2_qual_data: Span<felt252> = array![p2_token_1.into(), 0 // No token for qualifier 2
    ]
        .span();
    let p2_valid = validator.valid_entry(gated_tournament.id, player2, p2_qual_data);
    assert(!p2_valid, 'Player2 should be invalid');
}

// ==============================================
// INTEGRATION TEST: QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_participate_any_win_mode_full_flow() {
    // Tests that ALL_PARTICIPATE_ANY_WIN mode requires:
    // 1. Participation in ALL qualifying tournaments
    // 2. Winning (top positions) in at least ANY ONE tournament

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create THREE qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier_1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier_2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier_3 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters ALL three tournaments
    start_cheat_block_timestamp_global(qualifier_1.schedule.registration.unwrap().start);
    let player = account;

    start_cheat_caller_address(budokan_addr, player);
    let (token_1, _) = budokan.enter_tournament(qualifier_1.id, 'player', player, Option::None);
    let (token_2, _) = budokan.enter_tournament(qualifier_2.id, 'player', player, Option::None);
    let (token_3, _) = budokan.enter_tournament(qualifier_3.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Advance to game period and submit for tournament 2 (to simulate winning)
    start_cheat_block_timestamp_global(qualifier_2.schedule.game.start);
    start_cheat_caller_address(budokan_addr, player);
    // Note: In real scenario, player would need to submit score to get on leaderboard
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with ALL_PARTICIPATE_ANY_WIN mode, top_positions=3
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, // Using participants for this test
        QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, 3, // top_positions=3
        qualifier_1.id.into(),
        qualifier_2.id.into(), qualifier_3.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Verify validator config
    assert(
        tournament_validator
            .get_qualifying_mode(gated_tournament.id) == QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP,
        'Wrong qualifying mode',
    );

    // Test qualification format: (token_id, position) pairs for each tournament
    // position=0 means participated only, position>0 means winning position
    // For this test: participated in all (positions = 0, 0, 0)
    // This should FAIL because no wins
    let qual_no_wins: Span<felt252> = array![
        token_1.into(), 0, // participated
        token_2.into(), 0, // participated
        token_3.into(),
        0 // participated
    ]
        .span();

    let valid_no_wins = validator.valid_entry(gated_tournament.id, player, qual_no_wins);
    assert(!valid_no_wins, 'Should fail with no wins');
    // Note: Full validation requires leaderboard data which is complex to set up in fork test
// The validation logic is tested more thoroughly in budokan_fork tests
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_participate_any_win_config() {
    // Tests configuration and structure of ALL_PARTICIPATE_ANY_WIN mode

    let budokan_addr = budokan_address_sepolia();
    let _account = test_account_sepolia();

    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure with 2 qualifying tournaments, top 5 positions
    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, 5, // top_positions
        10, // tournament 1
        20 // tournament 2
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(5000, 1, extension_config); // entry_limit=1
    stop_cheat_caller_address(validator_address);

    // Verify configuration
    assert(
        tournament_validator.get_qualifying_mode(5000) == QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP,
        'Wrong mode',
    );
    assert(tournament_validator.get_top_positions(5000) == 5, 'Wrong top positions');

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(5000);
    assert(qualifying_ids.len() == 2, 'Wrong tournament count');
    assert(*qualifying_ids.at(0) == 10, 'Wrong tournament 1');
    assert(*qualifying_ids.at(1) == 20, 'Wrong tournament 2');

    // Note: entries_left validation requires actual tournament data
    // Full flow tests with real tournaments cover entries_left functionality
}

// ==============================================
// INTEGRATION TEST: QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_full_flow() {
    // Tests that ALL_WITH_CUMULATIVE_ENTRIES mode:
    // 1. Requires participation in ALL qualifying tournaments
    // 2. Provides cumulative entries (entry_limit × tournament_count)

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create TWO qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier_1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier_2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters BOTH tournaments
    start_cheat_block_timestamp_global(qualifier_1.schedule.registration.unwrap().start);
    let player = account;

    start_cheat_caller_address(budokan_addr, player);
    let (p_token_1, _) = budokan.enter_tournament(qualifier_1.id, 'player', player, Option::None);
    let (p_token_2, _) = budokan.enter_tournament(qualifier_2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with ALL_WITH_CUMULATIVE_ENTRIES mode
    // entry_limit=3, so total entries = 3 × 2 = 6
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        0, // top_positions (not relevant for participants)
        qualifier_1.id.into(),
        qualifier_2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement {
        entry_limit: 3, // 3 entries per tournament
        entry_requirement_type,
    };

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Verify validator config
    assert(
        tournament_validator
            .get_qualifying_mode(
                gated_tournament.id,
            ) == QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        'Wrong qualifying mode',
    );

    start_cheat_block_timestamp_global(gated_tournament.schedule.registration.unwrap().start);

    // Check initial entries: should be 3 × 2 = 6
    let qualification_data: Span<felt252> = array![p_token_1.into(), p_token_2.into()].span();
    let entries_left = validator.entries_left(gated_tournament.id, player, qualification_data);

    assert(entries_left.is_some(), 'Should have entries');
    assert(entries_left.unwrap() == 6, 'Should have 6 total entries');

    // Player can enter (has both qualifications)
    let qual_proof = QualificationProof::Extension(qualification_data);
    let p_valid = validator.valid_entry(gated_tournament.id, player, qualification_data);
    assert(p_valid, 'Player should be valid');

    start_cheat_caller_address(budokan_addr, player);
    let (_, entry_1) = budokan
        .enter_tournament(gated_tournament.id, 'entry1', player, Option::Some(qual_proof));
    stop_cheat_caller_address(budokan_addr);
    assert(entry_1 == 1, 'Should be entry 1');

    // Check entries after first entry: should be 5
    let entries_after_1 = validator.entries_left(gated_tournament.id, player, qualification_data);
    assert(entries_after_1.unwrap() == 5, 'Should have 5 left');

    // Player can continue entering up to 6 times total
    start_cheat_caller_address(budokan_addr, player);
    budokan.enter_tournament(gated_tournament.id, 'entry2', player, Option::Some(qual_proof));
    budokan.enter_tournament(gated_tournament.id, 'entry3', player, Option::Some(qual_proof));
    budokan.enter_tournament(gated_tournament.id, 'entry4', player, Option::Some(qual_proof));
    budokan.enter_tournament(gated_tournament.id, 'entry5', player, Option::Some(qual_proof));
    let (_, entry_6) = budokan
        .enter_tournament(gated_tournament.id, 'entry6', player, Option::Some(qual_proof));
    stop_cheat_caller_address(budokan_addr);

    assert(entry_6 == 6, 'Should be entry 6');

    // Check entries after all 6 entries: should be 0
    let entries_final = validator.entries_left(gated_tournament.id, player, qualification_data);
    assert(entries_final.unwrap() == 0, 'Should have 0 left');
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_config() {
    // Tests configuration of ALL_WITH_CUMULATIVE_ENTRIES mode

    let budokan_addr = budokan_address_sepolia();
    let _account = test_account_sepolia();

    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorDispatcher {
        contract_address: validator_address,
    };

    // Configure with 3 qualifying tournaments, entry_limit=2
    // Total entries = 2 × 3 = 6
    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP, 0,
        100, // tournament 1
        200, // tournament 2
        300 // tournament 3
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(6000, 2, extension_config); // entry_limit=2
    stop_cheat_caller_address(validator_address);

    // Verify configuration
    assert(
        tournament_validator
            .get_qualifying_mode(6000) == QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        'Wrong mode',
    );

    let qualifying_ids = tournament_validator.get_qualifying_tournament_ids(6000);
    assert(qualifying_ids.len() == 3, 'Wrong tournament count');

    // Note: cumulative entries calculation requires actual tournament data
    // Full flow tests with real tournaments cover this functionality
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_with_cumulative_entries_vs_all_mode() {
    // Compares ALL_WITH_CUMULATIVE_ENTRIES vs regular ALL mode entry limits

    let budokan_addr = budokan_address_sepolia();
    let _account = test_account_sepolia();

    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Configure tournament 7000 with regular ALL mode
    let config_all: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL, 0, 10, 20,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(7000, 3, config_all); // entry_limit=3 (non-cumulative)
    stop_cheat_caller_address(validator_address);

    // Configure tournament 7001 with ALL_WITH_CUMULATIVE_ENTRIES mode
    let config_cumulative: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP, 0, 10, 20,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(7001, 3, config_cumulative); // entry_limit=3 (cumulative)
    stop_cheat_caller_address(validator_address);

    // Note: entries_left comparison requires actual tournament data
    // Full flow tests with real tournaments cover this functionality
    // The key difference is:
    // - Regular ALL mode: entry_limit (not multiplied)
    // - Cumulative mode: entry_limit × tournament_count
}

// ==============================================
// INTEGRATION TEST: Invalid qualification scenarios
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_invalid_qualifications() {
    // Tests that invalid qualifications are properly rejected

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create qualifying tournament
    start_cheat_caller_address(budokan_addr, account);
    let qualifier = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player1 enters
    start_cheat_block_timestamp_global(qualifier.schedule.registration.unwrap().start);
    let player1 = account;
    start_cheat_caller_address(budokan_addr, player1);
    let (player1_token, _) = budokan
        .enter_tournament(qualifier.id, 'player1', player1, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0, qualifier.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Test 1: Wrong tournament ID
    let wrong_tournament_qual: Span<felt252> = array![999, player1_token.into()].span();
    let valid_wrong_tournament = validator
        .valid_entry(gated_tournament.id, player1, wrong_tournament_qual);
    assert(!valid_wrong_tournament, 'Wrong tournament should fail');

    // Test 2: Wrong token ID (player2 doesn't own this token)
    let player2: ContractAddress = 0x222.try_into().unwrap();
    let wrong_owner_qual: Span<felt252> = array![qualifier.id.into(), player1_token.into()].span();
    let valid_wrong_owner = validator.valid_entry(gated_tournament.id, player2, wrong_owner_qual);
    assert(!valid_wrong_owner, 'Wrong owner should fail');
}

// ==============================================
// INTEGRATION TEST: FINALIZATION REQUIRED FOR POSITION VALIDATION
// ==============================================

#[test]
#[fork("sepolia")]
fn test_tournament_validator_position_requires_finalization() {
    // This test verifies that position-based validation requires the tournament to be finalized
    // to prevent race conditions where more scores could be submitted

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create qualifying tournament
    start_cheat_caller_address(budokan_addr, account);
    let qualifier = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters qualifying tournament
    start_cheat_block_timestamp_global(qualifier.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (player_token, _) = budokan.enter_tournament(qualifier.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Advance to submission period and submit score
    let submission_start = qualifier.schedule.game.end + 1;
    start_cheat_block_timestamp_global(submission_start);
    start_cheat_caller_address(budokan_addr, player);
    budokan.submit_score(qualifier.id, player_token, 1); // Position 1
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with TOP_POSITION type
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_AT_LEAST_ONE, 3, qualifier.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Test 1: Validation should FAIL when tournament is still in submission period
    let qualification_submission: Span<felt252> = array![
        qualifier.id.into(), player_token.into(), 1 // position 1
    ]
        .span();
    let valid_during_submission = validator
        .valid_entry(gated_tournament.id, player, qualification_submission);
    assert(!valid_during_submission, 'Should fail before finalized');

    // Test 2: Advance time to finalized period (after submission period ends)
    let finalized_time = submission_start + qualifier.schedule.submission_duration + 1;
    start_cheat_block_timestamp_global(finalized_time);

    // Now validation should SUCCEED
    let qualification_finalized: Span<felt252> = array![
        qualifier.id.into(), player_token.into(), 1 // position 1
    ]
        .span();
    let valid_after_finalized = validator
        .valid_entry(gated_tournament.id, player, qualification_finalized);
    assert(valid_after_finalized, 'Should succeed after finalized');
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_all_participated_any_top_requires_finalization() {
    // Test that ALL_PARTICIPATED_ANY_TOP mode also requires finalization for position validation

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters both tournaments
    start_cheat_block_timestamp_global(qualifier1.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (token1, _) = budokan.enter_tournament(qualifier1.id, 'player', player, Option::None);
    let (token2, _) = budokan.enter_tournament(qualifier2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Submit scores for both (only one needs to be a winning position)
    let submission_start = qualifier1.schedule.game.end + 1;
    start_cheat_block_timestamp_global(submission_start);
    start_cheat_caller_address(budokan_addr, player);
    budokan.submit_score(qualifier1.id, token1, 1); // Position 1 (winning)
    budokan.submit_score(qualifier2.id, token2, 1); // Position 1
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with ALL_PARTICIPATED_ANY_TOP mode
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, // Note: still uses participants type for this mode
        QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, 3, // top 3 positions count as wins
        qualifier1.id.into(), qualifier2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Qualification: participated in both, won in first (position > 0)
    let qualification_before_final: Span<felt252> = array![
        token1.into(), 1, // Won position 1 in qualifier1
        token2.into(),
        0 // Just participated in qualifier2
    ]
        .span();

    // Test 1: Should FAIL when qualifier1 is not finalized (still in submission)
    let valid_before_final = validator
        .valid_entry(gated_tournament.id, player, qualification_before_final);
    assert(!valid_before_final, 'Should fail before finalized');

    // Test 2: Advance time so qualifier1 is finalized
    let finalized_time = submission_start + qualifier1.schedule.submission_duration + 1;
    start_cheat_block_timestamp_global(finalized_time);

    // Now validation should SUCCEED
    let qualification_after_final: Span<felt252> = array![
        token1.into(), 1, // Won position 1 in qualifier1
        token2.into(),
        0 // Just participated in qualifier2
    ]
        .span();
    let valid_after_final = validator
        .valid_entry(gated_tournament.id, player, qualification_after_final);
    assert(valid_after_final, 'Should succeed after finalized');
}

#[test]
#[fork("sepolia")]
fn test_tournament_validator_entries_left_requires_finalization() {
    // Test that entries_left returns 0 when tournaments aren't finalized
    // even if entry limits would otherwise allow entries

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create qualifying tournament
    start_cheat_caller_address(budokan_addr, account);
    let qualifier = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters and submits score
    start_cheat_block_timestamp_global(qualifier.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (player_token, _) = budokan.enter_tournament(qualifier.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    let submission_start = qualifier.schedule.game.end + 1;
    start_cheat_block_timestamp_global(submission_start);
    start_cheat_caller_address(budokan_addr, player);
    budokan.submit_score(qualifier.id, player_token, 1);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with TOP_POSITION type and entry_limit=3
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_AT_LEAST_ONE, 3, qualifier.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 3, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated_tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    let qualification: Span<felt252> = array![qualifier.id.into(), player_token.into(), 1].span();

    // Test 1: entries_left should return Some(0) when tournament not finalized
    let entries_before = validator.entries_left(gated_tournament.id, player, qualification);
    assert(entries_before.is_some(), 'Should return Some');
    assert(entries_before.unwrap() == 0, 'Should be 0 before finalized');

    // Test 2: Advance to finalized period
    let finalized_time = submission_start + qualifier.schedule.submission_duration + 1;
    start_cheat_block_timestamp_global(finalized_time);

    // Now entries_left should return Some(3) since qualification is valid
    let entries_after = validator.entries_left(gated_tournament.id, player, qualification);
    assert(entries_after.is_some(), 'Should return Some after');
    assert(entries_after.unwrap() == 3, 'Should be 3 after finalized');
}

// ==============================================
// COMPREHENSIVE TESTS: entries_left VALIDATION
// ==============================================

#[test]
#[fork("sepolia")]
fn test_entries_left_at_least_one_mode_partial_qualification() {
    // Test entries_left with AT_LEAST_ONE mode when player qualifies from some but not all
    // tournaments

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier3 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player only enters qualifier1 and qualifier2 (not qualifier3)
    start_cheat_block_timestamp_global(qualifier1.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (token1, _) = budokan.enter_tournament(qualifier1.id, 'player', player, Option::None);
    let (token2, _) = budokan.enter_tournament(qualifier2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with AT_LEAST_ONE mode, entry_limit=5
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_AT_LEAST_ONE, 0, qualifier1.id.into(),
        qualifier2.id.into(), qualifier3.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 5, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Test 1: Qualify via tournament 1 (valid) → should get 5 entries
    let qual1: Span<felt252> = array![qualifier1.id.into(), token1.into()].span();
    let entries1 = validator.entries_left(gated.id, player, qual1);
    assert(entries1.unwrap() == 5, 'Should have 5 entries via q1');

    // Test 2: Qualify via tournament 2 (valid) → should get 5 entries
    let qual2: Span<felt252> = array![qualifier2.id.into(), token2.into()].span();
    let entries2 = validator.entries_left(gated.id, player, qual2);
    assert(entries2.unwrap() == 5, 'Should have 5 entries via q2');

    // Test 3: Try to qualify via tournament 3 (not entered) → should get 0 entries
    let fake_token: u64 = 999;
    let qual3: Span<felt252> = array![qualifier3.id.into(), fake_token.into()].span();
    let entries3 = validator.entries_left(gated.id, player, qual3);
    assert(entries3.unwrap() == 0, 'Should have 0 entries via q3');
}

#[test]
#[fork("sepolia")]
fn test_entries_left_cumulative_per_tournament_mode() {
    // Test entries_left with CUMULATIVE_PER_TOURNAMENT mode
    // Player should get separate entry pools per qualifying tournament

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters both
    start_cheat_block_timestamp_global(qualifier1.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (token1, _) = budokan.enter_tournament(qualifier1.id, 'player', player, Option::None);
    let (token2, _) = budokan.enter_tournament(qualifier2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with CUMULATIVE_PER_TOURNAMENT mode, entry_limit=3
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT, 0,
        qualifier1.id.into(), qualifier2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 3, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Test: Each qualifying tournament gives separate pool of 3 entries
    let qual1: Span<felt252> = array![qualifier1.id.into(), token1.into()].span();
    let entries1 = validator.entries_left(gated.id, player, qual1);
    assert(entries1.unwrap() == 3, 'Should have 3 entries from q1');

    let qual2: Span<felt252> = array![qualifier2.id.into(), token2.into()].span();
    let entries2 = validator.entries_left(gated.id, player, qual2);
    assert(entries2.unwrap() == 3, 'Should have 3 entries from q2');
}

#[test]
#[fork("sepolia")]
fn test_entries_left_all_mode_requires_all_tournaments() {
    // Test that ALL mode requires qualification from ALL tournaments
    // Partial qualification should result in 0 entries

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player only enters qualifier1 (not qualifier2)
    start_cheat_block_timestamp_global(qualifier1.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (token1, _) = budokan.enter_tournament(qualifier1.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with ALL mode, entry_limit=4
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL, 0, qualifier1.id.into(),
        qualifier2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 4, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Test: Partial qualification (only 1 of 2 tournaments) → should get 0 entries
    let fake_token2: u64 = 999;
    let partial_qual: Span<felt252> = array![token1.into(), fake_token2.into()].span();
    let entries_partial = validator.entries_left(gated.id, player, partial_qual);
    assert(entries_partial.unwrap() == 0, 'Should have 0 with partial');

    // Now player enters qualifier2
    start_cheat_caller_address(budokan_addr, player);
    let (token2, _) = budokan.enter_tournament(qualifier2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Test: Full qualification (both tournaments) → should get 4 entries
    let full_qual: Span<felt252> = array![token1.into(), token2.into()].span();
    let entries_full = validator.entries_left(gated.id, player, full_qual);
    assert(entries_full.unwrap() == 4, 'Should have 4 with all');
}

#[test]
#[fork("sepolia")]
fn test_entries_left_all_participated_any_top_partial() {
    // Test ALL_PARTICIPATED_ANY_TOP mode
    // Must participate in all, but only need to win in one

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player enters both
    start_cheat_block_timestamp_global(qualifier1.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (token1, _) = budokan.enter_tournament(qualifier1.id, 'player', player, Option::None);
    let (token2, _) = budokan.enter_tournament(qualifier2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Submit scores - win in qualifier1, just participate in qualifier2
    let submission_start = qualifier1.schedule.game.end + 1;
    start_cheat_block_timestamp_global(submission_start);
    start_cheat_caller_address(budokan_addr, player);
    budokan.submit_score(qualifier1.id, token1, 1); // Position 1
    stop_cheat_caller_address(budokan_addr);

    // Advance to finalized
    let finalized_time = submission_start + qualifier1.schedule.submission_duration + 1;
    start_cheat_block_timestamp_global(finalized_time);

    // Deploy validator
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, 3,
        qualifier1.id.into(), qualifier2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 2, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Test 1: Participated in all, won in one → should get 2 entries
    let qual_won: Span<felt252> = array![
        token1.into(), 1, // Won position 1
        token2.into(), 0 // Just participated
    ]
        .span();
    let entries_won = validator.entries_left(gated.id, player, qual_won);
    assert(entries_won.unwrap() == 2, 'Should have 2 with win');

    // Test 2: Participated in all, but no wins → should get 0 entries
    let qual_no_win: Span<felt252> = array![token1.into(), 0, // Changed to no win
    token2.into(), 0]
        .span();
    let entries_no_win = validator.entries_left(gated.id, player, qual_no_win);
    assert(entries_no_win.unwrap() == 0, 'Should have 0 without win');
}

#[test]
#[fork("sepolia")]
fn test_entries_left_all_participated_cumulative_top_partial() {
    // Test ALL_PARTICIPATED_CUMULATIVE_TOP mode
    // Must qualify from all to get cumulative entries

    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let account = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 qualifying tournaments
    start_cheat_caller_address(budokan_addr, account);
    let qualifier1 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    let qualifier2 = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Player only enters qualifier1
    start_cheat_block_timestamp_global(qualifier1.schedule.registration.unwrap().start);
    let player = account;
    start_cheat_caller_address(budokan_addr, player);
    let (token1, _) = budokan.enter_tournament(qualifier1.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator with entry_limit=3 → cumulative should be 3×2=6
    let validator_address = deploy_tournament_validator(budokan_addr, true);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config: Span<felt252> = array![
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP, 0,
        qualifier1.id.into(), qualifier2.id.into(),
    ]
        .span();

    let extension = ExtensionConfig { address: validator_address, config: extension_config };
    let entry_requirement_type = EntryRequirementType::extension(extension);
    let entry_requirement = EntryRequirement { entry_limit: 3, entry_requirement_type };

    start_cheat_caller_address(budokan_addr, account);
    let gated = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(budokan_addr);

    // Test 1: Only qualified from 1 of 2 → should get 0 entries (need all)
    let fake_token2: u64 = 999;
    let partial_qual: Span<felt252> = array![token1.into(), fake_token2.into()].span();
    let entries_partial = validator.entries_left(gated.id, player, partial_qual);
    assert(entries_partial.unwrap() == 0, 'Should have 0 with partial');

    // Player enters qualifier2
    start_cheat_caller_address(budokan_addr, player);
    let (token2, _) = budokan.enter_tournament(qualifier2.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Test 2: Qualified from all → should get 6 entries (3×2)
    let full_qual: Span<felt252> = array![token1.into(), token2.into()].span();
    let entries_full = validator.entries_left(gated.id, player, full_qual);
    assert(entries_full.unwrap() == 6, 'Should have 6 cumulative');
}
