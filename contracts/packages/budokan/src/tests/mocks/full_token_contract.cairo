// Copied from game_components_embeddable_game_standard::token::tests::examples::full_token_contract
// (no longer exported from game_components_test_common)
// crate:: paths replaced with game_components_embeddable_game_standard::

use game_components_embeddable_game_standard::metagame::extensions::context::structs::GameContextDetails;
use game_components_embeddable_game_standard::minigame::extensions::settings::structs::GameSettingDetails;
use game_components_embeddable_game_standard::minigame::interface::{
    IMinigameDispatcher, IMinigameDispatcherTrait,
};
use game_components_embeddable_game_standard::minigame::structs::GameDetail;
use game_components_embeddable_game_standard::registry::interface::{
    IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
};
use game_components_embeddable_game_standard::token::core::core_token::CoreTokenComponent;
use game_components_embeddable_game_standard::token::extensions::context::context::ContextComponent;
use game_components_embeddable_game_standard::token::extensions::minter::minter::MinterComponent;
use game_components_embeddable_game_standard::token::extensions::objectives::objectives::ObjectivesComponent;
use game_components_embeddable_game_standard::token::extensions::renderer::renderer::RendererComponent;
use game_components_embeddable_game_standard::token::extensions::settings::settings::SettingsComponent;
use game_components_embeddable_game_standard::token::structs::TokenMetadata;
use game_components_utilities::utils::renderer::{create_custom_metadata, create_default_svg};
use openzeppelin_interfaces::erc2981::IERC2981;
use openzeppelin_interfaces::erc721::IERC721Metadata;
use openzeppelin_introspection::src5::SRC5Component;
use openzeppelin_token::common::erc2981::erc2981::{DefaultConfig, ERC2981Component};
use openzeppelin_token::erc721::ERC721Component;
use starknet::ContractAddress;
use starknet::storage::StoragePointerReadAccess;
use starknet::syscalls::call_contract_syscall;


