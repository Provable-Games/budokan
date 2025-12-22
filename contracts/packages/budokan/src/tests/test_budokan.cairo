// SPDX-License-Identifier: UNLICENSED

use budokan::models::budokan::{
    Distribution, ERC20Data, ERC721Data, EntryFee, EntryFeeRewardType, EntryRequirement,
    EntryRequirementType, ExtensionConfig, GameConfig, PrizeType, QualificationProof, RewardType,
    TokenTypeData,
};
use budokan::models::constants::{
    MAX_SUBMISSION_PERIOD, MIN_REGISTRATION_PERIOD, MIN_SUBMISSION_PERIOD, MIN_TOURNAMENT_LENGTH,
};
use budokan::models::schedule::{Period, Phase, Schedule};
use budokan::tests::constants::{
    OWNER, STARTING_BALANCE, TEST_END_TIME, TEST_REGISTRATION_END_TIME,
    TEST_REGISTRATION_START_TIME, TEST_START_TIME, TOURNAMENT_DESCRIPTION, TOURNAMENT_NAME,
};
use budokan::tests::helpers::{
    create_basic_tournament, custom_schedule, registration_open_beyond_tournament_end,
    registration_period_too_long, registration_period_too_short, test_game_config, test_game_period,
    test_metadata, test_schedule, test_season_schedule, tournament_too_long,
};
use budokan::tests::interfaces::{
    IERC20MockDispatcher, IERC20MockDispatcherTrait, IERC721MockDispatcher,
    IERC721MockDispatcherTrait, IERC721OldMockDispatcher,
};
use budokan::tests::mocks::tournament_validator_mock::{
    QUALIFIER_TYPE_PARTICIPANTS, QUALIFIER_TYPE_WINNERS,
};
use budokan::tests::setup_denshokan;
use budokan_interfaces::budokan::{IBudokanDispatcher, IBudokanDispatcherTrait};
use budokan_interfaces::entry_validator::IEntryValidatorDispatcher;
use budokan_interfaces::prize::{IPrizeDispatcher, IPrizeDispatcherTrait};
use budokan_interfaces::registration::{IRegistrationDispatcher, IRegistrationDispatcherTrait};
use core::option::Option;
use core::serde::Serde;
use game_components_metagame::interface::IMETAGAME_ID;
use game_components_test_starknet::minigame::mocks::minigame_starknet_mock::{
    IMinigameStarknetMockDispatcher, IMinigameStarknetMockDispatcherTrait,
};
use game_components_token::interface::IMinigameTokenMixinDispatcher;
use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
use openzeppelin_interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_block_timestamp, stop_cheat_caller_address,
};
use starknet::ContractAddress;

#[derive(Drop)]
pub struct TestContracts {
    pub budokan: IBudokanDispatcher,
    pub prize: IPrizeDispatcher,
    pub registration: IRegistrationDispatcher,
    pub minigame: IMinigameStarknetMockDispatcher,
    pub denshokan: IMinigameTokenMixinDispatcher,
    pub erc20: IERC20MockDispatcher,
    pub erc721: IERC721MockDispatcher,
    pub erc721_old: IERC721OldMockDispatcher,
    pub entry_validator: IEntryValidatorDispatcher,
}


//
// Setup
//

fn deploy_erc20_mock() -> ContractAddress {
    let contract_class = declare("erc20_mock").expect('declare erc20 failed').contract_class();
    let (contract_address, _) = contract_class.deploy(@array![]).expect('deploy erc20 failed');
    contract_address
}

fn deploy_erc721_mock() -> ContractAddress {
    let contract_class = declare("erc721_mock").expect('declare erc721 failed').contract_class();
    let (contract_address, _) = contract_class.deploy(@array![]).expect('deploy erc721 failed');
    contract_address
}

fn deploy_erc721_old_mock() -> ContractAddress {
    let contract_class = declare("erc721_old_mock")
        .expect('declare erc721old fail')
        .contract_class();
    let (contract_address, _) = contract_class.deploy(@array![]).expect('deploy erc721old fail');
    contract_address
}

fn deploy_entry_validator_mock(budokan_address: ContractAddress) -> ContractAddress {
    let contract_class = declare("entry_validator_mock")
        .expect('declare validator fail')
        .contract_class();
    let mut calldata = array![];
    calldata.append(budokan_address.into());
    calldata.append(false.into());
    let (contract_address, _) = contract_class.deploy(@calldata).expect('deploy validator fail');
    contract_address
}

fn deploy_tournament_validator_mock(budokan_address: ContractAddress) -> ContractAddress {
    let contract_class = declare("tournament_validator_mock")
        .expect('declare tourn val fail')
        .contract_class();
    let mut calldata = array![];
    calldata.append(budokan_address.into()); // budokan_address
    calldata.append(false.into()); // registration_only
    let (contract_address, _) = contract_class.deploy(@calldata).expect('deploy tourn val fail');
    contract_address
}

fn deploy_budokan(denshokan_address: ContractAddress) -> ContractAddress {
    use budokan::tests::constants::OWNER;

    let contract_class = declare("Budokan").expect('declare budokan failed').contract_class();

    // Build constructor calldata using proper Serde serialization
    let mut calldata: Array<felt252> = array![];

    // Serialize constructor arguments using Serde trait
    // 1. owner: ContractAddress
    OWNER.serialize(ref calldata);

    // 2. default_token_address: ContractAddress
    denshokan_address.serialize(ref calldata);

    // 3. event_relayer: ContractAddress (zero = no relayer)
    let zero_address: ContractAddress = 0_felt252.try_into().unwrap();
    zero_address.serialize(ref calldata);

    let (contract_address, _) = contract_class.deploy(@calldata).expect('deploy budokan failed');
    contract_address
}

pub fn setup() -> TestContracts {
    // Deploy Denshokan (game token) contracts first
    let denshokan_contracts = setup_denshokan::setup();

    // Deploy mock contracts
    let erc20_address = deploy_erc20_mock();
    let erc721_address = deploy_erc721_mock();
    let erc721_old_address = deploy_erc721_old_mock();

    // Deploy Budokan
    let budokan_address = deploy_budokan(denshokan_contracts.denshokan.contract_address);

    // Deploy entry validator with budokan address
    let entry_validator_address = deploy_entry_validator_mock(budokan_address);

    let budokan = IBudokanDispatcher { contract_address: budokan_address };
    let minigame = denshokan_contracts.minigame_mock;
    let denshokan = denshokan_contracts.denshokan;
    let erc20 = IERC20MockDispatcher { contract_address: erc20_address };
    let erc721 = IERC721MockDispatcher { contract_address: erc721_address };
    let erc721_old = IERC721OldMockDispatcher { contract_address: erc721_old_address };
    let entry_validator = IEntryValidatorDispatcher { contract_address: entry_validator_address };

    // Mint tokens to OWNER
    let owner = OWNER;
    start_cheat_caller_address(erc20_address, owner);
    erc20.mint(owner, STARTING_BALANCE);
    stop_cheat_caller_address(erc20_address);

    start_cheat_caller_address(erc721_address, owner);
    erc721.mint(owner, 1);
    stop_cheat_caller_address(erc721_address);

    // Create game settings
    start_cheat_caller_address(minigame.contract_address, owner);
    minigame.create_settings_difficulty("test_settings", "test_settings", 1);
    stop_cheat_caller_address(minigame.contract_address);

    let prize = IPrizeDispatcher { contract_address: budokan.contract_address };
    let registration = IRegistrationDispatcher { contract_address: budokan.contract_address };
    TestContracts {
        budokan,
        prize,
        registration,
        minigame,
        denshokan,
        erc20,
        erc721,
        erc721_old,
        entry_validator,
    }
}

//
// Test initializers
//

#[test]
fn test_initializer() {
    let contracts = setup();
    let owner = OWNER;

    let src5_dispatcher = ISRC5Dispatcher { contract_address: contracts.budokan.contract_address };
    assert(src5_dispatcher.supports_interface(IMETAGAME_ID) == true, 'should support IMETAGAME_ID');

    assert(contracts.erc20.balance_of(owner) == STARTING_BALANCE, 'Invalid balance');
    assert(contracts.erc721.balance_of(owner) == 1, 'Invalid balance');
}

//
// Test creating tournaments
//

#[test]
fn test_create_tournament() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    assert(tournament.metadata.name == TOURNAMENT_NAME(), 'Invalid tournament name');
    assert(
        tournament.metadata.description == TOURNAMENT_DESCRIPTION(),
        'Invalid tournament description',
    );
    match tournament.schedule.registration {
        Option::Some(registration) => {
            assert(
                registration.start == TEST_REGISTRATION_START_TIME().into(),
                'Invalid registration start',
            );
            assert(
                registration.end == TEST_REGISTRATION_END_TIME().into(), 'Invalid registration end',
            );
        },
        Option::None => { panic!("Tournament should have registration"); },
    }

    assert(
        tournament.schedule.game.start == TEST_START_TIME().into(), 'Invalid tournament start time',
    );
    assert(tournament.schedule.game.end == TEST_END_TIME().into(), 'Invalid tournament end time');
    assert!(
        tournament.entry_requirement == Option::None, "tournament entry requirement should be none",
    );
    assert!(tournament.entry_fee.is_none(), "tournament entry fee should be none");
    assert(
        tournament.game_config.address == contracts.minigame.contract_address,
        'Invalid game address',
    );
    assert(tournament.game_config.settings_id == 1, 'Invalid settings id');
    assert(contracts.budokan.total_tournaments() == 1, 'Invalid tournaments count');
    assert!(tournament.game_config.soulbound == false, "Tournament should not be soulbound");
    assert!(tournament.game_config.play_url == "", "Tournament play_url should be empty");
    assert!(tournament.game_config.play_url.len() == 0, "Tournament play_url should be empty");
}

#[test]
fn test_create_tournament_start_time_in_past() {
    let contracts = setup();
    let owner = OWNER;

    let time = 100_u64;

    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // try to create a tournament with the tournament start time in the past
    let game_period = Period { start: time - 10, end: time + MIN_TOURNAMENT_LENGTH.into() };

    let schedule = custom_schedule(Option::None, game_period, MIN_SUBMISSION_PERIOD.into());

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
}

#[should_panic(expected: "Budokan: Registration period less than minimum")]
#[test]
fn test_create_tournament_registration_period_too_short() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let schedule = custom_schedule(
        Option::Some(registration_period_too_short()),
        test_game_period(),
        MIN_SUBMISSION_PERIOD.into(),
    );

    let entry_requirement = Option::None;
    let entry_fee = Option::None;

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[should_panic(expected: "Budokan: Registration period greater than maximum")]
#[test]
fn test_create_tournament_registration_period_too_long() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let schedule = custom_schedule(
        Option::Some(registration_period_too_long()),
        test_game_period(),
        MIN_SUBMISSION_PERIOD.into(),
    );

    let entry_requirement = Option::None;
    let entry_fee = Option::None;

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[should_panic(expected: "Budokan: Registration end time")]
#[test]
fn test_create_tournament_end_time_too_close() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let schedule = registration_open_beyond_tournament_end();

    let entry_requirement = Option::None;
    let entry_fee = Option::None;

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[should_panic(expected: "Budokan: Tournament duration greater than maximum")]
#[test]
fn test_create_tournament_tournament_too_long() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let schedule = tournament_too_long();

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[should_panic(expected: "Budokan: Submission duration must be between")]
#[test]
fn test_create_tournament_submission_period_too_short() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let schedule = custom_schedule(
        Option::None, test_game_period(), MIN_SUBMISSION_PERIOD.into() - 1,
    );

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[should_panic(expected: "Budokan: Submission duration must be between")]
#[test]
fn test_create_tournament_submission_period_too_long() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let schedule = custom_schedule(
        Option::None, test_game_period(), MAX_SUBMISSION_PERIOD.into() + 1,
    );

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[test]
fn test_get_tournament() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let created_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let fetched_tournament = contracts.budokan.tournament(created_tournament.id);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    assert(fetched_tournament.id == created_tournament.id, 'Invalid tournament id');
    assert(fetched_tournament.metadata.name == created_tournament.metadata.name, 'Invalid name');
    assert(
        fetched_tournament.metadata.description == created_tournament.metadata.description,
        'Invalid description',
    );
}

