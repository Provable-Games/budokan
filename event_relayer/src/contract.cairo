// SPDX-License-Identifier: BUSL-1.1

#[dojo::contract]
mod BudokanEventRelayer {
    use budokan_event_relayer::constants::DEFAULT_NS;
    use budokan_event_relayer::events::{
        EntryCount, Leaderboard, PlatformMetrics, Prize, PrizeMetrics, QualificationEntries,
        Registration, RewardClaim, Tournament,
    };
    use budokan_event_relayer::interfaces::IBudokanEventRelayer;
    use budokan_event_relayer::models::{
        EntryFee, EntryRequirement, GameConfig, Metadata, QualificationProof, RewardType, Schedule,
        TokenTypeData,
    };
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
        // ============ Tournament Events ============

        fn emit_tournament(
            ref self: ContractState,
            id: u64,
            created_at: u64,
            created_by: ContractAddress,
            creator_token_id: u64,
            metadata: Metadata,
            schedule: Schedule,
            game_config: GameConfig,
            entry_fee: Option<EntryFee>,
            entry_requirement: Option<EntryRequirement>,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world
                .emit_event(
                    @Tournament {
                        id,
                        created_at,
                        created_by,
                        creator_token_id,
                        metadata,
                        schedule,
                        game_config,
                        entry_fee,
                        entry_requirement,
                    },
                );
        }

        // ============ Registration Events ============

        fn emit_registration(
            ref self: ContractState,
            game_address: ContractAddress,
            game_token_id: u64,
            tournament_id: u64,
            entry_number: u32,
            has_submitted: bool,
            is_banned: bool,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world
                .emit_event(
                    @Registration {
                        game_address,
                        game_token_id,
                        tournament_id,
                        entry_number,
                        has_submitted,
                        is_banned,
                    },
                );
        }

        fn emit_qualification_entries(
            ref self: ContractState,
            tournament_id: u64,
            qualification_proof: QualificationProof,
            entry_count: u32,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world
                .emit_event(
                    @QualificationEntries { tournament_id, qualification_proof, entry_count },
                );
        }

        // ============ Leaderboard Events ============

        fn emit_leaderboard(ref self: ContractState, tournament_id: u64, token_ids: Span<u64>) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@Leaderboard { tournament_id, token_ids });
        }

        // ============ Prize Events ============

        fn emit_prize(
            ref self: ContractState,
            id: u64,
            tournament_id: u64,
            payout_position: u32,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            sponsor_address: ContractAddress,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world
                .emit_event(
                    @Prize {
                        id,
                        tournament_id,
                        payout_position,
                        token_address,
                        token_type,
                        sponsor_address,
                    },
                );
        }

        fn emit_reward_claim(
            ref self: ContractState, tournament_id: u64, reward_type: RewardType, claimed: bool,
        ) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@RewardClaim { tournament_id, reward_type, claimed });
        }

        // ============ Metrics Events ============

        fn emit_platform_metrics(ref self: ContractState, key: felt252, total_tournaments: u64) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@PlatformMetrics { key, total_tournaments });
        }

        fn emit_prize_metrics(ref self: ContractState, key: felt252, total_prizes: u64) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@PrizeMetrics { key, total_prizes });
        }

        fn emit_entry_count(ref self: ContractState, tournament_id: u64, count: u32) {
            self.assert_only_budokan();
            let mut world = self.world(@DEFAULT_NS());
            world.emit_event(@EntryCount { tournament_id, count });
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
