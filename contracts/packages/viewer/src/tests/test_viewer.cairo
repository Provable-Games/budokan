use budokan::mocks::minigame_starknet_mock::IMinigameStarknetMockDispatcherTrait;
use budokan::structs::constants::{
    MIN_REGISTRATION_PERIOD, MIN_SUBMISSION_PERIOD, MIN_TOURNAMENT_LENGTH,
};
use budokan_interfaces::budokan::{
    GameConfig, IBudokanDispatcher, IBudokanDispatcherTrait, LeaderboardConfig, Metadata, Phase,
    Schedule,
};
use budokan_interfaces::viewer::IBudokanViewerDispatcherTrait;
use snforge_std::{
    start_cheat_block_timestamp, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use super::setup::{OWNER, PLAYER1, PLAYER2, setup};

// ================================================================================================
// HELPERS
// ================================================================================================

const REGISTRATION_START_DELAY: u32 = 100;

fn registration_end_delay() -> u32 {
    MIN_REGISTRATION_PERIOD
}

fn game_start_delay() -> u32 {
    100 + MIN_REGISTRATION_PERIOD + 100
}

fn game_end_delay() -> u32 {
    MIN_TOURNAMENT_LENGTH
}

fn test_schedule() -> Schedule {
    Schedule {
        registration_start_delay: REGISTRATION_START_DELAY,
        registration_end_delay: registration_end_delay(),
        game_start_delay: game_start_delay(),
        game_end_delay: game_end_delay(),
        submission_duration: MIN_SUBMISSION_PERIOD,
    }
}

fn test_metadata() -> Metadata {
    Metadata { name: 'Genesis Tournament', description: "Genesis Tournament" }
}

fn test_game_config(game_address: ContractAddress) -> GameConfig {
    GameConfig {
        game_address,
        settings_id: 1,
        soulbound: false,
        paymaster: false,
        client_url: Option::None,
        renderer: Option::None,
    }
}

fn test_leaderboard_config() -> LeaderboardConfig {
    LeaderboardConfig { ascending: false, game_must_be_over: false }
}

/// Create a tournament with a unique salt to avoid token collision
fn create_tournament_with_salt(
    budokan: IBudokanDispatcher, game_address: ContractAddress, salt: u16,
) -> u64 {
    let t = budokan
        .create_tournament(
            OWNER,
            test_metadata(),
            test_schedule(),
            test_game_config(game_address),
            Option::None,
            Option::None,
            test_leaderboard_config(),
            salt,
            0,
        );
    t.id
}

// ================================================================================================
// TESTS: TOURNAMENT LISTING
// ================================================================================================

#[test]
fn test_tournaments_empty() {
    let contracts = setup();
    let result = contracts.viewer.tournaments(0, 10);
    assert!(result.tournament_ids.len() == 0, "Should have no tournaments");
    assert!(result.total == 0, "Total should be 0");
}

#[test]
fn test_tournaments_basic() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    create_tournament_with_salt(contracts.budokan, game_address, 0);
    create_tournament_with_salt(contracts.budokan, game_address, 1);
    create_tournament_with_salt(contracts.budokan, game_address, 2);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    let result = contracts.viewer.tournaments(0, 10);
    assert!(result.tournament_ids.len() == 3, "Should have 3 tournaments");
    assert!(result.total == 3, "Total should be 3");
    assert!(*result.tournament_ids[0] == 1_u64, "First should be id 1");
    assert!(*result.tournament_ids[1] == 2_u64, "Second should be id 2");
    assert!(*result.tournament_ids[2] == 3_u64, "Third should be id 3");
}

#[test]
fn test_tournaments_pagination() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    let mut i: u16 = 0;
    while i < 5 {
        create_tournament_with_salt(contracts.budokan, game_address, i);
        i += 1;
    }

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Page 1: offset=0, limit=2
    let page1 = contracts.viewer.tournaments(0, 2);
    assert!(page1.tournament_ids.len() == 2, "Page 1 should have 2");
    assert!(page1.total == 5, "Total should be 5");
    assert!(*page1.tournament_ids[0] == 1_u64, "Page 1 first");
    assert!(*page1.tournament_ids[1] == 2_u64, "Page 1 second");

    // Page 2: offset=2, limit=2
    let page2 = contracts.viewer.tournaments(2, 2);
    assert!(page2.tournament_ids.len() == 2, "Page 2 should have 2");
    assert!(*page2.tournament_ids[0] == 3_u64, "Page 2 first");
    assert!(*page2.tournament_ids[1] == 4_u64, "Page 2 second");

    // Page 3: offset=4, limit=2 (only 1 left)
    let page3 = contracts.viewer.tournaments(4, 2);
    assert!(page3.tournament_ids.len() == 1, "Page 3 should have 1");
    assert!(*page3.tournament_ids[0] == 5_u64, "Page 3 first");

    // Beyond range
    let page4 = contracts.viewer.tournaments(5, 2);
    assert!(page4.tournament_ids.len() == 0, "Page 4 should be empty");
}