#[test]
fn test_total_tournaments() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    assert(contracts.budokan.total_tournaments() == 0, 'Should start at 0');

    create_basic_tournament(contracts.budokan, contracts.minigame.contract_address);
    assert(contracts.budokan.total_tournaments() == 1, 'Should be 1');

    create_basic_tournament(contracts.budokan, contracts.minigame.contract_address);
    assert(contracts.budokan.total_tournaments() == 2, 'Should be 2');

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[test]
fn test_tournament_current_phase_scheduled() {
    let contracts = setup();
    let owner = OWNER;

    // Set block timestamp to before registration starts
    start_cheat_block_timestamp(contracts.budokan.contract_address, 0);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let phase = contracts.budokan.current_phase(tournament.id);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);

    match phase {
        Phase::Scheduled => {},
        _ => panic!("Should be in Scheduled phase"),
    }
}

#[test]
fn test_tournament_current_phase_registration() {
    let contracts = setup();
    let owner = OWNER;

    // Set block timestamp to during registration period
    let registration_time = TEST_REGISTRATION_START_TIME().into() + 1;
    start_cheat_block_timestamp(contracts.budokan.contract_address, registration_time);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let phase = contracts.budokan.current_phase(tournament.id);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);

    match phase {
        Phase::Registration => {},
        _ => panic!("Should be in Registration phase"),
    }
}

#[test]
fn test_tournament_current_phase_live() {
    let contracts = setup();
    let owner = OWNER;

    // Set block timestamp to during game period
    let game_time = TEST_START_TIME().into() + 1;
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let phase = contracts.budokan.current_phase(tournament.id);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);

    match phase {
        Phase::Live => {},
        _ => panic!("Should be in Live phase"),
    }
}

#[test]
fn test_create_tournament_with_entry_fee() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: Distribution::Linear(10), // 85% available for positions (linear distribution)
        tournament_creator_share: Option::Some(
            1000,
        ), // 10% (1000 basis points) to tournament creator
        game_creator_share: Option::Some(500), // 5% (500 basis points) to game creator
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    match tournament.entry_fee {
        Option::Some(fee) => {
            assert(fee.token_address == contracts.erc20.contract_address, 'Invalid fee token');
            assert(fee.amount == 100, 'Invalid fee amount');
        },
        Option::None => panic!("Tournament should have entry fee"),
    }
}

#[test]
fn test_create_tournament_with_exponential_distribution() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Test with exponential distribution with weight=50 (moderate steepness)
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: Distribution::Exponential(500), // Weight of 50 (1-100 scale)
        tournament_creator_share: Option::Some(
            1000,
        ), // 10% (1000 basis points) to tournament creator
        game_creator_share: Option::Some(500), // 5% (500 basis points) to game creator
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Verify the tournament was created with exponential distribution
    match tournament.entry_fee {
        Option::Some(fee) => {
            assert(fee.token_address == contracts.erc20.contract_address, 'Invalid fee token');
            assert(fee.amount == 100, 'Invalid fee amount');
            match fee.distribution {
                Distribution::Exponential(weight) => {
                    assert(weight == 500, 'Weight should be 50');
                },
                _ => panic!("Distribution should be Exponential"),
            }
        },
        Option::None => panic!("Tournament should have entry fee"),
    }
}

#[test]
fn test_create_tournament_with_high_weight_exponential() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Test with high weight exponential (steep curve toward top positions)
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: Distribution::Exponential(900), // High weight = steeper toward top
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Verify exponential distribution with weight 90
    match tournament.entry_fee {
        Option::Some(fee) => {
            match fee.distribution {
                Distribution::Exponential(weight) => {
                    assert(weight == 900, 'Weight should be 90');
                },
                _ => panic!("Distribution should be Exponential"),
            }
        },
        Option::None => panic!("Tournament should have entry fee"),
    }
}

#[test]
fn test_create_soulbound_tournament() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let game_config = GameConfig {
        address: contracts.minigame.contract_address, settings_id: 1, soulbound: true, play_url: "",
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    assert!(tournament.game_config.soulbound == true, "Tournament should be soulbound");
}

#[test]
fn test_create_tournament_with_play_url() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let play_url: ByteArray = "https://play.example.com/game";

    let game_config = GameConfig {
        address: contracts.minigame.contract_address,
        settings_id: 1,
        soulbound: false,
        play_url: play_url.clone(),
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    assert!(tournament.game_config.play_url == play_url, "Invalid play_url");
}

#[test]
fn test_create_season_tournament_no_registration() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_season_schedule(), // No registration period
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    match tournament.schedule.registration {
        Option::Some(_) => panic!("Season tournament should not have registration"),
        Option::None => {},
    }
}

//
// Test creating tournaments with prizes
//

#[test]
fn test_create_tournament_with_prizes() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Approve tokens for transfer
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.erc721.contract_address, owner);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    stop_cheat_caller_address(contracts.erc721.contract_address);

    // Add prizes
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: STARTING_BALANCE.low,
                    distribution: Option::None,
                    distribution_count: Option::None,
                },
            ),
            Option::Some(1),
        );
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            Option::Some(1),
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    assert(contracts.erc20.balance_of(owner) == 0, 'Invalid balance');
    assert(contracts.erc721.balance_of(owner) == 0, 'Invalid balance');
}

// Test removed: With infinite leaderboards, any position > 0 is now valid
// The old test checked that position 2 would fail with only 1 prize_spot
// This is no longer applicable with the infinite leaderboard model

// Tests for invalid distribution percentages are no longer needed
// since the Distribution enum (Linear/Exponential) automatically calculates valid distributions

//
// Test gated tournaments
//

#[test]
fn test_create_gated_tournament_with_unsettled_tournament() {
    let contracts = setup();
    let owner = OWNER;

    let time = TEST_REGISTRATION_START_TIME().into();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Create first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Enter first tournament
    contracts.budokan.enter_tournament(first_tournament.id, 'test_player', owner, Option::None);

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id]
    let extension_config = array![QUALIFIER_TYPE_WINNERS, 0, 0, first_tournament.id.into()].span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );

    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let registration_period = Period { start: time, end: time + MIN_REGISTRATION_PERIOD.into() };

    let game_period = Period {
        start: time + MIN_REGISTRATION_PERIOD.into(),
        end: time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
    };

    let schedule = custom_schedule(
        Option::Some(registration_period), game_period, MIN_SUBMISSION_PERIOD.into(),
    );

    contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_create_tournament_gated_by_multiple_tournaments() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Create second tournament
    let second_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter and complete first tournament
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Enter and complete second tournament
    time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(second_entry_token_id, 20);
    contracts.budokan.submit_score(second_tournament.id, second_entry_token_id, 1);

    // Settle tournaments
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id_1, qualifying_tournament_id_2]
    let extension_config = array![
        QUALIFIER_TYPE_WINNERS, 0, 0, first_tournament.id.into(), second_tournament.id.into(),
    ]
        .span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );

    // entry_limit: 0 means unlimited entries (used to test multiple qualifying tournaments)
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: time, end: time + MIN_REGISTRATION_PERIOD.into() },
        ),
        game: Period {
            start: time + MIN_REGISTRATION_PERIOD.into(),
            end: time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
        },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let gated_tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    assert(gated_tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    time = time + MIN_REGISTRATION_PERIOD.into() - 1;
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Qualification proof: [qualifying_tournament_id, token_id, position]
    let first_qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![first_tournament.id.into(), first_entry_token_id.into(), 1].span(),
        ),
    );
    let second_qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![second_tournament.id.into(), second_entry_token_id.into(), 1].span(),
        ),
    );
    // This should succeed since we can qualify with either of the two qualifying tournaments
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player3', owner, first_qualifying_proof);
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player4', owner, second_qualifying_proof);

    // Verify entry was successful
    let entries = contracts.budokan.tournament_entries(gated_tournament.id);
    assert(entries == 2, 'Invalid entry count');

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_create_tournament_gated_by_participants() {
    // This test verifies that QUALIFIER_TYPE_PARTICIPANTS works correctly.
    //
    // QUALIFIER_TYPE_PARTICIPANTS allows any player who registered for the
    // qualifying tournament to enter - they do NOT need to have submitted a score.
    //
    // This is different from QUALIFIER_TYPE_WINNERS which requires:
    // - Player must have submitted a score (has_submitted=true)
    // - Player's score must be a "top score" (>= last place on leaderboard)
    let contracts = setup();
    let owner = OWNER;
    let other_player: starknet::ContractAddress = 'other_player'.try_into().unwrap();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create qualifying tournament
    let qualifying_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Owner enters and will submit a score (will be on leaderboard)
    let (owner_token_id, _) = contracts
        .budokan
        .enter_tournament(qualifying_tournament.id, 'owner_player', owner, Option::None);

    // Other player enters but will NOT submit a score
    start_cheat_caller_address(contracts.budokan.contract_address, other_player);
    let (other_token_id, _) = contracts
        .budokan
        .enter_tournament(qualifying_tournament.id, 'other_player', other_player, Option::None);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Move to submission period
    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Only owner submits a score - other_player does NOT submit
    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts.minigame.end_game(owner_token_id, 100);
    contracts.budokan.submit_score(qualifying_tournament.id, owner_token_id, 1);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Move past submission period (tournament is now finalized)
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id]
    // PARTICIPANTS type - just needs registration, not submission
    let extension_config = array![
        QUALIFIER_TYPE_PARTICIPANTS, 0, 0, qualifying_tournament.id.into(),
    ]
        .span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: time, end: time + MIN_REGISTRATION_PERIOD.into() },
        ),
        game: Period {
            start: time + MIN_REGISTRATION_PERIOD.into(),
            end: time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
        },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let gated_tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Move to registration period for gated tournament
    time = time + 1;
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Owner can enter - they submitted and are on the leaderboard
    // Qualification proof: [qualifying_tournament_id, token_id] (no position needed for
    // participants)
    let owner_qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![qualifying_tournament.id.into(), owner_token_id.into()].span(),
        ),
    );
    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'owner_new', owner, owner_qualifying_proof);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Other player can ALSO enter even though they NEVER submitted a score!
    // This is the key difference from QUALIFIER_TYPE_WINNERS - they only need
    // to have registered for the qualifying tournament.
    let other_qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![qualifying_tournament.id.into(), other_token_id.into()].span(),
        ),
    );
    start_cheat_caller_address(contracts.budokan.contract_address, other_player);
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'other_new', other_player, other_qualifying_proof);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Verify both entries were successful
    let entries = contracts.budokan.tournament_entries(gated_tournament.id);
    assert(entries == 2, 'Both participants should enter');

    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

//
// Test allowlist gated tournaments
//