#[starknet::contract]
pub mod FullTokenContract {
    use core::num::traits::Zero;
    use super::*;

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: ERC2981Component, storage: erc2981, event: ERC2981Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: CoreTokenComponent, storage: core_token, event: CoreTokenEvent);
    component!(path: MinterComponent, storage: minter, event: MinterEvent);
    component!(path: ObjectivesComponent, storage: objectives, event: ObjectivesEvent);
    component!(path: SettingsComponent, storage: settings, event: SettingsEvent);
    component!(path: ContextComponent, storage: context, event: ContextEvent);
    component!(path: RendererComponent, storage: renderer, event: RendererEvent);

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        erc2981: ERC2981Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        core_token: CoreTokenComponent::Storage,
        #[substorage(v0)]
        minter: MinterComponent::Storage,
        #[substorage(v0)]
        objectives: ObjectivesComponent::Storage,
        #[substorage(v0)]
        settings: SettingsComponent::Storage,
        #[substorage(v0)]
        context: ContextComponent::Storage,
        #[substorage(v0)]
        renderer: RendererComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC721Event: ERC721Component::Event,
        #[flat]
        ERC2981Event: ERC2981Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        CoreTokenEvent: CoreTokenComponent::Event,
        #[flat]
        MinterEvent: MinterComponent::Event,
        #[flat]
        ObjectivesEvent: ObjectivesComponent::Event,
        #[flat]
        SettingsEvent: SettingsComponent::Event,
        #[flat]
        ContextEvent: ContextComponent::Event,
        #[flat]
        RendererEvent: RendererComponent::Event,
    }

    #[abi(embed_v0)]
    impl ERC721Impl = ERC721Component::ERC721Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC2981InfoImpl = ERC2981Component::ERC2981InfoImpl<ContractState>;
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    #[abi(embed_v0)]
    impl CoreTokenImpl = CoreTokenComponent::CoreTokenImpl<ContractState>;

    #[abi(embed_v0)]
    impl ERC2981Impl of IERC2981<ContractState> {
        fn royalty_info(
            self: @ContractState, token_id: u256, sale_price: u256,
        ) -> (ContractAddress, u256) {
            let token_id_felt: felt252 = token_id.try_into().unwrap();
            let metadata = self.core_token.token_metadata(token_id_felt);
            let game_registry_address = self.core_token.game_registry_address();

            let (royalty_fraction, receiver) = if !game_registry_address.is_zero()
                && metadata.game_id != 0 {
                let registry = IMinigameRegistryDispatcher {
                    contract_address: game_registry_address,
                };
                let game_metadata = registry.game_metadata(metadata.game_id.into());
                let fraction = game_metadata.royalty_fraction;

                let owner_of_selector = selector!("owner_of");
                let mut calldata = array![];
                let game_id_u256: u256 = metadata.game_id.into();
                calldata.append(game_id_u256.low.into());
                calldata.append(game_id_u256.high.into());

                let owner =
                    match call_contract_syscall(
                        game_registry_address, owner_of_selector, calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<ContractAddress>::deserialize(ref result_span) {
                            Option::Some(addr) => addr,
                            Option::None => 0.try_into().unwrap(),
                        }
                    },
                    Result::Err(_) => 0.try_into().unwrap(),
                };

                (fraction, owner)
            } else {
                let (receiver, _, fraction) = self.erc2981.default_royalty();
                (fraction, receiver)
            };

            let royalty_amount = if royalty_fraction > 0 && !receiver.is_zero() {
                (sale_price * royalty_fraction.into()) / 10000
            } else {
                0
            };

            (receiver, royalty_amount)
        }
    }

    #[abi(embed_v0)]
    impl MinterImpl = MinterComponent::MinterImpl<ContractState>;
    #[abi(embed_v0)]
    impl ObjectivesImpl = ObjectivesComponent::ObjectivesImpl<ContractState>;
    #[abi(embed_v0)]
    impl SettingsImpl = SettingsComponent::SettingsImpl<ContractState>;
    #[abi(embed_v0)]
    impl RendererImpl = RendererComponent::RendererImpl<ContractState>;

    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;
    impl ERC2981InternalImpl = ERC2981Component::InternalImpl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;
    impl CoreTokenInternalImpl = CoreTokenComponent::InternalImpl<ContractState>;
    impl MinterInternalImpl = MinterComponent::InternalImpl<ContractState>;
    impl ObjectivesInternalImpl = ObjectivesComponent::InternalImpl<ContractState>;
    impl SettingsInternalImpl = SettingsComponent::InternalImpl<ContractState>;
    impl ContextInternalImpl = ContextComponent::InternalImpl<ContractState>;
    impl RendererInternalImpl = RendererComponent::InternalImpl<ContractState>;

    impl MinterOptionalImpl = MinterComponent::MinterOptionalImpl<ContractState>;
    impl ObjectivesOptionalImpl = ObjectivesComponent::ObjectivesOptionalImpl<ContractState>;
    impl SettingsOptionalImpl = SettingsComponent::SettingsOptionalImpl<ContractState>;
    impl ContextOptionalImpl = ContextComponent::ContextOptionalImpl<ContractState>;
    impl RendererOptionalImpl = RendererComponent::RendererOptionalImpl<ContractState>;

    #[abi(embed_v0)]
    impl ERC721Metadata of IERC721Metadata<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_name.read()
        }

        fn symbol(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_symbol.read()
        }

        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            self.erc721._require_owned(token_id);

            let token_metadata: TokenMetadata = self
                .core_token
                .token_metadata(token_id.try_into().unwrap());

            if token_metadata.game_id != 0 {
                let game_registry_address = self.core_token.game_registry_address();
                let game_registry_dispatcher = IMinigameRegistryDispatcher {
                    contract_address: game_registry_address,
                };
                let game_metadata = game_registry_dispatcher.game_metadata(token_metadata.game_id);
                let game_address = game_metadata.contract_address;
                let renderer_address = self
                    .core_token
                    .renderer_address(token_id.try_into().unwrap());
                let player_name = self.core_token.player_name(token_id.try_into().unwrap());
                let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
                let settings_address = game_dispatcher.settings_address();

                let score_selector = selector!("score");
                let token_name_selector = selector!("token_name");
                let token_description_selector = selector!("token_description");
                let game_details_svg_selector = selector!("game_details_svg");
                let game_details_selector = selector!("game_details");
                let settings_details_selector = selector!("settings_details");
                let context_details_selector = selector!("context_details");

                let mut token_calldata = array![];
                token_calldata.append(token_id.low.into());

                let score =
                    match call_contract_syscall(
                        game_address, score_selector, token_calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<u64>::deserialize(ref result_span) {
                            Option::Some(score) => score,
                            Option::None => 0,
                        }
                    },
                    Result::Err(_) => 0,
                };

                let token_name =
                    match call_contract_syscall(
                        renderer_address, token_name_selector, token_calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<ByteArray>::deserialize(ref result_span) {
                            Option::Some(token_name) => token_name,
                            Option::None => game_metadata.name.clone(),
                        }
                    },
                    Result::Err(_) => game_metadata.name.clone(),
                };

                let token_description =
                    match call_contract_syscall(
                        renderer_address, token_description_selector, token_calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<ByteArray>::deserialize(ref result_span) {
                            Option::Some(token_description) => token_description,
                            Option::None => "An NFT representing ownership of an embeddable game.",
                        }
                    },
                    Result::Err(_) => "An NFT representing ownership of an embeddable game.",
                };

                let game_details_svg =
                    match call_contract_syscall(
                        renderer_address, game_details_svg_selector, token_calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<ByteArray>::deserialize(ref result_span) {
                            Option::Some(game_details_svg) => game_details_svg,
                            Option::None => create_default_svg(
                                token_id.try_into().unwrap(),
                                game_metadata.clone(),
                                score,
                                player_name,
                            ),
                        }
                    },
                    Result::Err(_) => create_default_svg(
                        token_id.try_into().unwrap(), game_metadata.clone(), score, player_name,
                    ),
                };

                let game_details =
                    match call_contract_syscall(
                        renderer_address, game_details_selector, token_calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<Span<GameDetail>>::deserialize(ref result_span) {
                            Option::Some(game_details) => game_details,
                            Option::None => array![].span(),
                        }
                    },
                    Result::Err(_) => array![].span(),
                };

                let mut settings_calldata = array![];
                settings_calldata.append(token_metadata.settings_id.into());

                let settings_details =
                    match call_contract_syscall(
                        settings_address, settings_details_selector, settings_calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<GameSettingDetails>::deserialize(ref result_span) {
                            Option::Some(settings_details) => settings_details,
                            Option::None => GameSettingDetails {
                                name: "", description: "", settings: array![].span(),
                            },
                        }
                    },
                    Result::Err(_) => GameSettingDetails {
                        name: "", description: "", settings: array![].span(),
                    },
                };

                let minted_by_address = self.minter.get_minter_address(token_metadata.minted_by);

                let context_details =
                    match call_contract_syscall(
                        minted_by_address, context_details_selector, token_calldata.span(),
                    ) {
                    Result::Ok(result) => {
                        let mut result_span = result;
                        match Serde::<GameContextDetails>::deserialize(ref result_span) {
                            Option::Some(settings_details) => settings_details,
                            Option::None => GameContextDetails {
                                name: "",
                                description: "",
                                id: Option::None,
                                context: array![].span(),
                            },
                        }
                    },
                    Result::Err(_) => GameContextDetails {
                        name: "", description: "", id: Option::None, context: array![].span(),
                    },
                };
                create_custom_metadata(
                    token_id.try_into().unwrap(),
                    token_name,
                    token_description,
                    game_metadata,
                    game_details_svg,
                    game_details,
                    settings_details,
                    context_details,
                    token_metadata,
                    score,
                    minted_by_address,
                    player_name,
                )
            } else {
                "https://denshokan.dev/game/1"
            }
        }
    }

    impl ERC721HooksImpl of ERC721Component::ERC721HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) {
            let current_owner = self._owner_of(token_id);
            if current_owner.into() != 0 && to.into() != 0 {
                let contract_state = self.get_contract();
                if contract_state.is_soulbound(token_id.try_into().unwrap()) {
                    panic!("Token is soulbound and cannot be transferred");
                }
            }
        }

        fn after_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) {}
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: ByteArray,
        symbol: ByteArray,
        base_uri: ByteArray,
        owner: ContractAddress,
        royalty_receiver: ContractAddress,
        royalty_fraction: u128,
        game_registry_address: Option<ContractAddress>,
    ) {
        self.erc721.initializer(name, symbol, base_uri);
        self.erc2981.initializer(royalty_receiver, royalty_fraction);
        self.core_token.initializer(Option::None, Option::None, game_registry_address);

        self.minter.initializer();
        self.objectives.initializer();
        self.settings.initializer();
        self.context.initializer();
        self.renderer.initializer();
    }
}
