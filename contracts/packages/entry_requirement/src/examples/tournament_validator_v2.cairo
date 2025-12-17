use starknet::ContractAddress;

// Re-export TournamentRule for external use
#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct TournamentRule {
    pub tournament_id: u64,
    pub qualifier_type: u8,
    pub top_positions: u16,
}

// Public interface for view functions
#[starknet::interface]
pub trait ITournamentValidatorV2<TState> {
    fn get_rule(self: @TState, tournament_id: u64, rule_index: u32) -> TournamentRule;
    fn get_rule_count(self: @TState, tournament_id: u64) -> u32;
    fn get_qualifying_mode(self: @TState, tournament_id: u64) -> felt252;
    fn get_entry_limit(self: @TState, tournament_id: u64) -> u8;
}

// Export constants
pub const QUALIFIER_TYPE_PARTICIPANTS: u8 = 0;
pub const QUALIFIER_TYPE_TOP_POSITION: u8 = 1;

pub const QUALIFYING_MODE_AT_LEAST_ONE: felt252 = 0;
pub const QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT: felt252 = 1;
pub const QUALIFYING_MODE_ALL: felt252 = 2;
pub const QUALIFYING_MODE_CUMULATIVE_PER_ENTRY: felt252 = 3;
pub const QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP: felt252 = 4;
pub const QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP: felt252 = 5;

#[starknet::contract]
mod TournamentValidatorV2 {
    use budokan_interfaces::budokan::{IBudokanDispatcher, IBudokanDispatcherTrait};
    use budokan_interfaces::entry_validator::IEntryValidator;
    use budokan_interfaces::registration::{IRegistrationDispatcher, IRegistrationDispatcherTrait};
    use game_components_minigame::interface::{IMinigameDispatcher, IMinigameDispatcherTrait};
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::{
        QUALIFIER_TYPE_PARTICIPANTS, QUALIFIER_TYPE_TOP_POSITION, QUALIFYING_MODE_ALL,
        QUALIFYING_MODE_ALL_PARTICIPATED_ANY_TOP, QUALIFYING_MODE_ALL_PARTICIPATED_CUMULATIVE_TOP,
        QUALIFYING_MODE_AT_LEAST_ONE, QUALIFYING_MODE_CUMULATIVE_PER_ENTRY,
        QUALIFYING_MODE_CUMULATIVE_PER_TOURNAMENT, TournamentRule,
    };

    // ========================================
    // Storage
    // ========================================

    #[storage]
    struct Storage {
        budokan: IBudokanDispatcher,
        owner: ContractAddress,
        // Global settings per gated tournament
        qualifying_mode: LegacyMap<u64, felt252>,
        entry_limit: LegacyMap<u64, u8>,
        // Per-tournament rules
        rule_count: LegacyMap<u64, u32>,
        rules: LegacyMap<(u64, u32), TournamentRule>,
        // Entry tracking
        entries_used: LegacyMap<(u64, ContractAddress, felt252), u8>,
    }

