// SPDX-License-Identifier: UNLICENSED

use core::option::Option;
use starknet::{ContractAddress, get_block_timestamp, testing};
use dojo::world::{WorldStorage, WorldStorageTrait};
use dojo_cairo_test::{
    spawn_test_world, deploy_contract, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
    WorldStorageTestTrait,
};

use budokan::constants::{
    MIN_REGISTRATION_PERIOD, MIN_SUBMISSION_PERIOD, MAX_SUBMISSION_PERIOD, MIN_TOURNAMENT_LENGTH,
    DEFAULT_NS,
};
use budokan::libs::store::{Store as BudokanStore, StoreTrait as BudokanStoreTrait};

use budokan::models::{
    budokan::{
        m_Tournament, m_Registration, m_RegistrationBanned, m_EntryCount, m_Leaderboard, m_Prize, m_Token, m_PrizeMetrics,
        m_PlatformMetrics, m_TournamentTokenMetrics, m_PrizeClaim, m_QualificationEntries,
        ERC20Data, ERC721Data, EntryFee, TokenType, EntryRequirement, EntryRequirementType,
        TournamentType, Prize, PrizeType, Role, QualificationProof, TournamentQualification,
        NFTQualification, TokenData, TokenTypeData, ExtensionConfig,
    },
};
use budokan::models::schedule::{Schedule, Period, Phase};

use budokan::tests::{
    utils,
    constants::{
        OWNER, TOURNAMENT_NAME, TOURNAMENT_DESCRIPTION, STARTING_BALANCE,
        TEST_REGISTRATION_START_TIME, TEST_REGISTRATION_END_TIME, TEST_START_TIME, TEST_END_TIME,
    },
};
use budokan::tests::helpers::{
    create_basic_tournament, test_metadata, test_game_config, test_schedule, custom_schedule,
    test_game_period, registration_period_too_short, registration_period_too_long,
    registration_open_beyond_tournament_end, test_season_schedule, tournament_too_long,
};
use budokan::tests::mocks::{
    erc20_mock::erc20_mock, erc721_mock::erc721_mock, erc721_old_mock::erc721_old_mock,
    entry_validator_mock::entry_validator_mock,
};
use budokan::budokan::Budokan;
use budokan::tests::interfaces::{
    IERC20MockDispatcher, IERC20MockDispatcherTrait, IERC721MockDispatcher,
    IERC721MockDispatcherTrait, IERC721OldMockDispatcher,
};
use budokan::interfaces::{IBudokanDispatcher, IBudokanDispatcherTrait};
use game_components_token::interface::{
    IMinigameTokenMixinDispatcher, IMinigameTokenMixinDispatcherTrait,
};
use game_components_metagame::interface::{IMETAGAME_ID};
use game_components_test_starknet::minigame::mocks::minigame_starknet_mock::{
    IMinigameStarknetMockDispatcher, IMinigameStarknetMockDispatcherTrait,
};

use budokan::tests::setup_denshokan;

use budokan_extensions::entry_validator::interface::IEntryValidatorDispatcher;

use openzeppelin_introspection::interface::{ISRC5Dispatcher, ISRC5DispatcherTrait};
use openzeppelin_token::erc721::{ERC721Component::{Transfer, Approval}};
use openzeppelin_token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};

#[derive(Drop)]
pub struct TestContracts {
    pub world: WorldStorage,
    pub budokan: IBudokanDispatcher,
    pub minigame: IMinigameStarknetMockDispatcher,
    pub denshokan: IMinigameTokenMixinDispatcher,
    pub erc20: IERC20MockDispatcher,
    pub erc721: IERC721MockDispatcher,
    pub erc721_old: IERC721OldMockDispatcher,
    pub entry_validator: IEntryValidatorDispatcher,
}


//
// events helpers
//

fn assert_event_transfer(
    emitter: ContractAddress, from: ContractAddress, to: ContractAddress, token_id: u256,
) {
    let event = utils::pop_log::<Transfer>(emitter).unwrap();
    assert(event.from == from, 'Invalid `from`');
    assert(event.to == to, 'Invalid `to`');
    assert(event.token_id == token_id, 'Invalid `token_id`');
}

fn assert_only_event_transfer(
    emitter: ContractAddress, from: ContractAddress, to: ContractAddress, token_id: u256,
) {
    assert_event_transfer(emitter, from, to, token_id);
    utils::assert_no_events_left(emitter);
}

fn assert_event_approval(
    emitter: ContractAddress, owner: ContractAddress, approved: ContractAddress, token_id: u256,
) {
    let event = utils::pop_log::<Approval>(emitter).unwrap();
    assert(event.owner == owner, 'Invalid `owner`');
    assert(event.approved == approved, 'Invalid `approved`');
    assert(event.token_id == token_id, 'Invalid `token_id`');
}

fn assert_only_event_approval(
    emitter: ContractAddress, owner: ContractAddress, approved: ContractAddress, token_id: u256,
) {
    assert_event_approval(emitter, owner, approved, token_id);
    utils::assert_no_events_left(emitter);
}


//
// Setup
//

fn setup_uninitialized(
    denshokan_address: ContractAddress,
) -> (WorldStorage, ContractAddress, ContractAddress, ContractAddress, ContractAddress) {
    testing::set_block_number(1);
    testing::set_block_timestamp(1);

    let ndef = NamespaceDef {
        namespace: DEFAULT_NS(),
        resources: [
            // tournament models
            TestResource::Model(m_Tournament::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_Registration::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_RegistrationBanned::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_EntryCount::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_Leaderboard::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_Prize::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_Token::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_PrizeMetrics::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_PlatformMetrics::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_TournamentTokenMetrics::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_PrizeClaim::TEST_CLASS_HASH.try_into().unwrap()),
            TestResource::Model(m_QualificationEntries::TEST_CLASS_HASH.try_into().unwrap()),
            // contracts
            TestResource::Contract(Budokan::TEST_CLASS_HASH),
        ]
            .span(),
    };

    // deploy systems contract
    let erc20_mock_address = deploy_contract(
        erc20_mock::TEST_CLASS_HASH.try_into().unwrap(), array![].span(),
    );
    let erc721_mock_address = deploy_contract(
        erc721_mock::TEST_CLASS_HASH.try_into().unwrap(), array![].span(),
    );
    let erc721_old_mock_address = deploy_contract(
        erc721_old_mock::TEST_CLASS_HASH.try_into().unwrap(), array![].span(),
    );

    // Create token data array for new dojo_init signature
    let mut token_data_array = array![];
    token_data_array
        .append(TokenData { token_address: erc20_mock_address, token_type: TokenType::erc20 });
    token_data_array
        .append(TokenData { token_address: erc721_mock_address, token_type: TokenType::erc721 });
    token_data_array
        .append(
            TokenData { token_address: erc721_old_mock_address, token_type: TokenType::erc721 },
        );

    let mut init_calldata = array![];
    init_calldata.append(denshokan_address.into()); // denshokan_address

    // Serialize the token data array
    let mut serialized_tokens = array![];
    token_data_array.serialize(ref serialized_tokens);
    init_calldata.append_span(serialized_tokens.span());

    let mut contract_defs: Array<ContractDef> = array![
        ContractDefTrait::new(@DEFAULT_NS(), @"Budokan")
            .with_writer_of([dojo::utils::bytearray_hash(@DEFAULT_NS())].span())
            .with_init_calldata(init_calldata.span()),
    ];

    let mut world: WorldStorage = spawn_test_world([ndef].span());

    world.sync_perms_and_inits(contract_defs.span());

    let budokan_address = match world.dns(@"Budokan") {
        Option::Some((address, _)) => address,
        Option::None => panic!("Budokan contract not found in world DNS"),
    };

    let entry_validator_address = deploy_contract(
        entry_validator_mock::TEST_CLASS_HASH.try_into().unwrap(),
        array![budokan_address.into(), 0].span() // registration_only = false (0)
    );

    (
        world,
        erc20_mock_address,
        erc721_mock_address,
        erc721_old_mock_address,
        entry_validator_address,
    )
}

pub fn setup() -> TestContracts {
    let denshokan_contracts = setup_denshokan::setup();
    let (
        world,
        erc20_mock_address,
        erc721_mock_address,
        erc721_old_mock_address,
        entry_validator_address,
    ) =
        setup_uninitialized(
        denshokan_contracts.denshokan.contract_address,
    );

    let budokan_address = match world.dns(@"Budokan") {
        Option::Some((address, _)) => address,
        Option::None => panic!("Budokan contract not found in world DNS"),
    };
    let budokan = IBudokanDispatcher { contract_address: budokan_address };
    let minigame = denshokan_contracts.minigame_mock;
    let denshokan = denshokan_contracts.denshokan;
    let erc20 = IERC20MockDispatcher { contract_address: erc20_mock_address };
    let erc721 = IERC721MockDispatcher { contract_address: erc721_mock_address };
    let erc721_old = IERC721OldMockDispatcher { contract_address: erc721_old_mock_address };
    let entry_validator = IEntryValidatorDispatcher { contract_address: entry_validator_address };

    // mint tokens
    utils::impersonate(OWNER());
    erc20.mint(OWNER(), STARTING_BALANCE);
    erc721.mint(OWNER(), 1);

    minigame.create_settings_difficulty("test_settings", "test_settings", 1);

    // drop all events
    utils::drop_all_events(world.dispatcher.contract_address);
    utils::drop_all_events(budokan.contract_address);
    utils::drop_all_events(minigame.contract_address);
    utils::drop_all_events(denshokan.contract_address);
    utils::drop_all_events(erc20.contract_address);
    utils::drop_all_events(erc721.contract_address);
    utils::drop_all_events(erc721_old.contract_address);

    TestContracts {
        world, budokan, minigame, denshokan, erc20, erc721, erc721_old, entry_validator,
    }
}

//
// Test initializers
//

#[test]
fn initializer() {
    let contracts = setup();

    let src5_dispatcher = ISRC5Dispatcher { contract_address: contracts.budokan.contract_address };
    assert(src5_dispatcher.supports_interface(IMETAGAME_ID) == true, 'should support IMETAGAME_ID');

    assert(contracts.erc20.balance_of(OWNER()) == STARTING_BALANCE, 'Invalid balance');
    assert(contracts.erc721.balance_of(OWNER()) == 1, 'Invalid balance');

    let mut world = contracts.world;
    let store: BudokanStore = BudokanStoreTrait::new(world);

    let erc20_token = store.get_token(contracts.erc20.contract_address);
    assert(erc20_token.address == contracts.erc20.contract_address, 'Invalid erc20 token address');
    assert(erc20_token.name == "Test ERC20", 'Invalid erc20 token name');
    assert(erc20_token.symbol == "T20", 'Invalid erc20 token symbol');
    assert(erc20_token.token_type == TokenType::erc20, 'Invalid erc20 token type');
    assert(erc20_token.is_registered == true, 'Invalid erc20 token registered');

    let erc721_token = store.get_token(contracts.erc721.contract_address);
    assert(
        erc721_token.address == contracts.erc721.contract_address, 'Invalid erc721 token address',
    );
    assert(erc721_token.name == "Test ERC721", 'Invalid erc721 token name');
    assert(erc721_token.symbol == "T721", 'Invalid erc721 token symbol');
    assert(erc721_token.token_type == TokenType::erc721, 'Invalid erc721 token type');
    assert(erc721_token.is_registered == true, 'Invalid erc721 token registered');

    let erc721_old_token = store.get_token(contracts.erc721_old.contract_address);
    assert!(
        erc721_old_token.address == contracts.erc721_old.contract_address,
        "Invalid erc721_old token address",
    );
    assert!(erc721_old_token.name == "Test ERC721 Old", "Invalid erc721_old token name");
    assert!(erc721_old_token.symbol == "T721O", "Invalid erc721_old token symbol");
    assert!(erc721_old_token.token_type == TokenType::erc721, "Invalid erc721_old token type");
    assert!(erc721_old_token.is_registered == true, "Invalid erc721_old token registered");
}

