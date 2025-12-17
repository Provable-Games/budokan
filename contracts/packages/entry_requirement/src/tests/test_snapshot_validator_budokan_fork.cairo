use budokan_entry_requirement::examples::snapshot_validator::{
    Entry, ISnapshotValidatorDispatcher, ISnapshotValidatorDispatcherTrait, SnapshotStatus,
};
use budokan_entry_requirement::tests::constants::{
    budokan_address_mainnet, minigame_address_mainnet, test_account_mainnet,
};
use budokan_interfaces::entry_validator::{
    IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::{ContractAddress, get_block_timestamp};

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct EntryRequirement {
    pub entry_limit: u8,
    pub entry_requirement_type: EntryRequirementType,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum EntryRequirementType {
    token: ContractAddress,
    tournament: TournamentType,
    allowlist: Span<ContractAddress>,
    extension: ExtensionConfig,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum TournamentType {
    winners: Span<u64>,
    participants: Span<u64>,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct ExtensionConfig {
    pub address: ContractAddress,
    pub config: Span<felt252>,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum QualificationProof {
    // For qualifying via previous tournament
    Tournament: TournamentQualification,
    // For qualifying via NFT ownership
    NFT: NFTQualification,
    Address: ContractAddress,
    Extension: Span<felt252>,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct TournamentQualification {
    pub tournament_id: u64,
    pub token_id: u64,
    pub position: u8,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct NFTQualification {
    pub token_id: u256,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct Schedule {
    pub registration: Option<Period>,
    pub game: Period,
    pub submission_duration: u64,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct Period {
    pub start: u64,
    pub end: u64,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct EntryFee {
    pub token_address: ContractAddress,
    pub amount: u128,
    pub distribution: Span<u8>,
    pub tournament_creator_share: Option<u8>,
    pub game_creator_share: Option<u8>,
}

#[derive(Drop, Serde)]
pub struct Metadata {
    pub name: felt252,
    pub description: ByteArray,
}

#[derive(Copy, Drop, Serde)]
pub struct GameConfig {
    pub address: ContractAddress,
    pub settings_id: u32,
    pub prize_spots: u8,
}

#[derive(Drop, Serde)]
pub struct Tournament {
    pub id: u64,
    pub created_at: u64,
    pub created_by: ContractAddress,
    pub creator_token_id: u64,
    pub metadata: Metadata,
    pub schedule: Schedule,
    pub game_config: GameConfig,
    pub entry_fee: Option<EntryFee>,
    pub entry_requirement: Option<EntryRequirement>,
}

#[starknet::interface]
pub trait IBudokan<TState> {
    fn create_tournament(
        ref self: TState,
        creator_rewards_address: ContractAddress,
        metadata: Metadata,
        schedule: Schedule,
        game_config: GameConfig,
        entry_fee: Option<EntryFee>,
        entry_requirement: Option<EntryRequirement>,
        soulbound: bool,
        play_url: ByteArray,
    ) -> Tournament;
    fn enter_tournament(
        ref self: TState,
        tournament_id: u64,
        player_name: felt252,
        player_address: ContractAddress,
        qualification: Option<QualificationProof>,
    ) -> (u64, u32);
}

// ==============================================
// BUDOKAN INTEGRATION FORK TEST
// ==============================================
// This test demonstrates full integration with a deployed Budokan contract
// on a forked network (sepolia or mainnet).
//
// To run this test:
// 1. Deploy Budokan contract to sepolia/mainnet (or use existing deployment)
// 2. Update BUDOKAN_ADDRESS constant below with the deployed address
// 3. Run: snforge test test_snapshot_validator_budokan --fork-name sepolia
//
// Note: You'll need to mock/setup the required dependencies:
// - A minigame contract address
// - Test account with permissions
// ==============================================

// Deploy the SnapshotValidator contract
fn deploy_snapshot_validator(tournament_address: ContractAddress) -> ContractAddress {
    let contract = declare("SnapshotValidator").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![tournament_address.into()]).unwrap();
    contract_address
}

// Helper functions for creating tournaments
fn test_metadata() -> Metadata {
    Metadata { name: 'Test Tournament', description: "Test Description" }
}

fn test_game_config(minigame_address: ContractAddress) -> GameConfig {
    GameConfig { address: minigame_address, settings_id: 1, prize_spots: 1 }
}

fn test_schedule() -> Schedule {
    let current_time = get_block_timestamp();
    Schedule {
        registration: Option::Some(Period { start: current_time + 100, end: current_time + 1000 }),
        game: Period { start: current_time + 1001, end: current_time + 2000 },
        submission_duration: 900,
    }
}


// ==============================================
// INTEGRATION TESTS WITH BUDOKAN
// ==============================================

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_budokan_create_tournament() {
    // This test shows how to:
    // 1. Deploy SnapshotValidator
    // 2. Create a snapshot with ID
    // 3. Upload snapshot data (player addresses with entry counts)
    // 4. Lock the snapshot to prevent modifications
    // 5. Create a tournament on Budokan using the SnapshotValidator as the entry requirement
    // 6. Enter the tournament through Budokan, which calls the validator

    let budokan_addr = budokan_address_mainnet();
    let minigame_addr = minigame_address_mainnet();
    let account = test_account_mainnet();

    // Step 1: Deploy SnapshotValidator
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Step 2: Create a snapshot (returns the ID)
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    stop_cheat_caller_address(validator_address);

    // Step 3: Upload snapshot data with player addresses and their allowed entries
    let player1 = account; // Use test account as player1 for simplicity
    let player2: ContractAddress = 0x222.try_into().unwrap();
    let player3: ContractAddress = 0x333.try_into().unwrap();

    let entries = array![
        Entry { address: player1, count: 3 }, Entry { address: player2, count: 5 },
        Entry { address: player3, count: 1 },
    ];

    // Upload the snapshot data
    start_cheat_caller_address(validator_address, account);
    validator.upload_snapshot_data(snapshot_id, entries.span());
    stop_cheat_caller_address(validator_address);

    // Step 4: Lock the snapshot to prevent further modifications
    start_cheat_caller_address(validator_address, account);
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    // Verify snapshot is locked
    assert(validator.is_snapshot_locked(snapshot_id), 'Snapshot not locked');

    // Verify snapshots were inserted correctly using new API
    assert(validator.get_snapshot_entry(snapshot_id, player1) == 3, 'P1: 3 entries');
    assert(validator.get_snapshot_entry(snapshot_id, player2) == 5, 'P2: 5 entries');
    assert(validator.get_snapshot_entry(snapshot_id, player3) == 1, 'P3: 1 entry');

    // Step 5: Create tournament on Budokan with SnapshotValidator as entry requirement
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    // Create extension config with the snapshot ID
    let extension_config = ExtensionConfig {
        address: validator_address,
        config: array![snapshot_id.into()].span() // Pass the snapshot ID in config
    };

    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement {
        entry_limit: 0, // No additional limit, controlled by snapshot
        entry_requirement_type,
    };

    start_cheat_caller_address(budokan_addr, account);
    let tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None, // No entry fee
            Option::Some(entry_requirement),
            false,
            "",
        );
    stop_cheat_caller_address(budokan_addr);

    // Verify tournament was created with correct requirements
    assert(tournament.entry_requirement.is_some(), 'Should have entry requirement');
    assert(tournament.id > 0, 'Should have valid tournament ID');

    // Step 6: Player enters tournament through Budokan
    // Advance time to registration period
    let schedule = test_schedule();
    let registration_start = match schedule.registration {
        Option::Some(reg) => reg.start,
        Option::None => 0,
    };
    snforge_std::start_cheat_block_timestamp_global(registration_start);

    // Player1 enters with their address in the qualification proof
    start_cheat_caller_address(budokan_addr, player1);
    let qualification_proof = Option::Some(
        QualificationProof::Extension(array![player1.into()].span()),
    );
    let (token_id, entry_number) = budokan
        .enter_tournament(tournament.id, 'player1', player1, qualification_proof);
    stop_cheat_caller_address(budokan_addr);

    // Verify entry was successful
    assert(entry_number == 1, 'Invalid entry number');
    assert(token_id > 0, 'Invalid token ID');

    // Verify the entry was tracked in the validator
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let entries_left = entry_validator.entries_left(tournament.id, player1, array![].span());
    assert(entries_left.is_some(), 'Should have entries left');
    assert(entries_left.unwrap() == 2, 'Should have 2 left'); // Started with 3, used 1

    // Player2 can also enter
    start_cheat_caller_address(budokan_addr, player2);
    let qualification_proof2 = Option::Some(
        QualificationProof::Extension(array![player2.into()].span()),
    );
    let (token_id2, entry_number2) = budokan
        .enter_tournament(tournament.id, 'player2', player2, qualification_proof2);
    stop_cheat_caller_address(budokan_addr);

    assert(entry_number2 == 2, 'Invalid entry number p2');
    assert(token_id2 > token_id, 'Invalid token ID p2');

    // Verify that a player not in snapshot cannot enter
    let unauthorized: ContractAddress = 0x999.try_into().unwrap();
    let entry_validator_check = IEntryValidatorDispatcher { contract_address: validator_address };
    let valid_unauth = entry_validator_check
        .valid_entry(tournament.id, unauthorized, array![unauthorized.into()].span());
    assert(!valid_unauth, 'Unauthorized should be invalid');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_budokan_multiple_entries() {
    // This test demonstrates a player using multiple entries from their snapshot allocation

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create snapshot (returns the ID)
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();

    // Create a player with 3 entries
    let player: ContractAddress = 0x111.try_into().unwrap();
    let entries = array![Entry { address: player, count: 3 }];
    validator.upload_snapshot_data(snapshot_id, entries.span());
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    // Verify initial state using new API
    assert(validator.get_snapshot_entry(snapshot_id, player) == 3, '3 entries');

    // In a real test with Budokan:
    // 1. Create tournament with validator
    // 2. Player enters first time (3 -> 2 entries left)
    // 3. Player enters second time (2 -> 1 entry left)
    // 4. Player enters third time (1 -> 0 entries left)
    // 5. Verify player cannot enter a fourth time

    // For now, test the validator directly
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_id: u64 = 1;

    // Configure the tournament to use this snapshot
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_config(tournament_id, 0, array![snapshot_id.into()].span());
    stop_cheat_caller_address(validator_address);

    // Check entries available
    let entries_left = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.is_some(), 'Has entries');
    assert(entries_left.unwrap() == 3, '3 entries left');

    // Simulate entering tournament (would normally be called by Budokan)
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Verify one entry was used
    let entries_after = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_after.unwrap() == 2, '2 entries left');

    assert(true, 'Multiple entries test');
}

#[test]
#[should_panic(
    expected: "Tournament: Invalid entry according to extension 1977072242796495595213879884851539254463533382469412510192656337198321128473",
)]
#[fork("mainnet")]
fn test_snapshot_validator_budokan_unauthorized_entry() {
    // This test demonstrates that a player without snapshot entries cannot enter through Budokan

    let budokan_addr = budokan_address_mainnet();
    let minigame_addr = minigame_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create and lock a snapshot with only player1 having entries
    let player1 = account;
    let player2: ContractAddress = 0x222.try_into().unwrap(); // No entries

    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    let entries = array![Entry { address: player1, count: 3 }];
    validator.upload_snapshot_data(snapshot_id, entries.span());
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    // Verify player2 has no entries using new API
    assert(validator.get_snapshot_entry(snapshot_id, player2) == 0, '0 entries');

    // Create tournament on Budokan with the validator as extension
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

    let extension_config = ExtensionConfig {
        address: validator_address, config: array![snapshot_id.into()].span(),
    };

    let entry_requirement = EntryRequirement {
        entry_limit: 0, entry_requirement_type: EntryRequirementType::extension(extension_config),
    };

    start_cheat_caller_address(budokan_addr, account);
    let tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );
    stop_cheat_caller_address(budokan_addr);

    // Advance to registration period
    let schedule = test_schedule();
    let registration_start = match schedule.registration {
        Option::Some(reg) => reg.start,
        Option::None => 0,
    };
    snforge_std::start_cheat_block_timestamp_global(registration_start);

    // Player2 tries to enter but should fail since they're not in the snapshot
    start_cheat_caller_address(budokan_addr, player2);
    let qualification_proof = Option::Some(
        QualificationProof::Extension(array![player2.into()].span()),
    );

    // This should panic with "Invalid entry according to extension"
    budokan.enter_tournament(tournament.id, 'unauthorized_player', player2, qualification_proof);
}

#[test]
fn test_snapshot_validator_budokan_update_snapshots() {
    // This test demonstrates creating multiple snapshots with different data

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create first snapshot: player1 has 2 entries
    let player1: ContractAddress = 0x111.try_into().unwrap();
    start_cheat_caller_address(validator_address, account);
    let snapshot_id_1 = validator.create_snapshot();
    let initial_entries = array![Entry { address: player1, count: 2 }];
    validator.upload_snapshot_data(snapshot_id_1, initial_entries.span());
    validator.lock_snapshot(snapshot_id_1);
    stop_cheat_caller_address(validator_address);

    assert(validator.get_snapshot_entry(snapshot_id_1, player1) == 2, '2 entries');

    // Create second snapshot with more entries for same player
    start_cheat_caller_address(validator_address, account);
    let snapshot_id_2 = validator.create_snapshot();
    let updated_entries = array![Entry { address: player1, count: 5 }];
    validator.upload_snapshot_data(snapshot_id_2, updated_entries.span());
    validator.lock_snapshot(snapshot_id_2);
    stop_cheat_caller_address(validator_address);

    // Verify player has different entries in different snapshots
    assert(validator.get_snapshot_entry(snapshot_id_2, player1) == 5, '5 entries in snapshot 2');
    assert(
        validator.get_snapshot_entry(snapshot_id_1, player1) == 2, 'Still 2 entries in snapshot 1',
    );

    // Create third snapshot with multiple players
    let player2: ContractAddress = 0x222.try_into().unwrap();
    start_cheat_caller_address(validator_address, account);
    let snapshot_id_3 = validator.create_snapshot();
    let multi_entries = array![
        Entry { address: player1, count: 3 }, Entry { address: player2, count: 4 },
    ];
    validator.upload_snapshot_data(snapshot_id_3, multi_entries.span());
    validator.lock_snapshot(snapshot_id_3);
    stop_cheat_caller_address(validator_address);

    // Verify all snapshots maintain their independent data
    assert(validator.get_snapshot_entry(snapshot_id_1, player1) == 2, 'Snapshot 1 unchanged');
    assert(validator.get_snapshot_entry(snapshot_id_2, player1) == 5, 'Snapshot 2 unchanged');
    assert(validator.get_snapshot_entry(snapshot_id_3, player1) == 3, 'Snapshot 3 player1');
    assert(validator.get_snapshot_entry(snapshot_id_3, player2) == 4, 'Snapshot 3 player2');

    assert(true, 'Multiple snapshots test');
}

#[test]
fn test_snapshot_validator_budokan_cross_tournament() {
    // This test demonstrates using different snapshots for different tournaments

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Player has different entries in different snapshots
    let player: ContractAddress = 0x111.try_into().unwrap();

    // Create snapshot for tournament 1
    start_cheat_caller_address(validator_address, account);
    let snapshot_id_t1 = validator.create_snapshot();
    let entries_t1 = array![Entry { address: player, count: 5 }];
    validator.upload_snapshot_data(snapshot_id_t1, entries_t1.span());
    validator.lock_snapshot(snapshot_id_t1);
    stop_cheat_caller_address(validator_address);

    // Create snapshot for tournament 2 with different entries
    start_cheat_caller_address(validator_address, account);
    let snapshot_id_t2 = validator.create_snapshot();
    let entries_t2 = array![Entry { address: player, count: 3 }];
    validator.upload_snapshot_data(snapshot_id_t2, entries_t2.span());
    validator.lock_snapshot(snapshot_id_t2);
    stop_cheat_caller_address(validator_address);

    // Verify player has different entries in each snapshot
    assert(validator.get_snapshot_entry(snapshot_id_t1, player) == 5, 'T1 snapshot: 5 entries');
    assert(validator.get_snapshot_entry(snapshot_id_t2, player) == 3, 'T2 snapshot: 3 entries');

    // Each tournament would use its respective snapshot
    // Tournament 1 uses snapshot_id_t1 (5 entries)
    // Tournament 2 uses snapshot_id_t2 (3 entries)

    // This demonstrates complete isolation between snapshots
    assert(validator.is_snapshot_locked(snapshot_id_t1), 'T1 snapshot locked');
    assert(validator.is_snapshot_locked(snapshot_id_t2), 'T2 snapshot locked');

    assert(true, 'Cross tournament test');
}

#[test]
fn test_snapshot_validator_locking_mechanism() {
    // This test demonstrates the snapshot locking mechanism

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let _other_account: ContractAddress = 0x999.try_into().unwrap();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create a snapshot
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    stop_cheat_caller_address(validator_address);

    // Verify snapshot is not locked initially
    assert(!validator.is_snapshot_locked(snapshot_id), 'Should not be locked');

    // Upload initial data
    let player1: ContractAddress = 0x111.try_into().unwrap();
    let initial_entries = array![Entry { address: player1, count: 3 }];
    start_cheat_caller_address(validator_address, account);
    validator.upload_snapshot_data(snapshot_id, initial_entries.span());
    stop_cheat_caller_address(validator_address);

    // Can upload more data before locking
    let player2: ContractAddress = 0x222.try_into().unwrap();
    let additional_entries = array![Entry { address: player2, count: 2 }];
    start_cheat_caller_address(validator_address, account);
    validator.upload_snapshot_data(snapshot_id, additional_entries.span());
    stop_cheat_caller_address(validator_address);

    // Verify both players have their entries
    assert(validator.get_snapshot_entry(snapshot_id, player1) == 3, 'Player1: 3 entries');
    assert(validator.get_snapshot_entry(snapshot_id, player2) == 2, 'Player2: 2 entries');

    // Lock the snapshot
    start_cheat_caller_address(validator_address, account);
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    // Verify snapshot is now locked
    assert(validator.is_snapshot_locked(snapshot_id), 'Should be locked');

    // Get metadata to verify status
    let metadata = validator.get_snapshot_metadata(snapshot_id);
    assert(metadata.is_some(), 'Metadata should exist');
    let snapshot_meta = metadata.unwrap();
    assert(snapshot_meta.status == SnapshotStatus::Locked, 'Status should be Locked');
    assert(snapshot_meta.owner == account, 'Owner should be account');

    assert(true, 'Locking mechanism test');
}

#[test]
fn test_snapshot_validator_ownership() {
    // This test demonstrates ownership controls on snapshots

    let budokan_addr = budokan_address_mainnet();
    let owner = test_account_mainnet();
    let _other_user: ContractAddress = 0x999.try_into().unwrap();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Owner creates a snapshot
    start_cheat_caller_address(validator_address, owner);
    let snapshot_id = validator.create_snapshot();
    stop_cheat_caller_address(validator_address);

    // Owner uploads data
    let player1: ContractAddress = 0x111.try_into().unwrap();
    let entries = array![Entry { address: player1, count: 3 }];
    start_cheat_caller_address(validator_address, owner);
    validator.upload_snapshot_data(snapshot_id, entries.span());
    stop_cheat_caller_address(validator_address);

    // Verify ownership in metadata
    let metadata = validator.get_snapshot_metadata(snapshot_id);
    assert(metadata.unwrap().owner == owner, 'Owner should be set');

    // Owner can lock the snapshot
    start_cheat_caller_address(validator_address, owner);
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    assert(validator.is_snapshot_locked(snapshot_id), 'Should be locked by owner');

    assert(true, 'Ownership test');
}
#[test]
#[should_panic(
    expected: "Tournament: No entries left according to extension 1977072242796495595213879884851539254463533382469412510192656337198321128473",
)]
#[fork("mainnet")]
fn test_snapshot_validator_exceed_entry_limit() {
    // This test verifies that a player cannot enter a tournament more times
    // than their snapshot allocation allows

    let budokan_addr = budokan_address_mainnet();
    let minigame_addr = minigame_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create snapshot with player having only 2 entries
    let player: ContractAddress = 0x111.try_into().unwrap();
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    let entries = array![Entry { address: player, count: 2 }]; // Only 2 entries allowed
    validator.upload_snapshot_data(snapshot_id, entries.span());
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    // Create tournament
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };
    let extension_config = ExtensionConfig {
        address: validator_address, config: array![snapshot_id.into()].span(),
    };
    let entry_requirement = EntryRequirement {
        entry_limit: 0, entry_requirement_type: EntryRequirementType::extension(extension_config),
    };

    start_cheat_caller_address(budokan_addr, account);
    let tournament = budokan
        .create_tournament(
            account,
            test_metadata(),
            test_schedule(),
            test_game_config(minigame_addr),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );
    stop_cheat_caller_address(budokan_addr);

    // Advance to registration period
    let schedule = test_schedule();
    let registration_start = match schedule.registration {
        Option::Some(reg) => reg.start,
        Option::None => 0,
    };
    snforge_std::start_cheat_block_timestamp_global(registration_start);

    let qualification_proof = Option::Some(
        QualificationProof::Extension(array![player.into()].span()),
    );

    // First entry - should succeed
    start_cheat_caller_address(budokan_addr, player);
    let (token_id_1, entry_1) = budokan
        .enter_tournament(tournament.id, 'player_entry_1', player, qualification_proof);
    stop_cheat_caller_address(budokan_addr);
    assert(entry_1 == 1, 'First entry should succeed');

    // Second entry - should succeed
    start_cheat_caller_address(budokan_addr, player);
    let (token_id_2, entry_2) = budokan
        .enter_tournament(tournament.id, 'player_entry_2', player, qualification_proof);
    stop_cheat_caller_address(budokan_addr);
    assert(entry_2 == 2, 'Second entry should succeed');
    assert(token_id_2 > token_id_1, 'Second token ID higher');

    // Verify no entries left
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let entries_left = entry_validator.entries_left(tournament.id, player, array![].span());
    assert(entries_left.is_some(), 'Should have entries info');
    assert(entries_left.unwrap() == 0, 'Should have 0 entries left');

    // Third entry - should PANIC because player only had 2 entries
    start_cheat_caller_address(budokan_addr, player);
    budokan.enter_tournament(tournament.id, 'player_entry_3', player, qualification_proof);
    // Should not reach here
}

#[test]
fn test_snapshot_validator_zero_entries() {
    // Test that a player with 0 entries in snapshot cannot enter

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    let player: ContractAddress = 0x111.try_into().unwrap();

    // Create snapshot with player having 0 entries
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    let entries = array![Entry { address: player, count: 0 }];
    validator.upload_snapshot_data(snapshot_id, entries.span());
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    // Configure tournament
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_id: u64 = 1;

    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_config(tournament_id, 0, array![snapshot_id.into()].span());
    stop_cheat_caller_address(validator_address);

    // Verify player cannot enter
    let is_valid = entry_validator.valid_entry(tournament_id, player, array![].span());
    assert(!is_valid, 'Player with 0 entries invalid');

    let entries_left = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.is_some(), 'Should return entries info');
    assert(entries_left.unwrap() == 0, '0 entries left');
}