#[test]
fn test_allowlist_gated_tournament() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create array of allowed accounts
    let allowed_player1 = 0x456_felt252.try_into().unwrap();
    let allowed_player2 = 0x789_felt252.try_into().unwrap();
    let allowed_accounts = array![owner, allowed_player1, allowed_player2].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    // Verify tournament was created with correct gating
    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Allowed account (owner) can enter
    let player1_qualification = Option::Some(QualificationProof::Address(owner));
    contracts.budokan.enter_tournament(tournament.id, 'test_player1', owner, player1_qualification);

    // Allowed player can enter
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, allowed_player1);

    let player2_qualification = Option::Some(QualificationProof::Address(allowed_player1));
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', allowed_player1, player2_qualification);

    // Verify entries were successful
    let entries = contracts.budokan.tournament_entries(tournament.id);
    assert(entries == 2, 'Invalid entry count');

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "EntryRequirement: Maximum qualified entries reached for context")]
#[test]
fn test_allowlist_gated_tournament_with_entry_limit() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create array of allowed accounts
    let allowed_player2 = 0x456_felt252.try_into().unwrap();
    let allowed_accounts = array![owner, allowed_player2].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    // Verify tournament was created with correct gating
    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Allowed account (owner) can enter
    let player1_qualification = Option::Some(QualificationProof::Address(owner));
    contracts.budokan.enter_tournament(tournament.id, 'test_player1', owner, player1_qualification);

    // Allowed player can enter
    start_cheat_caller_address(contracts.budokan.contract_address, allowed_player2);
    let player2_qualification = Option::Some(QualificationProof::Address(allowed_player2));
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', allowed_player2, player2_qualification);
    // this should fail because we have an entry limit of 1
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player3', allowed_player2, player2_qualification);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Qualifying address is not in allowlist")]
#[test]
fn test_allowlist_gated_tournament_unauthorized() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create array of allowed accounts (not including player2)
    let allowed_player = 0x456_felt252.try_into().unwrap();
    let allowed_accounts = array![owner, allowed_player].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let entry_fee = Option::None;

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
        );

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Try to enter with unauthorized account
    let unauthorized_player = 0x789_felt252.try_into().unwrap();
    start_cheat_caller_address(contracts.budokan.contract_address, unauthorized_player);
    let unauthorized_player_qualification = Option::Some(
        QualificationProof::Address(unauthorized_player),
    );
    // This should panic since unauthorized_player is not in the allowed accounts list
    contracts
        .budokan
        .enter_tournament(
            tournament.id,
            'test_player_unauthorized',
            unauthorized_player,
            unauthorized_player_qualification,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_allowlist_gated_caller_different_from_qualification_address() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Only allowed_player is on the allowlist
    let allowed_player = 0x456_felt252.try_into().unwrap();
    let allowed_accounts = array![allowed_player].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // OWNER (caller) tries to enter using allowed_player's address as qualification
    // Since caller != qualified address, token should go to qualified address (allowed_player)
    let player_qualification = Option::Some(QualificationProof::Address(allowed_player));
    let (game_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', owner, player_qualification);

    // Verify the game token was minted to the qualified address (allowed_player), not the caller
    // (OWNER)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(game_token_id.into());
    assert!(
        token_owner == allowed_player,
        "Token should be owned by qualified address (allowed_player), not caller",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_allowlist_gated_caller_is_qualified_address_different_player() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Only allowed_player is on the allowlist
    let allowed_player = 0x456_felt252.try_into().unwrap();
    let allowed_accounts = array![allowed_player].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // allowed_player (caller) enters using their own address as qualification
    // but specifies a different player_address (OWNER)
    // Since caller == qualified address, token should go to player_address (OWNER)
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, allowed_player);

    let player_qualification = Option::Some(QualificationProof::Address(allowed_player));
    let (game_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', owner, player_qualification);

    // Verify the game token was minted to player_address (OWNER), not the caller (allowed_player)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(game_token_id.into());
    assert!(
        token_owner == owner,
        "Token should be owned by player_address (OWNER), not caller (allowed_player)",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

//
// Test extension gated tournaments
//

#[test]
fn test_extension_gated_tournament() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament gated by entry validator extension
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Verify tournament was created with correct gating
    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let qualification_proof = Option::Some(QualificationProof::Extension(array![].span()));

    // OWNER already has an ERC721 token (minted in setup), so they should be able to enter
    let (token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, qualification_proof);

    // Verify entry was successful
    assert(entry_number == 1, 'Invalid entry number');
    let entries = contracts.budokan.tournament_entries(tournament.id);
    assert(entries == 1, 'Invalid entry count');

    // Verify registration information
    let registration = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, token_id);
    assert(registration.context_id == tournament.id, 'Wrong tournament id');
    assert(registration.entry_number == 1, 'Wrong entry number');

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Invalid entry according to extension")]
#[test]
fn test_extension_gated_tournament_unauthorized() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament gated by entry validator extension
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Create a player who doesn't own any ERC721 tokens
    let unauthorized_player = 0x999_felt252.try_into().unwrap();
    start_cheat_caller_address(contracts.budokan.contract_address, unauthorized_player);

    // Verify the player has no tokens
    let balance = contracts.erc721.balance_of(unauthorized_player);
    assert(balance == 0, 'Player should have no tokens');

    let qualification_proof = Option::Some(QualificationProof::Extension(array![].span()));

    // Try to enter with unauthorized account - should panic
    contracts
        .budokan
        .enter_tournament(
            tournament.id, 'unauthorized_player', unauthorized_player, qualification_proof,
        );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

//
// Test tournament registration and entry
//

#[test]
fn test_enter_tournament() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // advance time to registration start time
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // enter tournament
    let (game_token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // verify registration information
    let player1_registration = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, game_token_id);

    assert!(
        player1_registration.context_id == tournament.id,
        "Wrong tournament id for player 1, expected: {}, got: {}",
        tournament.id,
        player1_registration.context_id,
    );
    assert!(player1_registration.entry_number == 1, "Entry number should be 1");
    assert!(
        player1_registration.entry_number == entry_number,
        "Invalid entry number for player 1, expected: {}, got: {}",
        entry_number,
        player1_registration.entry_number,
    );
    assert!(player1_registration.has_submitted == false, "submitted score should be false");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_enter_tournament_season() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let schedule = Schedule {
        registration: Option::None,
        game: Period { start: TEST_START_TIME().into(), end: TEST_END_TIME().into() },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    // advance time to tournament start time (no registration phase for season tournaments)
    let time = TEST_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // enter tournament
    let (game_token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // verify registration information
    let player1_registration = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, game_token_id);

    assert!(player1_registration.context_id == tournament.id, "Wrong tournament id");
    assert!(player1_registration.entry_number == entry_number, "Invalid entry number");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

//
// Test score submission
//

#[test]
fn test_submit_score_basic() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 10 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id, 100);

    // Submit score for first place (position 1)
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    // Verify leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 1, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == token_id, "Invalid token id in leaderboard");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_submit_score_multiple_positions() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 4 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament with four players
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);
    let (token_id4, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player4', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Set different scores
    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);
    contracts.minigame.end_game(token_id3, 75);
    contracts.minigame.end_game(token_id4, 1);

    // Submit scores in different order than final ranking
    contracts.budokan.submit_score(tournament.id, token_id3, 1); // 75 points
    contracts.budokan.submit_score(tournament.id, token_id1, 1); // 100 points
    contracts.budokan.submit_score(tournament.id, token_id2, 3); // 50 points
    contracts.budokan.submit_score(tournament.id, token_id4, 4); // 1 point

    // Verify leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 4, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == token_id1, "Invalid first place");
    assert!(*leaderboard.at(1) == token_id3, "Invalid second place");
    assert!(*leaderboard.at(2) == token_id2, "Invalid third place");
    assert!(*leaderboard.at(3) == token_id4, "Invalid fourth place");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Score")]
#[test]
fn test_submit_score_lower_score() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);

    // Submit higher score first
    contracts.budokan.submit_score(tournament.id, token_id1, 1);

    // Try to submit lower score for same position
    contracts.budokan.submit_score(tournament.id, token_id2, 1);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Invalid position")]
#[test]
fn test_submit_score_invalid_position() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(token_id, 100);

    // Try to submit for position 3 when only 2 prize spots exist
    contracts.budokan.submit_score(tournament.id, token_id, 3);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Registration: Score already submitted")]
#[test]
fn test_submit_score_already_submitted() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(token_id, 100);

    // Submit score once
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    // Try to submit again
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Not in submission period")]
#[test]
fn test_submit_score_wrong_period() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    // Try to submit before tournament ends (during live phase)
    let live_time = TEST_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, live_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, live_time);

    contracts.minigame.end_game(token_id, 100);
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Invalid position")]
#[test]
fn test_submit_score_position_zero() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(token_id, 100);

    // Try to submit for position 0
    contracts.budokan.submit_score(tournament.id, token_id, 0);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Invalid position")]
#[test]
fn test_submit_score_with_gap() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 75);

    // Submit to position 1 first
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    // Submit to position 3, leaving position 2 empty - should panic
    contracts.budokan.submit_score(tournament.id, token_id2, 3);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Tournament")]
#[test]
fn test_submit_score_invalid_tournament() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // create basic tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Try to submit score for non-existent tournament
    let tournament_id = tournament.id + 1;
    let token_id = 1;
    let position = 1;
    contracts.budokan.submit_score(tournament_id, token_id, position);

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

//
// Test claiming prizes
//

#[test]
fn test_claim_prizes_with_sponsored_prizes() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Approve tokens for transfer
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.erc721.contract_address, owner);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    stop_cheat_caller_address(contracts.erc721.contract_address);

    // Add prizes
    let first_prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: STARTING_BALANCE.low,
                    distribution: Option::None,
                    distribution_count: Option::None,
                },
            ),
            Option::Some(1),
        );
    let second_prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            Option::Some(1),
        );

    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(entry_token_id, 1);

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Single(first_prize.id)));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Single(second_prize.id)));

    // check balances of owner after claiming prizes
    assert(contracts.erc20.balance_of(owner) == STARTING_BALANCE, 'Invalid balance');
    assert(contracts.erc721.owner_of(1) == owner, 'Invalid owner');

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Prize: Prize has already been claimed")]
#[test]
fn test_claim_prizes_prize_already_claimed() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Approve tokens for transfer
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.erc721.contract_address, owner);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    stop_cheat_caller_address(contracts.erc721.contract_address);

    // Add prizes
    let first_prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: STARTING_BALANCE.low,
                    distribution: Option::None,
                    distribution_count: Option::None,
                },
            ),
            Option::Some(1),
        );

    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            Option::Some(1),
        );

    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(entry_token_id, 1);

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Claim prize once
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Single(first_prize.id)));
    // Try to claim again - should panic
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Single(first_prize.id)));

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

//
// Test state transitions and tournament lifecycle
//

#[test]
fn test_state_transitions() {
    let contracts = setup();
    let owner = OWNER;

    // Start before tournament creation
    let mut time = 0_u64;
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Scheduled phase - before registration starts
    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Scheduled => {},
        _ => panic!("Should be in Scheduled phase"),
    }

    // Registration phase
    time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Registration => {},
        _ => panic!("Should be in Registration phase"),
    }

    // Enter tournament
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // Live phase - during game period
    time = TEST_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Live => {},
        _ => panic!("Should be in Live phase"),
    }

    // Submission phase - after game ends
    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id, 100);
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Submission => {},
        _ => panic!("Should be in Submission phase"),
    }

    // Finalized phase - after submission period
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Finalized => {},
        _ => panic!("Should be in Finalized phase"),
    }

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_tournament_with_no_submissions() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Move through registration without any entries
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Skip to finalized phase
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Tournament should be finalized with no winners
    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Finalized => {},
        _ => panic!("Should be in Finalized phase"),
    }

    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 0, "Leaderboard should be empty");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_tournament_with_partial_submissions() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    // Register 2 players (but tournament has 3 prize spots)
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);

    // End games and submit scores
    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);

    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);

    // Verify only 2 positions filled
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 2, "Leaderboard should have 2 entries");
    assert!(*leaderboard.at(0) == token_id1, "Invalid first place");
    assert!(*leaderboard.at(1) == token_id2, "Invalid second place");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

//
// Tournament gated tests with entry limits
//