//
// Test creating tournaments
//

#[test]
fn create_tournament() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

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
    assert!(tournament.entry_fee == Option::None, "tournament entry fee should be none");
    assert(
        tournament.game_config.address == contracts.minigame.contract_address,
        'Invalid game address',
    );
    assert(tournament.game_config.settings_id == 1, 'Invalid settings id');
    assert(contracts.budokan.total_tournaments() == 1, 'Invalid tournaments count');
    assert!(tournament.soulbound == false, "Tournament should not be soulbound");
    assert!(tournament.play_url == "", "Tournament play_url should be empty");
    assert!(tournament.play_url.len() == 0, "Tournament play_url should be empty");
}

#[test]
fn create_tournament_start_time_in_past() {
    let contracts = setup();

    let time = 100;

    testing::set_block_timestamp(time);

    // try to create a tournament with the tournament start time in the past
    let game_period = Period { start: time - 10, end: time + MIN_TOURNAMENT_LENGTH.into() };

    let schedule = custom_schedule(Option::None, game_period, MIN_SUBMISSION_PERIOD.into());

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: ("Schedule: Registration period less than minimum of 900", 'ENTRYPOINT_FAILED'),
)]
fn create_tournament_registration_period_too_short() {
    let contracts = setup();

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: (
        "Schedule: Registration period greater than maximum of 2592000", 'ENTRYPOINT_FAILED',
    ),
)]
fn create_tournament_registration_period_too_long() {
    let contracts = setup();

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: (
        "Schedule: Registration end time 1802 is after tournament end time 1801",
        'ENTRYPOINT_FAILED',
    ),
)]
fn create_tournament_end_time_too_close() {
    let contracts = setup();

    let schedule = registration_open_beyond_tournament_end();

    let entry_requirement = Option::None;
    let entry_fee = Option::None;

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: (
        "Schedule: Tournament duration greater than maximum of 31104000", 'ENTRYPOINT_FAILED',
    ),
)]
fn create_tournament_tournament_too_long() {
    let contracts = setup();

    let schedule = tournament_too_long();

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: ("Schedule: Submission duration must be between 900 and 604800", 'ENTRYPOINT_FAILED'),
)]
fn create_tournament_submission_period_too_short() {
    let contracts = setup();

    let schedule = custom_schedule(
        Option::None, test_game_period(), MIN_SUBMISSION_PERIOD.into() - 1,
    );

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: ("Schedule: Submission duration must be between 900 and 604800", 'ENTRYPOINT_FAILED'),
)]
fn create_tournament_submission_period_too_long() {
    let contracts = setup();

    let schedule = custom_schedule(
        Option::None, test_game_period(), MAX_SUBMISSION_PERIOD.into() + 1,
    );

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );
}

#[test]
fn create_tournament_with_prizes() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );
    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
            1,
        );
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            1,
        );
    assert(contracts.erc20.balance_of(OWNER()) == 0, 'Invalid balance');
    assert(contracts.erc721.balance_of(OWNER()) == 0, 'Invalid balance');
}

// #[test]
// #[should_panic(expected: ('prize token not registered', 'ENTRYPOINT_FAILED'))]
// fn create_tournament_with_prizes_token_not_registered() {
//     let (_world, mut tournament, _loot_survivor, _pragma, _eth, _lords, mut erc20, mut erc721,
// _golden_token, _blobert) =
//         setup();

//     utils::impersonate(OWNER());
//     create_basic_tournament(tournament);
//     erc20.approve(tournament.contract_address, 1);
//     erc721.approve(tournament.contract_address, 1);

//     erc20.approve(tournament.contract_address, STARTING_BALANCE);
//     erc721.approve(tournament.contract_address, 1);
//     tournament
//         .add_prize(
//             1,
//             erc20.contract_address,
//             TokenType::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
//             1
//         );
//     tournament
//         .add_prize(
//             1, erc721.contract_address, TokenType::erc721(ERC721Data { id: 1 }), 1
//         );
// }

#[test]
#[should_panic(
    expected: (
        "Tournament: Prize position 2 is greater than the winners count 1", 'ENTRYPOINT_FAILED',
    ),
)]
fn create_tournament_with_prizes_position_too_large() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
            2,
        );
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            2,
        );
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Entry fee distribution length 2 is longer than prize spots 1",
        'ENTRYPOINT_FAILED',
    ),
)]
fn create_tournament_with_premiums_too_long() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // entry fee configuration attempts to distribute 90% to first place and 10% to second place
    // this isn't valid because the tournament will only be tracking a single top score
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 1,
        distribution: array![90, 10].span(),
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
    };

    let entry_fee = Option::Some(entry_fee);
    let entry_requirement = Option::None;

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Entry fee distribution needs to be 100%. Distribution: 95%",
        'ENTRYPOINT_FAILED',
    ),
)]
fn create_tournament_with_premiums_not_100() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 1,
        distribution: array![90, 5].span(),
        tournament_creator_share: Option::None,
        game_creator_share: Option::None,
    };
    let entry_fee = Option::Some(entry_fee);
    let entry_requirement = Option::None;

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 2;

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            entry_fee,
            entry_requirement,
            false,
            "",
        );
}

#[test]
fn create_gated_tournament_with_unsettled_tournament() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Move to tournament start time
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter first tournament
    contracts.budokan.enter_tournament(first_tournament.id, 'test_player', OWNER(), Option::None);

    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id].span()),
    );

    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = get_block_timestamp();

    let registration_period = Period {
        start: current_time, end: current_time + MIN_REGISTRATION_PERIOD.into(),
    };

    let game_period = Period {
        start: current_time + MIN_REGISTRATION_PERIOD.into(),
        end: current_time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
    };

    let schedule = custom_schedule(
        Option::Some(registration_period), game_period, MIN_SUBMISSION_PERIOD.into(),
    );

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );
}

#[test]
fn create_tournament_gated_by_multiple_tournaments() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Create second tournament
    let second_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter and complete first tournament
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Enter and complete second tournament
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(second_entry_token_id, 20);
    contracts.budokan.submit_score(second_tournament.id, second_entry_token_id, 1);

    // Settle tournaments
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Create tournament gated by both previous tournaments
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id, second_tournament.id].span()),
    );

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = get_block_timestamp();

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

    let gated_tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    assert(gated_tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    testing::set_block_timestamp(current_time + MIN_REGISTRATION_PERIOD.into() - 1);

    let first_qualifying_token_id = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: first_tournament.id, token_id: first_entry_token_id, position: 1,
            },
        ),
    );
    let second_qualifying_token_id = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: second_tournament.id, token_id: second_entry_token_id, position: 1,
            },
        ),
    );
    // This should succeed since we completed both required tournaments
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player3', OWNER(), first_qualifying_token_id);
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player4', OWNER(), second_qualifying_token_id);

    // Verify entry was successful
    let entries = contracts.budokan.tournament_entries(gated_tournament.id);
    assert(entries == 2, 'Invalid entry count');
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Maximum qualified entries reached for tournament 3", 'ENTRYPOINT_FAILED',
    ),
)]
fn create_tournament_gated_by_multiple_tournaments_with_limited_entry() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Create second tournament
    let second_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter and complete first tournament
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Enter and complete second tournament
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(second_entry_token_id, 20);
    contracts.budokan.submit_score(second_tournament.id, second_entry_token_id, 1);

    // Settle tournaments
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Create tournament gated by both previous tournaments
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id, second_tournament.id].span()),
    );

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = get_block_timestamp();

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

    let gated_tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    assert(gated_tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    testing::set_block_timestamp(current_time + MIN_REGISTRATION_PERIOD.into() - 1);

    let first_qualifying_token_id = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: first_tournament.id, token_id: first_entry_token_id, position: 1,
            },
        ),
    );
    let second_qualifying_token_id = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: second_tournament.id, token_id: second_entry_token_id, position: 1,
            },
        ),
    );
    // This should succeed since we completed both required tournaments
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player3', OWNER(), first_qualifying_token_id);
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player4', OWNER(), second_qualifying_token_id);
    // this is the failing case, should only be able to enter once with the same qualification proof
    contracts
        .budokan
        .enter_tournament(gated_tournament.id, 'test_player5', OWNER(), second_qualifying_token_id);
}

// When caller owns the qualifying tournament token, they can specify where the new token goes
#[test]
fn tournament_gated_caller_owns_qualifying_token_different_player() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create and complete first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Create tournament gated by first tournament
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id].span()),
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = get_block_timestamp();

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // OWNER owns the qualifying token and enters with a different player_address
    let different_player = starknet::contract_address_const::<0x999>();
    let qualifying_token = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: first_tournament.id, token_id: first_entry_token_id, position: 1,
            },
        ),
    );

    // Since caller (OWNER) owns the qualifying token, token should go to player_address
    // (different_player)
    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', different_player, qualifying_token);

    // Verify the game token was minted to player_address (different_player), not the caller (OWNER)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(second_entry_token_id.into());
    assert!(
        token_owner == different_player,
        "Token should be owned by player_address (different_player), not caller (OWNER)",
    );
}

// When caller does NOT own the qualifying tournament token, token goes to the token owner
#[test]
fn tournament_gated_caller_does_not_own_qualifying_token() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create and complete first tournament
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // qualified_player enters and wins the first tournament
    let qualified_player = starknet::contract_address_const::<0x789>();
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', qualified_player, Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(first_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Create tournament gated by first tournament
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id].span()),
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let current_time = get_block_timestamp();

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // OWNER (caller) tries to enter using qualified_player's winning token
    // Since caller != token owner, new token should go to token owner (qualified_player)
    let qualifying_token = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: first_tournament.id, token_id: first_entry_token_id, position: 1,
            },
        ),
    );

    let different_player = starknet::contract_address_const::<0x999>();
    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', different_player, qualifying_token);

    // Verify the game token was minted to the qualified token owner (qualified_player), not
    // player_address
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(second_entry_token_id.into());
    assert!(
        token_owner == qualified_player,
        "Token should be owned by qualified token owner (qualified_player), not player_address or caller",
    );
}

#[test]
fn allowlist_gated_tournament() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create array of allowed accounts
    let allowed_player1 = starknet::contract_address_const::<0x456>();
    let allowed_player2 = starknet::contract_address_const::<0x789>();
    let allowed_accounts = array![OWNER(), allowed_player1, allowed_player2].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    // Verify tournament was created with correct gating
    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Allowed account (owner) can enter
    let player1_qualification = Option::Some(QualificationProof::Address(OWNER()));
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), player1_qualification);

    // Allowed player can enter
    utils::impersonate(allowed_player1);
    let player2_qualification = Option::Some(QualificationProof::Address(allowed_player1));
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', allowed_player1, player2_qualification);

    // Verify entries were successful
    let entries = contracts.budokan.tournament_entries(tournament.id);
    assert(entries == 2, 'Invalid entry count');
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Maximum qualified entries reached for tournament 1", 'ENTRYPOINT_FAILED',
    ),
)]
fn allowlist_gated_tournament_with_entry_limit() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create array of allowed accounts
    let allowed_player2 = starknet::contract_address_const::<0x456>();
    let allowed_accounts = array![OWNER(), allowed_player2].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);

    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let entry_fee = Option::None;
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    // Verify tournament was created with correct gating
    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Allowed account (owner) can enter
    let player1_qualification = Option::Some(QualificationProof::Address(OWNER()));
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), player1_qualification);

    // Allowed player can enter
    utils::impersonate(allowed_player2);
    let player2_qualification = Option::Some(QualificationProof::Address(allowed_player2));
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', allowed_player2, player2_qualification);
    // this should fail because we have an entry limit of 1
    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player3', allowed_player2, player2_qualification);
}

#[test]
#[should_panic(
    expected: ("Tournament: Qualifying address is not in allowlist", 'ENTRYPOINT_FAILED'),
)]
fn allowlist_gated_tournament_unauthorized() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create array of allowed accounts (not including player2)
    let allowed_player = starknet::contract_address_const::<0x456>();
    let allowed_accounts = array![OWNER(), allowed_player].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let entry_fee = Option::None;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Try to enter with unauthorized account
    let unauthorized_player = starknet::contract_address_const::<0x789>();
    utils::impersonate(unauthorized_player);
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
}

