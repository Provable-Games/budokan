// SPDX-License-Identifier: BUSL-1.1

/// EntryValidatorComponent provides extensible entry validation for tournaments.
/// This component allows external contracts to implement custom entry validation logic.

#[starknet::component]
pub mod EntryValidatorComponent {
    use budokan_interfaces::entry_validator::{IENTRY_VALIDATOR_ID, IEntryValidator};
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    pub struct Storage {
        // TODO: generalise to context address?
        tournament_address: ContractAddress,
        registration_only: bool,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    pub trait EntryValidator<TContractState> {
        fn valid_entry(
            self: @TContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool;

        fn validate_entry(
            self: @TContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool;

        fn entries_left(
            self: @TContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8>;

        fn registration_only(self: @TContractState) -> bool;

        fn add_config(
            ref self: TContractState, tournament_id: u64, entry_limit: u8, config: Span<felt252>,
        );

        fn add_entry(
            ref self: TContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        );

        fn remove_entry(
            ref self: TContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        );
    }

    #[embeddable_as(EntryValidatorImpl)]
    impl EntryValidatorComponentImpl<
        TContractState,
        +HasComponent<TContractState>,
        +EntryValidator<TContractState>,
        +SRC5Component::HasComponent<TContractState>,
        +Drop<TContractState>,
    > of IEntryValidator<ComponentState<TContractState>> {
        fn valid_entry(
            self: @ComponentState<TContractState>,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            let contract = self.get_contract();
            EntryValidator::valid_entry(contract, tournament_id, player_address, qualification)
        }

        fn validate_entry(
            self: @ComponentState<TContractState>,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            let contract = self.get_contract();
            EntryValidator::validate_entry(contract, tournament_id, player_address, qualification)
        }

        fn entries_left(
            self: @ComponentState<TContractState>,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8> {
            let contract = self.get_contract();
            EntryValidator::entries_left(contract, tournament_id, player_address, qualification)
        }

        fn registration_only(self: @ComponentState<TContractState>) -> bool {
            let contract = self.get_contract();
            EntryValidator::registration_only(contract)
        }

        fn add_config(
            ref self: ComponentState<TContractState>,
            tournament_id: u64,
            entry_limit: u8,
            config: Span<felt252>,
        ) {
            let mut contract = self.get_contract_mut();
            EntryValidator::add_config(ref contract, tournament_id, entry_limit, config);
        }

        fn add_entry(
            ref self: ComponentState<TContractState>,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let mut contract = self.get_contract_mut();
            EntryValidator::add_entry(ref contract, tournament_id, player_address, qualification);
        }

        fn remove_entry(
            ref self: ComponentState<TContractState>,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let mut contract = self.get_contract_mut();
            EntryValidator::remove_entry(
                ref contract, tournament_id, player_address, qualification,
            );
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState,
        +HasComponent<TContractState>,
        impl SRC5: SRC5Component::HasComponent<TContractState>,
        +Drop<TContractState>,
    > of InternalTrait<TContractState> {
        fn initializer(
            ref self: ComponentState<TContractState>,
            tournament_address: ContractAddress,
            registration_only: bool,
        ) {
            self.tournament_address.write(tournament_address);
            self.registration_only.write(registration_only);

            let mut src5_component = get_dep_component_mut!(ref self, SRC5);
            src5_component.register_interface(IENTRY_VALIDATOR_ID);
        }

        fn get_tournament_address(self: @ComponentState<TContractState>) -> ContractAddress {
            self.tournament_address.read()
        }

        fn is_registration_only(self: @ComponentState<TContractState>) -> bool {
            self.registration_only.read()
        }
    }
}