#[test]
#[should_panic(expected: "Snapshot is locked")]
fn test_snapshot_upload_data_to_locked_snapshot() {
    // Test that uploading data to a locked snapshot fails

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create and lock snapshot
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    let initial_entries = array![Entry { address: account, count: 3 }];
    validator.upload_snapshot_data(snapshot_id, initial_entries.span());
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    // Try to upload more data - should panic
    let player2: ContractAddress = 0x222.try_into().unwrap();
    let additional_entries = array![Entry { address: player2, count: 5 }];
    start_cheat_caller_address(validator_address, account);
    validator.upload_snapshot_data(snapshot_id, additional_entries.span());
    // Should not reach here
}

#[test]
#[should_panic(expected: "Caller is not the owner")]
fn test_snapshot_non_owner_upload() {
    // Test that non-owner cannot upload data to someone else's snapshot

    let budokan_addr = budokan_address_mainnet();
    let owner = test_account_mainnet();
    let non_owner: ContractAddress = 0x999.try_into().unwrap();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Owner creates snapshot
    start_cheat_caller_address(validator_address, owner);
    let snapshot_id = validator.create_snapshot();
    stop_cheat_caller_address(validator_address);

    // Non-owner tries to upload data - should panic
    let entries = array![Entry { address: non_owner, count: 3 }];
    start_cheat_caller_address(validator_address, non_owner);
    validator.upload_snapshot_data(snapshot_id, entries.span());
    // Should not reach here
}