// When caller is NOT the qualified address, token should go to the qualified address
#[test]
fn allowlist_gated_caller_different_from_qualification_address() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Only allowed_player is on the allowlist
    let allowed_player = starknet::contract_address_const::<0x456>();
    let allowed_accounts = array![allowed_player].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // OWNER (caller) tries to enter using allowed_player's address as qualification
    // Since caller != qualified address, token should go to qualified address (allowed_player)
    let player_qualification = Option::Some(QualificationProof::Address(allowed_player));
    let (game_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), player_qualification);

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
}

// When caller IS the qualified address, they can specify where the token goes
#[test]
fn allowlist_gated_caller_is_qualified_address_different_player() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Only allowed_player is on the allowlist
    let allowed_player = starknet::contract_address_const::<0x456>();
    let allowed_accounts = array![allowed_player].span();

    // Create tournament gated by account list
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // allowed_player (caller) enters using their own address as qualification
    // but specifies a different player_address (OWNER)
    // Since caller == qualified address, token should go to player_address (OWNER)
    utils::impersonate(allowed_player);
    let player_qualification = Option::Some(QualificationProof::Address(allowed_player));
    let (game_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), player_qualification);

    // Verify the game token was minted to player_address (OWNER), not the caller (allowed_player)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(game_token_id.into());
    assert!(
        token_owner == OWNER(),
        "Token should be owned by player_address (OWNER), not caller (allowed_player)",
    );
}

#[test]
fn create_tournament_season() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let schedule = Schedule {
        registration: Option::None,
        game: Period { start: TEST_START_TIME().into(), end: TEST_END_TIME().into() },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );

    // verify tournament was created with correct schedule
    assert(tournament.schedule == schedule, 'Invalid tournament schedule');
}

#[test]
fn extension_gated_tournament() {
    let contracts = setup();

    utils::impersonate(OWNER());

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Verify tournament was created with correct gating
    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let qualification_proof = Option::Some(QualificationProof::Extension(array![].span()));

    // OWNER already has an ERC721 token (minted in setup), so they should be able to enter
    let (token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), qualification_proof);

    // Verify entry was successful
    assert(entry_number == 1, 'Invalid entry number');
    let entries = contracts.budokan.tournament_entries(tournament.id);
    assert(entries == 1, 'Invalid entry count');

    // Verify registration information
    let registration = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id);
    assert(registration.tournament_id == tournament.id, 'Wrong tournament id');
    assert(registration.entry_number == 1, 'Wrong entry number');
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Invalid entry according to extension 3007414460181774009432052108111073619606548326168429821767862854774080769195",
        'ENTRYPOINT_FAILED',
    ),
)]
fn extension_gated_tournament_unauthorized() {
    let contracts = setup();

    utils::impersonate(OWNER());

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Create a player who doesn't own any ERC721 tokens
    let unauthorized_player = starknet::contract_address_const::<0x999>();
    utils::impersonate(unauthorized_player);

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
}

#[test]
fn extension_gated_tournament_with_entry_limit() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create a second player wallet
    let player2 = starknet::contract_address_const::<0x456>();

    // Mint ERC721 token to second player so they can pass validation
    contracts.erc721.mint(player2, 2);

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // First wallet (OWNER) enters with their address in qualification proof
    let qualification_proof1 = Option::Some(
        QualificationProof::Extension(array![OWNER().into()].span()),
    );

    let (_token_id1, entry_number1) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), qualification_proof1);

    assert(entry_number1 == 1, 'Invalid entry number');

    // Second wallet enters with their address in qualification proof
    utils::impersonate(player2);
    let qualification_proof2 = Option::Some(
        QualificationProof::Extension(array![player2.into()].span()),
    );

    let (_token_id2, entry_number2) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', player2, qualification_proof2);

    assert(entry_number2 == 2, 'Invalid entry number player2');

    // Verify both entries succeeded
    let entries = contracts.budokan.tournament_entries(tournament.id);
    assert(entries == 2, 'Invalid entry count');
}

#[test]
#[should_panic(
    expected: (
        "Tournament: No entries left according to extension 1516414728364900522454652391976133241843660233759942797917340069442079625664",
        'ENTRYPOINT_FAILED',
    ),
)]
fn extension_gated_tournament_entry_limit_enforced() {
    let contracts = setup();

    utils::impersonate(OWNER());

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // First entry with OWNER address in qualification proof - should succeed
    let qualification_proof = Option::Some(
        QualificationProof::Extension(array![OWNER().into()].span()),
    );

    let (_token_id1, entry_number1) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), qualification_proof);

    assert(entry_number1 == 1, 'Invalid entry number');

    // Try to enter again with the same address - should panic because entry limit is 1
    let qualification_proof2 = Option::Some(
        QualificationProof::Extension(array![OWNER().into()].span()),
    );

    contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', OWNER(), qualification_proof2);
}

#[test]
#[should_panic(expected: ('ENTRYPOINT_NOT_FOUND', 'ENTRYPOINT_FAILED', 'ENTRYPOINT_FAILED'))]
fn extension_gated_tournament_invalid_interface() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create tournament gated by a contract that doesn't implement IEntryValidator
    // Using the ERC20 mock contract which doesn't have the validate_entry function
    let extension_config = ExtensionConfig {
        address: contracts.erc20.contract_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let _tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );
}

// When caller qualifies via extension, they can specify where the token goes
#[test]
fn extension_gated_caller_qualifies_different_player() {
    let contracts = setup();

    utils::impersonate(OWNER());

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // OWNER owns an ERC721 token (minted in setup), so they qualify
    // They enter but specify a different player_address
    let different_player = starknet::contract_address_const::<0x999>();
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
}

// When caller does NOT qualify via extension, entry should fail or go to qualified address
#[test]
#[should_panic(
    expected: (
        "Tournament: Invalid entry according to extension 3007414460181774009432052108111073619606548326168429821767862854774080769195",
        'ENTRYPOINT_FAILED',
    ),
)]
fn extension_gated_caller_does_not_qualify() {
    let contracts = setup();

    utils::impersonate(OWNER());

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            entry_requirement,
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Create a player who doesn't own any ERC721 tokens
    let unauthorized_player = starknet::contract_address_const::<0x999>();
    utils::impersonate(unauthorized_player);

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
}

//
// Test registering tokens
//

#[test]
fn register_token() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Deploy new token contracts that are not pre-registered
    let new_erc20_address = deploy_contract(
        erc20_mock::TEST_CLASS_HASH.try_into().unwrap(), array![].span(),
    );
    let new_erc721_address = deploy_contract(
        erc721_mock::TEST_CLASS_HASH.try_into().unwrap(), array![].span(),
    );

    // Create dispatchers for the new tokens
    let new_erc20 = IERC20MockDispatcher { contract_address: new_erc20_address };
    let new_erc721 = IERC721MockDispatcher { contract_address: new_erc721_address };

    // Mint tokens to owner
    new_erc20.mint(OWNER(), 1000);
    new_erc721.mint(OWNER(), 1);

    // Verify new tokens are not yet registered
    assert(!contracts.budokan.is_token_registered(new_erc20_address), 'New ERC20 not registered');
    assert(!contracts.budokan.is_token_registered(new_erc721_address), 'New ERC721 not registered');

    // Set approvals needed for registration (ERC20 needs allowance of 1, ERC721 needs approval)
    new_erc20.approve(contracts.budokan.contract_address, 1);
    new_erc721.approve(contracts.budokan.contract_address, 1);

    // Register new ERC20 token
    contracts
        .budokan
        .register_token(new_erc20_address, TokenTypeData::erc20(ERC20Data { amount: 1 }));

    // Register new ERC721 token
    contracts
        .budokan
        .register_token(new_erc721_address, TokenTypeData::erc721(ERC721Data { id: 1 }));

    // Verify new tokens are now registered
    assert(contracts.budokan.is_token_registered(new_erc20_address), 'New ERC20 not registered');
    assert(contracts.budokan.is_token_registered(new_erc721_address), 'New ERC721 not registered');

    // Verify original setup tokens are still registered
    // Note: The old ERC721 token compatibility is proven by the setup process where
    // erc721_old (felt252 metadata format) is successfully registered during initialization
    assert(
        contracts.budokan.is_token_registered(contracts.erc20.contract_address),
        'Setup ERC20 not registered',
    );
    assert(
        contracts.budokan.is_token_registered(contracts.erc721.contract_address),
        'Setup ERC721 not registered',
    );
    assert(
        contracts.budokan.is_token_registered(contracts.erc721_old.contract_address),
        'Setup ERC721 old not registered',
    );
}

#[test]
fn register_token_old_erc721_compatibility() {
    let contracts = setup();

    // This test validates that old ERC721 tokens (those with felt252 metadata)
    // are successfully registered and can be queried through the system

    let mut world = contracts.world;
    let store: BudokanStore = BudokanStoreTrait::new(world);

    // Verify the old ERC721 token was registered during setup and has felt252-style metadata
    let erc721_old_token = store.get_token(contracts.erc721_old.contract_address);
    assert(erc721_old_token.is_registered == true, 'ERC721 old not registered');
    assert(erc721_old_token.token_type == TokenType::erc721, 'Wrong token type');
    assert(erc721_old_token.name == "Test ERC721 Old", 'Wrong name');
    assert(erc721_old_token.symbol == "T721O", 'Wrong symbol');

    // Verify the register_token system accepts and processes old ERC721 format
    // (this is proven by successful initialization where all three token types are processed)
    assert(
        contracts.budokan.is_token_registered(contracts.erc721_old.contract_address),
        'Old ERC721 not in system',
    );
}

#[test]
#[should_panic]
fn register_token_already_registered() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Try to register a token that was already registered during setup - should panic
    contracts
        .budokan
        .register_token(
            contracts.erc20.contract_address, TokenTypeData::erc20(ERC20Data { amount: 1 }),
        );
}

//
// Test entering tournaments
//

#[test]
fn enter_tournament() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // advance time to registration start time
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // enter tournament
    let (game_token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    // verify registration information
    let player1_registration = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, game_token_id);

    assert!(
        player1_registration.tournament_id == tournament.id,
        "Wrong tournament id for player 1, expected: {}, got: {}",
        tournament.id,
        player1_registration.tournament_id,
    );
    assert!(player1_registration.entry_number == 1, "Entry number should be 1");
    assert!(
        player1_registration.entry_number == entry_number,
        "Invalid entry number for player 1, expected: {}, got: {}",
        entry_number,
        player1_registration.entry_number,
    );
    assert!(player1_registration.has_submitted == false, "submitted score should be false");
}

#[test]
#[should_panic(expected: ("Schedule: Registration is not open", 'ENTRYPOINT_FAILED'))]
fn enter_tournament_after_registration_ends() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create a tournament with a gap between registration end and tournament start
    let registration_start_time = 1000;
    let registration_end_time = 2000;
    let tournament_start_time = 3000; // Gap of 1000 between registration end and tournament start
    let tournament_end_time = 4000;

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: registration_start_time, end: registration_end_time },
        ),
        game: Period { start: tournament_start_time, end: tournament_end_time },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );

    // Set timestamp to after registration ends but before tournament starts (Staging phase)
    testing::set_block_timestamp(registration_end_time);

    // Verify we're in the Staging phase
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Staging,
        "Tournament should be in Staging phase",
    );

    // Try to enter tournament during the gap - should panic
    contracts.budokan.enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);
}

#[test]
#[should_panic(expected: ("Token is soulbound and cannot be transferred", 'ENTRYPOINT_FAILED'))]
fn soulbound_tournament_prevents_token_transfer() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create a soulbound tournament (soulbound = true)
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            true, // soulbound = true
            "",
        );

    // Advance time to registration start time
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter tournament
    let (game_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    // Verify token was minted to OWNER
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    let token_owner = denshokan_erc721.owner_of(game_token_id.into());
    assert!(token_owner == OWNER(), "Token should be owned by OWNER");

    // Try to transfer the game token to another address - should panic
    let recipient = starknet::contract_address_const::<0x999>();
    denshokan_erc721.transfer_from(OWNER(), recipient, game_token_id.into());
}

