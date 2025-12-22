// SPDX-License-Identifier: BUSL-1.1

/// EntryRequirementComponent handles entry requirements for any context (tournaments, quests,
/// etc.).
/// This component manages:
/// - Entry requirement configuration per context
/// - Entry requirement type (token, allowlist, extension)
/// - Qualification entries tracking
/// - Entry count management

#[starknet::component]
pub mod EntryRequirementComponent {
    use budokan_entry_requirement::models::{
        EntryRequirement, EntryRequirementMeta, EntryRequirementMetaStorePacking,
        EntryRequirementType, ExtensionConfig, QualificationEntries, QualificationProof,
    };
    use budokan_interfaces::entry_requirement::IEntryRequirement;
    use budokan_interfaces::entry_validator::{
        IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
    };
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{
        Map, MutableVecTrait, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
        Vec, VecTrait,
    };
    use starknet::{ContractAddress, get_caller_address};

    // Entry requirement type constants
    const REQ_TYPE_TOKEN: u8 = 0;
    const REQ_TYPE_ALLOWLIST: u8 = 1;
    const REQ_TYPE_EXTENSION: u8 = 2;
    const REQ_TYPE_NONE: u8 = 255;

    #[storage]
    pub struct Storage {
        /// Entry requirement metadata keyed by context_id (entry_limit + req_type)
        EntryRequirement_meta: Map<u64, EntryRequirementMeta>,
        /// Token address for token-gated requirements
        EntryRequirement_token: Map<u64, ContractAddress>,
        /// Allowlist addresses for allowlist-gated requirements (stored as Vec)
        EntryRequirement_allowlist: Map<u64, Vec<ContractAddress>>,
        /// Extension address for extension-gated requirements
        EntryRequirement_extension_address: Map<u64, ContractAddress>,
        /// Extension config data (stored as Vec)
        /// TODO: Remove as this will be stored within the extension contract
        EntryRequirement_extension_config: Map<u64, Vec<felt252>>,
        /// Qualification entries tracking keyed by (context_id, qualification_hash)
        EntryRequirement_qualification_entries: Map<(u64, felt252), u8>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[embeddable_as(EntryRequirementImpl)]
    impl EntryRequirementComponentImpl<
        TContractState, +HasComponent<TContractState>,
    > of IEntryRequirement<ComponentState<TContractState>> {
        fn get_entry_requirement(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Option<EntryRequirement> {
            self._get_entry_requirement(context_id)
        }

        fn get_qualification_entries(
            self: @ComponentState<TContractState>, context_id: u64, proof: QualificationProof,
        ) -> QualificationEntries {
            self._get_qualification_entries(context_id, proof)
        }
    }

    #[generate_trait]
    pub impl EntryRequirementInternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of EntryRequirementInternalTrait<TContractState> {
        /// Get entry requirement for a context (internal)
        /// Returns None if no entry requirement is set (req_type is 255)
        fn _get_entry_requirement(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Option<EntryRequirement> {
            let meta = self.EntryRequirement_meta.entry(context_id).read();

            // If req_type is 255, no entry requirement is set
            if meta.req_type == REQ_TYPE_NONE {
                return Option::None;
            }

            let entry_requirement_type = match meta.req_type {
                0 => { // TOKEN
                    let token = self.EntryRequirement_token.entry(context_id).read();
                    EntryRequirementType::token(token)
                },
                1 => { // ALLOWLIST
                    let addresses = self.read_allowlist(context_id);
                    EntryRequirementType::allowlist(addresses)
                },
                2 => { // EXTENSION
                    let address = self.EntryRequirement_extension_address.entry(context_id).read();
                    let config = self.read_extension_config(context_id);
                    EntryRequirementType::extension(ExtensionConfig { address, config })
                },
                _ => { return Option::None; },
            };

            Option::Some(EntryRequirement { entry_limit: meta.entry_limit, entry_requirement_type })
        }

        /// Set entry requirement for a context
        fn set_entry_requirement(
            ref self: ComponentState<TContractState>,
            context_id: u64,
            entry_requirement: Option<EntryRequirement>,
        ) {
            match entry_requirement {
                Option::Some(req) => {
                    let (req_type, entry_limit) = match req.entry_requirement_type {
                        EntryRequirementType::token(token) => {
                            self.EntryRequirement_token.entry(context_id).write(token);
                            (REQ_TYPE_TOKEN, req.entry_limit)
                        },
                        EntryRequirementType::allowlist(addresses) => {
                            self.write_allowlist(context_id, addresses);
                            (REQ_TYPE_ALLOWLIST, req.entry_limit)
                        },
                        EntryRequirementType::extension(config) => {
                            self
                                .EntryRequirement_extension_address
                                .entry(context_id)
                                .write(config.address);
                            self.write_extension_config(context_id, config.config);
                            (REQ_TYPE_EXTENSION, req.entry_limit)
                        },
                    };

                    let meta = EntryRequirementMeta { entry_limit, req_type };
                    self.EntryRequirement_meta.entry(context_id).write(meta);
                },
                Option::None => {
                    // Write empty meta with REQ_TYPE_NONE
                    let meta = EntryRequirementMeta { entry_limit: 0, req_type: REQ_TYPE_NONE };
                    self.EntryRequirement_meta.entry(context_id).write(meta);
                },
            }
        }

        /// Get qualification entries for a context and qualification proof (internal)
        fn _get_qualification_entries(
            self: @ComponentState<TContractState>, context_id: u64, proof: QualificationProof,
        ) -> QualificationEntries {
            let qualification_hash = self.hash_qualification_proof(proof);
            let entry_count = self
                .EntryRequirement_qualification_entries
                .entry((context_id, qualification_hash))
                .read();
            QualificationEntries { context_id, qualification_proof: proof, entry_count }
        }

        /// Set qualification entries for a context
        fn set_qualification_entries(
            ref self: ComponentState<TContractState>, entries: @QualificationEntries,
        ) {
            let qualification_hash = self.hash_qualification_proof(*entries.qualification_proof);
            self
                .EntryRequirement_qualification_entries
                .entry((*entries.context_id, qualification_hash))
                .write(*entries.entry_count);
        }

        // Internal helper functions
        fn read_allowlist(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Span<ContractAddress> {
            let vec = self.EntryRequirement_allowlist.entry(context_id);
            let mut arr = ArrayTrait::new();
            let len = vec.len();
            let mut i: u64 = 0;
            loop {
                if i >= len {
                    break;
                }
                arr.append(vec.at(i).read());
                i += 1;
            }
            arr.span()
        }

        fn write_allowlist(
            ref self: ComponentState<TContractState>,
            context_id: u64,
            addresses: Span<ContractAddress>,
        ) {
            let mut vec = self.EntryRequirement_allowlist.entry(context_id);
            let mut i: u32 = 0;
            loop {
                if i >= addresses.len() {
                    break;
                }
                vec.push(*addresses.at(i));
                i += 1;
            };
        }

        fn read_extension_config(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Span<felt252> {
            let vec = self.EntryRequirement_extension_config.entry(context_id);
            let mut arr = ArrayTrait::new();
            let len = vec.len();
            let mut i: u64 = 0;
            loop {
                if i >= len {
                    break;
                }
                arr.append(vec.at(i).read());
                i += 1;
            }
            arr.span()
        }

        fn write_extension_config(
            ref self: ComponentState<TContractState>, context_id: u64, config: Span<felt252>,
        ) {
            let mut vec = self.EntryRequirement_extension_config.entry(context_id);
            let mut i: u32 = 0;
            loop {
                if i >= config.len() {
                    break;
                }
                vec.push(*config.at(i));
                i += 1;
            };
        }

        fn hash_qualification_proof(
            self: @ComponentState<TContractState>, proof: QualificationProof,
        ) -> felt252 {
            let mut data = ArrayTrait::new();
            proof.serialize(ref data);
            poseidon_hash_span(data.span())
        }

        /// Update qualification entries after a successful entry
        /// Handles both extension-based and standard entry counting
        /// NOTE: For extensions, this only validates entries_left. The actual add_entry
        /// call must be made by the caller (Budokan) after minting when game_token_id is available.
        fn update_qualification_entries(
            ref self: ComponentState<TContractState>,
            context_id: u64,
            qualifier: QualificationProof,
            entry_requirement: EntryRequirement,
        ) {
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::extension(extension_config) => {
                    let extension_address = extension_config.address;
                    let entry_validator_dispatcher = IEntryValidatorDispatcher {
                        contract_address: extension_address,
                    };
                    let display_extension_address: felt252 = extension_address.into();
                    let caller_address = get_caller_address();

                    let qualification = match qualifier {
                        QualificationProof::Extension(qual) => qual,
                        _ => panic!(
                            "EntryRequirement: Provided qualification proof is not of type 'Extension'",
                        ),
                    };

                    let entries_left = entry_validator_dispatcher
                        .entries_left(context_id, caller_address, qualification);

                    match entries_left {
                        Option::Some(entries_left) => {
                            assert!(
                                entries_left > 0,
                                "EntryRequirement: No entries left according to extension {}",
                                display_extension_address,
                            );
                        },
                        Option::None => {},
                    }
                },
                _ => {
                    let entry_limit = entry_requirement.entry_limit;
                    if entry_limit != 0 {
                        let mut qualification_entries = self
                            ._get_qualification_entries(context_id, qualifier);

                        assert!(
                            qualification_entries.entry_count < entry_limit.try_into().unwrap(),
                            "EntryRequirement: Maximum qualified entries reached for context {}",
                            context_id,
                        );

                        qualification_entries.entry_count += 1;

                        self.set_qualification_entries(@qualification_entries);
                    }
                },
            }
        }
    }
}
