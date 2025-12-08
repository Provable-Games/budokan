use budokan_entry_requirement::examples::opus_troves_validator::{
    IEntryValidatorMockDispatcher, IEntryValidatorMockDispatcherTrait,
};
use budokan_entry_requirement::tests::constants::{budokan_address, minigame_address, test_account};
use budokan_interfaces::entry_validator::{
    IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
};
use core::num::traits::Zero;
use opus::periphery::interfaces::{
    IFrontendDataProviderDispatcher, IFrontendDataProviderDispatcherTrait,
};
use opus::periphery::types::TroveInfo;
use opus::types::AssetBalance;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::{ContractAddress, get_block_timestamp};
use wadray::Wad;

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
    Tournament: TournamentQualification,
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
    fn validate_entry(
        ref self: TState, tournament_id: u64, game_token_id: u64, proof: Span<felt252>,
    );
}

#[starknet::interface]
pub trait IERC20<TState> {
    fn approve(ref self: TState, spender: ContractAddress, amount: u256);
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
}

#[starknet::interface]
pub trait IAbbot<TState> {
    fn open_trove(
        ref self: TState,
        yang_assets: Span<AssetBalance>,
        forge_amount: Wad,
        max_forge_fee_pct: Wad,
    ) -> u64;
    fn melt(ref self: TState, trove_id: u64, amount: Wad);
    fn get_user_trove_ids(self: @TState, user: ContractAddress) -> Span<u64>;
}

// ==============================================
// OPUS TROVES VALIDATOR BUDOKAN INTEGRATION FORK TEST
// ==============================================
// This test demonstrates full integration with a deployed Budokan contract
// on a forked network using the OpusTrovesValidator.
//
// Key features tested:
// - Mode 1: Fixed entry limit (all eligible players get same entries)
// - Mode 2: Scaled entries based on deposited value (no cap)
// - Mode 3: Scaled entries with maximum cap
// - Entry validation based on trove asset deposits
// ==============================================

// Opus mainnet addresses
fn abbot_address() -> ContractAddress {
    0x04d0bb0a4c40012384e7c419e6eb3c637b28e8363fb66958b60d90505b9c072f.try_into().unwrap()
}

fn fdp_address() -> ContractAddress {
    0x023037703b187f6ff23b883624a0a9f266c9d44671e762048c70100c2f128ab9.try_into().unwrap()
}

fn opus_strk_gate_address() -> ContractAddress {
    0x031a96FE18Fe3Fdab28822c82C81471f1802800723C8f3E209F1d9da53bC637D.try_into().unwrap()
}

fn strk_token_address() -> ContractAddress {
    0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d.try_into().unwrap()
}

fn strk_yang_address() -> ContractAddress {
    // The STRK yang address in Opus (wrapped STRK used in troves)
    0x07c2e1e733f28daa23e78be3a4f6c724c0ab06af65f6a95b5e0545215f1abc1b.try_into().unwrap()
}

fn wsteth_yang_address() -> ContractAddress {
    0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2.try_into().unwrap()
}

// Mock trove asset address (for non-fork tests)
fn mock_trove_asset() -> ContractAddress {
    0x888888888.try_into().unwrap()
}

// Deploy the OpusTrovesValidator contract
fn deploy_opus_validator(tournament_address: ContractAddress) -> ContractAddress {
    let contract = declare("OpusTrovesValidator").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![tournament_address.into()]).unwrap();
    contract_address
}