#[test]
fn extension_with_registration_only_requires_registration_period() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Deploy a new entry validator with registration_only = true
    let budokan_address = contracts.budokan.contract_address;
    let entry_validator_registration_only_address = deploy_contract(
        entry_validator_mock::TEST_CLASS_HASH.try_into().unwrap(),
        array![budokan_address.into(), 1].span() // registration_only = true (1)
    );

    // Create extension config with the registration_only validator
    let extension_config = ExtensionConfig {
        address: entry_validator_registration_only_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    // Create a schedule WITH a registration period that has a gap before game start (should
    // succeed)
    let registration_start = 1000;
    let registration_end = 2000;
    let game_start = 3000; // Gap of 1000 between registration end and game start
    let game_end = 4000;

    let schedule_with_gap = Schedule {
        registration: Option::Some(Period { start: registration_start, end: registration_end }),
        game: Period { start: game_start, end: game_end },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule_with_gap,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Verify tournament was created successfully
    assert!(tournament.id == 1, "Tournament should be created with ID 1");
}

#[test]
#[should_panic(
    expected: (
        "Schedule: Extension requires a registration period but none was provided",
        'ENTRYPOINT_FAILED',
    ),
)]
fn extension_with_registration_only_rejects_season_without_registration_gap() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Deploy a new entry validator with registration_only = true
    let budokan_address = contracts.budokan.contract_address;
    let entry_validator_registration_only_address = deploy_contract(
        entry_validator_mock::TEST_CLASS_HASH.try_into().unwrap(),
        array![budokan_address.into(), 1].span() // registration_only = true (1)
    );

    // Create extension config with the registration_only validator
    let extension_config = ExtensionConfig {
        address: entry_validator_registration_only_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    // Create a schedule WITHOUT a registration period (season-style) - should panic
    let schedule_without_registration = Schedule {
        registration: Option::None,
        game: test_game_period(),
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule_without_registration,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: (
        "Schedule: Extension requires registration to end before game starts. Registration ends at 2000, game starts at 2000",
        'ENTRYPOINT_FAILED',
    ),
)]
fn extension_with_registration_only_rejects_no_gap_between_registration_and_game() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Deploy a new entry validator with registration_only = true
    let budokan_address = contracts.budokan.contract_address;
    let entry_validator_registration_only_address = deploy_contract(
        entry_validator_mock::TEST_CLASS_HASH.try_into().unwrap(),
        array![budokan_address.into(), 1].span() // registration_only = true (1)
    );

    // Create extension config with the registration_only validator
    let extension_config = ExtensionConfig {
        address: entry_validator_registration_only_address,
        config: array![contracts.erc721.contract_address.into()].span(),
    };
    let entry_requirement_type = EntryRequirementType::extension(extension_config);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    // Create a schedule where registration ends at the same time the game starts (no gap)
    let registration_start = 1000;
    let registration_and_game_start = 2000; // Registration ends and game starts at same time
    let game_end = 3000;

    let schedule_no_gap = Schedule {
        registration: Option::Some(
            Period { start: registration_start, end: registration_and_game_start },
        ),
        game: Period { start: registration_and_game_start, end: game_end },
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    };

    contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule_no_gap,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Provided Token ID 1 does not match Token ID 1 at leaderboard position 1 for tournament 1",
        'ENTRYPOINT_FAILED',
    ),
)]
fn use_host_token_to_qualify_into_tournament_gated_tournament() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // First create and complete a tournament that will be used as a gate
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Complete the first tournament
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(first_entry_token_id, 100);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // assert first_entry_token_id is in the leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(first_tournament.id);
    let first_place = *leaderboard.at(0);
    assert!(
        first_place == first_entry_token_id,
        "Invalid first place for first tournament. Expected: {}, got: {}",
        first_place,
        first_entry_token_id,
    );

    // Create a tournament gated by the previous tournament
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id].span()),
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let entry_fee = Option::None;

    let current_time = get_block_timestamp();

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    // attempt to join second tournament using the host token, should panic
    let wrong_submission_type = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: first_tournament.id,
                token_id: first_tournament.creator_token_id,
                position: 1,
            },
        ),
    );
    contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player', OWNER(), wrong_submission_type);
}


#[test]
#[should_panic(
    expected: (
        "Tournament: Provided Token ID 3 does not match Token ID 3 at leaderboard position 1 for tournament 1",
        'ENTRYPOINT_FAILED',
    ),
)]
fn enter_tournament_wrong_submission_type() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // First create and complete a tournament that will be used as a gate
    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Complete the first tournament
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player', OWNER(), Option::None);

    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(first_entry_token_id, 100);
    contracts.minigame.end_game(second_entry_token_id, 10);
    contracts.budokan.submit_score(first_tournament.id, first_entry_token_id, 1);

    // Settle first tournament
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // assert first_entry_token_id is in the leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(first_tournament.id);
    let first_place = *leaderboard.at(0);
    assert!(
        first_place == first_entry_token_id,
        "Invalid first place for first tournament. Expected: {}, got: {}",
        first_place,
        first_entry_token_id,
    );

    // Create a tournament gated by the previous tournament
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id].span()),
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let entry_fee = Option::None;

    let current_time = get_block_timestamp();

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    // attempt to join second tournament using token that did not win first tournament, should panic
    let wrong_submission_type = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: first_tournament.id, token_id: second_entry_token_id, position: 1,
            },
        ),
    );
    contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player', OWNER(), wrong_submission_type);
}

#[test]
fn enter_tournament_season() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let schedule = test_season_schedule();

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_START_TIME().into());

    let (game_token_id, entry_number) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    assert!(entry_number == 1, "Invalid entry number");

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(game_token_id, 10);
    contracts.budokan.submit_score(tournament.id, game_token_id, 1);

    // verify finished first
    let winners = contracts.budokan.get_leaderboard(tournament.id);
    assert(winners.len() == 1, 'Invalid number of winners');
    assert(*winners.at(0) == game_token_id, 'Invalid winner');
}

//
// Test submitting scores
//

#[test]
fn submit_score_gas_check() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create tournament with leaderboard of 10
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 10;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter 10 players into the tournament
    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', OWNER(), Option::None);

    let (player3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player3', OWNER(), Option::None);

    let (player4, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player4', OWNER(), Option::None);

    let (player5, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player5', OWNER(), Option::None);

    let (player6, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player6', OWNER(), Option::None);

    let (player7, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player7', OWNER(), Option::None);

    let (player8, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player8', OWNER(), Option::None);

    let (player9, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player9', OWNER(), Option::None);

    let (player10, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player10', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

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
    testing::set_block_timestamp(TEST_END_TIME().into() + MIN_SUBMISSION_PERIOD.into() + 1);

    // verify tournament is finalized
    let state = contracts.budokan.current_phase(tournament.id);
    assert!(state == Phase::Finalized, "Tournament should be finalized");

    // Verify final leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 10, "Invalid leaderboard length");
    assert!(
        *leaderboard.at(0) == player1,
        "Invalid first place. Expected: {}, got: {}",
        player1,
        *leaderboard.at(0),
    );
    assert!(
        *leaderboard.at(1) == player2,
        "Invalid second place. Expected: {}, got: {}",
        player2,
        *leaderboard.at(1),
    );
    assert!(
        *leaderboard.at(2) == player3,
        "Invalid third place. Expected: {}, got: {}",
        player3,
        *leaderboard.at(2),
    );
    assert!(
        *leaderboard.at(3) == player4,
        "Invalid fourth place. Expected: {}, got: {}",
        player4,
        *leaderboard.at(3),
    );
    assert!(
        *leaderboard.at(4) == player5,
        "Invalid fifth place. Expected: {}, got: {}",
        player5,
        *leaderboard.at(4),
    );
    assert!(
        *leaderboard.at(5) == player6,
        "Invalid sixth place. Expected: {}, got: {}",
        player6,
        *leaderboard.at(5),
    );
    assert!(
        *leaderboard.at(6) == player7,
        "Invalid seventh place. Expected: {}, got: {}",
        player7,
        *leaderboard.at(6),
    );
    assert!(
        *leaderboard.at(7) == player8,
        "Invalid eighth place. Expected: {}, got: {}",
        player8,
        *leaderboard.at(7),
    );
    assert!(
        *leaderboard.at(8) == player9,
        "Invalid ninth place. Expected: {}, got: {}",
        player9,
        *leaderboard.at(8),
    );
    assert!(
        *leaderboard.at(9) == player10,
        "Invalid tenth place. Expected: {}, got: {}",
        player10,
        *leaderboard.at(9),
    );
}

#[test]
fn submit_score_basic() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create tournament with 10 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 10;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter tournament
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(token_id, 100);

    // Submit score for first place (position 1)
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    // Verify leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 1, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == token_id, "Invalid token id in leaderboard");
}

#[test]
fn submit_score_multiple_positions() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 4;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter tournament with three players
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', OWNER(), Option::None);
    let (token_id4, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player4', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    // Set different scores
    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);
    contracts.minigame.end_game(token_id3, 75);
    contracts.minigame.end_game(token_id4, 1);

    // Submit scores in different order than final ranking
    contracts.budokan.submit_score(tournament.id, token_id3, 1); // 75 points
    contracts.budokan.submit_score(tournament.id, token_id1, 1); // 100 points
    contracts.budokan.submit_score(tournament.id, token_id2, 3); // 50 points
    contracts.budokan.submit_score(tournament.id, token_id4, 4); // 25 points

    // Verify leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 4, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == token_id1, "Invalid first place");
    assert!(*leaderboard.at(1) == token_id3, "Invalid second place");
    assert!(*leaderboard.at(2) == token_id2, "Invalid third place");
    assert!(*leaderboard.at(3) == token_id4, "Invalid fourth place");
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Score 50 is less than current score of 100 at position 1", 'ENTRYPOINT_FAILED',
    ),
)]
fn submit_score_lower_score() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 3;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);

    // Submit higher score first
    contracts.budokan.submit_score(tournament.id, token_id1, 1);

    // Try to submit lower score for same position
    contracts.budokan.submit_score(tournament.id, token_id2, 1);
}


#[test]
#[should_panic(expected: ("Tournament: Invalid position", 'ENTRYPOINT_FAILED'))]
fn submit_score_invalid_position() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 2;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(token_id, 100);

    // Try to submit for position 3 when only 2 prize spots exist
    contracts.budokan.submit_score(tournament.id, token_id, 3);
}

#[test]
#[should_panic(expected: ("Tournament: Score already submitted", 'ENTRYPOINT_FAILED'))]
fn submit_score_already_submitted() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(token_id, 100);

    // Submit score once
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    // Try to submit again
    contracts.budokan.submit_score(tournament.id, token_id, 1);
}

#[test]
#[should_panic(expected: ("Tournament: Not in submission period", 'ENTRYPOINT_FAILED'))]
fn submit_score_wrong_period() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);

    // Try to submit before tournament ends
    testing::set_block_timestamp(TEST_START_TIME().into());
    contracts.minigame.end_game(token_id, 100);
    contracts.budokan.submit_score(tournament.id, token_id, 1);
}

#[test]
#[should_panic(expected: ("Tournament: Invalid position", 'ENTRYPOINT_FAILED'))]
fn submit_score_position_zero() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(token_id, 100);

    // Try to submit for position 0
    contracts.budokan.submit_score(tournament.id, token_id, 0);
}

#[test]
#[should_panic(
    expected: ("Tournament: Must submit for next available position", 'ENTRYPOINT_FAILED'),
)]
fn submit_score_with_gap() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 3;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());
    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 75);

    // Submit to position 1 first
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    // Submit to position 3, leaving position 2 empty
    contracts.budokan.submit_score(tournament.id, token_id2, 3);

    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 2, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == token_id1, "Invalid first place");
    assert!(*leaderboard.at(1) == token_id2, "Invalid second place");
}

