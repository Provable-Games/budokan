#[dojo::contract]
mod BudokanEventRelayer {
    use budokan_event_relayer::constants::DEFAULT_NS;
    use budokan_event_relayer::models::PrizeType;
    use budokan_event_relayer::events::{
        LeaderboardUpdate, PrizeAdded, PrizeClaimed, ScoreSubmitted, TokenRegistered,
        TournamentCreated, TournamentRegistration,
    };
    use budokan_event_relayer::interfaces::IBudokanEventRelayer;
    use dojo::event::EventStorage;
    use openzeppelin_access::ownable::OwnableComponent;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    #[abi(embed_v0)]
    impl OwnableCamelOnlyImpl =
        OwnableComponent::OwnableCamelOnlyImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        budokan_address: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    fn dojo_init(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl BudokanEventRelayerImpl of IBudokanEventRelayer<ContractState> {
        fn emit_tournament_created(
            ref self: ContractState,
            tournament_id: u64,
            created_at: u64,
            created_by: ContractAddress,
            creator_token_id: u64,
            name: felt252,
            description: ByteArray,
            game_address: ContractAddress,
            settings_id: u32,
            prize_spots: u8,
            soulbound: bool,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world
                .emit_event(
                    @TournamentCreated {
                        tournament_id,
                        created_at,
                        created_by,
                        creator_token_id,
                        name,
                        description,
                        game_address,
                        settings_id,
                        prize_spots,
                        soulbound,
                    },
                );
        }

        fn emit_registration(
            ref self: ContractState,
            game_address: ContractAddress,
            game_token_id: u64,
            tournament_id: u64,
            entry_number: u32,
            is_banned: bool,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world
                .emit_event(
                    @TournamentRegistration {
                        game_address, game_token_id, tournament_id, entry_number, is_banned,
                    },
                );
        }

        fn emit_score_submitted(
            ref self: ContractState, tournament_id: u64, game_token_id: u64, position: u8,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@ScoreSubmitted { tournament_id, game_token_id, position });
        }

        fn emit_leaderboard_update(
            ref self: ContractState, tournament_id: u64, token_ids: Span<u64>,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@LeaderboardUpdate { tournament_id, token_ids });
        }

        fn emit_prize_added(
            ref self: ContractState,
            prize_id: u64,
            tournament_id: u64,
            token_address: ContractAddress,
            payout_position: u8,
            sponsor_address: ContractAddress,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world
                .emit_event(
                    @PrizeAdded {
                        prize_id, tournament_id, token_address, payout_position, sponsor_address,
                    },
                );
        }

        fn emit_prize_claimed(ref self: ContractState, tournament_id: u64, prize_type: PrizeType) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@PrizeClaimed { tournament_id, prize_type });
        }

        fn emit_token_registered(
            ref self: ContractState,
            token_address: ContractAddress,
            name: ByteArray,
            symbol: ByteArray,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@TokenRegistered { token_address, name, symbol });
        }
    }

    #[abi(embed_v0)]
    impl BudokanEventRelayerAdminImpl of super::IBudokanEventRelayerAdmin<ContractState> {
        fn set_budokan_address(ref self: ContractState, budokan_address: ContractAddress) {
            self.ownable.assert_only_owner();
            self.budokan_address.write(budokan_address);
        }

        fn get_budokan_address(self: @ContractState) -> ContractAddress {
            self.budokan_address.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_only_budokan(ref self: ContractState) {
            let caller = get_caller_address();
            let budokan_address = self.budokan_address.read();
            assert!(budokan_address == caller, "Only Budokan can call this function");
        }
    }
}

#[starknet::interface]
pub trait IBudokanEventRelayerAdmin<TState> {
    fn set_budokan_address(ref self: TState, budokan_address: ContractAddress);
    fn get_budokan_address(self: @TState) -> ContractAddress;
}
use starknet::ContractAddress;
