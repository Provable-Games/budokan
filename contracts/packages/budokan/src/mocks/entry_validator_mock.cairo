use starknet::ContractAddress;

#[starknet::interface]
pub trait IEntryValidatorMock<TState> {
    fn get_tournament_erc721_address(
        self: @TState, context_owner: ContractAddress, tournament_id: u64,
    ) -> ContractAddress;
}

#[starknet::contract]
pub mod entry_validator_mock {
    use core::num::traits::Zero;
    use metagame_extensions_interfaces::entry_requirement_extension::{
        IENTRY_REQUIREMENT_EXTENSION_ID, IEntryRequirementExtension,
    };
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        registered: Map<(ContractAddress, u64), bool>,
        bannable: Map<(ContractAddress, u64), bool>,
        tournament_erc721_address: Map<(ContractAddress, u64), ContractAddress>,
        tournament_entry_limit: Map<(ContractAddress, u64), u32>,
        tournament_entries: Map<(ContractAddress, u64, ContractAddress), u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, _budokan_address: ContractAddress) {
        // `_budokan_address` is accepted for backwards-compat with existing deploy scripts
        // but is unused — per-context ownership is now tracked via the caller of `add_config`.
        self.src5.register_interface(IENTRY_REQUIREMENT_EXTENSION_ID);
    }

    #[abi(embed_v0)]
    impl EntryValidatorImpl of IEntryRequirementExtension<ContractState> {
        fn is_context_registered(
            self: @ContractState, context_owner: ContractAddress, context_id: u64,
        ) -> bool {
            self.registered.read((context_owner, context_id))
        }

        fn bannable(self: @ContractState, context_owner: ContractAddress, context_id: u64) -> bool {
            self.bannable.read((context_owner, context_id))
        }

        fn valid_entry(
            self: @ContractState,
            context_owner: ContractAddress,
            context_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            self.validate_entry_internal(context_owner, context_id, player_address, qualification)
        }

        fn should_ban(
            self: @ContractState,
            context_owner: ContractAddress,
            context_id: u64,
            game_token_id: felt252,
            current_owner: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            // Check if the current owner still holds the required ERC721
            // If not, this entry should be banned
            !self.validate_entry_internal(context_owner, context_id, current_owner, qualification)
        }

        fn entries_left(
            self: @ContractState,
            context_owner: ContractAddress,
            context_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u32> {
            let entry_limit = self.tournament_entry_limit.read((context_owner, context_id));
            if entry_limit == 0 {
                return Option::None; // Unlimited entries
            }
            let key = (context_owner, context_id, player_address);
            let current_entries = self.tournament_entries.read(key);
            let remaining_entries = entry_limit - current_entries;
            return Option::Some(remaining_entries);
        }

        fn add_config(
            ref self: ContractState, context_id: u64, entry_limit: u32, config: Span<felt252>,
        ) {
            let caller = get_caller_address();
            // Mark the context as registered (no duplicate-register assertion in the mock).
            self.registered.write((caller, context_id), true);
            // Extract ERC721 address from config (first element)
            let erc721_address: ContractAddress = (*config.at(0)).try_into().unwrap();
            self.tournament_erc721_address.write((caller, context_id), erc721_address);
            self.tournament_entry_limit.write((caller, context_id), entry_limit);
        }

        fn add_entry(
            ref self: ContractState,
            context_id: u64,
            game_token_id: felt252,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            // Track entry count scoped to the calling context owner.
            let caller = get_caller_address();
            let key = (caller, context_id, player_address);
            let current_entries = self.tournament_entries.read(key);
            self.tournament_entries.write(key, current_entries + 1);
        }

        fn remove_entry(
            ref self: ContractState,
            context_id: u64,
            game_token_id: felt252,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            // Decrement entry count scoped to the calling context owner.
            let caller = get_caller_address();
            let key = (caller, context_id, player_address);
            let current_entries = self.tournament_entries.read(key);
            if current_entries > 0 {
                self.tournament_entries.write(key, current_entries - 1);
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn validate_entry_internal(
            self: @ContractState,
            context_owner: ContractAddress,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            let erc721_address = self
                .tournament_erc721_address
                .read((context_owner, tournament_id));

            // Check if ERC721 address is set for this tournament
            if erc721_address.is_zero() {
                return false;
            }

            let erc721 = IERC721Dispatcher { contract_address: erc721_address };

            // Check if the player owns at least one token
            let balance = erc721.balance_of(player_address);
            balance > 0
        }
    }

    // Public interface implementation
    use super::IEntryValidatorMock;
    #[abi(embed_v0)]
    impl EntryValidatorMockImpl of IEntryValidatorMock<ContractState> {
        fn get_tournament_erc721_address(
            self: @ContractState, context_owner: ContractAddress, tournament_id: u64,
        ) -> ContractAddress {
            self.tournament_erc721_address.read((context_owner, tournament_id))
        }
    }
}
