// SPDX-License-Identifier: BUSL-1.1

//! Tournament Validator
//!
//! This extension contract validates tournament entry based on participation/winning
//! in qualifying tournaments. It delegates to an external contract (Budokan) to query
//! registration and leaderboard data.
//!
//! Configuration (via add_config):
//! - config[0]: qualifier_type (0 = participants, 1 = top_position)
//! - config[1]: qualifying_mode
//!   - 0 = AT_LEAST_ONE (must qualify from at least one tournament, global entry tracking)
//!   - 1 = CUMULATIVE_PER_TOURNAMENT (must qualify from at least one, track entry limits per
//!   qualifying tournament)
//!   - 2 = ALL (must qualify from ALL tournaments)
//!   - 3 = CUMULATIVE_PER_ENTRY (track entries per qualifying token ID)
//!   - 4 = ALL_PARTICIPATED_ANY_TOP (must participate in ALL, but only need to win in ANY one)
//!   - 5 = ALL_PARTICIPATED_CUMULATIVE_TOP (must participate in ALL, entries = entry_limit ×
//!   tournament_count)
//! - config[2]: top_positions (for QUALIFIER_TYPE_TOP_POSITION: how many top positions count as
//! winners, 0 = all positions)
//! - config[3..]: qualifying tournament IDs
//!
//! Qualification proof (via valid_entry qualification param):
//! When qualifying_mode = 0 or 1 (AT_LEAST_ONE or CUMULATIVE_PER_TOURNAMENT modes):
//! - qualification[0]: qualifying tournament ID
//! - qualification[1]: token ID used in qualifying tournament
//! - qualification[2]: position on leaderboard (for top_position type)
//!
//! When qualifying_mode = 2 or 5 (ALL or ALL_PARTICIPATED_CUMULATIVE_TOP modes):
//! For PARTICIPANTS: token IDs in same order as qualifying tournament IDs
//! - qualification[0..n]: token IDs for each qualifying tournament
//! For TOP_POSITION: pairs of (token_id, position) for each qualifying tournament
//! - qualification[0]: token_id_1
//! - qualification[1]: position_1
//! - qualification[2]: token_id_2
//! - qualification[3]: position_2
//! - etc.
//!
//! When qualifying_mode = 4 (ALL_PARTICIPATED_ANY_TOP):
//! Pairs of (token_id, position) for each qualifying tournament in order
//! - qualification[0]: token_id_1
//! - qualification[1]: position_1 (0 = participated only, >0 = winning position)
//! - qualification[2]: token_id_2
//! - qualification[3]: position_2 (0 = participated only, >0 = winning position)
//! - etc.
//! Note: At least one position must be >0 and within top_positions to qualify

use starknet::ContractAddress;

pub const QUALIFIER_TYPE_PARTICIPANTS: felt252 = 0;
pub const QUALIFIER_TYPE_TOP_POSITION: felt252 = 1;

pub const QUALIFYING_MODE_AT_LEAST_ONE: felt252 = 0;
pub const QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT: felt252 = 1;
pub const QUALIFYING_MODE_ALL: felt252 = 2;
pub const QUALIFYING_MODE_CUMULATIVE_PER_ENTRY: felt252 = 3;
pub const QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP: felt252 = 4;
pub const QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP: felt252 = 5;

#[starknet::interface]
pub trait ITournamentValidator<TState> {
    fn get_qualifier_type(self: @TState, tournament_id: u64) -> felt252;
    fn get_qualifying_tournament_ids(self: @TState, tournament_id: u64) -> Array<u64>;
    fn get_qualifying_mode(self: @TState, tournament_id: u64) -> felt252;
    fn get_top_positions(self: @TState, tournament_id: u64) -> u32;
}

