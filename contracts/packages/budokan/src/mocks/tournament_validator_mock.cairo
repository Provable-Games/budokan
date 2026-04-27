// SPDX-License-Identifier: BUSL-1.1

//! Tournament Validator Mock
//!
//! This extension contract validates tournament entry based on participation/winning
//! in qualifying tournaments. It replaces the old built-in context entry requirement
//! by delegating to an external contract that can query Budokan for registration
//! and leaderboard data.
//!
//! Configuration (via add_config):
//! - config[0]: qualifier_type (0 = participants, 1 = winners)
//! - config[1..]: qualifying tournament IDs
//!
//! Qualification proof (via valid_entry qualification param):
//! - qualification[0]: qualifying tournament ID
//! - qualification[1]: token ID used in qualifying tournament
//! - qualification[2]: position on leaderboard (for winners type)

use starknet::ContractAddress;

pub const QUALIFIER_TYPE_PARTICIPANTS: felt252 = 0;
pub const QUALIFIER_TYPE_WINNERS: felt252 = 1;

#[starknet::interface]
pub trait ITournamentValidatorMock<TState> {
    fn get_budokan_address(self: @TState) -> ContractAddress;
    fn get_qualifier_type(
        self: @TState, context_owner: ContractAddress, tournament_id: u64,
    ) -> felt252;
    fn get_qualifying_tournament_ids(
        self: @TState, context_owner: ContractAddress, tournament_id: u64,
    ) -> Array<u64>;
}

#[starknet::contract]
pub mod tournament_validator_mock {
    use budokan_interfaces::budokan::{IBudokanDispatcher, IBudokanDispatcherTrait};
    use game_components_embeddable_game_standard::minigame::interface::{
        IMinigameDispatcher, IMinigameDispatcherTrait,
    };
    use game_components_interfaces::registration::{
        IRegistrationDispatcher, IRegistrationDispatcherTrait,
    };
    use metagame_extensions_interfaces::entry_requirement_extension::{
        IENTRY_REQUIREMENT_EXTENSION_ID, IEntryRequirementExtension,
    };
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;
    use starknet::storage::{
        Map, MutableVecTrait, StorageMapReadAccess, StorageMapWriteAccess, StoragePathEntry,
        StoragePointerReadAccess, StoragePointerWriteAccess, Vec, VecTrait,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::{QUALIFIER_TYPE_PARTICIPANTS, QUALIFIER_TYPE_WINNERS};

    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        /// The Budokan contract address (used for cross-contract lookups, not for ownership).
        budokan_address: ContractAddress,
        /// Context registration flag per (context_owner, context_id).
        registered: Map<(ContractAddress, u64), bool>,
        /// Bannable flag per (context_owner, context_id).
        bannable: Map<(ContractAddress, u64), bool>,
        /// Qualifier type per (context_owner, context_id) (0 = participants, 1 = winners)
        qualifier_type: Map<(ContractAddress, u64), felt252>,
        /// Qualifying tournament IDs per (context_owner, context_id)
        qualifying_tournament_ids: Map<(ContractAddress, u64), Vec<u64>>,
        /// Entry limit per (context_owner, context_id)
        tournament_entry_limit: Map<(ContractAddress, u64), u32>,
        /// Entry count per (context_owner, context_id, player_address)
        tournament_entries: Map<(ContractAddress, u64, ContractAddress), u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, budokan_address: ContractAddress) {
        self.budokan_address.write(budokan_address);
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
            if !self
                .validate_entry_internal(
                    context_owner, context_id, player_address, qualification,
                ) {
                return false;
            }

            // Quota: framework no longer cross-checks entries_left, so enforce here.
            let entry_limit = self.tournament_entry_limit.read((context_owner, context_id));
            if entry_limit == 0 {
                return true;
            }
            let key = (context_owner, context_id, player_address);
            let current_entries = self.tournament_entries.read(key);
            current_entries < entry_limit
        }