#[test]
#[should_panic(expected: "Caller is not the owner")]
fn test_snapshot_non_owner_lock() {
    // Test that non-owner cannot lock someone else's snapshot

    let budokan_addr = budokan_address_mainnet();
    let owner = test_account_mainnet();
    let non_owner: ContractAddress = 0x999.try_into().unwrap();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Owner creates and uploads data to snapshot
    start_cheat_caller_address(validator_address, owner);
    let snapshot_id = validator.create_snapshot();
    let entries = array![Entry { address: owner, count: 3 }];
    validator.upload_snapshot_data(snapshot_id, entries.span());
    stop_cheat_caller_address(validator_address);

    // Non-owner tries to lock - should panic
    start_cheat_caller_address(validator_address, non_owner);
    validator.lock_snapshot(snapshot_id);
    // Should not reach here
}

#[test]
#[should_panic(expected: "Snapshot does not exist")]
fn test_snapshot_use_nonexistent_snapshot() {
    // Test that using a non-existent snapshot ID fails

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    let nonexistent_snapshot_id: u64 = 999;

    // Try to upload data to non-existent snapshot - should panic
    let entries = array![Entry { address: account, count: 3 }];
    start_cheat_caller_address(validator_address, account);
    validator.upload_snapshot_data(nonexistent_snapshot_id, entries.span());
    // Should not reach here
}

