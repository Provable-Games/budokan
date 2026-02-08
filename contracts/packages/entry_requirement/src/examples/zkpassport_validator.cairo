// SPDX-License-Identifier: BUSL-1.1

//! ZK Passport Entry Validator
//!
//! Privacy-preserving identity verification for tournament entry using ZK proofs
//! about passport data. Calls a deployed Garaga Honk verifier contract and validates
//! public inputs (service scope, subscope, parameter commitment, nullifier type,
//! proof freshness) without revealing personal information.
//!
//! Configuration (via add_config):
//!   config[0]: verifier_address       - Deployed UltraKeccakZKHonkVerifier contract
//!   config[1]: expected_service_scope  - SHA256("zkpassport.id") truncated to 31 bytes
//!   config[2]: expected_service_subscope - SHA256("bigproof") truncated to 31 bytes
//!   config[3]: expected_param_commitment - SHA256(PROOF_TYPE_AGE, len, min_age, max_age)
//!   config[4]: max_proof_age_seconds   - Max proof age in seconds (e.g., 3600)
//!   config[5]: expected_nullifier_type - Expected nullifier type (0 = NON_SALTED)
//!
//! Qualification proof (via valid_entry qualification param):
//!   qualification[0]:  nullifier_low  - Low 128 bits of passport nullifier
//!   qualification[1]:  nullifier_high - High 128 bits of passport nullifier
//!   qualification[2..]: proof_data    - Full proof calldata passed to verifier

use starknet::ContractAddress;