#[should_panic(expected: "EntryRequirement: No entries left according to extension")]
#[test]
fn test_create_tournament_gated_by_multiple_tournaments_with_limited_entry() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Create second tournament
    let second_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter and complete first tournament
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Enter and complete second tournament
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', owner, Option::None);

    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(second_entry_token_id, 20);
    contracts.budokan.submit_score(second_tournament.id, second_entry_token_id, 1);

    // Settle tournaments
    let settle_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, settle_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, settle_time);

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id_1, qualifying_tournament_id_2]
    let extension_config = array![
        QUALIFIER_TYPE_WINNERS, 0, 0, first_tournament.id.into(), second_tournament.id.into(),
    ]
        .span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: settle_time, end: settle_time + MIN_REGISTRATION_PERIOD.into() },
        ),
        game: Period {
            start: settle_time + MIN_REGISTRATION_PERIOD.into(),
            end: settle_time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
        },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let gated_tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    let reg_time = settle_time + MIN_REGISTRATION_PERIOD.into() - 1;
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Qualification proof: [qualifying_tournament_id, token_id, position]
    let first_qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![first_tournament.id.into(), first_entry_token_id.into(), 1].span(),
        ),
    );
    let second_qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![second_tournament.id.into(), second_entry_token_id.into(), 1].span(),
        ),
    );

    // First two entries should succeed
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player3', owner, first_qualifying_proof);
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player4', owner, second_qualifying_proof);
    // Third entry with same qualification should fail (entry limit reached)
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player5', owner, second_qualifying_proof);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

//
// Tournament gated caller ownership tests
//

#[test]
fn test_tournament_gated_caller_owns_qualifying_token_different_player() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create and complete first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    let settle_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, settle_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, settle_time);

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id]
    let extension_config = array![QUALIFIER_TYPE_WINNERS, 0, 0, first_tournament.id.into()].span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: settle_time, end: settle_time + MIN_REGISTRATION_PERIOD.into() },
        ),
        game: Period {
            start: settle_time + MIN_REGISTRATION_PERIOD.into(),
            end: settle_time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
        },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let second_tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // OWNER owns the qualifying token and enters with a different player_address
    let different_player = 0x999_felt252.try_into().unwrap();
    // Qualification proof: [qualifying_tournament_id, token_id, position]
    let qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![first_tournament.id.into(), first_entry_token_id.into(), 1].span(),
        ),
    );

    // Since caller (OWNER) owns the qualifying token, token should go to player_address
    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', different_player, qualifying_proof);

    // Verify the game token was minted to player_address (different_player), not the caller (OWNER)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(second_entry_token_id.into());
    assert!(
        token_owner == different_player,
        "Token should be owned by player_address (different_player), not caller (OWNER)",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_tournament_gated_caller_does_not_own_qualifying_token() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create and complete first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // qualified_player enters and wins the first tournament
    let qualified_player = 0x789_felt252.try_into().unwrap();
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', qualified_player, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);
    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    let settled_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, settled_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, settled_time);

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id]
    let extension_config = array![QUALIFIER_TYPE_WINNERS, 0, 0, first_tournament.id.into()].span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = settled_time;

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: current_time, end: current_time + MIN_REGISTRATION_PERIOD.into() },
        ),
        game: Period {
            start: current_time + MIN_REGISTRATION_PERIOD.into(),
            end: current_time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
        },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let second_tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // OWNER (caller) tries to enter using qualified_player's winning token
    // Since caller != token owner, validation will fail in the tournament_validator
    // Qualification proof: [qualifying_tournament_id, token_id, position]
    let qualifying_proof = Option::Some(
        QualificationProof::Extension(
            array![first_tournament.id.into(), first_entry_token_id.into(), 1].span(),
        ),
    );

    // Change caller to the qualified player (token owner) to make this work
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, qualified_player);

    let different_player = 0x999_felt252.try_into().unwrap();
    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', different_player, qualifying_proof);

    // Verify the game token was minted to player_address (different_player)
    // since qualified_player (caller) owns the qualifying token
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(second_entry_token_id.into());
    assert!(
        token_owner == different_player,
        "Token should be owned by player_address (different_player) since caller owns qualifying token",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Extension Gated Tournament With Entry Limit ====================

#[test]
fn test_extension_gated_tournament_with_entry_limit() {
    let contracts = setup();
    let owner = OWNER;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament gated by entry validator extension with entry limit
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 2, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Verify tournament was created with correct gating
    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    // Start tournament entries
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let qualification_proof = Option::Some(QualificationProof::Extension(array![].span()));

    // OWNER already has an ERC721 token (minted in setup), so they should be able to enter
    let (token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, qualification_proof);

    // Verify entry was successful
    assert(entry_number == 1, 'Invalid entry number');
    assert!(token_id > 0, "Entry token ID should be positive");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Enter Tournament After Registration Ends ====================

#[should_panic(expected: "Budokan: Registration is not open")]
#[test]
fn test_enter_tournament_after_registration_ends() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create a tournament with registration period
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Fast forward to after game period starts (after registration ends)
    let after_registration = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, after_registration);
    start_cheat_block_timestamp(contracts.minigame.contract_address, after_registration);

    // Try to enter tournament after registration period - should panic
    contracts.budokan.enter_tournament(tournament.id, 'late_player', owner, Option::None);
}


// ==================== Third Party Entry Tests ====================

#[test]
fn test_third_party_enters_player_into_tournament() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Third party (owner) enters a different player into the tournament
    let player = 0x123_felt252.try_into().unwrap();
    let (entry_token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'sponsored_player', player, Option::None);

    // Verify entry was successful
    assert!(entry_token_id > 0, "Entry token ID should be positive");
    assert!(entry_number == 1, "Entry number should be 1");

    // Verify the entry token was minted to the player_address (not caller)
    // Note: In this contract, tokens are minted to player_address unless qualification is used
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(entry_token_id.into());
    assert!(token_owner == player, "Entry token should be owned by player_address");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}


// ==================== Score Submission Tie Breaker Tests ====================

#[test]
fn test_score_submission_multiple_players() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter two players
    let (entry_token_id_1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let player2 = 0x123_felt252.try_into().unwrap();
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    let (entry_token_id_2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', player2, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // End games with different scores - player 1 submits first, player 2 has higher score
    contracts.minigame.end_game(entry_token_id_1, 500);
    contracts.minigame.end_game(entry_token_id_2, 1000);

    // Player 1 submits score at position 1 first
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts.budokan.submit_score(tournament.id, entry_token_id_1, 1);

    // Player 2 submits at position 1 with higher score (takes position from player 1)
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    contracts.budokan.submit_score(tournament.id, entry_token_id_2, 1);

    // Wait for tournament to settle
    let settle_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, settle_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, settle_time);

    // Get tournament results - verify both entries recorded
    let entry_count = contracts.budokan.tournament_entries(tournament.id);
    assert!(entry_count == 2, "Should have 2 entries");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}


// ==================== Multiple Tournament Tests ====================

#[test]
fn test_create_multiple_tournaments() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    start_cheat_block_timestamp(contracts.budokan.contract_address, TEST_START_TIME().into());
    start_cheat_block_timestamp(contracts.minigame.contract_address, TEST_START_TIME().into());

    // Create multiple tournaments
    let tournament1 = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    let tournament2 = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
        );

    // Verify both tournaments can be retrieved
    let retrieved_tournament1 = contracts.budokan.tournament(tournament1.id);
    let retrieved_tournament2 = contracts.budokan.tournament(tournament2.id);
    assert!(retrieved_tournament1.id == tournament1.id, "Tournament 1 ID should match");
    assert!(retrieved_tournament2.id == tournament2.id, "Tournament 2 ID should match");

    // Verify total tournaments count
    let total = contracts.budokan.total_tournaments();
    assert!(total >= 2, "Should have at least 2 tournaments");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Get Registration Tests ====================

#[test]
fn test_get_registration() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament
    let (entry_token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // Get registration
    let registration = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, entry_token_id);
    assert!(registration.context_id == tournament.id, "Tournament ID should match");
    assert!(registration.entry_number == entry_number, "Entry number should match");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Get Prize Tests ====================

#[test]
fn test_get_prize_basic() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // ERC20 is already registered in setup - approve tokens for transfer
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Add a prize
    let added_prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: 1000, distribution: Option::None, distribution_count: Option::None,
                },
            ),
            Option::Some(1),
        );

    // Get the prize
    let prize = contracts.prize.get_prize(added_prize.id);
    assert!(prize.id == added_prize.id, "Prize ID should match");
    assert!(prize.context_id == tournament.id, "Tournament ID should match");
    assert!(prize.token_address == contracts.erc20.contract_address, "Token address should match");
    assert!(prize.sponsor_address == owner, "Sponsor should be the caller");

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[test]
fn test_get_prize_erc721() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // ERC721 is already registered in setup - mint NFT id 2 (id 1 is minted in setup)
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.erc721.contract_address, owner);
    contracts.erc721.mint(owner, 2);
    stop_cheat_caller_address(contracts.erc721.contract_address);

    // Approve budokan to transfer the NFT
    start_cheat_caller_address(contracts.erc721.contract_address, owner);
    contracts.erc721.approve(contracts.budokan.contract_address, 2);
    stop_cheat_caller_address(contracts.erc721.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Add an ERC721 prize
    let added_prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 2 }),
            Option::Some(1),
        );

    // Get the prize
    let prize = contracts.prize.get_prize(added_prize.id);
    assert!(prize.id == added_prize.id, "Prize ID should match");
    assert!(prize.context_id == tournament.id, "Tournament ID should match");
    assert!(prize.token_address == contracts.erc721.contract_address, "Token address should match");

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[test]
fn test_add_prize_records_sponsor_address() {
    let owner = OWNER;
    let sponsor = 0x5678_felt252.try_into().unwrap();
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint tokens to sponsor
    contracts.erc20.mint(sponsor, 1000);

    // Sponsor approves budokan
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, 1000);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Sponsor adds a prize
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);

    let added_prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: 500, distribution: Option::None, distribution_count: Option::None,
                },
            ),
            Option::Some(1),
        );

    // Get the prize and verify sponsor
    let prize = contracts.prize.get_prize(added_prize.id);
    assert!(prize.sponsor_address == sponsor, "Sponsor address should be recorded");

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[test]
fn test_prize_refunded_to_sponsor_when_position_exceeds_leaderboard() {
    let owner = OWNER;
    let sponsor = 0x5678_felt252.try_into().unwrap();
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint tokens to sponsor
    contracts.erc20.mint(sponsor, 1000);

    // Sponsor approves budokan
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, 1000);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Sponsor adds a prize for position 3
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: 500, distribution: Option::None, distribution_count: Option::None,
                },
            ),
            Option::Some(3),
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Start registration and enter tournament with only 2 players
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);

    // Move to submission period and submit scores (only 2 players, leaderboard size = 2)
    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);

    // Verify leaderboard has only 2 entries
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 2, "Leaderboard should have 2 entries");

    // Move to finalized period
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Record sponsor balance before claim
    let sponsor_balance_before = contracts.erc20.balance_of(sponsor);

    // Claim prize for position 3 (which doesn't exist on the leaderboard)
    // This should refund the prize to the sponsor
    contracts.budokan.claim_reward(tournament.id, RewardType::Prize(PrizeType::Single(prize.id)));

    // Verify prize was refunded to sponsor (not tournament creator)
    let sponsor_balance_after = contracts.erc20.balance_of(sponsor);
    assert!(
        sponsor_balance_after == sponsor_balance_before + 500,
        "Prize should be refunded to sponsor",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Get Tournament ID for Token ID Tests ====================

#[test]
fn test_get_context_id_for_token_id() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament
    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // Get tournament ID for the token
    let retrieved_tournament_id = contracts
        .registration
        .get_context_id_for_token(contracts.minigame.contract_address, entry_token_id);
    assert!(retrieved_tournament_id == tournament.id, "Tournament ID should match");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_get_tournament_id_for_unregistered_token() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Try to get tournament ID for a token that was never entered
    let tournament_id = contracts
        .registration
        .get_context_id_for_token(contracts.minigame.contract_address, 99999);

    // Should return 0 for unregistered token
    assert!(tournament_id == 0, "Should return 0 for unregistered token");

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

// ==================== Get Registration Banned Tests ====================

#[test]
fn test_get_registration_banned_not_banned() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament
    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // Get registration banned status
    let is_banned = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, entry_token_id);
    assert!(!is_banned, "Should not be banned initially");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Leaderboard Tests ====================