    // ========================================
    // Events
    // ========================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ConfigAdded: ConfigAdded,
        EntryRecorded: EntryRecorded,
    }

    #[derive(Drop, starknet::Event)]
    struct ConfigAdded {
        tournament_id: u64,
        qualifying_mode: felt252,
        entry_limit: u8,
        rule_count: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct EntryRecorded {
        tournament_id: u64,
        player: ContractAddress,
        entries_used: u8,
    }

    // ========================================
    // Constructor
    // ========================================

    #[constructor]
    fn constructor(ref self: ContractState, budokan_address: ContractAddress) {
        self.budokan.write(IBudokanDispatcher { contract_address: budokan_address });
        self.owner.write(get_caller_address());
    }

    // ========================================
    // External Functions
    // ========================================

    #[abi(embed_v0)]
    impl EntryValidatorImpl of IEntryValidator<ContractState> {
        fn budokan_address(self: @ContractState) -> ContractAddress {
            self.budokan.read().contract_address
        }

        fn registration_only(self: @ContractState) -> bool {
            true // This validator checks qualifications which don't change
        }

        fn add_config(
            ref self: ContractState, tournament_id: u64, entry_limit: u8, config: Span<felt252>,
        ) {
            // Only budokan can add configs
            assert(get_caller_address() == self.budokan.read().contract_address, 'Only budokan');

            // Config format: [qualifying_mode, tournament_id, qualifier_type, top_positions, ...]
            // Must have at least: [qualifying_mode] + one rule triplet
            assert(config.len() >= 4, 'Config too short');
            assert((config.len() - 1) % 3 == 0, 'Invalid config format');

            let qualifying_mode = *config.at(0);
            self.qualifying_mode.write(tournament_id, qualifying_mode);
            self.entry_limit.write(tournament_id, entry_limit);

            // Parse per-tournament rules (triplets: tournament_id, qualifier_type, top_positions)
            let rule_count: u32 = ((config.len() - 1) / 3).try_into().unwrap();
            self.rule_count.write(tournament_id, rule_count);

            let mut i: u32 = 0;
            loop {
                if i >= rule_count {
                    break;
                }

                let base_idx = 1 + (i * 3);
                let qual_tournament_id: u64 = (*config.at(base_idx)).try_into().unwrap();
                let qualifier_type: u8 = (*config.at(base_idx + 1)).try_into().unwrap();
                let top_positions: u16 = (*config.at(base_idx + 2)).try_into().unwrap();

                // Validate qualifier_type
                assert(
                    qualifier_type == QUALIFIER_TYPE_PARTICIPANTS
                        || qualifier_type == QUALIFIER_TYPE_TOP_POSITION,
                    'Invalid qualifier_type',
                );

                let rule = TournamentRule {
                    tournament_id: qual_tournament_id, qualifier_type, top_positions,
                };

                self.rules.write((tournament_id, i), rule);
                i += 1;
            }

            self.emit(ConfigAdded { tournament_id, qualifying_mode, entry_limit, rule_count });
        }

        fn valid_entry(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            let qualifying_mode = self.qualifying_mode.read(tournament_id);
            let rule_count = self.rule_count.read(tournament_id);

            if rule_count == 0 {
                return false;
            }

            match qualifying_mode {
                0 => InternalTrait::validate_any_mode(
                    self, tournament_id, player_address, qualification, rule_count,
                ),
                1 => InternalTrait::validate_any_per_tournament_mode(
                    self, tournament_id, player_address, qualification, rule_count,
                ),
                2 => InternalTrait::validate_all_mode(
                    self, tournament_id, player_address, qualification, rule_count,
                ),
                3 => InternalTrait::validate_per_entry_mode(
                    self, tournament_id, player_address, qualification, rule_count,
                ),
                4 => InternalTrait::validate_all_participate_any_win_mode(
                    self, tournament_id, player_address, qualification, rule_count,
                ),
                5 => InternalTrait::validate_all_with_cumulative_entries_mode(
                    self, tournament_id, player_address, qualification, rule_count,
                ),
                _ => false,
            }
        }

        fn add_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            // Only budokan can record entries
            assert(get_caller_address() == self.budokan.read().contract_address, 'Only budokan');

            let qualifying_mode = self.qualifying_mode.read(tournament_id);
            let entry_limit = self.entry_limit.read(tournament_id);

            if entry_limit == 0 {
                return; // Unlimited entries, no tracking needed
            }

            // Determine storage key based on qualifying mode
            let storage_key = InternalTrait::get_storage_key(
                @self, tournament_id, player_address, qualification, qualifying_mode,
            );

            let entries_used = self.entries_used.read((tournament_id, player_address, storage_key));
            self.entries_used.write((tournament_id, player_address, storage_key), entries_used + 1);

            self
                .emit(
                    EntryRecorded {
                        tournament_id, player: player_address, entries_used: entries_used + 1,
                    },
                );
        }

        fn entries_left(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8> {
            let entry_limit = self.entry_limit.read(tournament_id);

            if entry_limit == 0 {
                return Option::None; // Unlimited
            }

            let qualifying_mode = self.qualifying_mode.read(tournament_id);

            // Special handling for QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES
            let total_entries_available = if qualifying_mode == 5 {
                // Count how many tournaments the player meets the tier requirement in
                InternalTrait::calculate_cumulative_entries(
                    self, tournament_id, player_address, qualification, entry_limit,
                )
            } else {
                entry_limit
            };

            let storage_key = InternalTrait::get_storage_key(
                self, tournament_id, player_address, qualification, qualifying_mode,
            );

            let entries_used = self.entries_used.read((tournament_id, player_address, storage_key));

            if entries_used >= total_entries_available {
                Option::Some(0)
            } else {
                Option::Some(total_entries_available - entries_used)
            }
        }

        fn remove_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            // Only budokan can remove entries
            assert(get_caller_address() == self.budokan.read().contract_address, 'Only budokan');

            let qualifying_mode = self.qualifying_mode.read(tournament_id);
            let storage_key = InternalTrait::get_storage_key(
                @self, tournament_id, player_address, qualification, qualifying_mode,
            );

            let entries_used = self.entries_used.read((tournament_id, player_address, storage_key));
            if entries_used > 0 {
                self
                    .entries_used
                    .write((tournament_id, player_address, storage_key), entries_used - 1);
            }
        }
    }

    // ========================================
    // View Functions
    // ========================================

    #[generate_trait]
    #[abi(per_item)]
    impl TournamentValidatorImpl of TournamentValidatorTrait {
        #[external(v0)]
        fn get_rule(self: @ContractState, tournament_id: u64, rule_index: u32) -> TournamentRule {
            self.rules.read((tournament_id, rule_index))
        }

        #[external(v0)]
        fn get_rule_count(self: @ContractState, tournament_id: u64) -> u32 {
            self.rule_count.read(tournament_id)
        }

        #[external(v0)]
        fn get_qualifying_mode(self: @ContractState, tournament_id: u64) -> felt252 {
            self.qualifying_mode.read(tournament_id)
        }

        #[external(v0)]
        fn get_entry_limit(self: @ContractState, tournament_id: u64) -> u8 {
            self.entry_limit.read(tournament_id)
        }
    }

    // ========================================
    // Internal Functions - Validation Modes
    // ========================================

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        // QUALIFYING_MODE_ANY: At least ONE rule must be satisfied
        fn validate_any_mode(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            rule_count: u32,
        ) -> bool {
            let mut i: u32 = 0;
            loop {
                if i >= rule_count {
                    break false; // No rules satisfied
                }

                let rule = self.rules.read((tournament_id, i));
                if self.validate_single_rule(player, qualification, rule) {
                    break true; // Found a satisfied rule
                }

                i += 1;
            }
        }

        // QUALIFYING_MODE_ANY_PER_TOURNAMENT: Same as ANY but entry tracking is per tournament
        fn validate_any_per_tournament_mode(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            rule_count: u32,
        ) -> bool {
            // Validation logic is same as ANY mode
            self.validate_any_mode(tournament_id, player, qualification, rule_count)
        }

        // QUALIFYING_MODE_ALL: ALL rules must be satisfied
        fn validate_all_mode(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            rule_count: u32,
        ) -> bool {
            let mut i: u32 = 0;
            loop {
                if i >= rule_count {
                    break true; // All rules satisfied
                }

                let rule = self.rules.read((tournament_id, i));
                if !self.validate_single_rule(player, qualification, rule) {
                    break false; // Rule failed, early exit
                }

                i += 1;
            }
        }

        // QUALIFYING_MODE_PER_ENTRY: Entry tracking is per qualifying token
        fn validate_per_entry_mode(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            rule_count: u32,
        ) -> bool {
            // Validation logic is same as ANY mode
            // (difference is in entry tracking, handled in get_storage_key)
            self.validate_any_mode(tournament_id, player, qualification, rule_count)
        }

        // QUALIFYING_MODE_ALL_PARTICIPATE_ANY_WIN (NEW):
        // Must have participated in ALL tournaments AND won in at least ONE
        fn validate_all_participate_any_win_mode(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            rule_count: u32,
        ) -> bool {
            let mut all_participated = true;
            let mut any_won = false;

            let mut i: u32 = 0;
            loop {
                if i >= rule_count {
                    break;
                }

                let rule = self.rules.read((tournament_id, i));

                // Find token for this tournament
                let token_result = self
                    .find_token_for_tournament(rule.tournament_id, qualification);
                if token_result.is_none() {
                    all_participated = false;
                    break; // Missing a tournament, fail immediately
                }

                let token_id = token_result.unwrap();

                // Check ownership
                if !self.owns_token(rule.tournament_id, token_id, player) {
                    all_participated = false;
                    break; // Doesn't own token, fail immediately
                }

                // Check if this token is a winner (based on rule's qualifier_type and
                // top_positions)
                if rule.qualifier_type == QUALIFIER_TYPE_TOP_POSITION {
                    let position = self
                        .get_token_position(rule.tournament_id, token_id, qualification);
                    if self.is_winner(position, rule.top_positions.into()) {
                        any_won = true;
                    }
                }

                i += 1;
            }

            all_participated && any_won
        }

        // QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES (NEW):
        // Must have participated in ALL tournaments
        // Entries granted are cumulative based on tier achievements
        fn validate_all_with_cumulative_entries_mode(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            rule_count: u32,
        ) -> bool {
            // Validation: Must have participated in ALL tournaments
            let mut i: u32 = 0;
            loop {
                if i >= rule_count {
                    break true; // All tournaments verified
                }

                let rule = self.rules.read((tournament_id, i));

                // Find token for this tournament
                let token_result = self
                    .find_token_for_tournament(rule.tournament_id, qualification);
                if token_result.is_none() {
                    break false; // Missing a tournament, fail immediately
                }

                let token_id = token_result.unwrap();

                // Check ownership
                if !self.owns_token(rule.tournament_id, token_id, player) {
                    break false; // Doesn't own token, fail immediately
                }

                i += 1;
            }
        }

        // ========================================
        // Internal Functions - Helpers
        // ========================================

        // Validate a single rule
        fn validate_single_rule(
            self: @ContractState,
            player: ContractAddress,
            qualification: Span<felt252>,
            rule: TournamentRule,
        ) -> bool {
            // Find the token for this specific tournament in the qualification proof
            let token_result = self.find_token_for_tournament(rule.tournament_id, qualification);

            if token_result.is_none() {
                return false;
            }

            let token_id = token_result.unwrap();

            // Check ownership
            if !self.owns_token(rule.tournament_id, token_id, player) {
                return false;
            }

            // Check qualifier type
            match rule.qualifier_type {
                0 => true, // PARTICIPANTS: ownership is enough
                1 => {
                    // WINNERS: must be in top N positions
                    let position = self
                        .get_token_position(rule.tournament_id, token_id, qualification);
                    self.is_winner(position, rule.top_positions.into())
                },
                _ => false,
            }
        }

        // Find token ID for a specific tournament in the qualification proof
        // Qualification format: [tournament_id, token_id, position, tournament_id, token_id,
        // position, ...]
        fn find_token_for_tournament(
            self: @ContractState, tournament_id: u64, qualification: Span<felt252>,
        ) -> Option<u64> {
            // Qualification format: triplets [tournament_id, token_id, position]
            if qualification.len() % 3 != 0 {
                return Option::None;
            }

            let mut i: u32 = 0;
            loop {
                if i >= qualification.len() / 3 {
                    break Option::None;
                }

                let qual_tournament_id: u64 = (*qualification.at(i * 3)).try_into().unwrap_or(0);
                if qual_tournament_id == tournament_id {
                    let token_id: u64 = (*qualification.at(i * 3 + 1)).try_into().unwrap_or(0);
                    break Option::Some(token_id);
                }

                i += 1;
            }
        }

        // Check if player owns the token
        fn owns_token(
            self: @ContractState, tournament_id: u64, token_id: u64, player: ContractAddress,
        ) -> bool {
            let budokan = self.budokan.read();

            // Get tournament details
            let tournament = budokan.tournament(tournament_id);
            let game_address = tournament.game_config.address;

            // Get the game token address from the game contract
            let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
            let game_token_address = game_dispatcher.token_address();

            // Use ERC721 interface to check token ownership
            let erc721 = IERC721Dispatcher { contract_address: game_token_address };
            let token_id_u256: u256 = token_id.into();
            let token_owner = erc721.owner_of(token_id_u256);

            token_owner == player
        }

        // Get the position from qualification proof for a specific tournament
        // Qualification format: [tournament_id, token_id, position, ...]
        fn get_token_position(
            self: @ContractState, tournament_id: u64, token_id: u64, qualification: Span<felt252>,
        ) -> u8 {
            // Find the position in the qualification proof
            // Format is triplets: [tournament_id, token_id, position]
            if qualification.len() % 3 != 0 {
                return 0; // Invalid format
            }

            let mut i: u32 = 0;
            loop {
                if i >= qualification.len() / 3 {
                    break 0; // Not found
                }

                let qual_tournament_id: u64 = (*qualification.at(i * 3)).try_into().unwrap_or(0);
                let qual_token_id: u64 = (*qualification.at(i * 3 + 1)).try_into().unwrap_or(0);

                if qual_tournament_id == tournament_id && qual_token_id == token_id {
                    let position: u8 = (*qualification.at(i * 3 + 2)).try_into().unwrap_or(0);
                    break position;
                }

                i += 1;
            }
        }

        // Check if a position qualifies as a winner
        fn is_winner(self: @ContractState, position: u8, top_positions: u64) -> bool {
            if top_positions == 0 {
                return true; // 0 means unlimited/all positions count
            }
            position > 0 && position.into() <= top_positions
        }

        // Calculate cumulative entries for QUALIFYING_MODE_ALL_WITH_CUMULATIVE_ENTRIES
        // Returns: number of qualifying tournaments × entry_limit
        fn calculate_cumulative_entries(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            entry_limit_per_tournament: u8,
        ) -> u8 {
            let rule_count = self.rule_count.read(tournament_id);
            let mut qualifying_tournament_count: u8 = 0;

            let mut i: u32 = 0;
            loop {
                if i >= rule_count {
                    break;
                }

                let rule = self.rules.read((tournament_id, i));

                // Check if player meets this tournament's tier requirement
                if self.validate_single_rule(player, qualification, rule) {
                    qualifying_tournament_count += 1;
                }

                i += 1;
            }

            // Total entries = qualifying_tournament_count × entry_limit_per_tournament
            qualifying_tournament_count * entry_limit_per_tournament
        }

        // Get storage key for entry tracking based on qualifying mode
        fn get_storage_key(
            self: @ContractState,
            tournament_id: u64,
            player: ContractAddress,
            qualification: Span<felt252>,
            qualifying_mode: felt252,
        ) -> felt252 {
            match qualifying_mode {
                0 => 0, // ANY: global tracking (key = 0)
                1 => {
                    // ANY_PER_TOURNAMENT: track per qualifying tournament
                    // Use first tournament ID in qualification as key
                    if qualification.len() >= 3 {
                        *qualification.at(0)
                    } else {
                        0
                    }
                },
                2 => 0, // ALL: global tracking (key = 0)
                3 => {
                    // PER_ENTRY: track per qualifying token ID
                    // Use qualifying token ID as key (second element in triplet)
                    if qualification.len() >= 3 {
                        *qualification.at(1)
                    } else {
                        0
                    }
                },
                4 => 0, // ALL_PARTICIPATE_ANY_WIN: global tracking (key = 0)
                5 => 0, // ALL_WITH_CUMULATIVE_ENTRIES: global tracking (key = 0)
                _ => 0,
            }
        }
    }
}