#[test]
#[should_panic(expected: ("Tournament: Tournament 2 does not exist", 'ENTRYPOINT_FAILED'))]
fn submit_score_invalid_tournament() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // create basic tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Try to submit score for non-existent tournament
    let tournament_id = tournament.id + 1;
    let token_id = 1;
    let position = 1;
    contracts.budokan.submit_score(tournament_id, token_id, position);
}

//
// Test distributing rewards
//

#[test]
fn claim_prizes_with_sponsored_prizes() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // register_tokens_for_test(tournament, erc20, erc721);

    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    let first_prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
            1,
        );
    let second_prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            1,
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(1, 1);

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(first_prize_id));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(second_prize_id));

    // check balances of owner after claiming prizes
    assert(contracts.erc20.balance_of(OWNER()) == STARTING_BALANCE, 'Invalid balance');
    assert(contracts.erc721.owner_of(1) == OWNER(), 'Invalid owner');
}

#[test]
#[should_panic(expected: ("Tournament: Prize has already been claimed", 'ENTRYPOINT_FAILED'))]
fn claim_prizes_prize_already_claimed() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    let first_prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
            1,
        );

    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            1,
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(1, 1);

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(first_prize_id));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(first_prize_id));
}

#[test]
fn claim_prizes_with_gated_tokens_criteria() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let entry_requirement_type = EntryRequirementType::token(contracts.erc721.contract_address);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let entry_fee = Option::None;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    assert(tournament.entry_fee == entry_fee, 'Invalid entry fee');

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let qualification = Option::Some(QualificationProof::NFT(NFTQualification { token_id: 1 }));

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), qualification);

    testing::set_block_timestamp(TEST_START_TIME().into());

    // check tournament entries
    assert(contracts.budokan.tournament_entries(tournament.id) == 1, 'Invalid entries');

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(entry_token_id, 1);

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);
}

#[test]
fn claim_prizes_with_gated_tokens_uniform() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let entry_requirement_type = EntryRequirementType::token(contracts.erc721.contract_address);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let entry_fee = Option::None;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    assert(tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let qualification = Option::Some(QualificationProof::NFT(NFTQualification { token_id: 1 }));

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), qualification);

    // check tournament entries
    assert(contracts.budokan.tournament_entries(tournament.id) == 1, 'Invalid entries');

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(entry_token_id, 1);

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);
}

#[test]
fn claim_prizes_with_gated_tournaments() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let first_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(first_tournament.id, 'test_player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(entry_token_id, 1);

    contracts.budokan.submit_score(first_tournament.id, entry_token_id, 1);

    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // verify entry token id won the first tournament
    let leaderboard = contracts.budokan.get_leaderboard(first_tournament.id);
    assert!(
        *leaderboard.at(0) == entry_token_id,
        "Wrong leaderboard for first tournament. Expected: {}, got: {}",
        entry_token_id,
        *leaderboard.at(0),
    );

    // create a new tournament that is restricted to winners of the first tournament
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![first_tournament.id].span()),
    );
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };
    let entry_requirement = Option::Some(entry_requirement);

    let entry_fee = Option::None;

    let current_time = get_block_timestamp();

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    assert(second_tournament.entry_fee == entry_fee, 'Invalid entry fee');
    assert(second_tournament.entry_requirement == entry_requirement, 'Invalid entry requirement');

    testing::set_block_timestamp(current_time);

    let qualification = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: first_tournament.id, token_id: entry_token_id, position: 1,
            },
        ),
    );

    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(second_tournament.id, 'test_player2', OWNER(), qualification);

    testing::set_block_timestamp(
        current_time + MIN_REGISTRATION_PERIOD.into() + MIN_TOURNAMENT_LENGTH.into(),
    );

    contracts.minigame.end_game(second_entry_token_id, 1);

    contracts.budokan.submit_score(second_tournament.id, second_entry_token_id, 1);
}

#[test]
fn claim_prizes_with_premiums() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let entry_fee = Option::Some(
        EntryFee {
            token_address: contracts.erc20.contract_address,
            amount: 1,
            distribution: array![100].span(),
            tournament_creator_share: Option::None,
            game_creator_share: Option::None,
        },
    );

    let entry_requirement = Option::None;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    assert(tournament.entry_fee == entry_fee, 'Invalid entry fee');

    // handle approval for the premium
    contracts.erc20.approve(contracts.budokan.contract_address, 1);

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player', OWNER(), Option::None);

    // check owner now has 1 less premium token
    assert(contracts.erc20.balance_of(OWNER()) == STARTING_BALANCE - 1, 'Invalid balance');

    // check tournament now has premium funds
    assert(contracts.erc20.balance_of(contracts.budokan.contract_address) == 1, 'Invalid balance');

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(entry_token_id, 1);

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // claim entry fee prize for first place
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(1)));

    // check owner now has all premium funds back
    assert(contracts.erc20.balance_of(OWNER()) == STARTING_BALANCE, 'Invalid balance');
}

#[test]
fn claim_prizes_with_premium_creator_fee() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create entry fee with 10% creator fee and 90% to winner
    let entry_fee = Option::Some(
        EntryFee {
            token_address: contracts.erc20.contract_address,
            amount: 100, // 100 tokens per entry
            distribution: array![90].span(), // 90% to winner
            tournament_creator_share: Option::Some(10),
            game_creator_share: Option::None,
        },
    );

    let entry_requirement = Option::None;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter tournament with two players
    utils::impersonate(OWNER());
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), Option::None);

    let player2 = starknet::contract_address_const::<0x456>();
    utils::impersonate(player2);
    contracts.erc20.mint(player2, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (player2_game_token, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', player2, Option::None);

    let creator_initial_balance = contracts.erc20.balance_of(OWNER());

    testing::set_block_timestamp(TEST_END_TIME().into());

    // Set scores (player2 wins)
    contracts.minigame.end_game(first_entry_token_id, 1);
    contracts.minigame.end_game(player2_game_token, 2);

    utils::impersonate(OWNER());

    contracts.budokan.submit_score(tournament.id, player2_game_token, 1);

    // Advance time to tournament submission period
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Claim creator fee
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::TournamentCreator));

    // Verify creator fee distribution (10% of 200 total = 20)
    assert(
        contracts.erc20.balance_of(OWNER()) == creator_initial_balance + 20, 'Invalid creator fee',
    );

    // Check initial balances
    let winner_initial_balance = contracts.erc20.balance_of(player2);

    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(1)));

    // Verify winner prize distribution (90% of 200 total = 180)
    assert!(
        contracts.erc20.balance_of(player2) == winner_initial_balance + 180,
        "Invalid winner distribution, expected: {}, actual: {}",
        winner_initial_balance + 180,
        contracts.erc20.balance_of(player2),
    );
}


#[test]
fn claim_prizes_with_premium_game_fee() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create entry fee with 10% creator fee and 90% to winner
    let entry_fee = Option::Some(
        EntryFee {
            token_address: contracts.erc20.contract_address,
            amount: 100, // 100 tokens per entry
            distribution: array![90].span(), // 90% to winner
            tournament_creator_share: Option::None,
            game_creator_share: Option::Some(10),
        },
    );

    let entry_requirement = Option::None;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter tournament with two players
    utils::impersonate(OWNER());
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), Option::None);

    let player2 = starknet::contract_address_const::<0x456>();
    utils::impersonate(player2);
    contracts.erc20.mint(player2, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (player2_game_token, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', player2, Option::None);

    let minigame_registry_address = contracts.denshokan.game_registry_address();
    let minigame_registry_erc721_dispatcher = IERC721Dispatcher {
        contract_address: minigame_registry_address,
    };
    let game_creator = minigame_registry_erc721_dispatcher.owner_of(1);

    let creator_initial_balance = contracts.erc20.balance_of(game_creator);

    testing::set_block_timestamp(TEST_END_TIME().into());

    // Set scores (player2 wins)
    contracts.minigame.end_game(first_entry_token_id, 1);
    contracts.minigame.end_game(player2_game_token, 2);

    utils::impersonate(OWNER());

    contracts.budokan.submit_score(tournament.id, player2_game_token, 1);

    // Advance time to tournament submission period
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Claim gsme creator fee
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::GameCreator));

    // Verify game creator fee distribution (10% of 200 total = 20)
    assert!(
        contracts.erc20.balance_of(game_creator) == creator_initial_balance + 20,
        "Invalid game creator fee",
    );

    // Check initial balances
    let winner_initial_balance = contracts.erc20.balance_of(player2);

    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(1)));

    // Verify winner prize distribution (90% of 200 total = 180)
    assert!(
        contracts.erc20.balance_of(player2) == winner_initial_balance + 180,
        "Invalid winner distribution, expected: {}, actual: {}",
        winner_initial_balance + 180,
        contracts.erc20.balance_of(player2),
    );
}

#[test]
fn claim_prizes_with_premium_multiple_winners() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create premium with 10% creator fee and split remaining 90% between top 3:
    // 1st: 50%, 2nd: 30%, 3rd: 20%
    let entry_fee = Option::Some(
        EntryFee {
            token_address: contracts.erc20.contract_address,
            amount: 100, // 100 tokens per entry
            distribution: array![50, 25, 15].span(), // Distribution percentages
            tournament_creator_share: Option::Some(10),
            game_creator_share: Option::None,
        },
    );

    let entry_requirement = Option::None;

    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 3;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            entry_fee,
            entry_requirement,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Create and enter with 4 players
    let player2 = starknet::contract_address_const::<0x456>();
    let player3 = starknet::contract_address_const::<0x789>();
    let player4 = starknet::contract_address_const::<0x101>();

    // Owner enters
    utils::impersonate(OWNER());
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (first_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), Option::None);

    // Player 2 enters
    utils::impersonate(player2);
    contracts.erc20.mint(player2, 200);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (second_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', player2, Option::None);

    // Player 3 enters
    utils::impersonate(player3);
    contracts.erc20.mint(player3, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (third_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player3', player3, Option::None);

    // Player 4 enters
    utils::impersonate(player4);
    contracts.erc20.mint(player4, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (fourth_entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player4', player4, Option::None);

    testing::set_block_timestamp(TEST_START_TIME().into());

    let third_initial = contracts.erc20.balance_of(OWNER());

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(second_entry_token_id, 100); // player2's game
    contracts.minigame.end_game(third_entry_token_id, 75); // player3's game
    contracts.minigame.end_game(first_entry_token_id, 50); // owner's game
    contracts.minigame.end_game(fourth_entry_token_id, 25); // player4's game

    // Submit scores
    utils::impersonate(player2);

    contracts.budokan.submit_score(tournament.id, second_entry_token_id, 1);
    contracts.budokan.submit_score(tournament.id, third_entry_token_id, 2);
    contracts.budokan.submit_score(tournament.id, first_entry_token_id, 3);

    // Store initial balances
    let first_initial = contracts.erc20.balance_of(player2);
    let second_initial = contracts.erc20.balance_of(player3);

    // Claim rewards
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());
    // 3 premium prizes
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(1)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(2)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(3)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::TournamentCreator));

    // Total pool = 4 players * 100 tokens = 400 tokens
    // 1st place (50%) = 200 tokens
    // 2nd place (25%) = 100 tokens
    // 3rd place (15%) = 60 tokens
    //     + creator reward (10%) = 40 tokens
    // Verify winner distributions
    let first_expected = first_initial + 200;
    let second_expected = second_initial + 100;
    let third_expected = third_initial + 60 + 40;
    assert!(
        contracts.erc20.balance_of(player2) == first_expected,
        "Invalid first distribution, expected: {}, actual: {}",
        first_expected,
        contracts.erc20.balance_of(player2),
    );
    assert!(
        contracts.erc20.balance_of(player3) == second_expected,
        "Invalid second distribution, expected: {}, actual: {}",
        second_expected,
        contracts.erc20.balance_of(player3),
    );
    assert!(
        contracts.erc20.balance_of(OWNER()) == third_expected,
        "Invalid third distribution, expected: {}, actual: {}",
        third_expected,
        contracts.erc20.balance_of(OWNER()),
    );
}

#[test]
fn claim_prizes_season() {
    let contracts = setup();

    utils::impersonate(OWNER());

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    let first_prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
            1,
        );
    let second_prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            1,
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let (entry_token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_START_TIME().into());

    contracts.minigame.end_game(entry_token_id, 1);

    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.budokan.submit_score(tournament.id, entry_token_id, 1);

    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(first_prize_id));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(second_prize_id));

    // check balances of owner after claiming prizes
    assert(contracts.erc20.balance_of(OWNER()) == STARTING_BALANCE, 'Invalid balance');
    assert(contracts.erc721.owner_of(1) == OWNER(), 'Invalid owner');
}