        fn should_ban(
            self: @ContractState,
            context_owner: ContractAddress,
            context_id: u64,
            game_token_id: felt252,
            current_owner: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
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
            // config[0]: qualifier_type (0 = participants, 1 = winners)
            // config[1..]: qualifying tournament IDs
            assert!(
                config.len() >= 2, "Config must have at least qualifier_type and one tournament ID",
            );

            let qualifier_type = *config.at(0);
            assert!(
                qualifier_type == QUALIFIER_TYPE_PARTICIPANTS
                    || qualifier_type == QUALIFIER_TYPE_WINNERS,
                "Invalid qualifier type",
            );

            let caller = get_caller_address();
            self.registered.write((caller, context_id), true);
            self.qualifier_type.write((caller, context_id), qualifier_type);
            self.tournament_entry_limit.write((caller, context_id), entry_limit);

            // Store qualifying tournament IDs
            let mut vec = self.qualifying_tournament_ids.entry((caller, context_id));
            let mut i: u32 = 1;
            loop {
                if i >= config.len() {
                    break;
                }
                let qualifying_id: u64 = (*config.at(i)).try_into().unwrap();
                vec.push(qualifying_id);
                i += 1;
            };
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
            // qualification[0]: qualifying tournament ID
            // qualification[1]: token ID used in qualifying tournament
            // qualification[2]: position on leaderboard (for winners type, optional)
            if qualification.len() < 2 {
                return false;
            }

            let qualifying_tournament_id: u64 = (*qualification.at(0)).try_into().unwrap();
            let token_id: felt252 = *qualification.at(1);

            // Check if qualifying tournament is in the valid set
            if !self
                .is_qualifying_tournament(context_owner, tournament_id, qualifying_tournament_id) {
                return false;
            }

            let budokan_address = self.budokan_address.read();
            let budokan = IBudokanDispatcher { contract_address: budokan_address };
            let registration_dispatcher = IRegistrationDispatcher {
                contract_address: budokan_address,
            };

            // Get the qualifying tournament to find the game address
            let qualifying_tournament = budokan.tournament(qualifying_tournament_id);
            let game_address = qualifying_tournament.game_config.game_address;

            // Check registration exists - use entry count to find the entry
            let entry_count = registration_dispatcher.get_entry_count(qualifying_tournament_id);
            if entry_count == 0 {
                return false;
            }

            // Search entries to find one matching this token_id
            let mut found = false;
            let mut registration = registration_dispatcher.get_entry(qualifying_tournament_id, 1);
            let mut i: u32 = 1;
            loop {
                if i > entry_count {
                    break;
                }
                let entry = registration_dispatcher.get_entry(qualifying_tournament_id, i);
                if entry.game_token_id == token_id {
                    registration = entry;
                    found = true;
                    break;
                }
                i += 1;
            }
            if !found || registration.context_id != qualifying_tournament_id {
                return false;
            }

            // Check token ownership - player must own the qualifying token
            let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
            let game_token_address = game_dispatcher.token_address();
            let erc721 = IERC721Dispatcher { contract_address: game_token_address };
            let token_owner = erc721.owner_of(token_id.into());

            if token_owner != player_address {
                return false;
            }

            let qualifier_type = self.qualifier_type.read((context_owner, tournament_id));

            if qualifier_type == QUALIFIER_TYPE_WINNERS {
                // For winners: must have submitted and be on the leaderboard
                if !registration.has_submitted {
                    return false;
                }

                // Check position provided in qualification
                if qualification.len() < 3 {
                    return false;
                }
                let position: u8 = (*qualification.at(2)).try_into().unwrap();
                if position == 0 {
                    return false;
                }

                // Get leaderboard and verify position
                let leaderboard = budokan.get_leaderboard(qualifying_tournament_id);
                if position.into() > leaderboard.len() {
                    return false;
                }

                // Verify token is at the claimed position on leaderboard
                let leaderboard_token_id = *leaderboard.at((position - 1).into());
                if leaderboard_token_id != token_id {
                    return false;
                }

                return true;
            } else {
                // For participants: just needs to be registered (already checked above)
                return true;
            }
        }

        fn is_qualifying_tournament(
            self: @ContractState,
            context_owner: ContractAddress,
            tournament_id: u64,
            qualifying_tournament_id: u64,
        ) -> bool {
            let vec = self.qualifying_tournament_ids.entry((context_owner, tournament_id));
            let len = vec.len();
            let mut i: u64 = 0;
            loop {
                if i >= len {
                    break false;
                }
                if vec.at(i).read() == qualifying_tournament_id {
                    break true;
                }
                i += 1;
            }
        }
    }

    // Public interface implementation
    use super::ITournamentValidatorMock;
    #[abi(embed_v0)]
    impl TournamentValidatorMockImpl of ITournamentValidatorMock<ContractState> {
        fn get_budokan_address(self: @ContractState) -> ContractAddress {
            self.budokan_address.read()
        }

        fn get_qualifier_type(
            self: @ContractState, context_owner: ContractAddress, tournament_id: u64,
        ) -> felt252 {
            self.qualifier_type.read((context_owner, tournament_id))
        }

        fn get_qualifying_tournament_ids(
            self: @ContractState, context_owner: ContractAddress, tournament_id: u64,
        ) -> Array<u64> {
            let vec = self.qualifying_tournament_ids.entry((context_owner, tournament_id));
            let len = vec.len();
            let mut arr = ArrayTrait::new();
            let mut i: u64 = 0;
            loop {
                if i >= len {
                    break;
                }
                arr.append(vec.at(i).read());
                i += 1;
            }
            arr
        }
    }
}