// ================================================================================================
// TESTS: FILTERED QUERIES
// ================================================================================================

#[test]
fn test_tournaments_by_creator() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;
    let other_creator: ContractAddress = 'OTHER'.try_into().unwrap();

    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    // OWNER creates 2 tournaments
    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    create_tournament_with_salt(contracts.budokan, game_address, 0);
    create_tournament_with_salt(contracts.budokan, game_address, 1);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // OTHER creates 1 tournament
    start_cheat_caller_address(contracts.budokan.contract_address, other_creator);
    create_tournament_with_salt(contracts.budokan, game_address, 2);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Filter by OWNER
    let result = contracts.viewer.tournaments_by_creator(OWNER, 0, 10);
    assert!(result.tournament_ids.len() == 2, "OWNER should have 2");
    assert!(result.total == 2, "Total should be 2");

    // Filter by OTHER
    let result2 = contracts.viewer.tournaments_by_creator(other_creator, 0, 10);
    assert!(result2.tournament_ids.len() == 1, "OTHER should have 1");
    assert!(*result2.tournament_ids[0] == 3_u64, "OTHER's tournament is id 3");
}

#[test]
fn test_tournaments_by_phase() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    create_tournament_with_salt(contracts.budokan, game_address, 0);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // At time 1000, tournament created at 1000 with registration_start_delay=100
    // So registration starts at 1100 -> phase should be Scheduled
    let result = contracts.viewer.tournaments_by_phase(Phase::Scheduled, 0, 10);
    assert!(result.tournament_ids.len() == 1, "Should have 1 scheduled");
    assert!(result.total == 1, "Total scheduled should be 1");

    // Advance to registration period
    start_cheat_block_timestamp(
        contracts.budokan.contract_address, 1000 + REGISTRATION_START_DELAY.into() + 1,
    );

    let result2 = contracts.viewer.tournaments_by_phase(Phase::Registration, 0, 10);
    assert!(result2.tournament_ids.len() == 1, "Should have 1 in registration");

    let result3 = contracts.viewer.tournaments_by_phase(Phase::Scheduled, 0, 10);
    assert!(result3.tournament_ids.len() == 0, "Should have 0 scheduled now");
}

// ================================================================================================
// TESTS: COUNTS
// ================================================================================================

#[test]
fn test_count_tournaments() {
    let contracts = setup();
    assert!(contracts.viewer.count_tournaments() == 0, "Initially 0");

    let game_address = contracts.minigame.contract_address;
    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    create_tournament_with_salt(contracts.budokan, game_address, 0);
    create_tournament_with_salt(contracts.budokan, game_address, 1);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    assert!(contracts.viewer.count_tournaments() == 2, "Should be 2");
}

#[test]
fn test_count_tournaments_by_creator() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;
    let other_creator: ContractAddress = 'OTHER'.try_into().unwrap();

    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    create_tournament_with_salt(contracts.budokan, game_address, 0);
    create_tournament_with_salt(contracts.budokan, game_address, 1);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, other_creator);
    create_tournament_with_salt(contracts.budokan, game_address, 2);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    assert!(contracts.viewer.count_tournaments_by_creator(OWNER) == 2, "OWNER count");
    assert!(contracts.viewer.count_tournaments_by_creator(other_creator) == 1, "OTHER count");
}

// ================================================================================================
// TESTS: TOURNAMENT DETAIL
// ================================================================================================

#[test]
fn test_tournament_detail() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    let tid = create_tournament_with_salt(contracts.budokan, game_address, 0);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    let detail = contracts.viewer.tournament_detail(tid);
    assert!(detail.tournament.id == tid, "ID should match");
    assert!(detail.tournament.created_by == OWNER, "Creator should be OWNER");
    assert!(detail.entry_count == 0, "No entries yet");
    assert!(detail.phase == Phase::Scheduled, "Should be Scheduled");
}

#[test]
fn test_tournaments_batch() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    create_tournament_with_salt(contracts.budokan, game_address, 0);
    create_tournament_with_salt(contracts.budokan, game_address, 1);
    create_tournament_with_salt(contracts.budokan, game_address, 2);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    let batch = contracts.viewer.tournaments_batch(array![1, 3]);
    assert!(batch.len() == 2, "Batch should have 2");
    assert!(*batch[0].tournament.id == 1_u64, "First should be id 1");
    assert!(*batch[1].tournament.id == 3_u64, "Second should be id 3");
}