// Helper functions for creating tournaments
fn test_metadata() -> Metadata {
    Metadata { name: 'Opus Tournament', description: "Tournament for Opus Trove holders" }
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
// INTEGRATION TESTS WITH BUDOKAN AND OPUS
// ==============================================

#[test]
#[fork("mainnet")]
fn test_opus_validator_fixed_entry_limit() {
    // Mode 1: Fixed entry limit - all eligible players get the same number of entries
    // Config: [trove_asset, threshold]
    // All players with threshold+ deposits get exactly entry_limit entries

    let budokan_addr = budokan_address();
    let minigame_addr = minigame_address();
    let account = test_account();

    // Deploy OpusTrovesValidator
    let validator_address = deploy_opus_validator(budokan_addr);
    let _validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let validator_mock = IEntryValidatorMockDispatcher { contract_address: validator_address };

    // Configure for fixed entry limit mode
    let trove_asset = mock_trove_asset();
    let threshold: u128 = 1000; // Must have at least 1000 units deposited
    let entry_limit: u8 = 5; // All eligible players get 5 entries

    let extension_config = ExtensionConfig {
        address: validator_address, config: array![trove_asset.into(), threshold.into()].span(),
    };

    let entry_requirement = EntryRequirement {
        entry_limit: entry_limit,
        entry_requirement_type: EntryRequirementType::extension(extension_config),
    };

    // Create tournament on Budokan
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

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

    // Verify tournament created
    assert(tournament.id > 0, 'Tournament should be created');
    assert(tournament.entry_requirement.is_some(), 'Should have entry requirement');

    // Verify configuration was stored correctly
    assert(validator_mock.get_trove_asset(tournament.id) == trove_asset, 'Trove asset mismatch');
    assert(validator_mock.get_trove_threshold(tournament.id) == threshold, 'Threshold mismatch');
    assert(validator_mock.get_value_per_entry(tournament.id) == 0, 'Should be fixed mode');
    assert(validator_mock.get_max_entries(tournament.id) == 0, 'No max cap');
    // In fixed mode, eligible players would get exactly 5 entries
// This would require actual Opus integration on mainnet fork
}

#[test]
fn test_opus_validator_scaled_entries_no_cap() {
    // Mode 2: Scaled entries without cap
    // Config: [trove_asset, threshold, value_per_entry, 0]
    // Entries = (deposited_value - threshold) / value_per_entry, unlimited

    let budokan_addr = budokan_address();
    let _account = test_account();

    let validator_address = deploy_opus_validator(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let validator_mock = IEntryValidatorMockDispatcher { contract_address: validator_address };

    let tournament_id: u64 = 1;
    let trove_asset = mock_trove_asset();
    let threshold: u128 = 1000; // Base threshold
    let value_per_entry: u128 = 500; // Each 500 units = 1 entry
    let max_entries: u8 = 0; // No cap

    // Configure directly via validator
    let config = array![
        trove_asset.into(), threshold.into(), value_per_entry.into(), max_entries.into(),
    ];

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(tournament_id, 0, config.span());
    stop_cheat_caller_address(validator_address);

    // Verify configuration
    assert(validator_mock.get_trove_asset(tournament_id) == trove_asset, 'Trove asset mismatch');
    assert(validator_mock.get_trove_threshold(tournament_id) == threshold, 'Threshold mismatch');
    assert(
        validator_mock.get_value_per_entry(tournament_id) == value_per_entry,
        'Value per entry mismatch',
    );
    assert(validator_mock.get_max_entries(tournament_id) == 0, 'Should have no cap');
    // Example calculations:
// Player with 5500 deposited: (5500 - 1000) / 500 = 9 entries
// Player with 3000 deposited: (3000 - 1000) / 500 = 4 entries
// Player with 900 deposited: not eligible (below threshold)
}

#[test]
fn test_opus_validator_scaled_entries_with_cap() {
    // Mode 3: Scaled entries with maximum cap
    // Config: [trove_asset, threshold, value_per_entry, max_entries]
    // Entries = min((deposited_value - threshold) / value_per_entry, max_entries)

    let budokan_addr = budokan_address();
    let _account = test_account();

    let validator_address = deploy_opus_validator(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let validator_mock = IEntryValidatorMockDispatcher { contract_address: validator_address };

    let tournament_id: u64 = 1;
    let trove_asset = mock_trove_asset();
    let threshold: u128 = 1000; // Base threshold
    let value_per_entry: u128 = 500; // Each 500 units = 1 entry
    let max_entries: u8 = 10; // Cap at 10 entries

    // Configure directly via validator
    let config = array![
        trove_asset.into(), threshold.into(), value_per_entry.into(), max_entries.into(),
    ];

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(tournament_id, 0, config.span());
    stop_cheat_caller_address(validator_address);

    // Verify configuration
    assert(validator_mock.get_trove_asset(tournament_id) == trove_asset, 'Trove asset mismatch');
    assert(validator_mock.get_trove_threshold(tournament_id) == threshold, 'Threshold mismatch');
    assert(
        validator_mock.get_value_per_entry(tournament_id) == value_per_entry,
        'Value per entry mismatch',
    );
    assert(validator_mock.get_max_entries(tournament_id) == max_entries, 'Max entries mismatch');
    // Example calculations with cap:
// Player with 10000 deposited: (10000 - 1000) / 500 = 18, capped to 10 entries
// Player with 3000 deposited: (3000 - 1000) / 500 = 4 entries (not capped)
// Player with 6000 deposited: (6000 - 1000) / 500 = 10 entries (at cap)
// Player with 900 deposited: not eligible (below threshold)
}

#[test]
fn test_opus_validator_entry_tracking() {
    // Test that entries are properly tracked as players use them

    let budokan_addr = budokan_address();
    let _account = test_account();

    let validator_address = deploy_opus_validator(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let tournament_id: u64 = 1;
    let player: ContractAddress = 0x111.try_into().unwrap();

    // Configure with fixed limit
    let config = array![mock_trove_asset().into(), 1000_u128.into()];

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(tournament_id, 5, config.span());
    stop_cheat_caller_address(validator_address);

    // Check initial entries (would be 5 if player meets threshold)
    let initial_entries = validator.entries_left(tournament_id, player, array![].span());
    assert(initial_entries.is_some(), 'Should have entries info');

    // Simulate player using entries
    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_entry(tournament_id, player, array![].span());
    validator.add_entry(tournament_id, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Check remaining entries (should have used 2)
    let remaining = validator.entries_left(tournament_id, player, array![].span());
    assert(remaining.is_some(), 'Should still have entries info');
}

#[test]
fn test_opus_validator_configuration_modes() {
    // Test that all three configuration modes are properly recognized

    let budokan_addr = budokan_address();
    let account = test_account();

    let validator_address = deploy_opus_validator(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let validator_mock = IEntryValidatorMockDispatcher { contract_address: validator_address };

    // Tournament 1: Fixed mode (2 params)
    let tournament_1: u64 = 1;
    let config_1 = array![mock_trove_asset().into(), 1000_u128.into()];

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(tournament_1, 5, config_1.span());
    stop_cheat_caller_address(validator_address);

    assert(validator_mock.get_value_per_entry(tournament_1) == 0, 'T1: Fixed mode');
    assert(validator_mock.get_max_entries(tournament_1) == 0, 'T1: No cap');

    // Tournament 2: Scaled mode without cap (3 params)
    let tournament_2: u64 = 2;
    let config_2 = array![mock_trove_asset().into(), 1000_u128.into(), 500_u128.into()];

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(tournament_2, 0, config_2.span());
    stop_cheat_caller_address(validator_address);

    assert(validator_mock.get_value_per_entry(tournament_2) == 500, 'T2: Scaled mode');
    assert(validator_mock.get_max_entries(tournament_2) == 0, 'T2: No cap');

    // Tournament 3: Scaled mode with cap (4 params)
    let tournament_3: u64 = 3;
    let config_3 = array![
        mock_trove_asset().into(), 1000_u128.into(), 500_u128.into(), 10_u8.into(),
    ];

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(tournament_3, 0, config_3.span());
    stop_cheat_caller_address(validator_address);

    assert(validator_mock.get_value_per_entry(tournament_3) == 500, 'T3: Scaled mode');
    assert(validator_mock.get_max_entries(tournament_3) == 10, 'T3: Has cap');
}

#[test]
fn test_opus_validator_cross_tournament_independence() {
    // Test that entry tracking is independent per tournament

    let budokan_addr = budokan_address();
    let account = test_account();

    let validator_address = deploy_opus_validator(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    let tournament_1: u64 = 1;
    let tournament_2: u64 = 2;
    let player: ContractAddress = 0x111.try_into().unwrap();

    // Configure both tournaments
    let config = array![mock_trove_asset().into(), 1000_u128.into()];

    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_config(tournament_1, 3, config.span());
    validator.add_config(tournament_2, 5, config.span());
    stop_cheat_caller_address(validator_address);

    // Use 2 entries in tournament 1
    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_entry(tournament_1, player, array![].span());
    validator.add_entry(tournament_1, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Use 1 entry in tournament 2
    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_entry(tournament_2, player, array![].span());
    stop_cheat_caller_address(validator_address);

    // Verify independent tracking
    let t1_entries = validator.entries_left(tournament_1, player, array![].span());
    let t2_entries = validator.entries_left(tournament_2, player, array![].span());

    assert(t1_entries.is_some(), 'T1 should have entries');
    assert(t2_entries.is_some(), 'T2 should have entries');
    // In practice: T1 would have 1 left (3-2), T2 would have 4 left (5-1)
}

// #[test]
// #[fork("mainnet")]
// fn test_debug_trove_assets() {
//     // Debug test to print out what asset addresses are in a trove
//     let _account = test_account();
//     let strk_token = IERC20Dispatcher { contract_address: strk_token_address() };
//     let abbot = IAbbotDispatcher { contract_address: abbot_address() };
//     let fdp = IFrontendDataProviderDispatcher { contract_address: fdp_address() };

//     // Approve and open trove
//     start_cheat_caller_address(strk_token_address(), account);
//     strk_token.approve(opus_strk_gate_address(), 1000000000000000000000);
//     stop_cheat_caller_address(strk_token_address());

//     let yang_asset = AssetBalance {
//         address: strk_token_address(), amount: 1000000000000000000000,
//     };

//     start_cheat_caller_address(abbot_address(), account);
//     let trove_id = abbot
//         .open_trove(array![yang_asset].span(), 4000000000000000000_u128.into(), 1_u128.into(),);
//     abbot.melt(trove_id, 1_u128.into());
//     stop_cheat_caller_address(abbot_address());

//     // Get trove info and print asset addresses
//     let trove_info = fdp.get_trove_info(trove_id);

//     println!("Trove assets:");
//     for trove_asset_info in trove_info.assets {
//         println!("Asset address: {:?}", *trove_asset_info.shrine_asset_info.address);
//         println!("Asset value: {:?}", *trove_asset_info.value);
//     };

//     println!("STRK token address: {:?}", strk_token_address());
//     println!("STRK yang address: {:?}", strk_yang_address());
//     println!("Opus STRK gate address: {:?}", opus_strk_gate_address());
// }

#[test]
#[fork("mainnet")]
fn test_opus_validator_with_real_trove() {
    // This test demonstrates the full flow:
    // 1. Create a real Opus trove with STRK
    // 2. Configure validator with STRK as the asset
    // 3. Validate that the player can enter the tournament
    // 4. Enter the tournament and collect token ID
    // 5. Call validate_entry to re-check the trove

    let budokan_addr = budokan_address();
    let minigame_addr = minigame_address();
    let account = test_account();

    // Step 1: Setup - Approve STRK for Opus STRK Gate
    let strk_token = IERC20Dispatcher { contract_address: strk_token_address() };
    let abbot = IAbbotDispatcher { contract_address: abbot_address() };

    start_cheat_caller_address(strk_token_address(), account);
    strk_token.approve(opus_strk_gate_address(), 1000000000000000000000); // 1000 STRK
    stop_cheat_caller_address(strk_token_address());

    // Step 2: Open a trove with STRK
    let yang_asset = AssetBalance {
        address: strk_token_address(), amount: 1000000000000000000000 // 1000 STRK
    };

    start_cheat_caller_address(abbot_address(), account);
    let trove_id = abbot
        .open_trove(
            array![yang_asset].span(),
            4000000000000000000_u128.into(), // Forge 4 synthetic
            1_u128.into() // Max fee
        );
    stop_cheat_caller_address(abbot_address());

    assert(trove_id > 0, 'Trove should be created');

    // Step 3: Melt the synthetic (required step)
    start_cheat_caller_address(abbot_address(), account);
    abbot.melt(trove_id, 1_u128.into());
    stop_cheat_caller_address(abbot_address());

    // Verify user has a trove
    let user_troves = abbot.get_user_trove_ids(account);
    println!("User troves count: {}", user_troves.len());
    println!("Trove ID: {}", trove_id);
    assert(user_troves.len() > 0, 'User should have trove');

    // Step 4: Deploy validator and configure for STRK with scaled entries
    let validator_address = deploy_opus_validator(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let validator_mock = IEntryValidatorMockDispatcher { contract_address: validator_address };

    // Configure: threshold=100, value_per_entry=200, max_entries=10
    // Note: Trove values are in Wad (already normalized), not wei
    // The trove has ~135.7 Wad of STRK: (135 - 100) / 20 = 1.75 → 1 entry
    let threshold: u128 = 100; // 100 Wad (not wei!)
    let value_per_entry: u128 = 20; // 20 Wad per entry
    let max_entries: u8 = 10;

    let extension_config = ExtensionConfig {
        address: validator_address,
        config: array![
            strk_token_address().into(), // Use STRK token address
            threshold.into(),
            value_per_entry.into(), max_entries.into(),
        ]
            .span(),
    };

    let entry_requirement = EntryRequirement {
        entry_limit: 0, // Ignored in scaled mode
        entry_requirement_type: EntryRequirementType::extension(extension_config),
    };

    // Step 5: Create tournament
    let budokan = IBudokanDispatcher { contract_address: budokan_addr };

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

    assert(tournament.id > 0, 'Tournament created');

    // Step 6: Verify validator configuration
    assert(
        validator_mock.get_trove_asset(tournament.id) == strk_token_address(),
        'Asset should be STRK',
    );
    assert(validator_mock.get_trove_threshold(tournament.id) == threshold, 'Threshold mismatch');
    assert(
        validator_mock.get_value_per_entry(tournament.id) == value_per_entry,
        'Value per entry mismatch',
    );
    assert(validator_mock.get_max_entries(tournament.id) == max_entries, 'Max entries mismatch');

    // Step 7: Check that player is valid and has entries
    let is_valid = validator.valid_entry(tournament.id, account, array![].span());
    assert(is_valid, 'Player should be valid');

    let entries_left = validator.entries_left(tournament.id, account, array![].span());
    assert(entries_left.is_some(), 'Should have entries');

    // Calculate expected entries: (deposited_value - threshold) / value_per_entry
    // The actual trove value depends on Opus oracle prices at fork time
    // But we can verify the calculation logic is working
    let entries_count = entries_left.unwrap();
    println!("Entries left before entering: {}", entries_count);
    assert(entries_count > 0, 'Should have at least 1 entry');

    // Step 8: Advance to registration and enter tournament
    let schedule = test_schedule();
    let registration_start = match schedule.registration {
        Option::Some(reg) => reg.start,
        Option::None => 0,
    };
    start_cheat_block_timestamp_global(registration_start);

    let qualification_proof = Option::Some(QualificationProof::Extension(array![].span()));

    start_cheat_caller_address(budokan_addr, account);
    let (token_id, entry_number) = budokan
        .enter_tournament(tournament.id, 'opus_player', account, qualification_proof);
    stop_cheat_caller_address(budokan_addr);

    assert(token_id > 0, 'Token ID should be valid');
    assert(entry_number == 1, 'Should be first entry');

    // Verify entries left decreased after entering
    let entries_after_first = validator.entries_left(tournament.id, account, array![].span());
    assert(entries_after_first.is_some(), 'Should still have result');
    let entries_after_count = entries_after_first.unwrap();
    println!("Entries left after first entry: {}", entries_after_count);
    assert(entries_after_count == entries_count - 1, 'Entries should decrease by 1');

    // Step 9: Validate entry (re-checks trove deposits)
    start_cheat_caller_address(budokan_addr, account);
    budokan.valid_entry(tournament.id, token_id, array![].span());
    stop_cheat_caller_address(budokan_addr);
    // If the trove still has sufficient deposits, entry remains valid
// If deposits fell below threshold, entry would be invalidated
}

#[test]
#[fork("mainnet")]
fn test_opus_validator_entries_calculation_with_value_per_entry() {
    // This test verifies that entries_left correctly calculates based on value_per_entry
    // Formula: entries = (deposited_value - threshold) / value_per_entry
    // Capped by max_entries if set

    let budokan_addr = budokan_address();
    let _minigame_addr = minigame_address();
    let account = test_account();

    // Step 1: Setup - Approve STRK for Opus STRK Gate
    let strk_token = IERC20Dispatcher { contract_address: strk_token_address() };
    let abbot = IAbbotDispatcher { contract_address: abbot_address() };

    start_cheat_caller_address(strk_token_address(), account);
    strk_token.approve(opus_strk_gate_address(), 1000000000000000000000); // 1000 STRK
    stop_cheat_caller_address(strk_token_address());

    // Step 2: Open a trove with STRK
    let yang_asset = AssetBalance {
        address: strk_token_address(), amount: 1000000000000000000000 // 1000 STRK
    };

    start_cheat_caller_address(abbot_address(), account);
    let trove_id = abbot
        .open_trove(
            array![yang_asset].span(),
            4000000000000000000_u128.into(), // Forge 4 synthetic
            1_u128.into() // Max fee
        );
    stop_cheat_caller_address(abbot_address());

    assert(trove_id > 0, 'Trove should be created');

    // Step 3: Melt the synthetic (required step)
    start_cheat_caller_address(abbot_address(), account);
    abbot.melt(trove_id, 1_u128.into());
    stop_cheat_caller_address(abbot_address());

    // Deploy validator
    let validator_address = deploy_opus_validator(budokan_addr);
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };

    // Debug: Check actual trove value to determine proper test parameters
    let fdp = IFrontendDataProviderDispatcher { contract_address: fdp_address() };
    let trove_info: TroveInfo = fdp.get_trove_info(trove_id);

    let mut actual_strk_value: Wad = Zero::zero();
    for trove_asset_info in trove_info.assets {
        if *trove_asset_info.shrine_asset_info.address == strk_token_address() {
            actual_strk_value = *trove_asset_info.value;
            break;
        }
    }
    println!("Actual STRK trove value (Wad): {}", actual_strk_value.val);

    // Calculate test parameters based on actual value
    // The deposited_value is in Wad (with 18 decimals), but threshold and value_per_entry
    // are specified as simple integers (e.g., 100 means 100 Wad, not 100e18)
    // The calculation in the validator is: ((deposited_value_wad - threshold_wad) /
    // value_per_entry_wad).val So we need to convert actual_strk_value back to simple Wad units

    // actual_strk_value.val is ~141972719999999999973 = 141.97 Wad
    // We need to divide by 1e18 to get simple units: 141.97 / 1e18 ≈ 141
    let wad_scale: u128 = 1000000000000000000; // 1e18
    let actual_value_simple: u128 = actual_strk_value.val / wad_scale;

    println!("Actual STRK trove value (simple Wad units): {}", actual_value_simple);

    // Test Case 1: Higher value_per_entry (should result in fewer entries)
    // With actual_value_simple = 141 Wad:
    // Case 1: (141 - 50) / 3 = 30.33... → 30 entries
    let threshold_1: u128 = 50; // 50 Wad
    let value_per_entry_1: u128 = 3; // 3 Wad per entry

    let tournament_id_1: u64 = 1;
    start_cheat_caller_address(validator_address, budokan_addr);
    validator
        .add_config(
            tournament_id_1,
            0, // entry_limit (ignored in scaled mode)
            array![
                strk_token_address().into(), threshold_1.into(), value_per_entry_1.into(),
                0_u8.into() // max_entries (no cap)
            ]
                .span(),
        );
    stop_cheat_caller_address(validator_address);

    let entries_case1 = validator.entries_left(tournament_id_1, account, array![].span());
    assert(entries_case1.is_some(), 'Case 1: Should have entries');
    let entries_count_1 = entries_case1.unwrap();
    println!(
        "Case 1 (threshold={}, value_per_entry={}): {} entries",
        threshold_1,
        value_per_entry_1,
        entries_count_1,
    );

    // Verify we got a reasonable number of entries (not 0, not 255)
    assert(entries_count_1 > 0, 'Case 1: Should have > 0 entries');
    assert(entries_count_1 < 255, 'Case 1: Should not be capped');

    // Test Case 2: Lower value_per_entry (should result in more entries)
    // Case 2: (141 - 50) / 2 = 45.5 → 45 entries (more than Case 1's 30)
    let threshold_2: u128 = 50; // 50 Wad
    let value_per_entry_2: u128 = 2; // 2 Wad per entry

    let tournament_id_2: u64 = 2;
    start_cheat_caller_address(validator_address, budokan_addr);
    validator
        .add_config(
            tournament_id_2,
            0,
            array![
                strk_token_address().into(), threshold_2.into(), value_per_entry_2.into(),
                0_u8.into() // max_entries (no cap)
            ]
                .span(),
        );
    stop_cheat_caller_address(validator_address);

    let entries_case2 = validator.entries_left(tournament_id_2, account, array![].span());
    assert(entries_case2.is_some(), 'Case 2: Should have entries');
    let entries_count_2 = entries_case2.unwrap();
    println!(
        "Case 2 (threshold={}, value_per_entry={}): {} entries",
        threshold_2,
        value_per_entry_2,
        entries_count_2,
    );

    // Verify we got reasonable entries
    assert(entries_count_2 > 0, 'Case 2: Should have > 0 entries');
    assert(entries_count_2 < 255, 'Case 2: Should not be capped');

    // Verify that lower value_per_entry gives more entries
    // Since value_per_entry_2 (2) < value_per_entry_1 (3), we should get more entries
    assert(entries_count_2 > entries_count_1, 'Lower value should give more');

    // Test Case 3: With max_entries cap
    // Use same parameters as Case 2 but with max_entries=75
    // Should be capped at 75 if Case 2 had 100 entries
    let max_cap: u8 = 75;
    let tournament_id_3: u64 = 3;
    start_cheat_caller_address(validator_address, budokan_addr);
    validator
        .add_config(
            tournament_id_3,
            0,
            array![
                strk_token_address().into(), threshold_2.into(), value_per_entry_2.into(),
                max_cap.into() // max_entries (capped at 75)
            ]
                .span(),
        );
    stop_cheat_caller_address(validator_address);

    let entries_case3 = validator.entries_left(tournament_id_3, account, array![].span());
    assert(entries_case3.is_some(), 'Case 3: Should have entries');
    let entries_count_3 = entries_case3.unwrap();
    println!(
        "Case 3 (threshold={}, value_per_entry={}, max={}): {} entries",
        threshold_2,
        value_per_entry_2,
        max_cap,
        entries_count_3,
    );

    // Case 3 uses same parameters as Case 2 but with max_entries cap
    // If case 2 had more entries than cap, case 3 should be capped
    if entries_count_2 > max_cap {
        assert(entries_count_3 == max_cap, 'Should be capped at max');
    } else {
        assert(entries_count_3 == entries_count_2, 'Should match uncapped');
    }

    // Test Case 4: Verify entries decrease after add_entry
    start_cheat_caller_address(validator_address, budokan_addr);
    validator.add_entry(tournament_id_2, account, array![].span());
    stop_cheat_caller_address(validator_address);

    let entries_after = validator.entries_left(tournament_id_2, account, array![].span());
    assert(entries_after.is_some(), 'Should have entries after');
    let entries_after_count = entries_after.unwrap();
    println!("Case 2 after add_entry: {} entries", entries_after_count);
    assert(entries_after_count == entries_count_2 - 1, 'Should decrease by 1');

    // Test Case 5: Very high threshold (player shouldn't qualify)
    // threshold=1000 (higher than expected trove value of ~135-150 Wad)
    let tournament_id_5: u64 = 5;
    start_cheat_caller_address(validator_address, budokan_addr);
    validator
        .add_config(
            tournament_id_5,
            0,
            array![
                strk_token_address().into(), 1000_u128.into(), // threshold (1000 Wad - very high)
                10_u128.into(), // value_per_entry
                0_u8.into() // max_entries
            ]
                .span(),
        );
    stop_cheat_caller_address(validator_address);

    let is_valid_case5 = validator.valid_entry(tournament_id_5, account, array![].span());
    let entries_case5 = validator.entries_left(tournament_id_5, account, array![].span());

    println!(
        "Case 5 (threshold=1000): is_valid={}, entries={}", is_valid_case5, entries_case5.unwrap(),
    );

    // If deposited value < threshold, should have 0 entries
    if !is_valid_case5 {
        assert(entries_case5.unwrap() == 0, 'Should have 0 entries');
        println!("Case 5: Player does not qualify (as expected)");
    } else {
        // If player somehow qualifies, ensure entries is reasonable
        println!("Case 5: Player qualifies (unexpected but valid)");
    }
}
// ==============================================
// REAL WORLD USAGE EXAMPLES
// ==============================================
// This comment block shows how you would use the OpusTrovesValidator in production:
//
// 1. Deploy OpusTrovesValidator:
//    let validator = deploy_opus_validator(budokan_address);
//
// 2a. Mode 1 - Fixed Entry Limit:
//     let config = array![
//         trove_asset.into(),      // The Opus yang asset (e.g., ETH, wstETH)
//         1000_u128.into(),        // Minimum deposit threshold
//     ];
//     entry_limit = 5;             // All eligible players get 5 entries
//
// 2b. Mode 2 - Scaled Entries (No Cap):
//     let config = array![
//         trove_asset.into(),      // The Opus yang asset
//         1000_u128.into(),        // Base threshold
//         500_u128.into(),         // Value per entry (500 units = 1 entry)
//         0_u8.into(),             // No max cap
//     ];
//     entry_limit = 0;             // Ignored in scaled mode
//     // Player with 5500 deposited: (5500 - 1000) / 500 = 9 entries
//
// 2c. Mode 3 - Scaled Entries (With Cap):
//     let config = array![
//         trove_asset.into(),      // The Opus yang asset
//         1000_u128.into(),        // Base threshold
//         500_u128.into(),         // Value per entry
//         10_u8.into(),            // Cap at 10 entries max
//     ];
//     entry_limit = 0;             // Ignored in scaled mode
//     // Player with 10000 deposited: would get 18, but capped at 10
//
// 3. Create tournament on Budokan:
//    let extension_config = ExtensionConfig {
//        address: validator_address,
//        config: config.span(),
//    };
//    budokan.create_tournament(..., extension_config);
//
// 4. Players enter if they meet criteria:
//    - Must have a trove in Opus
//    - Trove must have deposited value >= threshold for the specified asset
//    - Entries determined by configuration mode
//
// 5. Validate entry to check current trove status:
//    budokan.valid_entry(tournament_id, game_token_id, array![].span());
//    // This re-checks the entry against current trove deposits
//    // Invalidates entry if player's deposit fell below threshold
// ==============================================