#[test]
fn test_get_leaderboard_empty() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Get leaderboard before any submissions
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 0, "Leaderboard should be empty initially");

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[test]
fn test_get_leaderboard_after_submissions() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament
    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // End game and submit score
    contracts.minigame.end_game(entry_token_id, 1000);
    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    // Get leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 1, "Leaderboard should have 1 entry");
    assert!(*leaderboard.at(0) == entry_token_id, "Leaderboard should contain the token ID");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_leaderboard_ordering_by_score() {
    let owner = OWNER;
    let player2 = 0x456_felt252.try_into().unwrap();
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 2 prize spots
    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            GameConfig {
                address: contracts.minigame.contract_address,
                settings_id: 1,
                soulbound: false,
                play_url: "",
            },
            Option::None,
            Option::None,
        );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament - player 1
    let (entry_token_id_1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    // Enter tournament - player 2
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    let (entry_token_id_2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', player2, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // Player 1 gets lower score, player 2 gets higher score
    contracts.minigame.end_game(entry_token_id_1, 500);
    contracts.minigame.end_game(entry_token_id_2, 1000);

    // Player 1 submits first at position 1
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts.budokan.submit_score(tournament.id, entry_token_id_1, 1);

    // Player 2 submits with higher score, takes position 1
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    contracts.budokan.submit_score(tournament.id, entry_token_id_2, 1);

    // Get leaderboard - player 2 should be first (higher score)
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 2, "Leaderboard should have 2 entries");
    assert!(*leaderboard.at(0) == entry_token_id_2, "Player 2 should be first (higher score)");
    assert!(*leaderboard.at(1) == entry_token_id_1, "Player 1 should be second (lower score)");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Tournament Entries Tests ====================

#[test]
fn test_tournament_entries_count() {
    let owner = OWNER;
    let player2 = 0x456_felt252.try_into().unwrap();
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Check initial entry count
    let initial_count = contracts.budokan.tournament_entries(tournament.id);
    assert!(initial_count == 0, "Initial entry count should be 0");

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament - player 1
    contracts.budokan.enter_tournament(tournament.id, 'player1', owner, Option::None);

    // Check entry count after first entry
    let count_after_first = contracts.budokan.tournament_entries(tournament.id);
    assert!(count_after_first == 1, "Entry count should be 1 after first entry");

    // Enter tournament - player 2
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    contracts.budokan.enter_tournament(tournament.id, 'player2', player2, Option::None);

    // Check entry count after second entry
    let count_after_second = contracts.budokan.tournament_entries(tournament.id);
    assert!(count_after_second == 2, "Entry count should be 2 after second entry");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Current Phase Tests ====================

#[test]
fn test_tournament_current_phase_submission() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Move to after game ends (submission period)
    let submission_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, submission_time);

    // Check phase is Submission
    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Submission => {},
        _ => { panic!("Should be in Submission phase"); },
    }

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
}

#[test]
fn test_tournament_current_phase_finalized() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Move to after submission period ends (finalized)
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Check phase is Finalized
    let phase = contracts.budokan.current_phase(tournament.id);
    match phase {
        Phase::Finalized => {},
        _ => { panic!("Should be in Finalized phase"); },
    }

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
}

// ==================== Entry Fee Distribution Tests ====================

#[test]
fn test_create_tournament_with_entry_fee_distribution() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // ERC20 is already registered in setup - create tournament with entry fee and distribution
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: Distribution::Linear(10), // Linear distribution across 3 prize spots
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            GameConfig {
                address: contracts.minigame.contract_address,
                settings_id: 1,
                soulbound: false,
                play_url: "",
            },
            Option::Some(entry_fee),
            Option::None,
        );

    // Verify tournament was created with entry fee
    let retrieved = contracts.budokan.tournament(tournament.id);
    match retrieved.entry_fee {
        Option::Some(fee) => {
            assert!(fee.amount == 100, "Entry fee amount should match");
            assert!(fee.distribution == Distribution::Linear(10), "Distribution should be Linear");
        },
        Option::None => { panic!("Tournament should have entry fee"); },
    }

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

#[test]
fn test_create_tournament_with_creator_shares() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // ERC20 is already registered in setup - create tournament with entry fee and creator shares
    // With 5% tournament creator + 5% game creator, 90% goes to position distribution
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: Distribution::Linear(10), // Linear distribution for remaining 90%
        tournament_creator_share: Option::Some(500), // 5% (500 basis points) to tournament creator
        game_creator_share: Option::Some(500), // 5% (500 basis points) to game creator
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            GameConfig {
                address: contracts.minigame.contract_address,
                settings_id: 1,
                soulbound: false,
                play_url: "",
            },
            Option::Some(entry_fee),
            Option::None,
        );

    // Verify tournament was created with creator shares
    let retrieved = contracts.budokan.tournament(tournament.id);
    match retrieved.entry_fee {
        Option::Some(fee) => {
            match fee.tournament_creator_share {
                Option::Some(share) => {
                    assert!(share == 500, "Tournament creator share should be 500 bp (5%)");
                },
                Option::None => { panic!("Should have tournament creator share"); },
            }
            match fee.game_creator_share {
                Option::Some(share) => {
                    assert!(share == 500, "Game creator share should be 500 bp (5%)");
                },
                Option::None => { panic!("Should have game creator share"); },
            }
        },
        Option::None => { panic!("Tournament should have entry fee"); },
    }

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

// ==================== Claim Prize Tests ====================

#[test]
fn test_claim_entry_fee_prizes() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // ERC20 is already registered in setup - create tournament with entry fee
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: Distribution::Linear(10), // 100% to winner (single prize spot)
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    // Mint tokens to player for entry fee
    contracts.erc20.mint(owner, 1000);

    // Approve budokan to spend tokens
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, 1000);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament (pays entry fee)
    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // End game and submit score
    contracts.minigame.end_game(entry_token_id, 1000);
    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    // Move to finalized period
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Claim entry fee prize for position 1
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(1)));

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_claim_entry_fee_exponential_distribution_five_players() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Use 18 decimal token amounts (100 tokens = 100 * 10^18)
    let one_token: u128 = 1_000_000_000_000_000_000; // 10^18
    let entry_amount: u128 = 100 * one_token; // 100 tokens per player
    let total_pool: u256 = 500 * one_token.into(); // 500 tokens total

    // Create tournament with exponential distribution and entry fee
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Exponential(15), // Weight of 1.5 for gentler curve
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    // Mint tokens to owner for entry fees (5 players * 100 tokens)
    contracts.erc20.mint(owner, total_pool);

    // Approve budokan to spend tokens
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, total_pool);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter 5 players into tournament
    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (player3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);
    let (player4, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player4', owner, Option::None);
    let (player5, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player5', owner, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // Submit scores for all players (in descending order)
    contracts.minigame.end_game(player1, 5000);
    contracts.budokan.submit_score(tournament.id, player1, 1);

    contracts.minigame.end_game(player2, 4000);
    contracts.budokan.submit_score(tournament.id, player2, 2);

    contracts.minigame.end_game(player3, 3000);
    contracts.budokan.submit_score(tournament.id, player3, 3);

    contracts.minigame.end_game(player4, 2000);
    contracts.budokan.submit_score(tournament.id, player4, 4);

    contracts.minigame.end_game(player5, 1000);
    contracts.budokan.submit_score(tournament.id, player5, 5);

    // Move to finalized period
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Record initial balance
    let initial_balance = contracts.erc20.balance_of(owner);

    // Claim prizes for all positions and verify amounts
    // Total prize pool: 500 tokens
    // With exponential distribution (weight=15 = 1.5), the distribution should favor top positions

    // Position 1 (highest share)
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(1)));
    let balance_after_p1 = contracts.erc20.balance_of(owner);
    let prize_p1 = balance_after_p1 - initial_balance;

    // Position 2
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(2)));
    let balance_after_p2 = contracts.erc20.balance_of(owner);
    let prize_p2 = balance_after_p2 - balance_after_p1;

    // Position 3
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(3)));
    let balance_after_p3 = contracts.erc20.balance_of(owner);
    let prize_p3 = balance_after_p3 - balance_after_p2;

    // Position 4
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(4)));
    let balance_after_p4 = contracts.erc20.balance_of(owner);
    let prize_p4 = balance_after_p4 - balance_after_p3;

    // Position 5 (lowest share)
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(5)));
    let balance_after_p5 = contracts.erc20.balance_of(owner);
    let prize_p5 = balance_after_p5 - balance_after_p4;

    // Verify exponential distribution properties:
    // 1. All prizes should be non-zero
    assert!(prize_p1 > 0, "Position 1 should receive prize");
    assert!(prize_p2 > 0, "Position 2 should receive prize");
    assert!(prize_p3 > 0, "Position 3 should receive prize");
    assert!(prize_p4 > 0, "Position 4 should receive prize");
    assert!(prize_p5 > 0, "Position 5 should receive prize");

    // 2. Prizes should decrease from position 1 to 5
    assert!(prize_p1 > prize_p2, "Position 1 > Position 2");
    assert!(prize_p2 > prize_p3, "Position 2 > Position 3");
    assert!(prize_p3 > prize_p4, "Position 3 > Position 4");
    assert!(prize_p4 > prize_p5, "Position 4 > Position 5");

    // 3. Total should equal prize pool (500 tokens with 18 decimals)
    // With 18 decimal tokens, dust from integer division is negligible (< 5 wei)
    let total_distributed = prize_p1 + prize_p2 + prize_p3 + prize_p4 + prize_p5;
    let one_token: u256 = 1_000_000_000_000_000_000; // 10^18
    let expected_pool: u256 = 500 * one_token;
    // Allow up to 4 wei of dust (positions - 1)
    assert!(
        total_distributed >= expected_pool - 4 && total_distributed <= expected_pool,
        "Total should equal prize pool",
    );

    // 4. Position 1 should receive more than position 5 (exponential curve)
    assert!(prize_p1 > prize_p5, "Position 1 should be > position 5");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Registration Has Submitted Tests ====================

#[test]
fn test_registration_has_submitted_flag() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter tournament
    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    // Check has_submitted is false before submission
    let registration_before = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, entry_token_id);
    assert!(!registration_before.has_submitted, "has_submitted should be false before submission");

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // End game and submit score
    contracts.minigame.end_game(entry_token_id, 1000);
    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    // Check has_submitted is true after submission
    let registration_after = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, entry_token_id);
    assert!(registration_after.has_submitted, "has_submitted should be true after submission");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Tie-Breaking Score Tests ====================

#[should_panic(expected: "Budokan: Score too low for position")]
#[test]
fn test_submit_score_tie_higher_game_id() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    // Start registration period
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);

    // Set both players to have the same score
    contracts.minigame.end_game(player1, 100);
    contracts.minigame.end_game(player2, 100);

    // Move to submission phase
    let sub_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, sub_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, sub_time);

    // First player submits score - should succeed
    contracts.budokan.submit_score(tournament.id, player1, 1);

    // Second player also tries to submit as position 1 (tie)
    // This should fail since player2's game id is higher than player1's
    contracts.budokan.submit_score(tournament.id, player2, 1);
}