/// Interface for the Garaga-generated Honk verifier (defined locally to avoid dependency)
#[starknet::interface]
pub trait IUltraKeccakZKHonkVerifier<TContractState> {
    fn verify_ultra_keccak_zk_honk_proof(
        self: @TContractState, full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}

#[starknet::interface]
pub trait IZkPassportValidator<TState> {
    fn get_verifier_address(self: @TState, tournament_id: u64) -> ContractAddress;
    fn get_expected_service_scope(self: @TState, tournament_id: u64) -> felt252;
    fn get_expected_service_subscope(self: @TState, tournament_id: u64) -> felt252;
    fn get_expected_param_commitment(self: @TState, tournament_id: u64) -> felt252;
    fn get_max_proof_age(self: @TState, tournament_id: u64) -> u64;
    fn get_expected_nullifier_type(self: @TState, tournament_id: u64) -> felt252;
    fn is_nullifier_used(self: @TState, tournament_id: u64, nullifier_hash: felt252) -> bool;
}

#[starknet::contract]
pub mod ZkPassportValidator {
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent;
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent::{
        EntryValidator, InternalTrait as EntryValidatorInternalTrait,
    };
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::{
        IUltraKeccakZKHonkVerifierDispatcher, IUltraKeccakZKHonkVerifierDispatcherTrait,
        IZkPassportValidator,
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
        // Per-tournament config
        verifier_address: Map<u64, ContractAddress>,
        expected_service_scope: Map<u64, felt252>,
        expected_service_subscope: Map<u64, felt252>,
        expected_param_commitment: Map<u64, felt252>,
        max_proof_age: Map<u64, u64>,
        expected_nullifier_type: Map<u64, felt252>,
        // Entry tracking
        tournament_entry_limit: Map<u64, u8>,
        tournament_entries: Map<(u64, ContractAddress), u8>,
        // Sybil prevention (per-tournament)
        used_nullifiers: Map<(u64, felt252), bool>,
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

    impl EntryValidatorImplInternal of EntryValidator<ContractState> {
        fn validate_entry(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            // 1. Guard: minimum qualification length and verifier configured
            if qualification.len() < 3 {
                return false;
            }

            let verifier_addr = self.verifier_address.read(tournament_id);
            if verifier_addr.is_zero() {
                return false;
            }

            // 2. Extract claimed nullifier from qualification[0..2]
            let claimed_nullifier_low: felt252 = *qualification.at(0);
            let claimed_nullifier_high: felt252 = *qualification.at(1);

            // 3. Extract proof data from qualification[2..]
            let proof_data = qualification.slice(2, qualification.len() - 2);

            // 4. Call verifier
            let verifier = IUltraKeccakZKHonkVerifierDispatcher {
                contract_address: verifier_addr,
            };
            let result = verifier.verify_ultra_keccak_zk_honk_proof(proof_data);
            let public_inputs = match result {
                Result::Ok(inputs) => inputs,
                Result::Err(_) => { return false; },
            };

            // 5. Assert public_inputs length
            if public_inputs.len() != 7 {
                return false;
            }

            // 6. Validate service scope (public_inputs[2])
            let expected_scope = self.expected_service_scope.read(tournament_id);
            let proof_scope: felt252 = (*public_inputs.at(2)).try_into().unwrap();
            if proof_scope != expected_scope {
                return false;
            }

            // 7. Validate service subscope (public_inputs[3])
            let expected_subscope = self.expected_service_subscope.read(tournament_id);
            let proof_subscope: felt252 = (*public_inputs.at(3)).try_into().unwrap();
            if proof_subscope != expected_subscope {
                return false;
            }

            // 8. Validate param commitment (public_inputs[4])
            let expected_param = self.expected_param_commitment.read(tournament_id);
            let proof_param: felt252 = (*public_inputs.at(4)).try_into().unwrap();
            if proof_param != expected_param {
                return false;
            }

            // 9. Validate nullifier type (public_inputs[5])
            let expected_ntype = self.expected_nullifier_type.read(tournament_id);
            let proof_ntype: felt252 = (*public_inputs.at(5)).try_into().unwrap();
            if proof_ntype != expected_ntype {
                return false;
            }

            // 10. Validate claimed nullifier matches proof nullifier (public_inputs[6])
            let proof_nullifier: u256 = *public_inputs.at(6);
            let claimed_nullifier_low_u128: u128 = claimed_nullifier_low.try_into().unwrap();
            let claimed_nullifier_high_u128: u128 = claimed_nullifier_high.try_into().unwrap();
            let claimed_nullifier = u256 {
                low: claimed_nullifier_low_u128, high: claimed_nullifier_high_u128,
            };
            if proof_nullifier != claimed_nullifier {
                return false;
            }

            // 11. Freshness: current_date (public_inputs[1]) not in future, not older than
            // max_proof_age
            let proof_date: u256 = *public_inputs.at(1);
            let proof_timestamp: u64 = proof_date.try_into().unwrap();
            let block_timestamp = starknet::get_block_timestamp();

            if proof_timestamp > block_timestamp {
                return false;
            }

            let max_age = self.max_proof_age.read(tournament_id);
            if max_age > 0 && (block_timestamp - proof_timestamp) > max_age {
                return false;
            }

            // 12. Sybil check: nullifier not already used for this tournament
            let nullifier_hash = InternalImpl::hash_nullifier(claimed_nullifier_low, claimed_nullifier_high);
            if self.used_nullifiers.read((tournament_id, nullifier_hash)) {
                return false;
            }

            true
        }

        fn should_ban_entry(
            self: @ContractState,
            tournament_id: u64,
            game_token_id: u64,
            current_owner: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            // ZK passport verification is entry-time only; no ongoing condition to revoke
            false
        }

        fn entries_left(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8> {
            let entry_limit = self.tournament_entry_limit.read(tournament_id);
            if entry_limit == 0 {
                return Option::None;
            }
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries.read(key);
            Option::Some(entry_limit - current_entries)
        }

        fn add_config(
            ref self: ContractState, tournament_id: u64, entry_limit: u8, config: Span<felt252>,
        ) {
            assert!(config.len() == 6, "ZkPassportValidator: config must have exactly 6 elements");

            let verifier_addr: ContractAddress = (*config.at(0)).try_into().unwrap();
            assert!(!verifier_addr.is_zero(), "ZkPassportValidator: verifier address cannot be zero");

            self.verifier_address.write(tournament_id, verifier_addr);
            self.expected_service_scope.write(tournament_id, *config.at(1));
            self.expected_service_subscope.write(tournament_id, *config.at(2));
            self.expected_param_commitment.write(tournament_id, *config.at(3));

            let max_age: u64 = (*config.at(4)).try_into().unwrap();
            self.max_proof_age.write(tournament_id, max_age);

            self.expected_nullifier_type.write(tournament_id, *config.at(5));
            self.tournament_entry_limit.write(tournament_id, entry_limit);
        }

        fn on_entry_added(
            ref self: ContractState,
            tournament_id: u64,
            game_token_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            // Extract nullifier from qualification and mark as used
            let nullifier_low: felt252 = *qualification.at(0);
            let nullifier_high: felt252 = *qualification.at(1);
            let nullifier_hash = InternalImpl::hash_nullifier(nullifier_low, nullifier_high);
            self.used_nullifiers.write((tournament_id, nullifier_hash), true);

            // Track entry count
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries.read(key);
            self.tournament_entries.write(key, current_entries + 1);
        }

        fn on_entry_removed(
            ref self: ContractState,
            tournament_id: u64,
            game_token_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            // Release nullifier
            let nullifier_low: felt252 = *qualification.at(0);
            let nullifier_high: felt252 = *qualification.at(1);
            let nullifier_hash = InternalImpl::hash_nullifier(nullifier_low, nullifier_high);
            self.used_nullifiers.write((tournament_id, nullifier_hash), false);

            // Decrement entry count
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries.read(key);
            if current_entries > 0 {
                self.tournament_entries.write(key, current_entries - 1);
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn hash_nullifier(nullifier_low: felt252, nullifier_high: felt252) -> felt252 {
            poseidon_hash_span(array![nullifier_low, nullifier_high].span())
        }
    }

    #[abi(embed_v0)]
    impl ZkPassportValidatorImpl of IZkPassportValidator<ContractState> {
        fn get_verifier_address(self: @ContractState, tournament_id: u64) -> ContractAddress {
            self.verifier_address.read(tournament_id)
        }

        fn get_expected_service_scope(self: @ContractState, tournament_id: u64) -> felt252 {
            self.expected_service_scope.read(tournament_id)
        }

        fn get_expected_service_subscope(self: @ContractState, tournament_id: u64) -> felt252 {
            self.expected_service_subscope.read(tournament_id)
        }

        fn get_expected_param_commitment(self: @ContractState, tournament_id: u64) -> felt252 {
            self.expected_param_commitment.read(tournament_id)
        }

        fn get_max_proof_age(self: @ContractState, tournament_id: u64) -> u64 {
            self.max_proof_age.read(tournament_id)
        }

        fn get_expected_nullifier_type(self: @ContractState, tournament_id: u64) -> felt252 {
            self.expected_nullifier_type.read(tournament_id)
        }

        fn is_nullifier_used(
            self: @ContractState, tournament_id: u64, nullifier_hash: felt252,
        ) -> bool {
            self.used_nullifiers.read((tournament_id, nullifier_hash))
        }
    }
}
