use budokan_entry_requirement::examples::snapshot_validator::{
    ISnapshotValidatorDispatcher, ISnapshotValidatorDispatcherTrait, Snapshot,
};
use budokan_interfaces::entry_validator::{
    IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// ==============================================
// FORK TEST CONFIGURATION
// ==============================================
// This test is designed to run against a forked network (mainnet or testnet)
// To run this test with forking:
//
// 1. Add to Scarb.toml under [tool.snforge]:
//    fork = [
//        { name = "sepolia", url = "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
//        block_id.number = 123456 }
//    ]
//
// 2. Run the test with:
//    snforge test --fork-name sepolia
//
// Or set environment variable:
//    export STARKNET_RPC_URL="your-rpc-url"
//    snforge test --fork-url $STARKNET_RPC_URL --fork-block-number 123456
// ==============================================

// Budokan contract address on mainnet
fn budokan_address() -> ContractAddress {
    // Mainnet Budokan contract address
    0x58f888ba5897efa811eca5e5818540d35b664f4281660cd839cd5a4b0bf4582.try_into().unwrap()
}

// Deploy the SnapshotValidator contract
fn deploy_snapshot_validator(tournament_address: ContractAddress) -> ContractAddress {
    let contract = declare("SnapshotValidator").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![tournament_address.into()]).unwrap();
    contract_address
}

// ==============================================
// FORK TESTS
// ==============================================

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_deploy() {
    // Test that we can deploy the SnapshotValidator on a forked network
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);

    // Verify the validator was deployed
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Test basic functionality - check that a non-existent player has 0 entries
    let player: ContractAddress = 0x123.try_into().unwrap();
    let entries = validator.get_address_entries(player);
    assert(entries == 0, 'New player has 0 entries');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_insert_snapshots() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create snapshot data for multiple players
    let player1: ContractAddress = 0x111.try_into().unwrap();
    let player2: ContractAddress = 0x222.try_into().unwrap();
    let player3: ContractAddress = 0x333.try_into().unwrap();

    let snapshots = array![
        Snapshot { address: player1, entries: 3 }, Snapshot { address: player2, entries: 5 },
        Snapshot { address: player3, entries: 1 },
    ];

    // Insert snapshots
    validator.insert_snapshots(snapshots.span());

    // Verify each player's entries
    assert(validator.get_address_entries(player1) == 3, 'Player1: 3 entries');
    assert(validator.get_address_entries(player2) == 5, 'Player2: 5 entries');
    assert(validator.get_address_entries(player3) == 1, 'Player3: 1 entry');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_validate_entry() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Create snapshot data
    let player_with_entries: ContractAddress = 0x111.try_into().unwrap();
    let player_without_entries: ContractAddress = 0x222.try_into().unwrap();

    let snapshots = array![Snapshot { address: player_with_entries, entries: 2 }];

    // Insert snapshots
    validator.insert_snapshots(snapshots.span());

    // Test validation - player with entries should be valid
    let tournament_id: u64 = 1;
    let is_valid = entry_validator.valid_entry(tournament_id, player_with_entries, array![].span());
    assert(is_valid, 'Player with entries valid');

    // Test validation - player without entries should be invalid
    let is_invalid = entry_validator
        .valid_entry(tournament_id, player_without_entries, array![].span());
    assert(!is_invalid, 'No entries: invalid');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_entries_left() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Create player with 3 entries
    let player: ContractAddress = 0x111.try_into().unwrap();
    let snapshots = array![Snapshot { address: player, entries: 3 }];
    validator.insert_snapshots(snapshots.span());

    let tournament_id: u64 = 1;

    // Initially should have 3 entries left
    let entries_left = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_left.is_some(), 'Has entries');
    assert(entries_left.unwrap() == 3, '3 entries left');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_add_entry() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Create player with 3 entries
    let player: ContractAddress = 0x111.try_into().unwrap();
    let snapshots = array![Snapshot { address: player, entries: 3 }];
    validator.insert_snapshots(snapshots.span());

    let tournament_id: u64 = 1;

    // Initially should have 3 entries left
    let entries_before = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_before.unwrap() == 3, '3 entries');

    // Simulate adding an entry (normally called by budokan contract)
    // We need to cheat the caller to be the budokan address
    start_cheat_caller_address(validator_address, tournament_address);
    entry_validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // After adding entry, should have 2 left
    let entries_after = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_after.unwrap() == 2, '2 entries left');

    // Add another entry
    start_cheat_caller_address(validator_address, tournament_address);
    entry_validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Should have 1 left
    let entries_after2 = entry_validator.entries_left(tournament_id, player, array![].span());
    assert(entries_after2.unwrap() == 1, '1 entry left');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_multiple_tournaments() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };
    let entry_validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Create player with 5 total entries
    let player: ContractAddress = 0x111.try_into().unwrap();
    let snapshots = array![Snapshot { address: player, entries: 5 }];
    validator.insert_snapshots(snapshots.span());

    // Test with two different tournaments
    let tournament_1: u64 = 1;
    let tournament_2: u64 = 2;

    // Add entries to tournament 1
    start_cheat_caller_address(validator_address, tournament_address);
    entry_validator.add_entry(tournament_1, player, array![].span());
    entry_validator.add_entry(tournament_1, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Check remaining entries for tournament 1 (should be 3)
    let entries_t1 = entry_validator.entries_left(tournament_1, player, array![].span());
    assert(entries_t1.unwrap() == 3, 'T1: 3 left');

    // Add entries to tournament 2
    start_cheat_caller_address(validator_address, tournament_address);
    entry_validator.add_entry(tournament_2, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Check remaining entries for tournament 2 (should be 4 - only 1 used in this tournament)
    let entries_t2 = entry_validator.entries_left(tournament_2, player, array![].span());
    assert(entries_t2.unwrap() == 4, 'T2: 4 left');

    // Verify tournament 1 entries haven't changed
    let entries_t1_again = entry_validator.entries_left(tournament_1, player, array![].span());
    assert(entries_t1_again.unwrap() == 3, 'T1: still 3');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_large_snapshot_batch() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create a large batch of snapshot data
    let mut snapshots = array![];
    let mut i: u32 = 1;
    while i <= 50 {
        let player_address: ContractAddress = (0x1000 + i.into()).try_into().unwrap();
        let entries: u8 = (i % 10).try_into().unwrap();
        snapshots.append(Snapshot { address: player_address, entries });
        i += 1;
    }

    // Insert large batch
    validator.insert_snapshots(snapshots.span());

    // Verify random samples
    let player_1: ContractAddress = 0x1001.try_into().unwrap();
    assert(validator.get_address_entries(player_1) == 1, 'P1: wrong entries');

    let player_10: ContractAddress = 0x100A.try_into().unwrap();
    assert(validator.get_address_entries(player_10) == 0, 'P10: wrong entries');

    let player_25: ContractAddress = 0x1019.try_into().unwrap();
    assert(validator.get_address_entries(player_25) == 5, 'P25: wrong entries');
}

#[test]
#[fork("mainnet")]
fn test_snapshot_validator_fork_overwrite_entries() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    let player: ContractAddress = 0x111.try_into().unwrap();

    // Insert initial snapshot with 3 entries
    let initial_snapshots = array![Snapshot { address: player, entries: 3 }];
    validator.insert_snapshots(initial_snapshots.span());
    assert(validator.get_address_entries(player) == 3, '3 entries');

    // Overwrite with new snapshot data (5 entries)
    let updated_snapshots = array![Snapshot { address: player, entries: 5 }];
    validator.insert_snapshots(updated_snapshots.span());
    assert(validator.get_address_entries(player) == 5, '5 entries');

    // Overwrite again (0 entries)
    let zero_snapshots = array![Snapshot { address: player, entries: 0 }];
    validator.insert_snapshots(zero_snapshots.span());
    assert(validator.get_address_entries(player) == 0, '0 entries');
}

