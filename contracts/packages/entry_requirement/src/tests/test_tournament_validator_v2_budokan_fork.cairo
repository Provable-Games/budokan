use budokan_entry_requirement::examples::tournament_validator_v2::{
    ITournamentValidatorV2Dispatcher, ITournamentValidatorV2DispatcherTrait,
    QUALIFIER_TYPE_PARTICIPANTS, QUALIFIER_TYPE_WINNERS, QUALIFYING_MODE_ALL,
    QUALIFYING_MODE_ALL_PARTICIPATE_ANY_WIN, QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES,
    QUALIFYING_MODE_ANY, QUALIFYING_MODE_ANY_PER_TOURNAMENT, QUALIFYING_MODE_PER_ENTRY,
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
use core::option::OptionTrait;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::{ContractAddress, get_block_timestamp};

// ==============================================
// HELPER FUNCTIONS
// ==============================================

fn deploy_tournament_validator_v2(budokan_addr: ContractAddress) -> ContractAddress {
    let declared = declare("TournamentValidatorV2").unwrap();
    let constructor_calldata = array![budokan_addr.into()];
    let (contract_address, _) = declared.contract_class().deploy(@constructor_calldata).unwrap();
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
    let registration_start = current_time + 100;
    let registration_end = registration_start + 3600;
    let game_start = registration_end + 1;
    let game_end = game_start + 3600;
    Schedule {
        registration: Option::Some(Period { start: registration_start, end: registration_end }),
        game: Period { start: game_start, end: game_end },
        submission_duration: 3600,
    }
}

// Helper to create a qualifying tournament and have a player enter it
fn create_and_enter_tournament(
    budokan: IBudokanDispatcher,
    budokan_addr: ContractAddress,
    minigame_addr: ContractAddress,
    player: ContractAddress,
) -> (u64, u64) {
    // Create tournament
    start_cheat_caller_address(budokan_addr, player);
    let tournament = budokan
        .create_tournament(
            player,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::None,
        );
    stop_cheat_caller_address(budokan_addr);

    // Enter tournament
    let reg_start = tournament.schedule.registration.unwrap().start;
    start_cheat_block_timestamp_global(reg_start);
    start_cheat_caller_address(budokan_addr, player);
    let (token_id, _) = budokan.enter_tournament(tournament.id, 'player', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    (tournament.id, token_id)
}

// Helper to submit a score for a player in a tournament
fn submit_score_for_player(
    budokan: IBudokanDispatcher,
    budokan_addr: ContractAddress,
    tournament_id: u64,
    token_id: u64,
    position: u8,
    player: ContractAddress,
) {
    // Advance to game period
    let tournament = budokan.tournament(tournament_id);
    let game_start = tournament.schedule.game.start;
    start_cheat_block_timestamp_global(game_start + 1);

    // Submit score
    start_cheat_caller_address(budokan_addr, player);
    budokan.submit_score(tournament_id, token_id, position);
    stop_cheat_caller_address(budokan_addr);
}

// ==============================================
// TESTS: QUALIFYING_MODE_ANY (0) - Legacy Compatibility
// ==============================================

#[test]
#[fork("sepolia")]
fn test_v2_any_mode_single_rule() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create qualifying tournament and enter it
    let (qualifying_id, token_id) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Config: ANY mode with single tournament rule
    let extension_config = array![
        QUALIFYING_MODE_ANY, qualifying_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(100, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Qualification proof with real tournament and token
    let qualification = array![qualifying_id.into(), token_id.into(), 5].span();

    // Should validate if player has token from the qualifying tournament
    let valid = validator.valid_entry(100, player, qualification);
    assert(valid, 'Should be valid with token');
}

#[test]
#[fork("sepolia")]
fn test_v2_any_mode_with_entry_limit() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create qualifying tournament and enter it
    let (qualifying_id, token_id) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFYING_MODE_ANY, qualifying_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(200, 2, extension_config); // entry_limit = 2
    stop_cheat_caller_address(validator_address);

    let qualification = array![qualifying_id.into(), token_id.into(), 5].span();

    // Check entries left before any entries
    let entries_left = validator.entries_left(200, player, qualification);
    assert(entries_left.is_some() && entries_left.unwrap() == 2, 'Should have 2 entries');

    // Add entry
    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_entry(200, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Check entries left after one entry
    let entries_left = validator.entries_left(200, player, qualification);
    assert(entries_left.is_some() && entries_left.unwrap() == 1, 'Should have 1 entry left');
}

// ==============================================
// TESTS: QUALIFYING_MODE_ALL (2) - Legacy Compatibility
// ==============================================

#[test]
#[fork("sepolia")]
fn test_v2_all_mode_multiple_tournaments() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 qualifying tournaments and enter them
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Config: ALL mode with 3 tournaments
    let extension_config = array![
        QUALIFYING_MODE_ALL, t1_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0, t2_id.into(),
        QUALIFIER_TYPE_PARTICIPANTS.into(), 0, t3_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(300, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Valid: has all 3 tournaments
    let qualification_all = array![
        t1_id.into(), t1_token.into(), 5, t2_id.into(), t2_token.into(), 3, t3_id.into(),
        t3_token.into(), 7,
    ]
        .span();
    let valid = validator.valid_entry(300, player, qualification_all);
    assert(valid, 'Should be valid with all');

    // Invalid: missing tournament 3
    let qualification_missing = array![
        t1_id.into(), t1_token.into(), 5, t2_id.into(), t2_token.into(), 3,
    ]
        .span();
    let valid = validator.valid_entry(300, player, qualification_missing);
    assert(!valid, 'Should be invalid missing T');
}

// ==============================================
// TESTS: PER_ENTRY mode (3) - Legacy Compatibility
// ==============================================

#[test]
#[fork("sepolia")]
fn test_v2_per_entry_mode_separate_tracking() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create qualifying tournament and enter it twice to get 2 different tokens
    let (t_id, token_100) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Enter same tournament again to get second token
    let reg_start = budokan.tournament(t_id).schedule.registration.unwrap().start;
    start_cheat_block_timestamp_global(reg_start);
    start_cheat_caller_address(budokan_addr, player);
    let (token_200, _) = budokan.enter_tournament(t_id, 'player2', player, Option::None);
    stop_cheat_caller_address(budokan_addr);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFYING_MODE_PER_ENTRY, t_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(400, 2, extension_config); // 2 entries per token
    stop_cheat_caller_address(validator_address);

    // Token 100
    let qualification_token_100 = array![t_id.into(), token_100.into(), 5].span();
    let entries_left = validator.entries_left(400, player, qualification_token_100);
    assert(entries_left.is_some() && entries_left.unwrap() == 2, 'Token 100 should have 2');

    // Token 200 (different token, should also have 2 entries)
    let qualification_token_200 = array![t_id.into(), token_200.into(), 5].span();
    let entries_left = validator.entries_left(400, player, qualification_token_200);
    assert(entries_left.is_some() && entries_left.unwrap() == 2, 'Token 200 should have 2');
}

// ==============================================
// TESTS: PER-TOURNAMENT RULES - New Feature
// ==============================================

#[test]
#[fork("sepolia")]
fn test_v2_per_tournament_different_types() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: T1 any position (50th), T2 Top 3 (2nd place)
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 2, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Config: Tournament 1 = PARTICIPANTS, Tournament 2 = WINNERS (Top 3)
    let extension_config = array![
        QUALIFYING_MODE_ALL, t1_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(),
        0, // Tournament 1: just participate
        t2_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        3 // Tournament 2: Top 3
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(500, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Valid: participated in T1 (any position) + Top 3 in T2
    let qualification_valid = array![
        t1_id.into(), t1_token.into(), 50, t2_id.into(), t2_token.into(), 2,
    ]
        .span();
    let valid = validator.valid_entry(500, player, qualification_valid);
    assert(valid, 'Should be valid T1+T2');

    // Invalid: participated in both but not Top 3 in T2
    let qualification_invalid = array![
        t1_id.into(), t1_token.into(), 50, t2_id.into(), t2_token.into(), 10,
    ]
        .span();
    let valid = validator.valid_entry(500, player, qualification_invalid);
    assert(!valid, 'Should be invalid not Top3');
}

#[test]
#[fork("sepolia")]
fn test_v2_per_tournament_different_top_positions() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: 7th in T1, 4th in T2, 2nd in T3
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 7, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 4, player);
    submit_score_for_player(budokan, budokan_addr, t3_id, t3_token, 2, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Config: T1 = Top 10, T2 = Top 5, T3 = Top 3
    let extension_config = array![
        QUALIFYING_MODE_ALL, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 10, t2_id.into(),
        QUALIFIER_TYPE_WINNERS.into(), 5, t3_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(600, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Valid: 7th in T1, 4th in T2, 2nd in T3
    let qualification_valid = array![
        t1_id.into(), t1_token.into(), 7, t2_id.into(), t2_token.into(), 4, t3_id.into(),
        t3_token.into(), 2,
    ]
        .span();
    let valid = validator.valid_entry(600, player, qualification_valid);
    assert(valid, 'Should be valid tiered');

    // Invalid: 7th in T1, 4th in T2, 5th in T3 (not Top 3)
    let qualification_invalid = array![
        t1_id.into(), t1_token.into(), 7, t2_id.into(), t2_token.into(), 4, t3_id.into(),
        t3_token.into(), 5,
    ]
        .span();
    let valid = validator.valid_entry(600, player, qualification_invalid);
    assert(!valid, 'Should be invalid not Top3');
}

// ==============================================
// TESTS: QUALIFYING_MODE_ALL_PARTICIPATE_ANY_WIN (4) - New Mode
// ==============================================

#[test]
#[fork("sepolia")]
fn test_v2_mode4_participated_all_won_one() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: won in T2 (2nd place = Top 3), didn't win in T1 and T3
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 15, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 2, player);
    submit_score_for_player(budokan, budokan_addr, t3_id, t3_token, 10, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Config: Must participate in ALL, Top 3 counts as winning
    let extension_config = array![
        QUALIFYING_MODE_ALL_PARTICIPATE_ANY_WIN, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3,
        t2_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3, t3_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        3,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(700, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Valid: participated in all, won in T2 (2nd place)
    let qualification_valid = array![
        t1_id.into(), t1_token.into(), 15, t2_id.into(), t2_token.into(), 2, t3_id.into(),
        t3_token.into(), 10,
    ]
        .span();
    let valid = validator.valid_entry(700, player, qualification_valid);
    assert(valid, 'Should be valid all+won T2');

    // Invalid: participated in all but didn't win any
    let qualification_no_wins = array![
        t1_id.into(), t1_token.into(), 15, t2_id.into(), t2_token.into(), 8, t3_id.into(),
        t3_token.into(), 10,
    ]
        .span();
    let valid = validator.valid_entry(700, player, qualification_no_wins);
    assert(!valid, 'Should be invalid no wins');

    // Invalid: won in one but missing a tournament
    let qualification_missing = array![
        t1_id.into(), t1_token.into(), 2, t2_id.into(), t2_token.into(), 2,
    ]
        .span();
    let valid = validator.valid_entry(700, player, qualification_missing);
    assert(!valid, 'Should be invalid missing T3');
}

#[test]
#[fork("sepolia")]
fn test_v2_mode4_multiple_wins() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: won in 2 tournaments (T1 and T2), didn't win in T3
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 3, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 1, player);
    submit_score_for_player(budokan, budokan_addr, t3_id, t3_token, 20, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFYING_MODE_ALL_PARTICIPATE_ANY_WIN, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 5,
        t2_id.into(), QUALIFIER_TYPE_WINNERS.into(), 5, t3_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        5,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(800, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Valid: won in 2 tournaments (exceeds the "at least one" requirement)
    let qualification = array![
        t1_id.into(), t1_token.into(), 3, t2_id.into(), t2_token.into(), 1, t3_id.into(),
        t3_token.into(), 20,
    ]
        .span();
    let valid = validator.valid_entry(800, player, qualification);
    assert(valid, 'Should be valid multi wins');
}

// ==============================================
// TESTS: QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES (5) - New Mode
// ==============================================

#[test]
#[fork("sepolia")]
fn test_v2_mode5_cumulative_entries_basic() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: Top 3 in T1 & T2, not in T3
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 2, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 1, player);
    submit_score_for_player(budokan, budokan_addr, t3_id, t3_token, 15, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Config: 3 tournaments, Top 3 counts, 2 entries per qualifying tournament
    let extension_config = array![
        QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3,
        t2_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3, t3_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        3,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(900, 2, extension_config); // 2 entries per qualifying tournament
    stop_cheat_caller_address(validator_address);

    // Qualified in 2 out of 3 tournaments → 2 × 2 = 4 total entries
    let qualification = array![
        t1_id.into(), t1_token.into(), 2, t2_id.into(), t2_token.into(), 1, t3_id.into(),
        t3_token.into(), 15,
    ]
        .span();

    // Check entries left
    let entries_left = validator.entries_left(900, player, qualification);
    assert(entries_left.is_some() && entries_left.unwrap() == 4, 'Should have 4 entries 2x2');

    // Use one entry
    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_entry(900, player, qualification);
    stop_cheat_caller_address(validator_address);

    // Check entries left after using one
    let entries_left = validator.entries_left(900, player, qualification);
    assert(entries_left.is_some() && entries_left.unwrap() == 3, 'Should have 3 left');
}

#[test]
#[fork("sepolia")]
fn test_v2_mode5_cumulative_all_qualified() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: Top 5 in all
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 2, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 1, player);
    submit_score_for_player(budokan, budokan_addr, t3_id, t3_token, 5, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 5,
        t2_id.into(), QUALIFIER_TYPE_WINNERS.into(), 5, t3_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        5,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1000, 3, extension_config); // 3 entries per qualifying tournament
    stop_cheat_caller_address(validator_address);

    // Qualified in ALL 3 tournaments → 3 × 3 = 9 total entries
    let qualification = array![
        t1_id.into(), t1_token.into(), 2, t2_id.into(), t2_token.into(), 1, t3_id.into(),
        t3_token.into(), 5,
    ]
        .span();

    let entries_left = validator.entries_left(1000, player, qualification);
    assert(entries_left.is_some() && entries_left.unwrap() == 9, 'Should have 9 entries 3x3');
}

#[test]
#[fork("sepolia")]
fn test_v2_mode5_cumulative_none_qualified() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: All outside Top 3
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 15, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 8, player);
    submit_score_for_player(budokan, budokan_addr, t3_id, t3_token, 10, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3,
        t2_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3, t3_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        3,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1100, 2, extension_config);
    stop_cheat_caller_address(validator_address);

    // Participated in all but qualified in NONE → 0 total entries
    let qualification = array![
        t1_id.into(), t1_token.into(), 15, t2_id.into(), t2_token.into(), 8, t3_id.into(),
        t3_token.into(), 10,
    ]
        .span(); // All outside Top 3

    let entries_left = validator.entries_left(1100, player, qualification);
    assert(entries_left.is_some() && entries_left.unwrap() == 0, 'Should have 0 entries');
}

#[test]
#[fork("sepolia")]
fn test_v2_mode5_cumulative_mixed_requirements() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: T1 any position (50), T2 3rd place, T3 2nd place (not winner)
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 50, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 3, player);
    submit_score_for_player(budokan, budokan_addr, t3_id, t3_token, 2, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Config: T1 = just participate, T2 = Top 5, T3 = Winner only
    let extension_config = array![
        QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES, t1_id.into(),
        QUALIFIER_TYPE_PARTICIPANTS.into(), 0, // Any position
        t2_id.into(),
        QUALIFIER_TYPE_WINNERS.into(), 5, // Top 5
        t3_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        1 // Winner only
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1200, 3, extension_config); // 3 entries per qualifying tournament
    stop_cheat_caller_address(validator_address);

    // Qualified in T1 (participated) and T2 (Top 5), not in T3 → 2 × 3 = 6 entries
    let qualification = array![
        t1_id.into(), t1_token.into(), 50, t2_id.into(), t2_token.into(), 3, t3_id.into(),
        t3_token.into(), 2,
    ]
        .span(); // T1 any, T2 3rd, T3 2nd (not winner)

    let entries_left = validator.entries_left(1200, player, qualification);
    assert(entries_left.is_some() && entries_left.unwrap() == 6, 'Should have 6 entries 2x3');
}

#[test]
#[fork("sepolia")]
fn test_v2_mode5_cumulative_validation_requires_all() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 3 tournaments
    let (t1_id, t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t3_id, _t3_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Submit scores: qualify in T1 and T2
    submit_score_for_player(budokan, budokan_addr, t1_id, t1_token, 2, player);
    submit_score_for_player(budokan, budokan_addr, t2_id, t2_token, 1, player);

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let extension_config = array![
        QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3,
        t2_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3, t3_id.into(), QUALIFIER_TYPE_WINNERS.into(),
        3,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1300, 2, extension_config);
    stop_cheat_caller_address(validator_address);

    // Missing T3 → validation should fail even if qualified in T1 and T2
    let qualification_missing = array![
        t1_id.into(), t1_token.into(), 2, t2_id.into(), t2_token.into(), 1,
    ]
        .span();
    let valid = validator.valid_entry(1300, player, qualification_missing);
    assert(!valid, 'Should be invalid missing3');
}

// ==============================================
// TESTS: VIEW FUNCTIONS
// ==============================================

#[test]
#[fork("sepolia")]
fn test_v2_get_rule() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 tournaments
    let (t1_id, _t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, _t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorV2Dispatcher {
        contract_address: validator_address,
    };

    let extension_config = array![
        QUALIFYING_MODE_ALL, t1_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0, t2_id.into(),
        QUALIFIER_TYPE_WINNERS.into(), 5,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1400, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    // Get rule 0
    let rule_0 = tournament_validator.get_rule(1400, 0);
    assert(rule_0.tournament_id == t1_id, 'Rule 0 tid mismatch');
    assert(rule_0.qualifier_type == QUALIFIER_TYPE_PARTICIPANTS, 'Rule 0 type PARTICIPANTS');
    assert(rule_0.top_positions == 0, 'Rule 0 top_pos should be 0');

    // Get rule 1
    let rule_1 = tournament_validator.get_rule(1400, 1);
    assert(rule_1.tournament_id == t2_id, 'Rule 1 tid mismatch');
    assert(rule_1.qualifier_type == QUALIFIER_TYPE_WINNERS, 'Rule 1 type WINNERS');
    assert(rule_1.top_positions == 5, 'Rule 1 top_pos should be 5');
}

#[test]
#[fork("sepolia")]
fn test_v2_get_rule_count() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 2 tournaments
    let (t1_id, _t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );
    let (t2_id, _t2_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorV2Dispatcher {
        contract_address: validator_address,
    };

    let extension_config = array![
        QUALIFYING_MODE_ALL, t1_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0, t2_id.into(),
        QUALIFIER_TYPE_WINNERS.into(), 3,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1500, 0, extension_config);
    stop_cheat_caller_address(validator_address);

    let rule_count = tournament_validator.get_rule_count(1500);
    assert(rule_count == 2, 'Should have 2 rules');
}

#[test]
#[fork("sepolia")]
fn test_v2_get_qualifying_mode() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 1 tournament
    let (t1_id, _t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorV2Dispatcher {
        contract_address: validator_address,
    };

    let extension_config = array![
        QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES, t1_id.into(), QUALIFIER_TYPE_WINNERS.into(), 3,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1600, 2, extension_config);
    stop_cheat_caller_address(validator_address);

    let mode = tournament_validator.get_qualifying_mode(1600);
    assert(mode == QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES, 'Should be mode 5');
}

#[test]
#[fork("sepolia")]
fn test_v2_get_entry_limit() {
    let budokan_addr = budokan_address_sepolia();
    let minigame_addr = minigame_address_sepolia();
    let player = test_account_sepolia();
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create 1 tournament
    let (t1_id, _t1_token) = create_and_enter_tournament(
        budokan, budokan_addr, minigame_addr, player,
    );

    // Deploy validator
    let validator_address = deploy_tournament_validator_v2(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_validator = ITournamentValidatorV2Dispatcher {
        contract_address: validator_address,
    };

    let extension_config = array![
        QUALIFYING_MODE_ANY, t1_id.into(), QUALIFIER_TYPE_PARTICIPANTS.into(), 0,
    ]
        .span();

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(1700, 5, extension_config); // entry_limit = 5
    stop_cheat_caller_address(validator_address);

    let entry_limit = tournament_validator.get_entry_limit(1700);
    assert(entry_limit == 5, 'Entry limit should be 5');
}
