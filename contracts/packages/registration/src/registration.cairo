// SPDX-License-Identifier: BUSL-1.1

/// RegistrationComponent handles registration storage and logic for any context.
/// This component manages:
/// - Player registrations for contexts (tournaments, quests, etc.)
/// - Entry counts per context
/// - Score submission tracking
/// - Registration banning

#[starknet::component]
pub mod RegistrationComponent {
    use budokan_interfaces::registration::{IRegistration, Registration};
    use budokan_registration::models::{RegistrationData, RegistrationDataStorePacking};
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };

    #[storage]
    pub struct Storage {
        /// Registration data keyed by (game_address, game_token_id)
        /// Stores: context_id, entry_number, has_submitted, is_banned
        Registration_registrations: Map<(ContractAddress, u64), RegistrationData>,
        /// Entry count per context
        Registration_entry_counts: Map<u64, u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[embeddable_as(RegistrationImpl)]
    impl RegistrationComponentImpl<
        TContractState, +HasComponent<TContractState>,
    > of IRegistration<ComponentState<TContractState>> {
        fn get_registration(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> Registration {
            self._get_registration(game_address, token_id)
        }

        fn is_registration_banned(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> bool {
            self.Registration_registrations.entry((game_address, token_id)).read().is_banned
        }

        fn get_context_id_for_token(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> u64 {
            self._get_context_id_for_token(game_address, token_id)
        }

        fn get_entry_count(self: @ComponentState<TContractState>, context_id: u64) -> u32 {
            self._get_entry_count(context_id)
        }

        fn registration_exists(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> bool {
            self._registration_exists(game_address, token_id)
        }
    }

    #[generate_trait]
    pub impl RegistrationInternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of RegistrationInternalTrait<TContractState> {
        /// Get registration for a game token (internal)
        fn _get_registration(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> Registration {
            let reg_data = self.Registration_registrations.entry((game_address, token_id)).read();
            Registration {
                game_address,
                game_token_id: token_id,
                context_id: reg_data.context_id,
                entry_number: reg_data.entry_number,
                has_submitted: reg_data.has_submitted,
                is_banned: reg_data.is_banned,
            }
        }

        /// Get raw registration data (for internal use)
        fn get_registration_data(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> RegistrationData {
            self.Registration_registrations.entry((game_address, token_id)).read()
        }

        /// Set registration for a game token
        fn set_registration(ref self: ComponentState<TContractState>, registration: @Registration) {
            let reg_data = RegistrationData {
                context_id: *registration.context_id,
                entry_number: *registration.entry_number,
                has_submitted: *registration.has_submitted,
                is_banned: *registration.is_banned,
            };
            self
                .Registration_registrations
                .entry((*registration.game_address, *registration.game_token_id))
                .write(reg_data);
        }

        /// Get context ID for a token (internal)
        fn _get_context_id_for_token(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> u64 {
            self.Registration_registrations.entry((game_address, token_id)).read().context_id
        }

        /// Get entry count for a context (internal)
        fn _get_entry_count(self: @ComponentState<TContractState>, context_id: u64) -> u32 {
            self.Registration_entry_counts.entry(context_id).read()
        }

        /// Increment entry count for a context and return new count
        fn increment_entry_count(ref self: ComponentState<TContractState>, context_id: u64) -> u32 {
            let current = self.Registration_entry_counts.entry(context_id).read();
            let new_count = current + 1;
            self.Registration_entry_counts.entry(context_id).write(new_count);
            new_count
        }

        /// Mark a registration as having submitted a score
        fn mark_score_submitted(
            ref self: ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) {
            let registration = self
                .Registration_registrations
                .entry((game_address, token_id))
                .read();
            let updated = RegistrationData {
                context_id: registration.context_id,
                entry_number: registration.entry_number,
                has_submitted: true,
                is_banned: registration.is_banned,
            };
            self.Registration_registrations.entry((game_address, token_id)).write(updated);
        }

        /// Ban a registration
        fn ban_registration(
            ref self: ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) {
            let registration = self
                .Registration_registrations
                .entry((game_address, token_id))
                .read();
            let updated = RegistrationData {
                context_id: registration.context_id,
                entry_number: registration.entry_number,
                has_submitted: registration.has_submitted,
                is_banned: true,
            };
            self.Registration_registrations.entry((game_address, token_id)).write(updated);
        }

        /// Check if a registration exists (has non-zero entry number) (internal)
        fn _registration_exists(
            self: @ComponentState<TContractState>, game_address: ContractAddress, token_id: u64,
        ) -> bool {
            self.Registration_registrations.entry((game_address, token_id)).read().entry_number != 0
        }

        /// Validate registration for score submission
        fn assert_valid_for_submission(
            self: @ComponentState<TContractState>, registration: @Registration, context_id: u64,
        ) {
            // Validate provided token is registered for the specified context
            assert!(
                *registration.context_id == context_id,
                "Registration: Token not registered for context",
            );

            // Score can only be submitted once
            assert!(!*registration.has_submitted, "Registration: Score already submitted");

            // Banned game IDs cannot submit scores
            assert!(!*registration.is_banned, "Registration: Game ID is banned");
        }
    }
}