#[test]
#[should_panic(expected: "Snapshot is already locked")]
fn test_snapshot_double_lock() {
    // Test that locking a snapshot twice fails

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create, upload, and lock snapshot
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    let entries = array![Entry { address: account, count: 3 }];
    validator.upload_snapshot_data(snapshot_id, entries.span());
    validator.lock_snapshot(snapshot_id);

    // Try to lock again - should panic
    validator.lock_snapshot(snapshot_id);
    // Should not reach here
}

#[test]
#[should_panic(expected: "Snapshot does not exist")]
fn test_snapshot_add_config_nonexistent_snapshot() {
    // Test that adding a tournament config with non-existent snapshot fails

    let budokan_addr = budokan_address_mainnet();
    let _account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let tournament_id: u64 = 1;
    let nonexistent_snapshot_id: u64 = 999;

    // Try to configure tournament with non-existent snapshot - should panic
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_config(tournament_id, 0, array![nonexistent_snapshot_id.into()].span());
    // Should not reach here
}

#[test]
fn test_snapshot_validator_entries_tracking_across_uses() {
    // Test that entries are properly tracked as they're used up

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    let player: ContractAddress = 0x111.try_into().unwrap();

    // Create snapshot with 5 entries
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    let entries = array![Entry { address: player, count: 5 }];
    validator.upload_snapshot_data(snapshot_id, entries.span());
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_id: u64 = 1;

    // Configure tournament
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_config(tournament_id, 0, array![snapshot_id.into()].span());
    stop_cheat_caller_address(validator_address);

    // Initial check - 5 entries
    let entries_left = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.unwrap() == 5, 'Start with 5 entries');

    // Use 1 entry
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    let entries_after_1 = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_after_1.unwrap() == 4, '4 entries left after 1');

    // Use 2 more entries
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_entry(tournament_id, player, array![].span());
    entry_validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    let entries_after_3 = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_after_3.unwrap() == 2, '2 entries left after 3');

    // Use remaining 2 entries
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_entry(tournament_id, player, array![].span());
    entry_validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    let entries_final = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_final.unwrap() == 0, '0 entries left after all used');

    // Verify player is still "valid" (has entries in snapshot) but has 0 entries left
    let is_valid = entry_validator.valid_entry(tournament_id, player, array![].span());
    assert(is_valid, 'Still valid, but 0 left');
    // The actual blocking happens in Budokan when entries_left == 0
}