#[test]
fn test_submit_score_tie_lower_game_id() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    // Start registration period
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);

    // Set both players to have the same score
    contracts.minigame.end_game(player1, 100);
    contracts.minigame.end_game(player2, 100);

    // Move to submission phase
    let sub_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, sub_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, sub_time);

    // First submit player2 (higher game ID)
    contracts.budokan.submit_score(tournament.id, player2, 1);

    // Then submit player1 (lower game ID) - should take first place
    contracts.budokan.submit_score(tournament.id, player1, 1);

    // Get leaderboard - player1 should be first due to lower game ID
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(*leaderboard.at(0) == player1, "Player1 should be first place");
    assert!(*leaderboard.at(1) == player2, "Player2 should be second place");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_submit_score_tie_higher_game_id_for_lower_position() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    // Start registration period
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Enter tournament with three players
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);

    // Move to submission phase
    let sub_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, sub_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, sub_time);

    // Set scores - player1 and player2 have same score, player3 has lower
    contracts.minigame.end_game(token_id1, 100); // First player (lower ID)
    contracts.minigame.end_game(token_id2, 100); // Second player (higher ID)
    contracts.minigame.end_game(token_id3, 50); // Third player

    // Submit scores in order
    contracts.budokan.submit_score(tournament.id, token_id1, 1); // First place
    contracts.budokan.submit_score(tournament.id, token_id2, 2); // Second place
    contracts.budokan.submit_score(tournament.id, token_id3, 3); // Third place

    // Verify leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 3, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == token_id1, "Invalid first place");
    assert!(*leaderboard.at(1) == token_id2, "Invalid second place");
    assert!(*leaderboard.at(2) == token_id3, "Invalid third place");

    // Verify registrations are marked as submitted
    let reg1 = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, token_id1);
    let reg2 = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, token_id2);
    let reg3 = contracts
        .registration
        .get_registration(contracts.minigame.contract_address, token_id3);

    assert!(reg1.has_submitted, "Player 1 should be marked as submitted");
    assert!(reg2.has_submitted, "Player 2 should be marked as submitted");
    assert!(reg3.has_submitted, "Player 3 should be marked as submitted");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Score too high for position")]
#[test]
fn test_submit_score_tie_lower_game_id_for_lower_position() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    // Start registration period
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Enter tournament with two players
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);

    // Move to submission phase
    let sub_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, sub_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, sub_time);

    // Set equal scores for both players
    contracts.minigame.end_game(token_id1, 100); // First player (lower ID)
    contracts.minigame.end_game(token_id2, 100); // Second player (higher ID)

    // Submit higher ID first
    contracts.budokan.submit_score(tournament.id, token_id2, 1); // First place

    // Try to submit lower ID for second place with same score
    // This should fail because for equal scores, the game ID in lower positions should be higher
    contracts.budokan.submit_score(tournament.id, token_id1, 2); // Second place
}

// ==================== Ban/Validate Entry Tests ====================

#[test]
fn test_ban_game_ids_during_registration() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with extension entry requirement
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter tournament during registration with valid player
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id_1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));
    let (game_id_2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::Some(qualification));

    // Transfer game_id_1 to invalid player (who doesn't have qualifying ERC721)
    let invalid_player = 0x999_felt252.try_into().unwrap();
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    start_cheat_caller_address(contracts.denshokan.contract_address, owner);
    denshokan_erc721.transfer_from(owner, invalid_player, game_id_1.into());
    stop_cheat_caller_address(contracts.denshokan.contract_address);

    // Verify registrations exist and are not banned initially
    let is_banned_1 = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id_1);
    assert!(!is_banned_1, "Registration should not be banned initially");

    // Ban game_id_1 - should be banned because owner doesn't have qualifying token
    contracts.budokan.ban_entry(tournament.id, game_id_1, array![].span());

    // Verify game_id_1 is now banned (owned by invalid_player)
    let is_banned_1_after = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id_1);
    assert!(is_banned_1_after, "Game ID 1 should be banned - owner doesn't have qualifying token");

    // Verify game_id_2 is NOT banned (still owned by valid_player, and we didn't call ban_entry on
    // it)
    let is_banned_2 = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id_2);
    assert!(!is_banned_2, "Game ID 2 should not be banned - owner has qualifying token");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Registration: Game ID is banned")]
#[test]
fn test_banned_game_id_cannot_submit_score() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with extension entry requirement
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter tournament
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));

    // Transfer to invalid player
    let invalid_player = 0x999_felt252.try_into().unwrap();
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    start_cheat_caller_address(contracts.denshokan.contract_address, owner);
    denshokan_erc721.transfer_from(owner, invalid_player, game_id.into());
    stop_cheat_caller_address(contracts.denshokan.contract_address);

    // Ban the game ID (will be banned because owner doesn't have qualifying token)
    contracts.budokan.ban_entry(tournament.id, game_id, array![].span());

    // Set score for the game (would happen during game period)
    let game_time = TEST_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);
    contracts.minigame.end_game(game_id, 100);

    // Move to submission period
    let sub_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, sub_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, sub_time);

    // Attempt to submit score - should panic
    contracts.budokan.submit_score(tournament.id, game_id, 1);
}

#[test]
fn test_anyone_can_ban() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with extension entry requirement
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter tournament
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));

    // Transfer to invalid player
    let invalid_player = 0x999_felt252.try_into().unwrap();
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    start_cheat_caller_address(contracts.denshokan.contract_address, owner);
    denshokan_erc721.transfer_from(owner, invalid_player, game_id.into());
    stop_cheat_caller_address(contracts.denshokan.contract_address);

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Switch to different address (not creator)
    let non_creator = 0x888_felt252.try_into().unwrap();
    start_cheat_caller_address(contracts.budokan.contract_address, non_creator);

    // Anyone can ban - should succeed
    contracts.budokan.ban_entry(tournament.id, game_id, array![].span());

    // Verify game ID is now banned
    let is_banned = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id);
    assert!(is_banned, "Registration should be banned");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Can only ban from registration start until game starts")]
#[test]
fn test_cannot_ban_after_game_starts() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with extension entry requirement
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter tournament
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));

    // Move to game start (after registration ends and after any gap)
    let game_time = TEST_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // Attempt to ban after game starts - should panic
    contracts.budokan.ban_entry(tournament.id, game_id, array![].span());
}

#[test]
fn test_can_ban_during_staging_phase() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with a gap between registration end and game start
    let registration_start_time: u64 = 1000;
    let registration_end_time: u64 = 1000 + MIN_REGISTRATION_PERIOD;
    let tournament_start_time: u64 = registration_end_time
        + 1000; // Gap of 1000 between registration end and game start
    let tournament_end_time: u64 = tournament_start_time + MIN_TOURNAMENT_LENGTH;

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: registration_start_time, end: registration_end_time },
        ),
        game: Period { start: tournament_start_time, end: tournament_end_time },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    // Create tournament with extension entry requirement
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter tournament during registration period
    start_cheat_block_timestamp(contracts.budokan.contract_address, registration_start_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, registration_start_time);

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));

    // Transfer to invalid player (who doesn't meet entry requirements)
    let invalid_player = 0x999_felt252.try_into().unwrap();
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    start_cheat_caller_address(contracts.denshokan.contract_address, owner);
    denshokan_erc721.transfer_from(owner, invalid_player, game_id.into());
    stop_cheat_caller_address(contracts.denshokan.contract_address);

    // Move to staging phase (after registration ends but before game starts)
    start_cheat_block_timestamp(contracts.budokan.contract_address, registration_end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, registration_end_time);

    // Verify we're in staging phase
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Staging,
        "Tournament should be in Staging phase",
    );

    // Banning should succeed during staging phase
    contracts.budokan.ban_entry(tournament.id, game_id, array![].span());

    // Verify game ID is now banned
    let is_banned = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id);
    assert!(is_banned, "Registration should be banned during staging phase");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Can only ban tournaments with registration period set")]
#[test]
fn test_ban_without_registration_period() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament without registration period but with extension requirement
    let schedule_without_registration = Schedule {
        registration: Option::None,
        game: test_game_period(),
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule_without_registration,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter tournament (no registration period, so can enter anytime before game starts)
    let before_game_start = TEST_START_TIME() - 100;
    start_cheat_block_timestamp(contracts.budokan.contract_address, before_game_start.into());
    start_cheat_block_timestamp(contracts.minigame.contract_address, before_game_start.into());

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));

    // Attempt to ban without registration period - should panic
    contracts.budokan.ban_entry(tournament.id, game_id, array![].span());
}

#[test]
fn test_ban_multiple_game_ids() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with extension entry requirement
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter multiple players
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id_1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));
    let (game_id_2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::Some(qualification));
    let (game_id_3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::Some(qualification));

    // Transfer game_id_1 and game_id_3 to invalid player
    let invalid_player = 0x999_felt252.try_into().unwrap();
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    start_cheat_caller_address(contracts.denshokan.contract_address, owner);
    denshokan_erc721.transfer_from(owner, invalid_player, game_id_1.into());
    denshokan_erc721.transfer_from(owner, invalid_player, game_id_3.into());
    stop_cheat_caller_address(contracts.denshokan.contract_address);

    // Ban game_id_1 and game_id_3 (owned by invalid player)
    // Don't ban game_id_2 since it's still owned by valid player
    contracts.budokan.ban_entry(tournament.id, game_id_1, array![].span());
    contracts.budokan.ban_entry(tournament.id, game_id_3, array![].span());

    // Verify correct IDs are banned
    let is_banned_1 = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id_1);
    let is_banned_2 = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id_2);
    let is_banned_3 = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id_3);

    assert!(is_banned_1, "Registration 1 should be banned - owner doesn't have qualifying token");
    assert!(!is_banned_2, "Registration 2 should not be banned");
    assert!(is_banned_3, "Registration 3 should be banned");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Game ID is already banned")]
#[test]
fn test_cannot_ban_already_banned_game_id() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with extension entry requirement
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Enter tournament
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::Some(qualification));

    // Transfer game token to invalid player (who doesn't own the qualifying token)
    let invalid_player = 0x999_felt252.try_into().unwrap();
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    start_cheat_caller_address(contracts.denshokan.contract_address, owner);
    denshokan_erc721.transfer_from(owner, invalid_player, game_id.into());
    stop_cheat_caller_address(contracts.denshokan.contract_address);

    // Ban the game ID for the first time
    contracts.budokan.ban_entry(tournament.id, game_id, array![].span());

    // Verify game ID is banned
    let is_banned = contracts
        .registration
        .is_registration_banned(contracts.minigame.contract_address, game_id);
    assert!(is_banned, "Game ID should be banned");

    // Attempt to ban the same game ID again - should panic
    contracts.budokan.ban_entry(tournament.id, game_id, array![].span());
}

// ==================== Extension Gated Tests (Additional) ====================

#[should_panic(expected: "EntryRequirement: No entries left according to extension")]
#[test]
fn test_extension_gated_tournament_entry_limit_enforced() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament gated by entry validator extension with entry limit of 1
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Start tournament entries
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // First entry with OWNER address in qualification proof - should succeed
    let qualification_proof = Option::Some(
        QualificationProof::Extension(array![owner.into()].span()),
    );

    let (_token_id1, entry_number1) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', owner, qualification_proof);

    assert!(entry_number1 == 1, "Invalid entry number");

    // Try to enter again with the same address - should panic because entry limit is 1
    let qualification_proof2 = Option::Some(
        QualificationProof::Extension(array![owner.into()].span()),
    );

    contracts.budokan.enter_tournament(tournament.id, 'test_player2', owner, qualification_proof2);
}