// ==============================================
// INTEGRATION TEST WITH BUDOKAN CONTRACT
// ==============================================
// This test demonstrates interaction with the actual deployed Budokan contract
// Note: This requires the Budokan contract to be deployed and accessible on the fork
// You may need to adjust this based on the actual Budokan interface

#[test]
#[fork("mainnet")]
#[ignore] // Remove this attribute when you have the actual Budokan interface available
fn test_snapshot_validator_fork_budokan_integration() {
    // Deploy validator
    let tournament_address = budokan_address();
    let validator_address = deploy_snapshot_validator(tournament_address);
    let validator = ISnapshotValidatorDispatcher { contract_address: validator_address };

    // Create snapshot for a player
    let player: ContractAddress = 0x111.try_into().unwrap();
    let snapshots = array![Snapshot { address: player, entries: 3 }];
    validator.insert_snapshots(snapshots.span());

    // At this point, you would interact with the actual Budokan contract
    // Example (pseudo-code, adjust to actual Budokan interface):
    //
    // use budokan::interface::{IBudokanDispatcher, IBudokanDispatcherTrait};
    // let budokan = IBudokanDispatcher { contract_address: tournament_address };
    //
    // // Set the validator for a tournament
    // start_cheat_caller_address(tournament_address, admin_address);
    // budokan.set_entry_validator(tournament_id, validator_address);
    // stop_cheat_caller_address(tournament_address);
    //
    // // Try to enter tournament as the player
    // start_cheat_caller_address(tournament_address, player);
    // budokan.enter_tournament(tournament_id);
    // stop_cheat_caller_address(tournament_address);
    //
    // // Verify the entry was successful
    // let entries_left = validator.get_address_entries(player);
    // assert(entries_left == 2, 'Should have used 1 entry');

    // Placeholder assertion
    assert(true, 'Integration test placeholder');
}
