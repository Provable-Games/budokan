// SPDX-License-Identifier: UNLICENSED

use core::serde::Serde;
use game_components_minigame::interface::IMinigameDispatcher;
use game_components_test_starknet::minigame::mocks::minigame_starknet_mock::{
    IMinigameStarknetMockDispatcher, IMinigameStarknetMockInitDispatcher,
    IMinigameStarknetMockInitDispatcherTrait,
};
use game_components_token::examples::minigame_registry_contract::IMinigameRegistryDispatcher;
use game_components_token::interface::IMinigameTokenMixinDispatcher;
use openzeppelin_interfaces::erc721::ERC721ABIDispatcher;
use openzeppelin_interfaces::introspection::ISRC5Dispatcher;
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use starknet::ContractAddress;

// Test address functions - using try_into().unwrap() pattern instead of const
pub fn OWNER_ADDR() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

pub fn PLAYER_ADDR() -> ContractAddress {
    'PLAYER'.try_into().unwrap()
}

pub fn GAME_CREATOR_ADDR() -> ContractAddress {
    'GAME_CREATOR'.try_into().unwrap()
}

#[derive(Drop)]
pub struct TestContracts {
    pub denshokan: IMinigameTokenMixinDispatcher,
    pub minigame_mock: IMinigameStarknetMockDispatcher,
}

//
// Setup
//

pub fn deploy_mock_game() -> (
    IMinigameDispatcher, IMinigameStarknetMockInitDispatcher, IMinigameStarknetMockDispatcher,
) {
    let contract_class = declare("minigame_starknet_mock")
        .expect('declare minigame failed')
        .contract_class();
    let (contract_address, _) = contract_class.deploy(@array![]).expect('deploy minigame failed');

    let minigame_dispatcher = IMinigameDispatcher { contract_address };
    let minigame_init_dispatcher = IMinigameStarknetMockInitDispatcher { contract_address };
    let minigame_mock_dispatcher = IMinigameStarknetMockDispatcher { contract_address };
    (minigame_dispatcher, minigame_init_dispatcher, minigame_mock_dispatcher)
}


pub fn deploy_minigame_registry_contract_with_params(
    name: ByteArray,
    symbol: ByteArray,
    base_uri: ByteArray,
    event_relayer_address: Option<ContractAddress>,
) -> IMinigameRegistryDispatcher {
    let mut constructor_calldata = array![];
    name.serialize(ref constructor_calldata);
    symbol.serialize(ref constructor_calldata);
    base_uri.serialize(ref constructor_calldata);

    // Serialize event_relayer_address Option manually
    match event_relayer_address {
        Option::Some(addr) => {
            constructor_calldata.append(0); // Some variant
            constructor_calldata.append(addr.into());
        },
        Option::None => {
            constructor_calldata.append(1); // None variant
        },
    }

    let contract_class = declare("MinigameRegistryContract")
        .expect('declare registry failed')
        .contract_class();
    let (contract_address, _) = contract_class
        .deploy(@constructor_calldata)
        .expect('deploy registry failed');

    let minigame_registry_dispatcher = IMinigameRegistryDispatcher { contract_address };
    minigame_registry_dispatcher
}

pub fn deploy_optimized_token_contract(
    name: Option<ByteArray>,
    symbol: Option<ByteArray>,
    base_uri: Option<ByteArray>,
    game_registry_address: Option<ContractAddress>,
    event_relayer_address: Option<ContractAddress>,
) -> (IMinigameTokenMixinDispatcher, ERC721ABIDispatcher, ISRC5Dispatcher, ContractAddress) {
    let mut constructor_calldata: Array<felt252> = array![];

    // Set default values if not provided
    let token_name: ByteArray = match name {
        Option::Some(n) => n,
        Option::None => "TestToken",
    };

    let token_symbol: ByteArray = match symbol {
        Option::Some(s) => s,
        Option::None => "TT",
    };

    let token_base_uri: ByteArray = match base_uri {
        Option::Some(uri) => uri,
        Option::None => "https://test.com/",
    };

    // Serialize basic parameters
    token_name.serialize(ref constructor_calldata);
    token_symbol.serialize(ref constructor_calldata);
    token_base_uri.serialize(ref constructor_calldata);

    // Royalty info - ContractAddress and u128 directly
    // Use OWNER_ADDR() as royalty receiver since zero address is rejected
    OWNER_ADDR().serialize(ref constructor_calldata); // royalty_receiver
    0_u128.serialize(ref constructor_calldata); // royalty_fraction (0 = no royalties)

    // Serialize game_registry_address Option manually
    // (matching game_components serialization format)
    match game_registry_address {
        Option::Some(addr) => {
            constructor_calldata.append(0); // Some variant
            constructor_calldata.append(addr.into());
        },
        Option::None => {
            constructor_calldata.append(1); // None variant
        },
    }

    // Serialize event_relayer_address Option manually
    match event_relayer_address {
        Option::Some(addr) => {
            constructor_calldata.append(0); // Some variant
            constructor_calldata.append(addr.into());
        },
        Option::None => {
            constructor_calldata.append(1); // None variant
        },
    }

    let contract_class = declare("FullTokenContract")
        .expect('declare token failed')
        .contract_class();
    let (contract_address, _) = contract_class
        .deploy(@constructor_calldata)
        .expect('deploy token failed');

    let token_dispatcher = IMinigameTokenMixinDispatcher { contract_address };
    let erc721_dispatcher = ERC721ABIDispatcher { contract_address };
    let src5_dispatcher = ISRC5Dispatcher { contract_address };

    (token_dispatcher, erc721_dispatcher, src5_dispatcher, contract_address)
}


pub fn setup() -> TestContracts {
    let (_, minigame_init_dispatcher, minigame_mock_dispatcher) = deploy_mock_game();

    let minigame_registry_dispatcher = deploy_minigame_registry_contract_with_params(
        "TestGame", "TT", "https://test.com/", Option::None,
    );

    let (token_dispatcher, _erc721_dispatcher, _src5_dispatcher, _contract_address) =
        deploy_optimized_token_contract(
        Option::None,
        Option::None,
        Option::None,
        Option::Some(minigame_registry_dispatcher.contract_address),
        Option::None,
    );

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
        );

    TestContracts { denshokan: token_dispatcher, minigame_mock: minigame_mock_dispatcher }
}