#[test]
fn test_extension_gated_caller_qualifies_different_player() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament gated by entry validator extension
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Start tournament entries
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // OWNER owns an ERC721 token (minted in setup), so they qualify
    // They enter but specify a different player_address
    let different_player = 0x999_felt252.try_into().unwrap();
    let qualification_proof = Option::Some(QualificationProof::Extension(array![].span()));

    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', different_player, qualification_proof);

    // Since caller (OWNER) qualifies, token should go to player_address (different_player)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(token_id.into());
    assert!(
        token_owner == different_player,
        "Token should be owned by player_address (different_player), not caller (OWNER)",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Invalid entry according to extension")]
#[test]
fn test_extension_gated_caller_does_not_qualify() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament gated by entry validator extension
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // Start tournament entries
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Create a player who doesn't own any ERC721 tokens
    let unauthorized_player = 0x999_felt252.try_into().unwrap();
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, unauthorized_player);

    // Verify the player has no tokens
    let balance = contracts.erc721.balance_of(unauthorized_player);
    assert!(balance == 0, "Player should have no tokens");

    let qualification_proof = Option::Some(QualificationProof::Extension(array![].span()));

    // Try to enter with unauthorized account - should panic
    contracts
        .budokan
        .enter_tournament(
            tournament.id, 'unauthorized_player', unauthorized_player, qualification_proof,
        );
}

// ==================== Soulbound Tournament Tests ====================

#[should_panic(expected: "Token is soulbound and cannot be transferred")]
#[test]
fn test_soulbound_tournament_prevents_token_transfer() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create a soulbound tournament (soulbound = true)
    let game_config = GameConfig {
        address: contracts.minigame.contract_address, settings_id: 1, soulbound: true, play_url: "",
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    // Advance time to registration start time
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Enter tournament
    let (game_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    // Verify token was minted to OWNER
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(game_token_id.into());
    assert!(token_owner == owner, "Token should be owned by OWNER");

    // Try to transfer the game token to another address - should panic
    let recipient = 0x999_felt252.try_into().unwrap();
    start_cheat_caller_address(contracts.denshokan.contract_address, owner);
    denshokan_erc721.transfer_from(owner, recipient, game_token_id.into());
}

// ==================== Extension with Registration Only Tests ====================

#[test]
fn test_extension_with_registration_only_requires_registration_period() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Use the entry validator from setup (not registration_only, but we can test with it)
    // Create extension config with the validator
    let extension_config = ExtensionConfig {
        address: contracts.entry_validator.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    // Create a schedule WITH a registration period that has a gap before game start (should
    // succeed)
    let registration_start: u64 = 1000;
    let registration_end: u64 = 1000 + MIN_REGISTRATION_PERIOD;
    let game_start: u64 = registration_end
        + 1000; // Gap of 1000 between registration end and game start
    let game_end: u64 = game_start + MIN_TOURNAMENT_LENGTH;

    let schedule_with_gap = Schedule {
        registration: Option::Some(Period { start: registration_start, end: registration_end }),
        game: Period { start: game_start, end: game_end },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule_with_gap,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
        );

    // Verify tournament was created successfully
    assert!(tournament.id == 1, "Tournament should be created with ID 1");

    stop_cheat_caller_address(contracts.budokan.contract_address);
}

// ==================== Tournament Entry Tests ====================

#[should_panic(expected: "Budokan: Invalid entry according to extension")]
#[test]
fn test_use_host_token_to_qualify_into_tournament_gated_tournament() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // First create and complete a tournament that will be used as a gate
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Complete the first tournament
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);
    contracts.minigame.end_game(first_entry_token_id, 100);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    let settled_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, settled_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, settled_time);

    // assert first_entry_token_id is in the leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(first_tournament.id);
    let first_place = *leaderboard.at(0);
    assert!(first_place == first_entry_token_id, "Invalid first place for first tournament");

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id]
    let extension_config = array![QUALIFIER_TYPE_WINNERS, 0, 0, first_tournament.id.into()].span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = settled_time;

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: current_time, end: current_time + MIN_REGISTRATION_PERIOD.into() },
        ),
        game: Period {
            start: current_time + MIN_REGISTRATION_PERIOD.into(),
            end: current_time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
        },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let second_tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // attempt to join second tournament using the host token, should panic
    // Qualification proof: [qualifying_tournament_id, token_id, position]
    let wrong_qualification = Option::Some(
        QualificationProof::Extension(
            array![first_tournament.id.into(), first_tournament.creator_token_id.into(), 1].span(),
        ),
    );
    contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player', owner, wrong_qualification);
}

#[should_panic(expected: "Budokan: Invalid entry according to extension")]
#[test]
fn test_enter_tournament_wrong_submission_type() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // First create and complete a tournament that will be used as a gate
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Complete the first tournament with two players
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player', owner, Option::None);

    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player2', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);
    contracts.minigame.end_game(first_entry_token_id, 100);
    contracts.minigame.end_game(second_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    let settled_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, settled_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, settled_time);

    // assert first_entry_token_id is in the leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(first_tournament.id);
    let first_place = *leaderboard.at(0);
    assert!(first_place == first_entry_token_id, "Invalid first place for first tournament");

    // Deploy tournament validator extension
    let tournament_validator_address = deploy_tournament_validator_mock(
        contracts.budokan.contract_address,
    );

    // Create extension config: [qualifier_type, qualifying_mode, top_positions,
    // qualifying_tournament_id]
    let extension_config = array![QUALIFIER_TYPE_WINNERS, 0, 0, first_tournament.id.into()].span();
    let entry_requirement_type = EntryRequirementType::extension(
        ExtensionConfig { address: tournament_validator_address, config: extension_config },
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = settled_time;

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: current_time, end: current_time + MIN_REGISTRATION_PERIOD.into() },
        ),
        game: Period {
            start: current_time + MIN_REGISTRATION_PERIOD.into(),
            end: current_time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
        },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let second_tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
        );

    // attempt to join second tournament using token that did not win first tournament, should panic
    // Qualification proof: [qualifying_tournament_id, token_id, position]
    let wrong_qualification = Option::Some(
        QualificationProof::Extension(
            array![first_tournament.id.into(), second_entry_token_id.into(), 1].span(),
        ),
    );
    contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player', owner, wrong_qualification);
}

// ==================== Score Submission Tests ====================

