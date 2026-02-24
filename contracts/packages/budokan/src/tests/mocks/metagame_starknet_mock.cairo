// Copied from game_components_embeddable_game_standard::token::tests::mocks::metagame_starknet_mock
// (no longer exported from game_components_test_common)

use starknet::ContractAddress;

#[starknet::interface]
pub trait IMetagameStarknetMock<TContractState> {
    fn mint_game(
        ref self: TContractState,
        game_address: Option<ContractAddress>,
        player_name: Option<felt252>,
        settings_id: Option<u32>,
        start: Option<u64>,
        end: Option<u64>,
        objective_id: Option<u32>,
        client_url: Option<ByteArray>,
        renderer_address: Option<ContractAddress>,
        to: ContractAddress,
        soulbound: bool,
        paymaster: bool,
        salt: u16,
        metadata: u16,
    ) -> felt252;
}

#[starknet::interface]
pub trait IMetagameStarknetMockInit<TContractState> {
    fn initializer(
        ref self: TContractState,
        context_address: Option<ContractAddress>,
        minigame_token_address: ContractAddress,
        supports_context: bool,
    );
}

#[starknet::contract]
pub mod metagame_starknet_mock {
    use game_components_embeddable_game_standard::metagame::extensions::callback::callback::MetagameCallbackComponent;
    use game_components_embeddable_game_standard::metagame::extensions::context::context::ContextComponent;
    use game_components_embeddable_game_standard::metagame::extensions::context::interface::{
        IMetagameContext, IMetagameContextDetails,
    };
    use game_components_embeddable_game_standard::metagame::extensions::context::structs::{
        GameContext, GameContextDetails,
    };
    use game_components_embeddable_game_standard::metagame::metagame::MetagameComponent;
    use game_components_embeddable_game_standard::metagame::metagame::MetagameComponent::InternalTrait as MetagameInternalTrait;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    component!(path: MetagameComponent, storage: metagame, event: MetagameEvent);
    component!(path: ContextComponent, storage: context, event: ContextEvent);
    component!(path: MetagameCallbackComponent, storage: callback, event: CallbackEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    impl CallbackHooksImpl of MetagameCallbackComponent::MetagameCallbackHooksTrait<ContractState> {
        fn on_game_action(ref self: ContractState, token_id: u256, score: u64) {
            self.cb_game_action_count.write(self.cb_game_action_count.read() + 1);
            self.cb_last_token_id.write(token_id);
            self.cb_last_score.write(score);
        }

        fn on_game_over(ref self: ContractState, token_id: u256, final_score: u64) {
            self.cb_game_over_count.write(self.cb_game_over_count.read() + 1);
            self.cb_last_token_id.write(token_id);
            self.cb_last_score.write(final_score);
        }

        fn on_objective_complete(ref self: ContractState, token_id: u256) {
            self.cb_objective_complete_count.write(self.cb_objective_complete_count.read() + 1);
            self.cb_last_token_id.write(token_id);
        }
    }

    #[abi(embed_v0)]
    impl MetagameImpl = MetagameComponent::MetagameImpl<ContractState>;
    impl MetagameInternalImpl = MetagameComponent::InternalImpl<ContractState>;
    impl ContextInternalImpl = ContextComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl MetagameCallbackImpl =
        MetagameCallbackComponent::MetagameCallbackImpl<ContractState>;
    impl CallbackInternalImpl = MetagameCallbackComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        metagame: MetagameComponent::Storage,
        #[substorage(v0)]
        context: ContextComponent::Storage,
        #[substorage(v0)]
        callback: MetagameCallbackComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        token_counter: u64,
        token_context_count: Map<felt252, u32>,
        token_context_name: Map<(felt252, u32), ByteArray>,
        token_context_value: Map<(felt252, u32), ByteArray>,
        token_context_exists: Map<felt252, bool>,
        cb_game_action_count: u32,
        cb_game_over_count: u32,
        cb_objective_complete_count: u32,
        cb_last_token_id: u256,
        cb_last_score: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        MetagameEvent: MetagameComponent::Event,
        #[flat]
        ContextEvent: ContextComponent::Event,
        #[flat]
        CallbackEvent: MetagameCallbackComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[abi(embed_v0)]
    impl MetagameContextImpl of IMetagameContext<ContractState> {
        fn has_context(self: @ContractState, token_id: felt252) -> bool {
            self.token_context_exists.read(token_id)
        }
    }

    #[abi(embed_v0)]
    impl MetagameContextDetailsImpl of IMetagameContextDetails<ContractState> {
        fn context_details(self: @ContractState, token_id: felt252) -> GameContextDetails {
            let context_count = self.token_context_count.read(token_id);
            let mut contexts = array![];

            let mut i = 0;
            while i < context_count {
                let context_name = self.token_context_name.read((token_id, i));
                let context_value = self.token_context_value.read((token_id, i));

                let game_context = GameContext { name: context_name, value: context_value };
                contexts.append(game_context);
                i += 1;
            }

            GameContextDetails {
                name: "Test Game Context",
                description: "Test context for testing",
                id: Option::None,
                context: contexts.span(),
            }
        }
    }

    #[abi(embed_v0)]
    impl MetagameMockImpl of super::IMetagameStarknetMock<ContractState> {
        fn mint_game(
            ref self: ContractState,
            game_address: Option<ContractAddress>,
            player_name: Option<felt252>,
            settings_id: Option<u32>,
            start: Option<u64>,
            end: Option<u64>,
            objective_id: Option<u32>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            to: ContractAddress,
            soulbound: bool,
            paymaster: bool,
            salt: u16,
            metadata: u16,
        ) -> felt252 {
            let context = array![GameContext { name: "Test Context 1", value: "Test Context" }]
                .span();
            let context_details = GameContextDetails {
                name: "Test App",
                description: "Test App Description",
                id: Option::None,
                context: context,
            };
            let token_id = self
                .metagame
                .mint(
                    game_address,
                    player_name,
                    settings_id,
                    start,
                    end,
                    objective_id,
                    Option::Some(context_details),
                    client_url,
                    renderer_address,
                    to,
                    soulbound,
                    paymaster,
                    salt,
                    metadata,
                );

            self.token_context_count.write(token_id, 1);
            self.token_context_name.write((token_id, 0), "Test Context 1");
            self.token_context_value.write((token_id, 0), "Test Context");
            self.token_context_exists.write(token_id, true);

            token_id
        }
    }

    #[abi(embed_v0)]
    impl MetagameInitializerImpl of super::IMetagameStarknetMockInit<ContractState> {
        fn initializer(
            ref self: ContractState,
            context_address: Option<ContractAddress>,
            minigame_token_address: ContractAddress,
            supports_context: bool,
        ) {
            self.metagame.initializer(context_address, minigame_token_address);
            self.token_counter.write(0);

            if supports_context {
                self.context.initializer();
            }

            self.callback.initializer();
        }
    }
}
