use starknet::ContractAddress;

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn name(self: @TContractState) -> ByteArray;
    fn symbol(self: @TContractState) -> ByteArray;
    fn decimals(self: @TContractState) -> u8;
}

#[starknet::interface]
pub trait IEntryValidatorMock<TState> {
    fn get_token_address(self: @TState, tournament_id: u64) -> ContractAddress;
    fn get_min_threshold(self: @TState, tournament_id: u64) -> u256;
    fn get_max_threshold(self: @TState, tournament_id: u64) -> u256;
    fn get_value_per_entry(self: @TState, tournament_id: u64) -> u256;
    fn get_max_entries(self: @TState, tournament_id: u64) -> u8;
}

#[starknet::contract]
pub mod ERC20BalanceValidator {
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent;
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent::EntryValidator;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::{IERC20Dispatcher, IERC20DispatcherTrait};

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
        tournament_token_address: Map<u64, ContractAddress>,
        tournament_min_threshold: Map<u64, u256>,
        tournament_max_threshold: Map<u64, u256>,
        tournament_entry_limit: Map<u64, u8>,
        tournament_entries_per_address: Map<(u64, ContractAddress), u8>,
        tournament_value_per_entry: Map<
            u64, u256,
        >, // Token amount required per entry (0 = fixed limit)
        tournament_max_entries: Map<u64, u8> // Maximum entries cap (0 = no cap)
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
    fn constructor(ref self: ContractState, budokan_address: ContractAddress) {
        self.entry_validator.initializer(budokan_address, true);
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

        fn registration_only(self: @ContractState) -> bool {
            self.entry_validator.is_registration_only()
        }

        fn entries_left(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8> {
            let value_per_entry = self.tournament_value_per_entry.read(tournament_id);

            if value_per_entry > 0 {
                // Calculate entries based on token balance
                let token_address = self.tournament_token_address.read(tournament_id);
                let erc20 = IERC20Dispatcher { contract_address: token_address };
                let balance = erc20.balance_of(player_address);

                let min_threshold = self.tournament_min_threshold.read(tournament_id);
                let max_threshold = self.tournament_max_threshold.read(tournament_id);

                // Check if balance is within valid range
                if balance < min_threshold {
                    return Option::Some(0);
                }

                // Determine the effective balance for calculation
                let effective_balance = if max_threshold > 0 && balance > max_threshold {
                    // If balance exceeds max, cap it at max_threshold
                    max_threshold
                } else {
                    balance
                };

                // Calculate total entries: (effective_balance - min_threshold) / value_per_entry
                let total_entries = if effective_balance > min_threshold {
                    (effective_balance - min_threshold) / value_per_entry
                } else {
                    0
                };

                let key = (tournament_id, player_address);
                let used_entries = self.tournament_entries_per_address.read(key);

                // Convert u256 to u8 safely
                let mut total_entries_u8: u8 = if total_entries > 255 {
                    255_u8 // Cap at max u8
                } else {
                    match total_entries.try_into() {
                        Option::Some(val) => val,
                        Option::None => { return Option::Some(0); },
                    }
                };

                // Apply max entries cap if set
                let max_entries = self.tournament_max_entries.read(tournament_id);
                if max_entries > 0 && total_entries_u8 > max_entries {
                    total_entries_u8 = max_entries;
                }

                if total_entries_u8 > used_entries {
                    return Option::Some(total_entries_u8 - used_entries);
                } else {
                    return Option::Some(0);
                }
            } else {
                // Use fixed entry limit (original behavior)
                let entry_limit = self.tournament_entry_limit.read(tournament_id);
                if entry_limit == 0 {
                    return Option::None; // Unlimited entries
                }
                let key = (tournament_id, player_address);
                let current_entries = self.tournament_entries_per_address.read(key);
                let remaining_entries = entry_limit - current_entries;
                return Option::Some(remaining_entries);
            }
        }

        fn add_config(
            ref self: ContractState, tournament_id: u64, entry_limit: u8, config: Span<felt252>,
        ) {
            // Extract token address, min threshold, max threshold, value_per_entry, and max_entries
            // from config Config format: [token_address, min_threshold_low, min_threshold_high,
            // max_threshold_low, max_threshold_high, value_per_entry_low, value_per_entry_high,
            // max_entries]
            // Note: u256 values are split into low (felt252) and high (felt252) parts

            let token_address: ContractAddress = (*config.at(0)).try_into().unwrap();

            // Reconstruct min_threshold from low and high parts
            let min_threshold_low: u128 = (*config.at(1)).try_into().unwrap();
            let min_threshold_high: u128 = (*config.at(2)).try_into().unwrap();
            let min_threshold: u256 = u256 { low: min_threshold_low, high: min_threshold_high };

            // Reconstruct max_threshold from low and high parts
            let max_threshold_low: u128 = if config.len() > 3 {
                (*config.at(3)).try_into().unwrap()
            } else {
                0
            };
            let max_threshold_high: u128 = if config.len() > 4 {
                (*config.at(4)).try_into().unwrap()
            } else {
                0
            };
            let max_threshold: u256 = u256 { low: max_threshold_low, high: max_threshold_high };

            // Reconstruct value_per_entry from low and high parts
            let value_per_entry_low: u128 = if config.len() > 5 {
                (*config.at(5)).try_into().unwrap()
            } else {
                0
            };
            let value_per_entry_high: u128 = if config.len() > 6 {
                (*config.at(6)).try_into().unwrap()
            } else {
                0
            };
            let value_per_entry: u256 = u256 {
                low: value_per_entry_low, high: value_per_entry_high,
            };

            let max_entries: u8 = if config.len() > 7 {
                (*config.at(7)).try_into().unwrap()
            } else {
                0 // Default to no cap if not provided
            };

            self.tournament_token_address.write(tournament_id, token_address);
            self.tournament_min_threshold.write(tournament_id, min_threshold);
            self.tournament_max_threshold.write(tournament_id, max_threshold);
            self.tournament_entry_limit.write(tournament_id, entry_limit);
            self.tournament_value_per_entry.write(tournament_id, value_per_entry);
            self.tournament_max_entries.write(tournament_id, max_entries);
        }

        fn add_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries_per_address.read(key);
            self.tournament_entries_per_address.write(key, current_entries + 1);
        }

        fn remove_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries_per_address.read(key);
            assert!(current_entries > 0, "ERC20 Entry Validator: No entries to remove");
            self.tournament_entries_per_address.write(key, current_entries - 1);
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
            assert!(qualification.len() == 0, "ERC20 Entry Validator: Qualification data invalid");

            let token_address = self.tournament_token_address.read(tournament_id);
            let erc20 = IERC20Dispatcher { contract_address: token_address };
            let balance = erc20.balance_of(player_address);

            // Check if balance meets the minimum threshold
            let min_threshold = self.tournament_min_threshold.read(tournament_id);
            let max_threshold = self.tournament_max_threshold.read(tournament_id);

            // Balance must be >= min_threshold
            if balance < min_threshold {
                return false;
            }

            // If max_threshold is set (> 0), balance must be <= max_threshold
            if max_threshold > 0 && balance > max_threshold {
                return false;
            }

            true
        }
    }

    // Public interface implementation
    use super::IEntryValidatorMock;
    #[abi(embed_v0)]
    impl EntryValidatorMockImpl of IEntryValidatorMock<ContractState> {
        fn get_token_address(self: @ContractState, tournament_id: u64) -> ContractAddress {
            self.tournament_token_address.read(tournament_id)
        }

        fn get_min_threshold(self: @ContractState, tournament_id: u64) -> u256 {
            self.tournament_min_threshold.read(tournament_id)
        }

        fn get_max_threshold(self: @ContractState, tournament_id: u64) -> u256 {
            self.tournament_max_threshold.read(tournament_id)
        }

        fn get_value_per_entry(self: @ContractState, tournament_id: u64) -> u256 {
            self.tournament_value_per_entry.read(tournament_id)
        }

        fn get_max_entries(self: @ContractState, tournament_id: u64) -> u8 {
            self.tournament_max_entries.read(tournament_id)
        }
    }
}