#[test]
fn state_transitions() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let registration_start_time = 1000;
    let registration_end_time = 10000;
    let tournament_start_time = 20000;
    let tournament_end_time = 30000;
    let submission_duration = 86400;

    let schedule = Schedule {
        registration: Option::Some(
            Period { start: registration_start_time, end: registration_end_time },
        ),
        game: Period { start: tournament_start_time, end: tournament_end_time },
        submission_duration: submission_duration,
    };

    // Create tournament
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::None,
            false,
            "",
        );

    // Test Scheduled state (before registration)
    testing::set_block_timestamp(registration_start_time - 1);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Scheduled,
        "Tournament should be in Scheduled state",
    );

    // Test Registration state
    testing::set_block_timestamp(registration_start_time);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Registration,
        "Tournament should be in Registration state at start",
    );

    testing::set_block_timestamp(registration_end_time - 1);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Registration,
        "Tournament should be in Registration state before end",
    );

    // Test Staging state (between registration end and tournament start)
    testing::set_block_timestamp(registration_end_time);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Staging,
        "Tournament should be in Staging state after registration",
    );

    testing::set_block_timestamp(tournament_start_time - 1);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Staging,
        "Tournament should be in Staging state before start",
    );

    // Test Live state
    testing::set_block_timestamp(tournament_start_time);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Live,
        "Tournament should be in Live state at start",
    );

    testing::set_block_timestamp(tournament_end_time - 1);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Live,
        "Tournament should be in Live state before end",
    );

    // Test Submission state
    testing::set_block_timestamp(tournament_end_time);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Submission,
        "Tournament should be in Submission state after end",
    );

    // just before submission period ends
    testing::set_block_timestamp(tournament_end_time + submission_duration - 1);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Submission,
        "Tournament should be in Submission state before submission period ends",
    );

    // Submission is over, so tournament should be finalized
    testing::set_block_timestamp(tournament_end_time + submission_duration);
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Finalized,
        "Tournament should be in Finalized state after submission period",
    );
}

#[test]
#[should_panic(
    expected: ("Tournament: Score 1000 qualifies for higher position than 3", 'ENTRYPOINT_FAILED'),
)]
fn malicious_score_submission() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create tournament with 5 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);

    // Tournament has 3 prize spots
    game_config.prize_spots = 3;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Five people enter the tournament
    let (first_place, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);

    let (second_place, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);

    let (third_place, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', OWNER(), Option::None);

    let (fourth_place, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player4', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    // End games and set scores
    contracts.minigame.end_game(first_place, 1000);
    contracts.minigame.end_game(second_place, 800);
    contracts.minigame.end_game(third_place, 600);
    contracts.minigame.end_game(fourth_place, 400);

    // second place submits score first, as first which is valid
    contracts.budokan.submit_score(tournament.id, second_place, 1);

    // third place submits score second, as second which is valid
    contracts.budokan.submit_score(tournament.id, third_place, 2);

    // fourth place submits score third, as third which is valid
    contracts.budokan.submit_score(tournament.id, fourth_place, 3);

    // Someone then attempts to submit first place's score as third
    // This should fail because the contract will see that the score is more than the
    // position above it.
    contracts.budokan.submit_score(tournament.id, first_place, 3);
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Tie goes to game with lower id. Submitted game id 3 is higher than current game id 2",
        'ENTRYPOINT_FAILED',
    ),
)]
fn test_submit_score_tie_higher_game_id() {
    // Setup
    let contracts = setup();

    // Create tournament with 5 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);

    // Tournament has 3 prize spots
    game_config.prize_spots = 3;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);

    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);

    // Set both players to have the same score
    contracts.minigame.end_game(player1, 100);
    contracts.minigame.end_game(player2, 100);

    // Move to submission phase
    testing::set_block_timestamp(TEST_END_TIME().into());

    // First player submits score - should succeed
    contracts.budokan.submit_score(tournament.id, player1, 1);

    // Second player also tries to submit as position 1 (tie)
    // This should fail since player2's game id is higher than player1's
    contracts.budokan.submit_score(tournament.id, player2, 1);
}

#[test]
fn test_submit_score_tie_lower_game_id() {
    // Setup
    let contracts = setup();

    // Create tournament with 5 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);

    // Tournament has 3 prize spots
    game_config.prize_spots = 3;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    let (player1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);

    let (player2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);

    // Set both players to have the same score
    contracts.minigame.end_game(player1, 100);
    contracts.minigame.end_game(player2, 100);

    // Move to submission phase
    testing::set_block_timestamp(TEST_END_TIME().into());

    // First player submits score - should succeed
    contracts.budokan.submit_score(tournament.id, player2, 1);

    // Second player also tries to submit as position 1 (tie)
    // This should succeed since player1's game id is lower than player2's
    contracts.budokan.submit_score(tournament.id, player1, 1);

    // get leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(*leaderboard.at(0) == player1, "Player1 should be first place");
    assert!(*leaderboard.at(1) == player2, "Player2 should be second place");
}

#[test]
fn test_submit_score_tie_higher_game_id_for_lower_position() {
    // Setup
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 3;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter tournament with three players
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    // Set scores - player1 and player2 have the same score, player3 has lower score
    contracts.minigame.end_game(token_id1, 100); // First player (lower ID)
    contracts.minigame.end_game(token_id2, 100); // Second player (higher ID)
    contracts.minigame.end_game(token_id3, 50); // Third player

    // Submit scores in order
    contracts.budokan.submit_score(tournament.id, token_id1, 1); // First place (ID: 1, Score: 100)
    contracts.budokan.submit_score(tournament.id, token_id2, 2); // Second place (ID: 2, Score: 100)
    contracts.budokan.submit_score(tournament.id, token_id3, 3); // Third place (ID: 3, Score: 50)

    // Verify leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 3, "Invalid leaderboard length");
    assert!(*leaderboard.at(0) == token_id1, "Invalid first place");
    assert!(*leaderboard.at(1) == token_id2, "Invalid second place");
    assert!(*leaderboard.at(2) == token_id3, "Invalid third place");

    // Verify registrations are marked as submitted
    let reg1 = contracts.budokan.get_registration(contracts.minigame.contract_address, token_id1);
    let reg2 = contracts.budokan.get_registration(contracts.minigame.contract_address, token_id2);
    let reg3 = contracts.budokan.get_registration(contracts.minigame.contract_address, token_id3);

    assert!(reg1.has_submitted, "Player 1 should be marked as submitted");
    assert!(reg2.has_submitted, "Player 2 should be marked as submitted");
    assert!(reg3.has_submitted, "Player 3 should be marked as submitted");
}

#[test]
#[should_panic(
    expected: (
        "Tournament: For equal scores, game id 2 should be higher than game id above 3",
        'ENTRYPOINT_FAILED',
    ),
)]
fn test_submit_score_tie_lower_game_id_for_lower_position() {
    // Setup
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create tournament with 3 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 3;
    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::None,
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Enter tournament with three players
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', OWNER(), Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', OWNER(), Option::None);

    testing::set_block_timestamp(TEST_END_TIME().into());

    // Set equal scores for both players
    contracts.minigame.end_game(token_id1, 100); // First player (lower ID)
    contracts.minigame.end_game(token_id2, 100); // Second player (higher ID)

    // Submit higher ID first
    contracts.budokan.submit_score(tournament.id, token_id2, 1); // First place (ID: 3, Score: 100)

    // Try to submit lower ID for second place with same score
    // This should fail because for equal scores, the game ID in lower positions should be higher
    contracts.budokan.submit_score(tournament.id, token_id1, 2); // Second place (ID: 2, Score: 100)
}

#[test]
fn test_add_prize_records_sponsor_address() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create tournament
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Create and impersonate sponsor address
    let sponsor = starknet::contract_address_const::<0x456>();
    utils::impersonate(sponsor);

    // Approve tokens as sponsor
    contracts.erc20.mint(sponsor, STARTING_BALANCE);
    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);

    // Add prize as sponsor
    let prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
            1,
        );

    // Get prize from tournament
    let prize: Prize = contracts.budokan.get_prize(prize_id);

    // Assert sponsor address is correctly recorded
    assert(prize.sponsor_address == sponsor, 'Incorrect sponsor address');
    assert(prize.tournament_id == tournament.id, 'Incorrect tournament id');
    assert(prize.token_address == contracts.erc20.contract_address, 'Incorrect token address');
    assert(prize.payout_position == 1, 'Incorrect payout position');
}

#[test]
fn tournament_with_no_submissions() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create tournament with prizes and premium
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: array![90].span(), // 90% to winner
        tournament_creator_share: Option::Some(10), // 10% creator fee
        game_creator_share: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::Some(entry_fee),
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Add some prizes
    contracts.erc20.approve(contracts.budokan.contract_address, STARTING_BALANCE);
    contracts.erc721.approve(contracts.budokan.contract_address, 1);
    let first_prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: STARTING_BALANCE.low }),
            1,
        );
    let second_prize_id = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc721.contract_address,
            TokenTypeData::erc721(ERC721Data { id: 1 }),
            1,
        );

    // Create multiple players
    let player2 = starknet::contract_address_const::<0x456>();
    let player3 = starknet::contract_address_const::<0x789>();

    // Enter tournament with all players
    contracts.erc20.mint(OWNER(), 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player1', OWNER(), Option::None);

    utils::impersonate(player2);
    contracts.erc20.mint(player2, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player2', player2, Option::None);

    utils::impersonate(player3);
    contracts.erc20.mint(player3, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'test_player3', player3, Option::None);

    // Store initial balances after entry fees are paid
    utils::impersonate(OWNER());
    let creator_balance_after_entries = contracts.erc20.balance_of(OWNER());
    let player2_balance_after_entry = contracts.erc20.balance_of(player2);
    let player3_balance_after_entry = contracts.erc20.balance_of(player3);

    // Move to after tournament and submission period without any score submissions
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Tournament creator claims all unclaimed prizes since no one submitted scores
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(first_prize_id));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(second_prize_id));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(1)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::TournamentCreator));

    // Verify tournament creator gets all prizes since no submissions were made
    // Creator should get: sponsored prizes (STARTING_BALANCE) + entry fee pool (270 total from 3
    // players) + creator fee (30 total from 3 players)
    let expected_creator_balance = creator_balance_after_entries + STARTING_BALANCE + 270 + 30;
    assert(
        contracts.erc20.balance_of(OWNER()) == expected_creator_balance,
        'Invalid creator prize claim',
    );

    // Verify other players don't get anything since they didn't submit scores
    assert!(
        contracts.erc20.balance_of(player2) == player2_balance_after_entry,
        "Player2 should get nothing",
    );
    assert!(
        contracts.erc20.balance_of(player3) == player3_balance_after_entry,
        "Player3 should get nothing",
    );

    // Verify NFT prize goes to tournament creator
    assert!(contracts.erc721.owner_of(1) == OWNER(), "NFT should go to creator");

    // Verify tournament entries were recorded but no scores submitted
    assert!(contracts.budokan.tournament_entries(tournament.id) == 3, "Invalid entry count");

    let registration1 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id1);
    let registration2 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id2);
    let registration3 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id3);

    assert!(!registration1.has_submitted, "Player1 should not have submitted");
    assert!(!registration2.has_submitted, "Player2 should not have submitted");
    assert!(!registration3.has_submitted, "Player3 should not have submitted");

    // Verify leaderboard is empty since no scores were submitted
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert(leaderboard.len() == 0, 'Leaderboard should be empty');
}