// ================================================================================================
// TESTS: REGISTRATIONS
// ================================================================================================

#[test]
fn test_tournament_registrations() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    let tid = create_tournament_with_salt(contracts.budokan, game_address, 0);

    // Advance to registration period
    start_cheat_block_timestamp(
        contracts.budokan.contract_address, 1000 + REGISTRATION_START_DELAY.into() + 1,
    );

    // Enter tournament with PLAYER1
    start_cheat_caller_address(contracts.budokan.contract_address, PLAYER1);
    contracts.budokan.enter_tournament(tid, 'Player1', PLAYER1, Option::None, 0, 0);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Enter tournament with PLAYER2
    start_cheat_caller_address(contracts.budokan.contract_address, PLAYER2);
    contracts.budokan.enter_tournament(tid, 'Player2', PLAYER2, Option::None, 1, 0);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Query registrations
    let result = contracts.viewer.tournament_registrations(tid, 0, 10);
    assert!(result.total == 2, "Should have 2 entries");
    assert!(result.entries.len() == 2, "Should return 2 entries");

    // Test pagination
    let page1 = contracts.viewer.tournament_registrations(tid, 0, 1);
    assert!(page1.entries.len() == 1, "Page 1 should have 1 entry");
    assert!(page1.total == 2, "Total should still be 2");

    let page2 = contracts.viewer.tournament_registrations(tid, 1, 1);
    assert!(page2.entries.len() == 1, "Page 2 should have 1 entry");
}

// ================================================================================================
// TESTS: LEADERBOARD
// ================================================================================================

#[test]
fn test_leaderboard_empty() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    let tid = create_tournament_with_salt(contracts.budokan, game_address, 0);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    let results = contracts.viewer.leaderboard(tid, 0, 10);
    assert!(results.len() == 0, "Leaderboard should be empty");
}

#[test]
fn test_leaderboard_with_submissions() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    let tid = create_tournament_with_salt(contracts.budokan, game_address, 0);

    // Advance to registration
    start_cheat_block_timestamp(
        contracts.budokan.contract_address, 1000 + REGISTRATION_START_DELAY.into() + 1,
    );

    // Enter with two players
    start_cheat_caller_address(contracts.budokan.contract_address, PLAYER1);
    let (token_id_1, _) = contracts
        .budokan
        .enter_tournament(tid, 'Player1', PLAYER1, Option::None, 0, 0);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, PLAYER2);
    let (token_id_2, _) = contracts
        .budokan
        .enter_tournament(tid, 'Player2', PLAYER2, Option::None, 1, 0);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Set scores via minigame mock
    contracts.minigame.end_game(token_id_1, 100);
    contracts.minigame.end_game(token_id_2, 200);

    // Advance to submission period
    let submission_start: u64 = 1000 + game_start_delay().into() + game_end_delay().into() + 1;
    start_cheat_block_timestamp(contracts.budokan.contract_address, submission_start);

    // Submit scores
    start_cheat_caller_address(contracts.budokan.contract_address, PLAYER1);
    contracts.budokan.submit_score(tid, token_id_1, 1);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, PLAYER2);
    contracts.budokan.submit_score(tid, token_id_2, 1);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Check leaderboard
    let results = contracts.viewer.leaderboard(tid, 0, 10);
    assert!(results.len() == 2, "Leaderboard should have 2 entries");
    assert!(*results[0].position == 1_u32, "First position should be 1");
    assert!(*results[1].position == 2_u32, "Second position should be 2");

    // Test pagination
    let page1 = contracts.viewer.leaderboard(tid, 0, 1);
    assert!(page1.len() == 1, "Page 1 should have 1");
    assert!(*page1[0].position == 1_u32, "Should be position 1");

    let page2 = contracts.viewer.leaderboard(tid, 1, 1);
    assert!(page2.len() == 1, "Page 2 should have 1");
    assert!(*page2[0].position == 2_u32, "Should be position 2");
}

// ================================================================================================
// TESTS: PRIZES
// ================================================================================================

#[test]
fn test_tournament_prizes_empty() {
    let contracts = setup();
    let game_address = contracts.minigame.contract_address;

    start_cheat_caller_address(contracts.budokan.contract_address, OWNER);
    start_cheat_block_timestamp(contracts.budokan.contract_address, 1000);

    let tid = create_tournament_with_salt(contracts.budokan, game_address, 0);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    let prizes = contracts.viewer.tournament_prizes(tid);
    assert!(prizes.len() == 0, "Should have no prizes");
}