#[starknet::contract]
pub mod TournamentValidator {
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent;
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent::{
        EntryValidator, InternalTrait as EntryValidatorInternalTrait,
    };
    use budokan_interfaces::budokan::{IBudokanDispatcher, IBudokanDispatcherTrait, Phase};
    use budokan_interfaces::registration::{IRegistrationDispatcher, IRegistrationDispatcherTrait};
    use game_components_minigame::interface::{IMinigameDispatcher, IMinigameDispatcherTrait};
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, MutableVecTrait, StorageMapReadAccess, StorageMapWriteAccess, StoragePathEntry,
        StoragePointerReadAccess, StoragePointerWriteAccess, Vec, VecTrait,
    };
    use super::{
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_ALL,
        QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        QUALIFYING_MODE_AT_LEAST_ONE, QUALIFYING_MODE_CUMULATIVE_PER_ENTRY,
        QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT,
    };

    component!(path: EntryValidatorComponent, storage: entry_validator, event: EntryValidatorEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl EntryValidatorImpl =
        EntryValidatorComponent::EntryValidatorImpl<ContractState>;
    impl EntryValidatorInternalImpl = EntryValidatorComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        entry_validator: EntryValidatorComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        /// Qualifier type per tournament (0 = participants, 1 = top_position)
        qualifier_type: Map<u64, felt252>,
        /// Qualifying tournament IDs per tournament
        qualifying_tournament_ids: Map<u64, Vec<u64>>,
        /// Entry limit per tournament
        tournament_entry_limit: Map<u64, u8>,
        /// Qualifying mode (0 = AT_LEAST_ONE, 1 = CUMULATIVE_PER_TOURNAMENT, 2 = ALL, 3 =
        /// CUMULATIVE_PER_ENTRY, 4 = ALL_PARTICIPATED_ANY_TOP, 5 = ALL_PARTICIPATED_CUMULATIVE_TOP)
        qualifying_mode: Map<u64, felt252>,
        /// Top positions that count as winners (0 = all positions)
        top_positions: Map<u64, u32>,
        /// Entry count per (tournament_id, player_address, qualifying_key)
        /// For AT_LEAST_ONE mode: qualifying_key is 0 (global tracking)
        /// For CUMULATIVE_PER_TOURNAMENT mode: qualifying_key is the tournament ID
        /// For ALL mode: qualifying_key is 0 (only one way to qualify)
        /// For CUMULATIVE_PER_ENTRY mode: qualifying_key is the token ID
        tournament_entries: Map<(u64, ContractAddress, u64), u8>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        EntryValidatorEvent: EntryValidatorComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, budokan_address: ContractAddress, registration_only: bool,
    ) {
        self.entry_validator.initializer(budokan_address, registration_only);
    }

    // Implement the EntryValidator trait for the contract
    impl EntryValidatorImplInternal of EntryValidator<ContractState> {
        fn validate_entry(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            self.validate_entry_internal(tournament_id, player_address, qualification)
        }

        fn entries_left(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8> {
            // First, validate that the qualification is actually valid
            // This ensures:
            // - Tournaments are finalized for position-based validation
            // - Player meets all qualification requirements
            // - Registration and ownership are verified
            let is_valid = self
                .validate_entry_internal(tournament_id, player_address, qualification);
            if !is_valid {
                return Option::Some(0); // Invalid qualification = 0 entries
            }

            let entry_limit = self.tournament_entry_limit.read(tournament_id);
            if entry_limit == 0 {
                return Option::None; // Unlimited entries
            }

            let qualifying_mode = self.qualifying_mode.read(tournament_id);

            // Calculate effective entry limit for cumulative mode
            let effective_entry_limit =
                if qualifying_mode == QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP {
                // For cumulative mode: entry_limit × number_of_tournaments
                let qualifying_tournaments = self.get_qualifying_tournament_ids(tournament_id);
                let tournament_count: u8 = qualifying_tournaments.len().try_into().unwrap();
                entry_limit * tournament_count
            } else {
                entry_limit
            };

            // Determine the qualifying_key for tracking
            let qualifying_key = if qualifying_mode == QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT {
                // Track per qualifying tournament - get tournament ID from qualification proof
                if qualification.len() < 1 {
                    0 // Fallback to global tracking if no qualification provided
                } else {
                    (*qualification.at(0)).try_into().unwrap()
                }
            } else if qualifying_mode == QUALIFYING_MODE_CUMULATIVE_PER_ENTRY {
                // Track per qualifying token - get token ID from qualification proof
                if qualification.len() < 2 {
                    0 // Fallback to global tracking if no qualification provided
                } else {
                    (*qualification.at(1)).try_into().unwrap()
                }
            } else {
                // For AT_LEAST_ONE, ALL, ALL_PARTICIPATED_ANY_TOP, and
                // ALL_PARTICIPATED_CUMULATIVE_TOP modes: use global tracking (0)
                0
            };

            let key = (tournament_id, player_address, qualifying_key);
            let current_entries = self.tournament_entries.read(key);
            let remaining_entries = effective_entry_limit - current_entries;
            return Option::Some(remaining_entries);
        }

        fn registration_only(self: @ContractState) -> bool {
            self.entry_validator.is_registration_only()
        }

        fn add_config(
            ref self: ContractState, tournament_id: u64, entry_limit: u8, config: Span<felt252>,
        ) {
            // config[0]: qualifier_type (0 = participants, 1 = top_position)
            // config[1]: qualifying_mode (0 = AT_LEAST_ONE, 1 = CUMULATIVE_PER_TOURNAMENT, 2 = ALL,
            // 3 = CUMULATIVE_PER_ENTRY, 4 = ALL_PARTICIPATED_ANY_TOP, 5 =
            // ALL_PARTICIPATED_CUMULATIVE_TOP)
            // config[2]: top_positions (0 = all positions, or number of top positions for
            // top_position type)
            // config[3..]: qualifying tournament IDs
            assert!(
                config.len() >= 4,
                "Config must have qualifier_type, qualifying_mode, top_positions, and at least one tournament ID",
            );

            let qualifier_type = *config.at(0);
            assert!(
                qualifier_type == QUALIFIER_TYPE_PARTICIPANTS
                    || qualifier_type == QUALIFIER_TYPE_TOP_POSITION,
                "Invalid qualifier type",
            );

            let qualifying_mode = *config.at(1);
            assert!(
                qualifying_mode == QUALIFYING_MODE_AT_LEAST_ONE
                    || qualifying_mode == QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT
                    || qualifying_mode == QUALIFYING_MODE_ALL
                    || qualifying_mode == QUALIFYING_MODE_CUMULATIVE_PER_ENTRY
                    || qualifying_mode == QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP
                    || qualifying_mode == QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
                "Invalid qualifying mode",
            );

            let top_positions: u32 = (*config.at(2)).try_into().unwrap();

            self.qualifier_type.write(tournament_id, qualifier_type);
            self.qualifying_mode.write(tournament_id, qualifying_mode);
            self.tournament_entry_limit.write(tournament_id, entry_limit);
            self.top_positions.write(tournament_id, top_positions);

            // Store qualifying tournament IDs
            let mut vec = self.qualifying_tournament_ids.entry(tournament_id);
            let mut i: u32 = 3;
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
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let qualifying_mode = self.qualifying_mode.read(tournament_id);

            // Determine the qualifying_key for tracking
            let qualifying_key = if qualifying_mode == QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT {
                // Track per qualifying tournament - get tournament ID from qualification proof
                if qualification.len() < 1 {
                    0 // Fallback to global tracking
                } else {
                    (*qualification.at(0)).try_into().unwrap()
                }
            } else if qualifying_mode == QUALIFYING_MODE_CUMULATIVE_PER_ENTRY {
                // Track per qualifying token - get token ID from qualification proof
                if qualification.len() < 2 {
                    0 // Fallback to global tracking
                } else {
                    (*qualification.at(1)).try_into().unwrap()
                }
            } else {
                // For AT_LEAST_ONE and ALL modes: use global tracking (0)
                0
            };

            let key = (tournament_id, player_address, qualifying_key);
            let current_entries = self.tournament_entries.read(key);
            self.tournament_entries.write(key, current_entries + 1);
        }

        fn remove_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) { // No specific action needed on remove_entry
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn validate_entry_internal(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            let qualifying_mode = self.qualifying_mode.read(tournament_id);

            if qualifying_mode == QUALIFYING_MODE_ALL
                || qualifying_mode == QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP {
                // ALL mode: must validate participation in ALL qualifying tournaments
                return self.validate_all_tournaments(tournament_id, player_address, qualification);
            } else if qualifying_mode == QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP {
                // ALL_PARTICIPATED_ANY_TOP mode: must participate in ALL, but only need to win ANY
                // one
                return self
                    .validate_all_participate_any_win(tournament_id, player_address, qualification);
            } else {
                // AT_LEAST_ONE, CUMULATIVE_PER_TOURNAMENT, or CUMULATIVE_PER_ENTRY mode: validate
                // single tournament
                return self
                    .validate_single_tournament(tournament_id, player_address, qualification);
            }
        }

        fn validate_single_tournament(
            self: @ContractState,
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
            let token_id: u64 = (*qualification.at(1)).try_into().unwrap();

            // Check if qualifying tournament is in the valid set
            if !self.is_qualifying_tournament(tournament_id, qualifying_tournament_id) {
                return false;
            }

            return self
                .validate_tournament_participation(
                    tournament_id,
                    qualifying_tournament_id,
                    token_id,
                    player_address,
                    qualification,
                    2,
                );
        }

        fn validate_all_tournaments(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            // Get list of required tournaments
            let qualifying_tournaments = self.get_qualifying_tournament_ids(tournament_id);
            let num_tournaments: u32 = qualifying_tournaments.len();

            if num_tournaments == 0 {
                return false;
            }

            let qualifier_type = self.qualifier_type.read(tournament_id);

            // Validate qualification proof length
            if qualifier_type == QUALIFIER_TYPE_TOP_POSITION {
                // For top_position: need (token_id, position) pairs
                if qualification.len() != num_tournaments * 2 {
                    return false;
                }
            } else {
                // For participants: need one token_id per tournament
                if qualification.len() != num_tournaments {
                    return false;
                }
            }

            // Validate each tournament
            let mut i: u32 = 0;
            loop {
                if i >= num_tournaments {
                    break true;
                }

                let qualifying_tournament_id = *qualifying_tournaments.at(i);

                if qualifier_type == QUALIFIER_TYPE_TOP_POSITION {
                    // Get token_id and position from qualification proof
                    let token_id: u64 = (*qualification.at(i * 2)).try_into().unwrap();
                    let position: u8 = (*qualification.at(i * 2 + 1)).try_into().unwrap();

                    // Create a temporary qualification span for this tournament
                    let mut temp_qual = ArrayTrait::new();
                    temp_qual.append(token_id.into());
                    temp_qual.append(position.into());

                    if !self
                        .validate_tournament_participation(
                            tournament_id,
                            qualifying_tournament_id,
                            token_id,
                            player_address,
                            temp_qual.span(),
                            1,
                        ) {
                        break false;
                    }
                } else {
                    // Get token_id from qualification proof
                    let token_id: u64 = (*qualification.at(i)).try_into().unwrap();

                    if !self
                        .validate_tournament_participation(
                            tournament_id,
                            qualifying_tournament_id,
                            token_id,
                            player_address,
                            array![].span(),
                            0,
                        ) {
                        break false;
                    }
                }

                i += 1;
            }
        }

        fn validate_all_participate_any_win(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            // Get list of required tournaments
            let qualifying_tournaments = self.get_qualifying_tournament_ids(tournament_id);
            let num_tournaments: u32 = qualifying_tournaments.len();

            if num_tournaments == 0 {
                return false;
            }

            // Qualification format: (token_id, position) pairs for each tournament
            // Position = 0 means participated only, position > 0 means won
            // Must have (token_id, position) pair for each tournament
            if qualification.len() != num_tournaments * 2 {
                return false;
            }

            let mut won_at_least_one = false;
            let top_positions = self.top_positions.read(tournament_id);

            // Validate participation in ALL tournaments and winning in at least ANY one
            let mut i: u32 = 0;
            let all_valid = loop {
                if i >= num_tournaments {
                    break true;
                }

                let qualifying_tournament_id = *qualifying_tournaments.at(i);
                let token_id: u64 = (*qualification.at(i * 2)).try_into().unwrap();
                let position: u8 = (*qualification.at(i * 2 + 1)).try_into().unwrap();

                // Check participation (registration + ownership)
                // For position = 0, only validate participation
                // For position > 0, validate winning
                let budokan_address = self.entry_validator.get_budokan_address();
                let budokan = IBudokanDispatcher { contract_address: budokan_address };
                let registration_dispatcher = IRegistrationDispatcher {
                    contract_address: budokan_address,
                };

                let qualifying_tournament = budokan.tournament(qualifying_tournament_id);
                let game_address = qualifying_tournament.game_config.address;

                // Check registration exists
                let registration = registration_dispatcher.get_registration(game_address, token_id);
                if registration.entry_number == 0
                    || registration.context_id != qualifying_tournament_id {
                    break false;
                }

                // Check token ownership
                let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
                let game_token_address = game_dispatcher.token_address();
                let erc721 = IERC721Dispatcher { contract_address: game_token_address };
                let token_owner = erc721.owner_of(token_id.into());

                if token_owner != player_address {
                    break false;
                }

                // If position > 0, validate winning requirements
                if position > 0 {
                    // Tournament must be finalized to ensure leaderboard is final
                    let current_phase = budokan.current_phase(qualifying_tournament_id);
                    if current_phase != Phase::Finalized {
                        break false;
                    }

                    // Must have submitted
                    if !registration.has_submitted {
                        break false;
                    }

                    // Check if position is within top_positions limit (if set)
                    if top_positions > 0 && position.into() > top_positions {
                        break false;
                    }

                    // Get leaderboard and verify position
                    let leaderboard = budokan.get_leaderboard(qualifying_tournament_id);
                    if position.into() > leaderboard.len() {
                        break false;
                    }

                    // Verify token is at the claimed position on leaderboard
                    let leaderboard_token_id = *leaderboard.at((position - 1).into());
                    if leaderboard_token_id != token_id {
                        break false;
                    }

                    // Mark that they won at least one tournament
                    won_at_least_one = true;
                }

                i += 1;
            };

            // Must have participated in all AND won in at least one
            all_valid && won_at_least_one
        }

        fn validate_tournament_participation(
            self: @ContractState,
            tournament_id: u64,
            qualifying_tournament_id: u64,
            token_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
            position_index: u32,
        ) -> bool {
            let budokan_address = self.entry_validator.get_budokan_address();
            let budokan = IBudokanDispatcher { contract_address: budokan_address };
            let registration_dispatcher = IRegistrationDispatcher {
                contract_address: budokan_address,
            };

            // Get the qualifying tournament to find the game address
            let qualifying_tournament = budokan.tournament(qualifying_tournament_id);
            let game_address = qualifying_tournament.game_config.address;

            // Check registration exists
            let registration = registration_dispatcher.get_registration(game_address, token_id);
            if registration.entry_number == 0
                || registration.context_id != qualifying_tournament_id {
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

            let qualifier_type = self.qualifier_type.read(tournament_id);

            if qualifier_type == QUALIFIER_TYPE_TOP_POSITION {
                // For top position validation, tournament must be finalized to ensure leaderboard
                // is final
                let current_phase = budokan.current_phase(qualifying_tournament_id);
                if current_phase != Phase::Finalized {
                    return false;
                }
                // For top_position: must have submitted and be on the leaderboard
                if !registration.has_submitted {
                    return false;
                }

                // Check position provided in qualification
                if qualification.len() <= position_index {
                    return false;
                }
                let position: u8 = (*qualification.at(position_index)).try_into().unwrap();
                if position == 0 {
                    return false;
                }

                // Check if position is within top_positions limit (if set)
                let top_positions = self.top_positions.read(tournament_id);
                if top_positions > 0 && position.into() > top_positions {
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
            self: @ContractState, tournament_id: u64, qualifying_tournament_id: u64,
        ) -> bool {
            let vec = self.qualifying_tournament_ids.entry(tournament_id);
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
    use super::ITournamentValidator;
    #[abi(embed_v0)]
    impl TournamentValidatorImpl of ITournamentValidator<ContractState> {
        fn get_qualifier_type(self: @ContractState, tournament_id: u64) -> felt252 {
            self.qualifier_type.read(tournament_id)
        }

        fn get_qualifying_tournament_ids(self: @ContractState, tournament_id: u64) -> Array<u64> {
            let vec = self.qualifying_tournament_ids.entry(tournament_id);
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

        fn get_qualifying_mode(self: @ContractState, tournament_id: u64) -> felt252 {
            self.qualifying_mode.read(tournament_id)
        }

        fn get_top_positions(self: @ContractState, tournament_id: u64) -> u32 {
            self.top_positions.read(tournament_id)
        }
    }
}