#[test]
fn tournament_with_partial_submissions() {
    let contracts = setup();

    utils::impersonate(OWNER());

    // Create entry fee with equal distribution across 10 positions
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 100,
        distribution: array![9, 9, 9, 9, 9, 9, 9, 9, 9, 9]
            .span(), // 90% distributed equally to top 10
        tournament_creator_share: Option::Some(10), // 10% creator fee
        game_creator_share: Option::None,
    };

    // Create tournament with 10 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 10;

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            game_config,
            Option::Some(entry_fee),
            Option::None,
            false,
            "",
        );

    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Add sponsored prizes for first 5 positions
    contracts.erc20.approve(contracts.budokan.contract_address, 500); // 5 prizes of 100 each
    contracts.erc721.approve(contracts.budokan.contract_address, 1);

    let sponsored_prize_1 = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: 100 }),
            1,
        );
    let sponsored_prize_2 = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: 100 }),
            2,
        );
    let sponsored_prize_3 = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: 100 }),
            3,
        );
    let sponsored_prize_4 = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: 100 }),
            4,
        );
    let sponsored_prize_5 = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(ERC20Data { amount: 100 }),
            5,
        );

    // Create 10 players
    let player1 = OWNER();
    let player2 = starknet::contract_address_const::<0x456>();
    let player3 = starknet::contract_address_const::<0x789>();
    let player4 = starknet::contract_address_const::<0x101>();
    let player5 = starknet::contract_address_const::<0x202>();
    let player6 = starknet::contract_address_const::<0x303>();
    let player7 = starknet::contract_address_const::<0x404>();
    let player8 = starknet::contract_address_const::<0x505>();
    let player9 = starknet::contract_address_const::<0x606>();
    let player10 = starknet::contract_address_const::<0x707>();

    // All 10 players enter tournament
    utils::impersonate(player1);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', player1, Option::None);

    // Player 2 enters
    utils::impersonate(player2);
    contracts.erc20.mint(player2, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', player2, Option::None);

    // Player 3 enters
    utils::impersonate(player3);
    contracts.erc20.mint(player3, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', player3, Option::None);

    // Player 4 enters
    utils::impersonate(player4);
    contracts.erc20.mint(player4, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id4, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player4', player4, Option::None);

    // Player 5 enters
    utils::impersonate(player5);
    contracts.erc20.mint(player5, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id5, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player5', player5, Option::None);

    // Player 6 enters
    utils::impersonate(player6);
    contracts.erc20.mint(player6, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id6, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player6', player6, Option::None);

    // Player 7 enters
    utils::impersonate(player7);
    contracts.erc20.mint(player7, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id7, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player7', player7, Option::None);

    // Player 8 enters
    utils::impersonate(player8);
    contracts.erc20.mint(player8, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id8, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player8', player8, Option::None);

    // Player 9 enters
    utils::impersonate(player9);
    contracts.erc20.mint(player9, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id9, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player9', player9, Option::None);

    // Player 10 enters
    utils::impersonate(player10);
    contracts.erc20.mint(player10, 100);
    contracts.erc20.approve(contracts.budokan.contract_address, 100);
    let (token_id10, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player10', player10, Option::None);

    // Store initial balances after entry fees are paid
    let player1_balance_after_entry = contracts.erc20.balance_of(player1);
    let player2_balance_after_entry = contracts.erc20.balance_of(player2);
    let player3_balance_after_entry = contracts.erc20.balance_of(player3);
    let player4_balance_after_entry = contracts.erc20.balance_of(player4);
    let player5_balance_after_entry = contracts.erc20.balance_of(player5);

    // Move to end of tournament and set scores for all players
    testing::set_block_timestamp(TEST_END_TIME().into());

    contracts.minigame.end_game(token_id1, 1000); // Best score
    contracts.minigame.end_game(token_id2, 900);
    contracts.minigame.end_game(token_id3, 800);
    contracts.minigame.end_game(token_id4, 700);
    contracts.minigame.end_game(token_id5, 600);
    contracts.minigame.end_game(token_id6, 500); // Not submitted
    contracts.minigame.end_game(token_id7, 400); // Not submitted
    contracts.minigame.end_game(token_id8, 300); // Not submitted
    contracts.minigame.end_game(token_id9, 200); // Not submitted
    contracts.minigame.end_game(token_id10, 100); // Not submitted

    // Submit scores for only the first 5 players
    utils::impersonate(player2);

    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);
    contracts.budokan.submit_score(tournament.id, token_id3, 3);
    contracts.budokan.submit_score(tournament.id, token_id4, 4);
    contracts.budokan.submit_score(tournament.id, token_id5, 5);

    // Move to after submission period
    testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

    // Verify leaderboard has only 5 entries
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert(leaderboard.len() == 5, 'Leaderboard has 5 entries');
    assert(*leaderboard.at(0) == token_id1, 'Invalid first place');
    assert(*leaderboard.at(1) == token_id2, 'Invalid second place');
    assert(*leaderboard.at(2) == token_id3, 'Invalid third place');
    assert(*leaderboard.at(3) == token_id4, 'Invalid fourth place');
    assert(*leaderboard.at(4) == token_id5, 'Invalid fifth place');

    // Submitters claim their sponsored prizes and entry fee prizes
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(sponsored_prize_1));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(sponsored_prize_2));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(sponsored_prize_3));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(sponsored_prize_4));
    contracts.budokan.claim_prize(tournament.id, PrizeType::Sponsored(sponsored_prize_5));

    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(1)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(2)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(3)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(4)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(5)));

    // Creator claims remaining positions and creator fee
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(6)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(7)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(8)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(9)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::Position(10)));
    contracts.budokan.claim_prize(tournament.id, PrizeType::EntryFees(Role::TournamentCreator));

    // Verify submitters received their rewards
    // Each position gets 9% of total pool (10 players * 100 = 1000), so 90 tokens each
    // Plus sponsored prizes of 100 tokens each
    let expected_prize_per_position = 90; // 9% of 1000
    let sponsored_prize_amount = 100;
    let expected_creator_rewards = 5 * expected_prize_per_position
        + 100; // 5 positions + creator fee

    // Debug: Let's check actual balances vs expected
    let player1_actual = contracts.erc20.balance_of(player1);
    // Player1 is OWNER, so gets position 1 rewards + sponsored prize + creator rewards
    let player1_expected = player1_balance_after_entry
        + expected_prize_per_position
        + sponsored_prize_amount
        + expected_creator_rewards;

    assert!(
        player1_actual == player1_expected,
        "Player1 balance mismatch. Expected: {}, got: {}",
        player1_expected,
        player1_actual,
    );

    assert!(
        contracts.erc20.balance_of(player2) == player2_balance_after_entry
            + expected_prize_per_position
            + sponsored_prize_amount,
        "Player2 should receive position 2 rewards",
    );
    assert!(
        contracts.erc20.balance_of(player3) == player3_balance_after_entry
            + expected_prize_per_position
            + sponsored_prize_amount,
        "Player3 should receive position 3 rewards",
    );
    assert!(
        contracts.erc20.balance_of(player4) == player4_balance_after_entry
            + expected_prize_per_position
            + sponsored_prize_amount,
        "Player4 should receive position 4 rewards",
    );
    assert!(
        contracts.erc20.balance_of(player5) == player5_balance_after_entry
            + expected_prize_per_position
            + sponsored_prize_amount,
        "Player5 should receive position 5 rewards",
    );

    // Verify tournament entries were recorded correctly
    assert!(contracts.budokan.tournament_entries(tournament.id) == 10, "Invalid entry count");

    // Verify only first 5 players submitted scores
    let registration1 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id1);
    let registration2 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id2);
    let registration3 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id3);
    let registration4 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id4);
    let registration5 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id5);
    let registration6 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id6);
    let registration7 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id7);
    let registration8 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id8);
    let registration9 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id9);
    let registration10 = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, token_id10);

    assert!(registration1.has_submitted, "Player1 should have submitted");
    assert!(registration2.has_submitted, "Player2 should have submitted");
    assert!(registration3.has_submitted, "Player3 should have submitted");
    assert!(registration4.has_submitted, "Player4 should have submitted");
    assert!(registration5.has_submitted, "Player5 should have submitted");
    assert!(!registration6.has_submitted, "Player6 should not have submitted");
    assert!(!registration7.has_submitted, "Player7 should not have submitted");
    assert!(!registration8.has_submitted, "Player8 should not have submitted");
    assert!(!registration9.has_submitted, "Player9 should not have submitted");
    assert!(!registration10.has_submitted, "Player10 should not have submitted");
}

//
// TESTS FOR THIRD-PARTY ENTRY FUNCTIONALITY (Issue #129)
//

/// Test that anyone can enter tournament for NFT-qualified participant
#[test]
fn third_party_enter_tournament_with_nft_requirement() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Setup NFT token for gating
    let nft_token_address = contracts.erc721.contract_address;

    // Mint NFT to qualified player
    let qualified_player = starknet::contract_address_const::<0x111>();
    contracts.erc721.mint(qualified_player, 2);

    // Create tournament gated by NFT
    let entry_requirement_type = EntryRequirementType::token(nft_token_address);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Third party (different from qualified player) enters tournament for qualified player
    let third_party = starknet::contract_address_const::<0x222>();
    utils::impersonate(third_party);

    let nft_qualification = Option::Some(QualificationProof::NFT(NFTQualification { token_id: 2 }));

    // Third party calls enter_tournament but provides different player_address
    let different_address = starknet::contract_address_const::<0x333>();
    let (game_token_id, entry_number) = contracts
        .budokan
        .enter_tournament(
            tournament.id,
            'qualified_player',
            different_address, // This address should be ignored
            nft_qualification,
        );

    // Verify tournament entry was registered correctly
    let registration = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, game_token_id);
    assert!(registration.tournament_id == tournament.id, "Wrong tournament ID");
    assert!(registration.entry_number == entry_number, "Wrong entry number");
}

/// Test that anyone can enter tournament for tournament-qualified participant
#[test]
fn third_party_enter_tournament_with_tournament_requirement() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create first tournament (qualifying tournament)
    let qualifying_tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start and complete qualifying tournament
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let qualified_player = starknet::contract_address_const::<0x111>();
    utils::impersonate(qualified_player);

    let (qualifying_token_id, _) = contracts
        .budokan
        .enter_tournament(
            qualifying_tournament.id, 'qualified_player', qualified_player, Option::None,
        );

    // Play game
    testing::set_block_timestamp(TEST_START_TIME().into());
    contracts.minigame.end_game(qualifying_token_id, 100);

    // Submit score
    testing::set_block_timestamp(TEST_END_TIME().into() + 1);
    contracts.budokan.submit_score(qualifying_tournament.id, qualifying_token_id, 1);

    // Finalize qualifying tournament
    let mut time = TEST_END_TIME() + MIN_SUBMISSION_PERIOD + 1;
    testing::set_block_timestamp(time.into());

    // Create second tournament gated by first tournament winners
    utils::impersonate(OWNER());
    let entry_requirement_type = EntryRequirementType::tournament(
        TournamentType::winners(array![qualifying_tournament.id].span()),
    );
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let gated_tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            custom_schedule(
                Option::Some(Period { start: (time).into(), end: (time + 1000).into() }),
                Period { start: (time + 1000).into(), end: (time + 10000).into() },
                MIN_SUBMISSION_PERIOD.into(),
            ),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Start gated tournament entries
    testing::set_block_timestamp(time.into() + 1);

    // Third party enters tournament for qualified player
    let third_party = starknet::contract_address_const::<0x222>();
    utils::impersonate(third_party);

    let tournament_qualification = Option::Some(
        QualificationProof::Tournament(
            TournamentQualification {
                tournament_id: qualifying_tournament.id, token_id: qualifying_token_id, position: 1,
            },
        ),
    );

    // Third party provides different player_address but game should mint to qualified player
    let different_address = starknet::contract_address_const::<0x333>();
    let (game_token_id, _) = contracts
        .budokan
        .enter_tournament(
            gated_tournament.id,
            'qualified_player',
            different_address, // This should be ignored
            tournament_qualification,
        );

    // Verify tournament entry was registered
    let registration = contracts
        .budokan
        .get_registration(contracts.minigame.contract_address, game_token_id);
    assert(registration.tournament_id == gated_tournament.id, 'Wrong tournament ID');
}