#[test]
fn test_snapshot_validator_independent_tournament_tracking() {
    // Test that entry tracking is independent per tournament

    let budokan_addr = budokan_address_mainnet();
    let account = test_account_mainnet();
    let validator_address = deploy_snapshot_validator(budokan_addr);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    let player: ContractAddress = 0x111.try_into().unwrap();

    // Create snapshot with 3 entries
    start_cheat_caller_address(validator_address, account);
    let snapshot_id = validator.create_snapshot();
    let entries = array![Entry { address: player, count: 3 }];
    validator.upload_snapshot_data(snapshot_id, entries.span());
    validator.lock_snapshot(snapshot_id);
    stop_cheat_caller_address(validator_address);

    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let tournament_1: u64 = 1;
    let tournament_2: u64 = 2;

    // Configure both tournaments with same snapshot
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_config(tournament_1, 0, array![snapshot_id.into()].span());
    entry_validator.add_config(tournament_2, 0, array![snapshot_id.into()].span());
    stop_cheat_caller_address(validator_address);

    // Use 2 entries in tournament 1
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_entry(tournament_1, player, array![].span());
    entry_validator.add_entry(tournament_1, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Check tournament 1 - should have 1 left
    let t1_entries = entry_validator.entries_left(tournament_1, player, array![].span());
    assert(t1_entries.unwrap() == 1, 'T1: 1 entry left');

    // Check tournament 2 - should still have 3 (independent tracking)
    let t2_entries = entry_validator.entries_left(tournament_2, player, array![].span());
    assert(t2_entries.unwrap() == 3, 'T2: 3 entries left');

    // Use 1 entry in tournament 2
    start_cheat_caller_address(validator_address, budokan_addr);
    entry_validator.add_entry(tournament_2, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Verify independent tracking
    let t1_final = entry_validator.entries_left(tournament_1, player, array![].span());
    let t2_final = entry_validator.entries_left(tournament_2, player, array![].span());
    assert(t1_final.unwrap() == 1, 'T1: still 1 entry');
    assert(t2_final.unwrap() == 2, 'T2: now 2 entries');
}
// ==============================================
// REAL WORLD USAGE EXAMPLE
// ==============================================
// This comment block shows how you would use this in production:
//
// 1. Deploy SnapshotValidator:
//    let validator = deploy_snapshot_validator(budokan_address);
//
// 2. Create a new snapshot (returns unique ID):
//    let snapshot_id = validator.create_snapshot();
//
// 3. Prepare and upload snapshot data (e.g., from off-chain analysis):
//    let snapshot_data = array![
//        Entry { address: eligible_player_1, count: 3 },
//        Entry { address: eligible_player_2, count: 5 },
//        // ... more players
//    ];
//    validator.upload_snapshot_data(snapshot_id, snapshot_data.span());
//
// 4. Lock the snapshot to prevent further modifications:
//    validator.lock_snapshot(snapshot_id);
//
// 5. Create tournament on Budokan with validator as extension:
//    let extension_config = ExtensionConfig {
//        address: validator_address,
//        config: array![snapshot_id.into()].span(), // Pass snapshot ID
//    };
//    budokan.create_tournament(..., extension_config);
//
// 6. Players can now enter using their snapshot allocation:
//    budokan.enter_tournament(
//        tournament_id,
//        player_name,
//        player_address,
//        QualificationProof::Extension(array![player_address.into()].span())
//    );
//
// 7. The validator will:
//    - Check if player has entries > 0 in the specified snapshot
//    - Track entries used per tournament
//    - Return remaining entries for the player
//    - Ensure snapshot data cannot be modified once locked
// ==============================================