#[test]
fn test_submit_score_gas_check() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create tournament with leaderboard of 10
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    let tournament = contracts
        .budokan
        .create_tournament(
            owner, test_metadata(), test_schedule(), game_config, Option::None, Option::None,
        );

    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Enter 10 players into the tournament
    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', owner, Option::None);

    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', owner, Option::None);

    let (player3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player3', owner, Option::None);

    let (player4, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player4', owner, Option::None);

    let (player5, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player5', owner, Option::None);

    let (player6, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player6', owner, Option::None);

    let (player7, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player7', owner, Option::None);

    let (player8, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player8', owner, Option::None);

    let (player9, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player9', owner, Option::None);

    let (player10, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player10', owner, Option::None);

    let end_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, end_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, end_time);

    // Set scores for each player
    contracts.minigame.end_game(player1, 100);
    contracts.minigame.end_game(player2, 90);
    contracts.minigame.end_game(player3, 80);
    contracts.minigame.end_game(player4, 70);
    contracts.minigame.end_game(player5, 60);
    contracts.minigame.end_game(player6, 50);
    contracts.minigame.end_game(player7, 40);
    contracts.minigame.end_game(player8, 30);
    contracts.minigame.end_game(player9, 20);
    contracts.minigame.end_game(player10, 10);

    // Submit scores for each player
    contracts.budokan.submit_score(tournament.id, player1, 1);
    contracts.budokan.submit_score(tournament.id, player2, 2);
    contracts.budokan.submit_score(tournament.id, player3, 3);
    contracts.budokan.submit_score(tournament.id, player4, 4);
    contracts.budokan.submit_score(tournament.id, player5, 5);
    contracts.budokan.submit_score(tournament.id, player6, 6);
    contracts.budokan.submit_score(tournament.id, player7, 7);
    contracts.budokan.submit_score(tournament.id, player8, 8);
    contracts.budokan.submit_score(tournament.id, player9, 9);
    contracts.budokan.submit_score(tournament.id, player10, 10);

    // Roll forward to beyond submission period
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, finalized_time);

    // verify tournament is finalized
    let state = contracts.budokan.current_phase(tournament.id);
    assert!(state == Phase::Finalized, "Tournament should be finalized");

    // Verify final leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 10, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == player1, "Invalid first place");
    assert!(*leaderboard.at(1) == player2, "Invalid second place");
    assert!(*leaderboard.at(2) == player3, "Invalid third place");
    assert!(*leaderboard.at(3) == player4, "Invalid fourth place");
    assert!(*leaderboard.at(4) == player5, "Invalid fifth place");
    assert!(*leaderboard.at(5) == player6, "Invalid sixth place");
    assert!(*leaderboard.at(6) == player7, "Invalid seventh place");
    assert!(*leaderboard.at(7) == player8, "Invalid eighth place");
    assert!(*leaderboard.at(8) == player9, "Invalid ninth place");
    assert!(*leaderboard.at(9) == player10, "Invalid tenth place");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Third Party Entry Tests ====================

#[test]
fn test_third_party_enters_different_player_into_tournament() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Create basic tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start registration period
    let reg_time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, reg_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, reg_time);

    // Third party (OWNER) enters a different player into the tournament
    let player = 0x456_felt252.try_into().unwrap();
    let (token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', player, Option::None);

    // Verify entry was successful
    assert!(entry_number == 1, "Invalid entry number");

    // Verify the game token was minted to player_address, not the caller
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(token_id.into());
    assert!(token_owner == player, "Token should be owned by player, not caller");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Tournament Creator Share / Game Creator Share / Refund Tests
// ====================

#[test]
fn test_claim_tournament_creator_share() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Use 18 decimal token amounts (100 tokens = 100 * 10^18)
    let one_token: u128 = 1_000_000_000_000_000_000; // 10^18
    let entry_amount: u128 = 100 * one_token; // 100 tokens per player
    let total_pool: u256 = 500 * one_token.into(); // 500 tokens total from 5 players

    // Create tournament with tournament creator share: 10% (1000 basis points)
    // Remaining 90% goes to position-based distribution
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Linear(10), // Linear distribution for prize pool
        tournament_creator_share: Option::Some(1000), // 10% to tournament creator
        game_creator_share: Option::None,
        refund_share: Option::None,
        distribution_positions: Option::None // Dynamic - use actual leaderboard size
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    // Mint tokens to owner for entry fees (5 players * 100 tokens)
    contracts.erc20.mint(owner, total_pool);

    // Approve budokan to spend tokens
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, total_pool);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter 5 players into tournament
    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (player3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);
    let (player4, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player4', owner, Option::None);
    let (player5, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player5', owner, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // Submit scores for all players
    contracts.minigame.end_game(player1, 5000);
    contracts.budokan.submit_score(tournament.id, player1, 1);

    contracts.minigame.end_game(player2, 4000);
    contracts.budokan.submit_score(tournament.id, player2, 2);

    contracts.minigame.end_game(player3, 3000);
    contracts.budokan.submit_score(tournament.id, player3, 3);

    contracts.minigame.end_game(player4, 2000);
    contracts.budokan.submit_score(tournament.id, player4, 4);

    contracts.minigame.end_game(player5, 1000);
    contracts.budokan.submit_score(tournament.id, player5, 5);

    // Move to finalized period
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Record initial balance before claiming
    let initial_balance = contracts.erc20.balance_of(owner);

    // Claim tournament creator share
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::TournamentCreator));

    // Verify tournament creator received 10% of total pool
    let balance_after = contracts.erc20.balance_of(owner);
    let creator_share = balance_after - initial_balance;

    // Expected: 10% of 500 tokens = 50 tokens
    let expected_creator_share: u256 = 50 * one_token.into();
    assert!(
        creator_share == expected_creator_share,
        "Tournament creator should receive 10% of pool (50 tokens)",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_claim_game_creator_share() {
    let owner = OWNER;
    let game_creator: ContractAddress = 'GAME_CREATOR'.try_into().unwrap();
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Use 18 decimal token amounts
    let one_token: u128 = 1_000_000_000_000_000_000; // 10^18
    let entry_amount: u128 = 100 * one_token; // 100 tokens per player
    let total_pool: u256 = 300 * one_token.into(); // 300 tokens total from 3 players

    // Create tournament with game creator share: 15% (1500 basis points)
    // Remaining 85% goes to position-based distribution
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Linear(10),
        tournament_creator_share: Option::None,
        game_creator_share: Option::Some(1500), // 15% to game creator
        refund_share: Option::None,
        distribution_positions: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    // Mint tokens to owner for entry fees
    contracts.erc20.mint(owner, total_pool);

    // Approve budokan to spend tokens
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, total_pool);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter 3 players into tournament
    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (player3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // Submit scores for all players
    contracts.minigame.end_game(player1, 300);
    contracts.budokan.submit_score(tournament.id, player1, 1);

    contracts.minigame.end_game(player2, 200);
    contracts.budokan.submit_score(tournament.id, player2, 2);

    contracts.minigame.end_game(player3, 100);
    contracts.budokan.submit_score(tournament.id, player3, 3);

    // Move to finalized period
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Record game creator's initial balance
    let initial_balance = contracts.erc20.balance_of(game_creator);

    // Game creator claims their share
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, game_creator);

    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::GameCreator));

    // Verify game creator received 15% of total pool
    let balance_after = contracts.erc20.balance_of(game_creator);
    let game_creator_share = balance_after - initial_balance;

    // Expected: 15% of 300 tokens = 45 tokens
    let expected_game_creator_share: u256 = 45 * one_token.into();
    assert!(
        game_creator_share == expected_game_creator_share,
        "Game creator should receive 15% of pool (45 tokens). Got: {} tokens, Expected: {} tokens",
        game_creator_share / one_token.into(),
        expected_game_creator_share / one_token.into(),
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_claim_refund_share() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Use 18 decimal token amounts
    let one_token: u128 = 1_000_000_000_000_000_000; // 10^18
    let entry_amount: u128 = 100 * one_token; // 100 tokens per player

    // Create tournament with refund share: 20% (2000 basis points)
    // This means each player gets 20% of their entry fee back
    // Remaining 80% goes to position-based distribution
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Linear(10),
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
        refund_share: Option::Some(2000), // 20% refund to each depositor
        distribution_positions: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    // Mint tokens for entry fee
    let mint_amount: u256 = (100 * one_token).into();
    contracts.erc20.mint(owner, mint_amount);

    // Approve budokan to spend tokens for owner
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, mint_amount);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Owner enters 1 player
    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (player1_token, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // Submit score for player
    contracts.minigame.end_game(player1_token, 100);
    contracts.budokan.submit_score(tournament.id, player1_token, 1);

    // Move to finalized period
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Record initial balance
    let owner_initial = contracts.erc20.balance_of(owner);

    // Owner claims refund for their token
    contracts
        .budokan
        .claim_reward(
            tournament.id, RewardType::EntryFee(EntryFeeRewardType::Refund(player1_token)),
        );

    // Verify refund
    let owner_after = contracts.erc20.balance_of(owner);
    let owner_refund = owner_after - owner_initial;

    // Owner paid 100 tokens
    // Expected refund: 20% of 100 = 20 tokens
    let expected_refund: u256 = 20 * one_token.into();

    assert!(owner_refund == expected_refund, "Owner should receive 20% refund (20 tokens)");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[test]
fn test_claim_all_shares_combined() {
    // This test verifies that all shares can coexist and be claimed correctly:
    // - Tournament creator share: 10% (1000 bps)
    // - Game creator share: 5% (500 bps)
    // - Refund share: 10% (1000 bps)
    // - Position-based distribution: 75% (remaining after fixed shares)
    // Total: 10% + 5% + 10% + 75% = 100%

    let owner = OWNER;
    let game_creator: ContractAddress = 'GAME_CREATOR'.try_into().unwrap();
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Use 18 decimal token amounts
    let one_token: u128 = 1_000_000_000_000_000_000; // 10^18
    let entry_amount: u128 = 1000 * one_token; // 1000 tokens per player
    let total_pool: u256 = 3000 * one_token.into(); // 3000 tokens total from 3 players

    // Create tournament with all shares
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Linear(10),
        tournament_creator_share: Option::Some(1000), // 10%
        game_creator_share: Option::Some(500), // 5%
        refund_share: Option::Some(1000), // 10%
        distribution_positions: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    // Mint tokens to owner for entry fees
    contracts.erc20.mint(owner, total_pool);

    // Approve budokan to spend tokens
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, total_pool);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // Start registration period
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Enter 3 players into tournament
    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (player3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);

    // Move to game period
    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    // Submit scores for all players
    contracts.minigame.end_game(player1, 300);
    contracts.budokan.submit_score(tournament.id, player1, 1);

    contracts.minigame.end_game(player2, 200);
    contracts.budokan.submit_score(tournament.id, player2, 2);

    contracts.minigame.end_game(player3, 100);
    contracts.budokan.submit_score(tournament.id, player3, 3);

    // Move to finalized period
    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Record initial balances
    let owner_initial = contracts.erc20.balance_of(owner);
    let game_creator_initial = contracts.erc20.balance_of(game_creator);

    // Claim tournament creator share (owner)
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::TournamentCreator));

    let owner_after_creator_share = contracts.erc20.balance_of(owner);
    let tournament_creator_share = owner_after_creator_share - owner_initial;

    // Expected: 10% of 3000 tokens = 300 tokens
    let expected_tournament_creator: u256 = 300 * one_token.into();
    assert!(
        tournament_creator_share == expected_tournament_creator,
        "Tournament creator should receive 10% (300 tokens)",
    );

    // Claim game creator share
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, game_creator);

    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::GameCreator));

    let game_creator_after = contracts.erc20.balance_of(game_creator);
    let game_creator_share = game_creator_after - game_creator_initial;

    // Expected: 5% of 3000 tokens = 150 tokens
    let expected_game_creator: u256 = 150 * one_token.into();
    assert!(
        game_creator_share == expected_game_creator,
        "Game creator should receive 5% (150 tokens). Got: {} tokens, Expected: {} tokens",
        game_creator_share / one_token.into(),
        expected_game_creator / one_token.into(),
    );

    // Claim refunds for all 3 entries (owner is the payer for all)
    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Refund(player1)));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Refund(player2)));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Refund(player3)));

    let owner_after_refunds = contracts.erc20.balance_of(owner);
    let total_refunds = owner_after_refunds - owner_after_creator_share;

    // Expected: 10% of 3000 tokens = 300 tokens total refunds
    // Allow for rounding dust (1-2 tokens difference due to basis point division)
    let expected_refunds: u256 = 300 * one_token.into();
    let dust_tolerance: u256 = 2 * one_token.into();
    let diff = if total_refunds > expected_refunds {
        total_refunds - expected_refunds
    } else {
        expected_refunds - total_refunds
    };
    assert!(
        diff <= dust_tolerance,
        "Owner should receive ~10% in refunds (300 tokens +/- 2). Got: {} tokens, Expected: {} tokens",
        total_refunds / one_token.into(),
        expected_refunds / one_token.into(),
    );

    // Claim position-based prizes for all positions
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(1)));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(2)));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::Position(3)));

    let owner_final = contracts.erc20.balance_of(owner);
    let position_prizes = owner_final - owner_after_refunds;

    // Expected: 75% of 3000 tokens = 2250 tokens for all positions
    // With linear distribution and 3 positions, each gets equal share: 2250/3 = 750 tokens each
    let expected_position_prizes: u256 = 2250 * one_token.into();
    assert!(
        position_prizes == expected_position_prizes,
        "Owner should receive 75% in position prizes (2250 tokens)",
    );

    // Verify total distribution equals 100% of pool (allow for rounding dust)
    let total_distributed = tournament_creator_share
        + game_creator_share
        + total_refunds
        + position_prizes;
    let total_diff = if total_distributed > total_pool {
        total_distributed - total_pool
    } else {
        total_pool - total_distributed
    };
    assert!(
        total_diff <= dust_tolerance,
        "Total distributed should equal pool (3000 tokens +/- 2). Got: {} tokens, Expected: {} tokens",
        total_distributed / one_token.into(),
        total_pool / one_token.into(),
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

#[should_panic(expected: "Budokan: Tournament creator share already claimed")]
#[test]
fn test_cannot_claim_tournament_creator_share_twice() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let one_token: u128 = 1_000_000_000_000_000_000;
    let entry_amount: u128 = 100 * one_token;
    let total_pool: u256 = 100 * one_token.into();

    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Linear(10),
        tournament_creator_share: Option::Some(1000), // 10%
        game_creator_share: Option::None,
        refund_share: Option::None,
        distribution_positions: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    contracts.erc20.mint(owner, total_pool);
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, total_pool);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    contracts.minigame.end_game(player1, 100);
    contracts.budokan.submit_score(tournament.id, player1, 1);

    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Claim once - should succeed
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::TournamentCreator));

    // Try to claim again - should panic
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::TournamentCreator));
}

#[should_panic(expected: "Budokan: Game creator share already claimed")]
#[test]
fn test_cannot_claim_game_creator_share_twice() {
    let owner = OWNER;
    let game_creator: ContractAddress = 0x123_felt252.try_into().unwrap();
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let one_token: u128 = 1_000_000_000_000_000_000;
    let entry_amount: u128 = 100 * one_token;
    let total_pool: u256 = 100 * one_token.into();

    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Linear(10),
        tournament_creator_share: Option::None,
        game_creator_share: Option::Some(500), // 5%
        refund_share: Option::None,
        distribution_positions: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    contracts.erc20.mint(owner, total_pool);
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, total_pool);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    contracts.minigame.end_game(player1, 100);
    contracts.budokan.submit_score(tournament.id, player1, 1);

    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    stop_cheat_caller_address(contracts.budokan.contract_address);
    start_cheat_caller_address(contracts.budokan.contract_address, game_creator);

    // Claim once - should succeed
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::GameCreator));

    // Try to claim again - should panic
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::EntryFee(EntryFeeRewardType::GameCreator));
}

#[should_panic(expected: "Budokan: Refund share already claimed for token 2")]
#[test]
fn test_cannot_claim_refund_twice() {
    let owner = OWNER;
    let contracts = setup();

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let one_token: u128 = 1_000_000_000_000_000_000;
    let entry_amount: u128 = 100 * one_token;
    let total_pool: u256 = 100 * one_token.into();

    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: entry_amount,
        distribution: Distribution::Linear(10),
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
        refund_share: Option::Some(1000), // 10%
        distribution_positions: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            owner,
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
        );

    contracts.erc20.mint(owner, total_pool);
    start_cheat_caller_address(contracts.erc20.contract_address, owner);
    contracts.erc20.approve(contracts.budokan.contract_address, total_pool);
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let (player1_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    let game_time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, game_time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, game_time);

    contracts.minigame.end_game(player1_token_id, 100);
    contracts.budokan.submit_score(tournament.id, player1_token_id, 1);

    let finalized_time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, finalized_time);

    // Claim once - should succeed
    contracts
        .budokan
        .claim_reward(
            tournament.id, RewardType::EntryFee(EntryFeeRewardType::Refund(player1_token_id)),
        );

    // Try to claim again - should panic
    contracts
        .budokan
        .claim_reward(
            tournament.id, RewardType::EntryFee(EntryFeeRewardType::Refund(player1_token_id)),
        );
}
