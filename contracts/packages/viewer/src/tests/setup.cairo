use budokan::budokan::Budokan::{
    IBudokanRewardsAdminDispatcher, IBudokanRewardsAdminDispatcherTrait,
};
use budokan_interfaces::budokan::IBudokanDispatcher;
use budokan_interfaces::viewer::IBudokanViewerDispatcher;
use core::serde::Serde;
use game_components_embeddable_game_standard::minigame::interface::IMinigameDispatcher;
use game_components_embeddable_game_standard::registry::interface::IMinigameRegistryDispatcher;
use game_components_embeddable_game_standard::token::interface::IMinigameTokenMixinDispatcher;
use game_components_interfaces::prize::IPrizeDispatcher;
use game_components_interfaces::registration::IRegistrationDispatcher;
use game_components_test_common::mocks::minigame_mock::{
    IMinigameMockDispatcher, IMinigameMockDispatcherTrait, IMinigameMockInitDispatcher,
    IMinigameMockInitDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// ================================================================================================
// CONSTANTS
// ================================================================================================

pub const OWNER: ContractAddress = 'OWNER'.try_into().unwrap();
pub const PLAYER1: ContractAddress = 'PLAYER1'.try_into().unwrap();
pub const PLAYER2: ContractAddress = 'PLAYER2'.try_into().unwrap();

pub fn OWNER_ADDR() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

pub fn GAME_CREATOR_ADDR() -> ContractAddress {
    'GAME_CREATOR'.try_into().unwrap()
}

// ================================================================================================
// TEST CONTRACTS
// ================================================================================================

#[derive(Drop)]
pub struct ViewerTestContracts {
    pub viewer: IBudokanViewerDispatcher,
    pub budokan: IBudokanDispatcher,
    pub prize: IPrizeDispatcher,
    pub registration: IRegistrationDispatcher,
    pub minigame: IMinigameMockDispatcher,
    pub denshokan: IMinigameTokenMixinDispatcher,
}

// ================================================================================================
// DEPLOYMENT HELPERS
// ================================================================================================

fn deploy_mock_game() -> (
    IMinigameDispatcher, IMinigameMockInitDispatcher, IMinigameMockDispatcher,
) {
    let contract_class = declare("minigame_mock")
        .expect('declare minigame failed')
        .contract_class();
    let (contract_address, _) = contract_class.deploy(@array![]).expect('deploy minigame failed');

    (
        IMinigameDispatcher { contract_address },
        IMinigameMockInitDispatcher { contract_address },
        IMinigameMockDispatcher { contract_address },
    )
}

fn deploy_minigame_registry() -> IMinigameRegistryDispatcher {
    let mut calldata = array![];
    let name: ByteArray = "TestGame";
    let symbol: ByteArray = "TT";
    let base_uri: ByteArray = "https://test.com/";
    name.serialize(ref calldata);
    symbol.serialize(ref calldata);
    base_uri.serialize(ref calldata);
    // event_relayer_address: None
    1_felt252.serialize(ref calldata);

    let contract_class = declare("MinigameRegistryContract")
        .expect('declare registry failed')
        .contract_class();
    let (contract_address, _) = contract_class.deploy(@calldata).expect('deploy registry failed');

    IMinigameRegistryDispatcher { contract_address }
}

fn deploy_token_contract(
    game_registry_address: ContractAddress,
) -> (IMinigameTokenMixinDispatcher, ContractAddress) {
    let mut calldata: Array<felt252> = array![];

    let name: ByteArray = "TestToken";
    let symbol: ByteArray = "TT";
    let base_uri: ByteArray = "https://test.com/";

    name.serialize(ref calldata);
    symbol.serialize(ref calldata);
    base_uri.serialize(ref calldata);
    OWNER_ADDR().serialize(ref calldata); // owner
    OWNER_ADDR().serialize(ref calldata); // royalty_receiver
    0_u128.serialize(ref calldata); // royalty_fraction
    Option::Some(game_registry_address).serialize(ref calldata);

    let contract_class = declare("FullTokenContract")
        .expect('declare token failed')
        .contract_class();
    let (contract_address, _) = contract_class.deploy(@calldata).expect('deploy token failed');

    (IMinigameTokenMixinDispatcher { contract_address }, contract_address)
}

fn deploy_budokan(denshokan_address: ContractAddress) -> ContractAddress {
    let mut calldata: Array<felt252> = array![];
    OWNER.serialize(ref calldata);
    denshokan_address.serialize(ref calldata);

    let contract_class = declare("Budokan").expect('declare budokan failed').contract_class();
    let (contract_address, _) = contract_class.deploy(@calldata).expect('deploy budokan failed');

    // Register BudokanRewards library class so add_prize / claim_reward dispatch works.
    let rewards_class = declare("BudokanRewards")
        .expect('declare rewards failed')
        .contract_class();
    let admin = IBudokanRewardsAdminDispatcher { contract_address };
    start_cheat_caller_address(contract_address, OWNER);
    admin.set_rewards_class_hash(*rewards_class.class_hash);
    stop_cheat_caller_address(contract_address);

    contract_address
}

fn deploy_viewer(budokan_address: ContractAddress) -> ContractAddress {
    let mut calldata: Array<felt252> = array![];
    OWNER.serialize(ref calldata);
    budokan_address.serialize(ref calldata);

    let contract_class = declare("BudokanViewer").expect('declare viewer failed').contract_class();
    let (contract_address, _) = contract_class.deploy(@calldata).expect('deploy viewer failed');
    contract_address
}

// ================================================================================================
// SETUP
// ================================================================================================

pub fn setup() -> ViewerTestContracts {
    // 1. Deploy Denshokan stack (game token ecosystem)
    let (_, minigame_init_dispatcher, minigame_mock_dispatcher) = deploy_mock_game();
    let registry = deploy_minigame_registry();
    let (token_dispatcher, _) = deploy_token_contract(registry.contract_address);

    minigame_init_dispatcher
        .initializer(
            GAME_CREATOR_ADDR(),
            "TestGame",
            "TestGame",
            "TestDev",
            "TestPub",
            "Genre",
            "Image",
            Option::None,
            Option::None,
            Option::None,
            Option::Some(minigame_mock_dispatcher.contract_address),
            Option::Some(minigame_mock_dispatcher.contract_address),
            token_dispatcher.contract_address,
            Option::None,
        );

    // 2. Deploy Budokan
    let budokan_address = deploy_budokan(token_dispatcher.contract_address);

    // 3. Create game settings
    snforge_std::start_cheat_caller_address(minigame_mock_dispatcher.contract_address, OWNER);
    minigame_mock_dispatcher.create_settings_difficulty("test_settings", "test_settings", 1);
    snforge_std::stop_cheat_caller_address(minigame_mock_dispatcher.contract_address);

    // 4. Deploy viewer
    let viewer_address = deploy_viewer(budokan_address);

    ViewerTestContracts {
        viewer: IBudokanViewerDispatcher { contract_address: viewer_address },
        budokan: IBudokanDispatcher { contract_address: budokan_address },
        prize: IPrizeDispatcher { contract_address: budokan_address },
        registration: IRegistrationDispatcher { contract_address: budokan_address },
        minigame: minigame_mock_dispatcher,
        denshokan: token_dispatcher,
    }
}