/// Test that anyone can enter tournament for allowlist-qualified participant
#[test]
fn third_party_enter_tournament_with_allowlist_requirement() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create array of allowed accounts
    let qualified_player = starknet::contract_address_const::<0x111>();
    let allowed_accounts = array![OWNER(), qualified_player].span();

    // Create tournament gated by allowlist
    let entry_requirement_type = EntryRequirementType::allowlist(allowed_accounts);
    let entry_requirement = EntryRequirement { entry_limit: 0, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Third party enters tournament for allowlisted player
    let third_party = starknet::contract_address_const::<0x222>();
    utils::impersonate(third_party);

    let allowlist_qualification = Option::Some(QualificationProof::Address(qualified_player));

    // Third party provides different player_address
    let different_address = starknet::contract_address_const::<0x333>();
    contracts
        .budokan
        .enter_tournament(
            tournament.id,
            'qualified_player',
            different_address, // This should be ignored
            allowlist_qualification,
        );
}

/// Test that tournaments without entry requirements still work as before
#[test]
fn third_party_enter_tournament_without_requirement_uses_player_address() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create tournament without entry requirements
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    // Third party enters tournament and provides player_address
    let third_party = starknet::contract_address_const::<0x222>();
    utils::impersonate(third_party);

    let player_address = starknet::contract_address_const::<0x333>();
    contracts
        .budokan
        .enter_tournament(
            tournament.id,
            'player',
            player_address, // This should be used since no entry requirements
            Option::None,
        );
}

/// Test entry limits still work with third-party registration
#[test]
#[should_panic(
    expected: (
        "Tournament: Maximum qualified entries reached for tournament 1", 'ENTRYPOINT_FAILED',
    ),
)]
fn third_party_enter_tournament_respects_entry_limits() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Setup NFT for gating
    let nft_token_address = contracts.erc721.contract_address;

    // Mint NFTs to different players
    let player1 = starknet::contract_address_const::<0x111>();
    let player2 = starknet::contract_address_const::<0x222>();
    contracts.erc721.mint(player1, 2);
    contracts.erc721.mint(player2, 3);

    // Create tournament with entry limit of 1
    let entry_requirement_type = EntryRequirementType::token(nft_token_address);
    let entry_requirement = EntryRequirement { entry_limit: 1, entry_requirement_type };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Start tournament entries
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let third_party = starknet::contract_address_const::<0x333>();
    utils::impersonate(third_party);

    // First entry should succeed
    let nft_qualification1 = Option::Some(
        QualificationProof::NFT(NFTQualification { token_id: 2 }),
    );
    contracts.budokan.enter_tournament(tournament.id, 'player1', player1, nft_qualification1);

    // attempt to enter a second time using the same qualification proof
    // should panic
    contracts.budokan.enter_tournament(tournament.id, 'player2', player2, nft_qualification1);
}

//
// Ban Game IDs Tests
//

#[test]
fn test_ban_game_ids_during_registration() {
    let contracts = setup();
    utils::impersonate(OWNER());

    // Create two players - one with ERC721 (valid), one without (invalid)
    let valid_player = OWNER(); // Already has ERC721 token 1
    let invalid_player = starknet::contract_address_const::<0x999>();

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter tournament during registration with valid player
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id_1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));
    let (game_id_2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', valid_player, Option::Some(qualification));

    // // Transfer game_id_1 to invalid player (who doesn't have qualifying ERC721)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    denshokan_erc721.transfer_from(valid_player, invalid_player, game_id_1.into());

    // // Verify registrations exist and are not banned initially
    let registration_banned_1 = contracts
        .budokan
        .get_registration_banned(contracts.minigame.contract_address, game_id_1);
    assert!(!registration_banned_1.is_banned, "Registration should not be banned initially");

    // Call validate_and_ban - should ban game_id_1 because owner doesn't have qualifying token
    contracts.budokan.validate_entries(tournament.id, array![game_id_1, game_id_2].span());

    // Verify game_id_1 is now banned (owned by invalid_player)
    let registration_banned_1_after = contracts
        .budokan
        .get_registration_banned(contracts.minigame.contract_address, game_id_1);
    assert!(
        registration_banned_1_after.is_banned,
        "Game ID 1 should be banned - owner doesn't have qualifying token",
    );

    // Verify game_id_2 is NOT banned (still owned by valid_player)
    let registration_banned_2 = contracts
        .budokan
        .get_registration_banned(contracts.minigame.contract_address, game_id_2);
    assert!(
        !registration_banned_2.is_banned, "Game ID 2 should not be banned - owner has qualifying token",
    );
}

#[test]
#[should_panic(expected: ("Tournament: Game ID is banned", 'ENTRYPOINT_FAILED'))]
fn test_banned_game_id_cannot_submit_score() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let valid_player = OWNER();
    let invalid_player = starknet::contract_address_const::<0x999>();

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter tournament
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));

    // Transfer to invalid player
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    denshokan_erc721.transfer_from(valid_player, invalid_player, game_id.into());

    // Ban the game ID (will be banned because owner doesn't have qualifying token)
    contracts.budokan.validate_entries(tournament.id, array![game_id].span());

    // Set score for the game (would happen during game period)
    testing::set_block_timestamp(TEST_START_TIME().into());
    contracts.minigame.end_game(game_id, 100);

    // Move to submission period
    testing::set_block_timestamp(TEST_END_TIME().into());

    // Attempt to submit score - should panic
    contracts.budokan.submit_score(tournament.id, game_id, 1);
}

#[test]
fn test_anyone_can_ban() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let valid_player = OWNER();
    let invalid_player = starknet::contract_address_const::<0x999>();

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter tournament
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));

    // Transfer to invalid player
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    denshokan_erc721.transfer_from(valid_player, invalid_player, game_id.into());

    // Switch to different address (not creator)
    let non_creator = starknet::contract_address_const::<0x888>();
    utils::impersonate(non_creator);

    // Anyone can ban - should succeed
    contracts.budokan.validate_entries(tournament.id, array![game_id].span());

    // Verify game ID is now banned
    let registration_banned = contracts
        .budokan
        .get_registration_banned(contracts.minigame.contract_address, game_id);
    assert!(registration_banned.is_banned, "Registration should be banned");
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Can only ban from registration start until game starts", 'ENTRYPOINT_FAILED',
    ),
)]
fn test_cannot_ban_after_game_starts() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let valid_player = OWNER();

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter tournament
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));

    // Move to game start (after registration ends and after any gap)
    testing::set_block_timestamp(TEST_START_TIME().into());

    // Attempt to ban after game starts - should panic
    contracts.budokan.validate_entries(tournament.id, array![game_id].span());
}

#[test]
fn test_can_ban_during_staging_phase() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let valid_player = OWNER();
    let invalid_player = starknet::contract_address_const::<0x999>();

    // Create tournament with a gap between registration end and game start
    let registration_start_time = 1000;
    let registration_end_time = 2000;
    let tournament_start_time = 3000; // Gap of 1000 between registration end and game start
    let tournament_end_time = 4000;

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
            OWNER(),
            test_metadata(),
            schedule,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter tournament during registration period
    testing::set_block_timestamp(registration_start_time);
    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));

    // Transfer to invalid player (who doesn't meet entry requirements)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    denshokan_erc721.transfer_from(valid_player, invalid_player, game_id.into());

    // Move to staging phase (after registration ends but before game starts)
    testing::set_block_timestamp(registration_end_time);

    // Verify we're in staging phase
    assert!(
        contracts.budokan.current_phase(tournament.id) == Phase::Staging,
        "Tournament should be in Staging phase",
    );

    // Banning should succeed during staging phase
    contracts.budokan.validate_entries(tournament.id, array![game_id].span());

    // Verify game ID is now banned
    let registration_banned = contracts
        .budokan
        .get_registration_banned(contracts.minigame.contract_address, game_id);
    assert!(registration_banned.is_banned, "Registration should be banned during staging phase");
}

#[test]
#[should_panic(
    expected: (
        "Tournament: Can only ban tournaments with registration period set", 'ENTRYPOINT_FAILED',
    ),
)]
fn test_ban_without_registration_period() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let valid_player = OWNER();

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
            OWNER(),
            test_metadata(),
            schedule_without_registration,
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter tournament (no registration period, so can enter anytime before game starts)
    let before_game_start = TEST_START_TIME() - 100;
    testing::set_block_timestamp(before_game_start.into());

    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));

    // Attempt to ban without registration period - should panic
    contracts.budokan.validate_entries(tournament.id, array![game_id].span());
}

#[test]
fn test_ban_multiple_game_ids() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let valid_player = OWNER();
    let invalid_player = starknet::contract_address_const::<0x999>();

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter multiple players
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id_1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));
    let (game_id_2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', valid_player, Option::Some(qualification));
    let (game_id_3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', valid_player, Option::Some(qualification));

    // Transfer game_id_1 and game_id_3 to invalid player
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    denshokan_erc721.transfer_from(valid_player, invalid_player, game_id_1.into());
    denshokan_erc721.transfer_from(valid_player, invalid_player, game_id_3.into());

    // Ban multiple game IDs at once
    contracts
        .budokan
        .validate_entries(tournament.id, array![game_id_1, game_id_2, game_id_3].span());

    // Verify correct IDs are banned
    let reg_banned_1 = contracts.budokan.get_registration_banned(contracts.minigame.contract_address, game_id_1);
    let reg_banned_2 = contracts.budokan.get_registration_banned(contracts.minigame.contract_address, game_id_2);
    let reg_banned_3 = contracts.budokan.get_registration_banned(contracts.minigame.contract_address, game_id_3);

    assert!(
        reg_banned_1.is_banned, "Registration 1 should be banned - owner doesn't have qualifying token",
    );
    assert!(!reg_banned_2.is_banned, "Registration 2 should not be banned");
    assert!(reg_banned_3.is_banned, "Registration 3 should be banned");
}

#[test]
#[should_panic(expected: ("Tournament: Game ID is already banned", 'ENTRYPOINT_FAILED'))]
fn test_cannot_ban_already_banned_game_id() {
    let contracts = setup();
    utils::impersonate(OWNER());

    let valid_player = OWNER();
    let invalid_player = starknet::contract_address_const::<0x999>();

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
            OWNER(),
            test_metadata(),
            test_schedule(),
            test_game_config(contracts.minigame.contract_address),
            Option::None,
            Option::Some(entry_requirement),
            false,
            "",
        );

    // Enter tournament
    testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());
    let qualification = QualificationProof::Extension(extension_config.config);
    let (game_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', valid_player, Option::Some(qualification));

    // Transfer game token to invalid player (who doesn't own the qualifying token)
    let denshokan_erc721 = IERC721Dispatcher {
        contract_address: contracts.denshokan.contract_address,
    };
    denshokan_erc721.transfer_from(valid_player, invalid_player, game_id.into());

    // Ban the game ID for the first time
    contracts.budokan.validate_entries(tournament.id, array![game_id].span());

    // Verify game ID is banned
    let registration_banned = contracts
        .budokan
        .get_registration_banned(contracts.minigame.contract_address, game_id);
    assert!(registration_banned.is_banned, "Game ID should be banned");

    // Attempt to ban the same game ID again - should panic
    contracts.budokan.validate_entries(tournament.id, array![game_id].span());
}
