// SPDX-License-Identifier: BUSL-1.1

#[starknet::contract]
pub mod Budokan {
    use budokan::events;
    use budokan::libs::schedule::{
        ScheduleAssertionsImpl, ScheduleAssertionsTrait, ScheduleImpl, ScheduleTrait,
    };
    use budokan::structs::budokan::{
        AdditionalShare, Distribution, EntryFee, EntryRequirement, EntryRequirementType, GameConfig,
        LeaderboardConfig, Metadata, PrizeData, QualificationProof, Registration, RewardType,
        TokenTypeData, Tournament as TournamentModel,
    };
    use budokan::structs::packed_storage::{
        TournamentConfig, TournamentConfigStorePacking, unpack_created_at,
        unpack_game_start_delay, unpack_registration_end_delay, unpack_registration_start_delay,
    };
    use budokan::structs::schedule::{Phase, Schedule};
    use budokan_interfaces::budokan::IBudokan;
    use budokan_interfaces::rewards::{IBudokanRewardsLibraryDispatcher, IBudokanRewardsDispatcherTrait};
    use core::num::traits::Zero;
    use game_components_embeddable_game_standard::metagame::extensions::context::context::ContextComponent;
    use game_components_embeddable_game_standard::metagame::extensions::context::interface::{
        IMetagameContext, IMetagameContextDetails,
    };
    use game_components_embeddable_game_standard::metagame::extensions::context::structs::{
        GameContext, GameContextDetails,
    };
    use game_components_embeddable_game_standard::metagame::metagame::get_game_fee_info;
    use game_components_embeddable_game_standard::metagame::metagame_component::MetagameComponent;
    use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
        IMinigameSettingsDispatcher, IMinigameSettingsDispatcherTrait,
    };
    use game_components_embeddable_game_standard::minigame::interface::{
        IMINIGAME_ID, IMinigameDispatcher, IMinigameDispatcherTrait, IMinigameTokenDataDispatcher,
        IMinigameTokenDataDispatcherTrait,
    };
    use game_components_embeddable_game_standard::token::interface::{
        IMinigameTokenDispatcher, IMinigameTokenDispatcherTrait,
    };
    use game_components_interfaces::entry_fee::{
        EntryFee as ComponentEntryFee, EntryFeeConfig, EntryFeeDeposit,
    };
    use game_components_interfaces::leaderboard::{ILeaderboard, LeaderboardResult};
    use game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent;
    use game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent::EntryFeeInternalTrait;
    use game_components_metagame::entry_requirement::entry_requirement_component::EntryRequirementComponent;
    use game_components_metagame::entry_requirement::entry_requirement_component::EntryRequirementComponent::EntryRequirementInternalTrait;
    use game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent;
    use game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardInternalTrait;
    use game_components_metagame::leaderboard::store::Store as LeaderboardStore;
    use game_components_metagame::prize::prize_component::PrizeComponent;
    use game_components_metagame::registration::registration_component::RegistrationComponent;
    use game_components_metagame::registration::registration_component::RegistrationComponent::RegistrationInternalTrait;
    use game_components_utilities::utils::encoding::u128_to_ascii_felt;
    use metagame_extensions_interfaces::entry_requirement_extension::{
        IEntryRequirementExtensionDispatcher, IEntryRequirementExtensionDispatcherTrait,
    };
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use openzeppelin_interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin_upgrades::UpgradeableComponent;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{
        ClassHash, ContractAddress, get_block_timestamp, get_caller_address, get_contract_address,
    };

    // Components needed: metagame requires SRC5, leaderboard for tournament rankings
    component!(path: MetagameComponent, storage: metagame, event: MetagameEvent);
    component!(path: ContextComponent, storage: context, event: ContextEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: LeaderboardComponent, storage: leaderboard, event: LeaderboardEvent);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    // Budokan-specific components
    component!(path: RegistrationComponent, storage: registration, event: RegistrationEvent);
    component!(path: EntryFeeComponent, storage: entry_fee, event: EntryFeeEvent);
    component!(
        path: EntryRequirementComponent, storage: entry_requirement, event: EntryRequirementEvent,
    );
    component!(path: PrizeComponent, storage: prize, event: PrizeEvent);
    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );

    #[abi(embed_v0)]
    impl MetagameImpl = MetagameComponent::MetagameImpl<ContractState>;
    impl MetagameInternalImpl = MetagameComponent::InternalImpl<ContractState>;

    impl MetagameInternalContextImpl = ContextComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    // Budokan component embeddable implementations
    #[abi(embed_v0)]
    impl EntryFeeImpl = EntryFeeComponent::EntryFeeImpl<ContractState>;
    #[abi(embed_v0)]
    impl EntryRequirementImpl =
        EntryRequirementComponent::EntryRequirementImpl<ContractState>;
    #[abi(embed_v0)]
    impl PrizeImpl = PrizeComponent::PrizeImpl<ContractState>;
    #[abi(embed_v0)]
    impl RegistrationImpl = RegistrationComponent::RegistrationImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        metagame: MetagameComponent::Storage,
        #[substorage(v0)]
        context: ContextComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        leaderboard: LeaderboardComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        // Budokan-specific components
        #[substorage(v0)]
        registration: RegistrationComponent::Storage,
        #[substorage(v0)]
        entry_fee: EntryFeeComponent::Storage,
        #[substorage(v0)]
        entry_requirement: EntryRequirementComponent::Storage,
        #[substorage(v0)]
        prize: PrizeComponent::Storage,
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        // Platform-wide metrics
        total_tournaments: u64,
        // Tournament base data
        tournament_created_by: Map<u64, ContractAddress>,
        tournament_config: Map<
            u64, felt252,
        >, // Packed felt252: delays + flags + created_at + settings_id
        tournament_creator_token_id: Map<u64, felt252>,
        tournament_game_address: Map<u64, ContractAddress>,
        tournament_metadata: Map<u64, Metadata>,
        tournament_client_url: Map<u64, ByteArray>, // Optional client URL from GameConfig
        tournament_renderer_address: Map<u64, ContractAddress>, // Optional renderer (zero = none)
        // Position-based entry fee claims: (tournament_id, position) -> claimed
        entry_fee_position_claimed: Map<(u64, u32), bool>,
        // Prize position mapping: prize_id -> position (for Single prizes)
        prize_position: Map<u64, u32>,
        // Map (context_id, game_token_id) → entry_id for reverse lookups
        token_to_entry: Map<(u64, felt252), u32>,
        // Map game_token_id → context_id (tournament_id) for global token lookups
        token_context_id: Map<felt252, u64>,
        // Class hash of the BudokanRewards library class. `add_prize` and
        // `claim_reward` dispatch into it via library_call to keep this
        // contract under the 81,920-felt bytecode limit. Owner-set via
        // `set_rewards_class_hash`.
        rewards_class_hash: ClassHash,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        MetagameEvent: MetagameComponent::Event,
        #[flat]
        ContextEvent: ContextComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        LeaderboardEvent: LeaderboardComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        RegistrationEvent: RegistrationComponent::Event,
        #[flat]
        EntryFeeEvent: EntryFeeComponent::Event,
        #[flat]
        EntryRequirementEvent: EntryRequirementComponent::Event,
        #[flat]
        PrizeEvent: PrizeComponent::Event,
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        TournamentCreated: events::TournamentCreated,
        TournamentRegistration: events::TournamentRegistration,
        LeaderboardUpdated: events::LeaderboardUpdated,
        PrizeAdded: events::PrizeAdded,
        RewardClaimed: events::RewardClaimed,
        QualificationEntriesUpdated: events::QualificationEntriesUpdated,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, default_token_address: ContractAddress,
    ) {
        // Initialize ownable component with the provided owner
        self.ownable.initializer(owner);

        // Initialize metagame component
        self.context.initializer();
        self.metagame.initializer(Option::Some(get_contract_address()), default_token_address);

        // Initialize leaderboard component with this contract as owner
        self.leaderboard.initializer(get_contract_address());
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    /// Owner-only configuration for the BudokanRewards library class hash.
    /// Must be set after deploy / upgrade before `add_prize` or `claim_reward`
    /// can be invoked. Allows independent upgrades of the rewards class.
    #[starknet::interface]
    pub trait IBudokanRewardsAdmin<TState> {
        fn set_rewards_class_hash(ref self: TState, new_class_hash: ClassHash);
        fn rewards_class_hash(self: @TState) -> ClassHash;
    }

    #[abi(embed_v0)]
    impl BudokanRewardsAdminImpl of IBudokanRewardsAdmin<ContractState> {
        fn set_rewards_class_hash(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            assert!(!new_class_hash.is_zero(), "Budokan: rewards class hash cannot be zero");
            self.rewards_class_hash.write(new_class_hash);
        }

        fn rewards_class_hash(self: @ContractState) -> ClassHash {
            self.rewards_class_hash.read()
        }
    }

    #[abi(embed_v0)]
    impl GameContextImpl of IMetagameContext<ContractState> {
        fn has_context(self: @ContractState, token_id: felt252) -> bool {
            let tournament_id = self.token_context_id.entry(token_id).read();
            tournament_id != 0
        }
    }

    #[abi(embed_v0)]
    impl GameContextDetailsImpl of IMetagameContextDetails<ContractState> {
        fn context_details(self: @ContractState, token_id: felt252) -> GameContextDetails {
            let tournament_id = self.token_context_id.entry(token_id).read();
            let context = array![
                GameContext {
                    name: 'Tournament ID', value: u128_to_ascii_felt(tournament_id.into()),
                },
            ]
                .span();
            GameContextDetails {
                name: "Budokan",
                description: "The onchain tournament system",
                id: Option::Some(tournament_id.try_into().expect('context_id exceeds u32::MAX')),
                context: context,
            }
        }
    }

    #[abi(embed_v0)]
    impl BudokanImpl of IBudokan<ContractState> {
        fn total_tournaments(self: @ContractState) -> u64 {
            self.total_tournaments.read()
        }

        fn tournament(self: @ContractState, tournament_id: u64) -> TournamentModel {
            self._get_tournament(tournament_id)
        }

        fn tournament_entries(self: @ContractState, tournament_id: u64) -> u32 {
            self.registration._get_entry_count(tournament_id)
        }

        fn get_leaderboard(self: @ContractState, tournament_id: u64) -> Array<felt252> {
            self._get_leaderboard(tournament_id)
        }

        fn current_phase(self: @ContractState, tournament_id: u64) -> Phase {
            let packed = self.tournament_config.entry(tournament_id).read();
            let config = TournamentConfigStorePacking::unpack(packed);
            let schedule = Schedule {
                registration_start_delay: config.registration_start_delay,
                registration_end_delay: config.registration_end_delay,
                game_start_delay: config.game_start_delay,
                game_end_delay: config.game_end_delay,
                submission_duration: config.submission_duration,
            };
            schedule.current_phase(config.created_at, get_block_timestamp())
        }

        fn tournament_distribution_shares(self: @ContractState, tournament_id: u64) -> Array<u16> {
            let stored_entry_fee = self.entry_fee._get_entry_fee(tournament_id);
            match stored_entry_fee {
                Option::Some(config) => match config.distribution {
                    Option::Some(Distribution::Custom(_)) => self
                        .entry_fee
                        ._get_distribution_shares(tournament_id, config.distribution_count),
                    _ => ArrayTrait::new(),
                },
                Option::None => ArrayTrait::new(),
            }
        }

        fn create_tournament(
            ref self: ContractState,
            creator_rewards_address: ContractAddress,
            metadata: Metadata,
            schedule: Schedule,
            game_config: GameConfig,
            entry_fee: Option<EntryFee>,
            entry_requirement: Option<EntryRequirement>,
            leaderboard_config: LeaderboardConfig,
            salt: u16,
            metadata_value: u16,
        ) -> TournamentModel {
            self.reentrancy_guard.start();

            schedule.assert_is_valid();
            self._assert_valid_game_config(@game_config);

            // Validate entry fee shares don't exceed 100%
            if let Option::Some(ef) = @entry_fee {
                self._assert_valid_entry_fee_shares(ef);
            }

            // Enforce game registry fee: game_creator_share must meet the registry minimum
            if let Option::Some(ef) = @entry_fee {
                self._assert_game_fee_met(game_config.game_address, *ef.game_creator_share);
            }

            if let Option::Some(entry_requirement) = entry_requirement {
                self._assert_valid_entry_requirement(entry_requirement, schedule);
            }

            let empty_objective_id: Option<u32> = Option::None;

            // Compute absolute game start/end from delays for the creator token mint
            let created_at = get_block_timestamp();
            let game_start = created_at + schedule.game_start_delay.into();
            let game_end = game_start + schedule.game_end_delay.into();

            // mint a game to the tournament creator for reward distribution
            let creator_token_id: felt252 = self
                ._mint_game(
                    game_config.game_address,
                    Option::Some('Tournament Creator'),
                    Option::Some(game_config.settings_id),
                    Option::Some(game_start),
                    Option::Some(game_end),
                    empty_objective_id,
                    Option::None, // creator token, so we don't want to give it context
                    Option::None, // client_url
                    Option::None, // renderer_address
                    Option::None, // skills_address
                    creator_rewards_address,
                    false, // soulbound
                    false, // paymaster
                    salt,
                    metadata_value,
                );

            let tournament = self
                ._create_tournament(
                    creator_token_id,
                    metadata,
                    schedule,
                    game_config,
                    entry_fee,
                    entry_requirement,
                    leaderboard_config,
                );

            self.reentrancy_guard.end();

            tournament
        }

        fn enter_tournament(
            ref self: ContractState,
            tournament_id: u64,
            player_name: felt252,
            player_address: ContractAddress,
            qualification: Option<QualificationProof>,
            salt: u16,
            metadata_value: u16,
        ) -> (felt252, u32) {
            self.reentrancy_guard.start();

            let tournament = self._get_tournament(tournament_id);

            self._assert_tournament_exists(tournament_id);

            tournament
                .schedule
                .assert_registration_open(tournament.created_at, get_block_timestamp());

            let caller_address = get_caller_address();

            // Determine the actual recipient based on entry requirements and qualification
            let mint_to_address = if let Option::Some(entry_requirement) = tournament
                .entry_requirement {
                let recipient = self
                    ._process_entry_requirement(tournament_id, entry_requirement, qualification);
                if recipient == caller_address {
                    player_address
                } else {
                    recipient
                }
            } else {
                player_address
            };

            if let Option::Some(entry_fee) = tournament.entry_fee {
                // Convert to EntryFeeConfig for component deposit
                let game_creator_share = if entry_fee.game_creator_share > 0 {
                    Option::Some(entry_fee.game_creator_share)
                } else {
                    Option::None
                };
                let refund_share = if entry_fee.refund_share > 0 {
                    Option::Some(entry_fee.refund_share)
                } else {
                    Option::None
                };
                let deposit_config = EntryFeeConfig {
                    token_address: entry_fee.token_address,
                    amount: entry_fee.amount,
                    game_creator_share,
                    refund_share,
                    additional_shares: array![].span(),
                    // Deposit path doesn't need the distribution — the pool
                    // shape is already persisted via set_entry_fee at creation.
                    distribution: Option::None,
                    distribution_count: 0,
                };
                self
                    .entry_fee
                    .deposit_entry_fee(tournament_id, EntryFeeDeposit::Config(deposit_config));
            }

            let empty_objective_id: Option<u32> = Option::None;
            let context = self._create_context(tournament_id);

            let client_url = match @tournament.game_config.client_url {
                Option::Some(url) => Option::Some(url.clone()),
                Option::None => {
                    Option::Some(format!("https://budokan.gg/tournament/{}", tournament.id))
                },
            };

            let renderer = match tournament.game_config.renderer {
                Option::Some(addr) => Option::Some(addr),
                Option::None => Option::None,
            };

            // Compute absolute times for the mint
            let game_start = tournament.created_at + tournament.schedule.game_start_delay.into();
            let game_end = game_start + tournament.schedule.game_end_delay.into();

            // mint game to the determined recipient
            let game_token_id: felt252 = self
                ._mint_game(
                    tournament.game_config.game_address,
                    Option::Some(player_name),
                    Option::Some(tournament.game_config.settings_id),
                    Option::Some(game_start),
                    Option::Some(game_end),
                    empty_objective_id,
                    Option::Some(context),
                    client_url,
                    renderer,
                    Option::None, // skills_address
                    mint_to_address, // to
                    tournament.game_config.soulbound, // soulbound
                    tournament.game_config.paymaster, // paymaster
                    salt,
                    metadata_value,
                );

            // For extension-based entry requirements, register the entry with the extension
            // now that we have the game_token_id
            if let Option::Some(entry_requirement) = tournament.entry_requirement {
                if let EntryRequirementType::extension(extension_config) = entry_requirement
                    .entry_requirement_type {
                    let qualification_proof = match qualification {
                        Option::Some(QualificationProof::Extension(proof)) => proof,
                        _ => array![].span(),
                    };
                    let entry_validator = IEntryRequirementExtensionDispatcher {
                        contract_address: extension_config.address,
                    };
                    entry_validator
                        .add_entry(
                            tournament_id, game_token_id, caller_address, qualification_proof,
                        );
                }
            }

            let entry_id = self._increment_entry_count(tournament_id);

            // associate game token with tournament via registration
            let registration = Registration {
                context_id: tournament_id,
                entry_id,
                game_token_id,
                has_submitted: false,
                is_banned: false,
            };
            self._set_registration(tournament.game_config.game_address, @registration);

            self.reentrancy_guard.end();

            // return game token id and entry number
            (game_token_id, entry_id)
        }

        fn ban_entry(
            ref self: ContractState,
            tournament_id: u64,
            game_token_id: felt252,
            proof: Span<felt252>,
        ) {
            self.reentrancy_guard.start();

            // Assert tournament exists
            self._assert_tournament_exists(tournament_id);

            // Read packed config (1 SLOAD) + game_address (1 SLOAD) + entry_requirement (1 SLOAD)
            let packed = self.tournament_config.entry(tournament_id).read();
            let game_address = self.tournament_game_address.entry(tournament_id).read();

            // Ensure tournament has an extension entry requirement
            let entry_requirement = self.entry_requirement._get_entry_requirement(tournament_id);
            assert!(entry_requirement.is_some(), "Budokan: No entry requirement set");

            let extension_config = match entry_requirement.unwrap().entry_requirement_type {
                EntryRequirementType::extension(config) => config,
                _ => panic!("Budokan: Entry requirement must be of type 'extension'"),
            };

            let extension_address = extension_config.address;

            // Can only ban from registration start up until game starts
            let current_time = get_block_timestamp();
            let created_at = unpack_created_at(packed);
            let registration_start_delay = unpack_registration_start_delay(packed);
            let registration_end_delay = unpack_registration_end_delay(packed);
            let game_start_delay = unpack_game_start_delay(packed);
            let has_registration = registration_start_delay > 0 || registration_end_delay > 0;
            if has_registration {
                let reg_start: u64 = created_at + registration_start_delay.into();
                let game_start: u64 = created_at + game_start_delay.into();
                assert!(
                    current_time >= reg_start && current_time < game_start,
                    "Budokan: Can only ban from registration start until game starts",
                );
            } else {
                panic!("Budokan: Can only ban tournaments with registration period set");
            }
            let game_token_address = IMinigameDispatcher { contract_address: game_address }
                .token_address();
            let game_dispatcher = IERC721Dispatcher { contract_address: game_token_address };
            let entry_validator_dispatcher = IEntryRequirementExtensionDispatcher {
                contract_address: extension_address,
            };

            // Look up entry_id from game_token_id
            let entry_id = self.token_to_entry.entry((tournament_id, game_token_id)).read();
            let registration = self.registration._get_entry(tournament_id, entry_id);

            // Verify this registration belongs to this tournament
            assert!(
                registration.context_id == tournament_id,
                "Budokan: Game ID not registered for this tournament",
            );

            // Assert game ID is not already banned
            assert!(!registration.is_banned, "Budokan: Game ID is already banned");

            // Get the current owner of this game token
            let current_owner = game_dispatcher.owner_of(game_token_id.into());

            // Ask the extension if this entry should be banned.
            // Budokan is the context owner — it was the caller at add_config time.
            let should_ban = entry_validator_dispatcher
                .should_ban(
                    starknet::get_contract_address(),
                    tournament_id,
                    game_token_id,
                    current_owner,
                    proof,
                );

            // Assert should be banned to avoid wasting gas on invalid ban attempts
            assert!(should_ban, "Budokan: Entry should not be banned");

            // Notify the extension to update its entry tracking
            entry_validator_dispatcher
                .remove_entry(tournament_id, game_token_id, current_owner, proof);

            // Update registration to mark as banned using component
            self.registration.ban_entry(tournament_id, entry_id);

            // Emit native event (reuse current_owner — same value, saves one external call)
            self
                .emit(
                    events::TournamentRegistration {
                        tournament_id,
                        game_token_id,
                        game_address: game_address,
                        player_address: current_owner,
                        entry_number: registration.entry_id,
                        has_submitted: false,
                        is_banned: true,
                    },
                );

            self.reentrancy_guard.end();
        }

        fn submit_score(
            ref self: ContractState, tournament_id: u64, token_id: felt252, position: u32,
        ) {
            self.reentrancy_guard.start();

            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            // Read packed config (1 SLOAD) + game_address (1 SLOAD)
            let packed = self.tournament_config.entry(tournament_id).read();
            let config = TournamentConfigStorePacking::unpack(packed);
            let game_address = self.tournament_game_address.entry(tournament_id).read();

            // look up entry_id from token_id
            let entry_id = self.token_to_entry.entry((tournament_id, token_id)).read();
            let registration = self.registration._get_entry(tournament_id, entry_id);

            // get score for token id
            let submitted_score = self.get_score_for_token_id(game_address, token_id);

            // If game_must_be_over is set, verify the game is finished before accepting score
            if config.game_must_be_over {
                let game_dispatcher = IMinigameTokenDataDispatcher {
                    contract_address: game_address,
                };
                assert(game_dispatcher.game_over(token_id), 'Budokan: Game not over');
            }

            // validate tournament-specific rules (phase, registration, etc.)
            let schedule = Schedule {
                registration_start_delay: config.registration_start_delay,
                registration_end_delay: config.registration_end_delay,
                game_start_delay: config.game_start_delay,
                game_end_delay: config.game_end_delay,
                submission_duration: config.submission_duration,
            };
            self
                ._validate_score_submission(
                    tournament_id, schedule, config.created_at, @registration,
                );

            // Submit score using leaderboard component (config is stored in leaderboard)
            let result = ILeaderboard::submit_score(
                ref self.leaderboard, tournament_id, token_id, submitted_score, position,
            );

            // Handle result
            match result {
                LeaderboardResult::Success => {
                    // mark score as submitted
                    self._mark_score_submitted(tournament_id, token_id, game_address);

                    // Emit native event
                    let leaderboard = self._get_leaderboard(tournament_id);
                    self
                        .emit(
                            events::LeaderboardUpdated {
                                tournament_id, token_ids: leaderboard.span(),
                            },
                        );
                },
                LeaderboardResult::InvalidPosition => { panic!("Budokan: Invalid position"); },
                LeaderboardResult::DuplicateEntry => {
                    panic!("Budokan: Token already on leaderboard");
                },
                LeaderboardResult::ScoreTooLow => {
                    panic!("Budokan: Score too low for position");
                },
                LeaderboardResult::ScoreTooHigh => {
                    panic!("Budokan: Score too high for position");
                },
                LeaderboardResult::LeaderboardFull => { panic!("Budokan: Leaderboard is full"); },
                LeaderboardResult::InvalidConfig => {
                    panic!("Budokan: Invalid leaderboard config");
                },
            }

            self.reentrancy_guard.end();
        }

        fn claim_reward(ref self: ContractState, tournament_id: u64, reward_type: RewardType) {
            self.reentrancy_guard.start();
            IBudokanRewardsLibraryDispatcher { class_hash: self._rewards_class_hash() }
                .claim_reward(tournament_id, reward_type);
            self.reentrancy_guard.end();
        }

        fn add_prize(
            ref self: ContractState,
            tournament_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            position: Option<u32>,
        ) -> PrizeData {
            self.reentrancy_guard.start();
            let prize_data = IBudokanRewardsLibraryDispatcher {
                class_hash: self._rewards_class_hash(),
            }
                .add_prize(tournament_id, token_address, token_type, position);
            self.reentrancy_guard.end();
            prize_data
        }
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        //
        // STORAGE HELPERS
        //

        // Leaderboard operations
        #[inline(always)]
        fn _get_leaderboard(self: @ContractState, tournament_id: u64) -> Array<felt252> {
            let span = LeaderboardStore::get_leaderboard(self.leaderboard, tournament_id);
            let mut result = ArrayTrait::new();
            let mut i: u32 = 0;
            loop {
                if i >= span.len() {
                    break;
                }
                result.append((*span.at(i)).into());
                i += 1;
            }
            result
        }

        // Registration operations
        #[inline(always)]
        fn _set_registration(
            ref self: ContractState, game_address: ContractAddress, registration: @Registration,
        ) {
            self.registration.set_entry(registration);

            // Store reverse mappings for token_id → entry_id and token_id → context_id
            self
                .token_to_entry
                .entry((*registration.context_id, *registration.game_token_id))
                .write(*registration.entry_id);
            self
                .token_context_id
                .entry(*registration.game_token_id)
                .write(*registration.context_id);

            // Emit native event - get player address from token ownership
            let game_token_address = IMinigameDispatcher { contract_address: game_address }
                .token_address();
            let player_address = IERC721Dispatcher { contract_address: game_token_address }
                .owner_of((*registration.game_token_id).into());
            self
                .emit(
                    events::TournamentRegistration {
                        tournament_id: *registration.context_id,
                        game_token_id: *registration.game_token_id,
                        game_address,
                        player_address,
                        entry_number: *registration.entry_id,
                        has_submitted: *registration.has_submitted,
                        is_banned: *registration.is_banned,
                    },
                );
        }

        // Tournament operations - reading from packed storage.
        // Not inlined: the body is large (~120 lines) and called from 4 sites
        // (`tournament`, `enter_tournament`, `claim_reward`, `_create_tournament`).
        // Forcing inline here duplicates the reconstruction logic into every caller,
        // pushing the contract over the 81,920-felt limit.
        fn _get_tournament(self: @ContractState, tournament_id: u64) -> TournamentModel {
            let config = TournamentConfigStorePacking::unpack(
                self.tournament_config.entry(tournament_id).read(),
            );
            let created_by = self.tournament_created_by.entry(tournament_id).read();
            let game_address = self.tournament_game_address.entry(tournament_id).read();
            let metadata = self.tournament_metadata.entry(tournament_id).read();
            let client_url_raw = self.tournament_client_url.entry(tournament_id).read();
            let renderer_address = self.tournament_renderer_address.entry(tournament_id).read();

            let schedule = budokan::libs::reconstruct::schedule_from_config(@config);
            let game_config = budokan::libs::reconstruct::game_config_from_storage(
                @config, game_address, client_url_raw, renderer_address,
            );
            let entry_fee = budokan::libs::reconstruct::entry_fee_view_from_stored(
                self.entry_fee._get_entry_fee(tournament_id),
            );
            let entry_requirement = self.entry_requirement._get_entry_requirement(tournament_id);
            let creator_token_id = self.tournament_creator_token_id.entry(tournament_id).read();
            let leaderboard_config = budokan::libs::reconstruct::leaderboard_config_from_config(
                @config,
            );

            TournamentModel {
                id: tournament_id,
                created_at: config.created_at,
                created_by,
                creator_token_id,
                metadata,
                schedule,
                game_config,
                entry_fee,
                entry_requirement,
                leaderboard_config,
            }
        }

        #[inline(always)]
        fn _create_tournament(
            ref self: ContractState,
            creator_token_id: felt252,
            metadata: Metadata,
            schedule: Schedule,
            game_config: GameConfig,
            entry_fee: Option<EntryFee>,
            entry_requirement: Option<EntryRequirement>,
            leaderboard_config: LeaderboardConfig,
        ) -> TournamentModel {
            // Increment total tournaments
            let tournament_id = self.total_tournaments.read() + 1;
            self.total_tournaments.write(tournament_id);

            let created_at = get_block_timestamp();
            let created_by = get_caller_address();

            // Store packed tournament config (replaces both TournamentMeta and Schedule storage)
            let config = TournamentConfig {
                created_at,
                settings_id: game_config.settings_id,
                soulbound: game_config.soulbound,
                paymaster: game_config.paymaster,
                registration_start_delay: schedule.registration_start_delay,
                registration_end_delay: schedule.registration_end_delay,
                game_start_delay: schedule.game_start_delay,
                game_end_delay: schedule.game_end_delay,
                submission_duration: schedule.submission_duration,
                ascending: leaderboard_config.ascending,
                game_must_be_over: leaderboard_config.game_must_be_over,
            };
            self
                .tournament_config
                .entry(tournament_id)
                .write(TournamentConfigStorePacking::pack(config));

            // Store creator_token_id separately (felt252, too large for packed storage)
            self.tournament_creator_token_id.entry(tournament_id).write(creator_token_id);

            // Store other base fields
            self.tournament_created_by.entry(tournament_id).write(created_by);
            self.tournament_game_address.entry(tournament_id).write(game_config.game_address);
            self.tournament_metadata.entry(tournament_id).write(metadata.clone());

            // Store client_url conditionally (only if Some)
            // Use snapshot to avoid moving game_config (needed later for event emission)
            if let Option::Some(url) = @game_config.client_url {
                self.tournament_client_url.entry(tournament_id).write(url.clone());
            }

            // Store renderer conditionally (only if Some and non-zero)
            if let Option::Some(renderer) = @game_config.renderer {
                if !renderer.is_zero() {
                    self.tournament_renderer_address.entry(tournament_id).write(*renderer);
                }
            }

            // Store entry fee using component. The component owns full
            // entry-fee state: fees, additional-share recipients, the
            // position distribution shape, and any Custom shares array.
            if let Option::Some(fee) = @entry_fee {
                // tournament_creator_share becomes the first additional_share
                let additional_shares = if *fee.tournament_creator_share > 0 {
                    array![
                        AdditionalShare {
                            recipient: created_by, share_bps: *fee.tournament_creator_share,
                        },
                    ]
                        .span()
                } else {
                    array![].span()
                };
                let game_creator_share = if *fee.game_creator_share > 0 {
                    Option::Some(*fee.game_creator_share)
                } else {
                    Option::None
                };
                let refund_share = if *fee.refund_share > 0 {
                    Option::Some(*fee.refund_share)
                } else {
                    Option::None
                };
                let stored_config = EntryFeeConfig {
                    token_address: *fee.token_address,
                    amount: *fee.amount,
                    game_creator_share,
                    refund_share,
                    additional_shares,
                    distribution: Option::Some(*fee.distribution),
                    distribution_count: *fee.distribution_count,
                };
                let component_fee = ComponentEntryFee::Config(stored_config);
                let _ = self.entry_fee.set_entry_fee(tournament_id, component_fee);
            }

            // Store entry requirement using component
            self.entry_requirement.set_entry_requirement(tournament_id, entry_requirement);

            // Configure leaderboard for this tournament
            self
                .leaderboard
                ._configure(
                    tournament_id,
                    0xFFFFFFFF_u32, // Unlimited leaderboard (u32::MAX = ~4.3B)
                    leaderboard_config.ascending,
                    game_config.game_address,
                );

            // Emit native event
            self
                .emit(
                    events::TournamentCreated {
                        tournament_id,
                        game_address: game_config.game_address,
                        created_at,
                        created_by,
                        creator_token_id,
                        metadata,
                        schedule,
                        game_config,
                        entry_fee,
                        entry_requirement,
                        leaderboard_config,
                    },
                );

            // Return reconstructed tournament model from storage
            self._get_tournament(tournament_id)
        }

        // Read the rewards library class hash, asserting it has been configured.
        #[inline(always)]
        fn _rewards_class_hash(self: @ContractState) -> ClassHash {
            let class_hash = self.rewards_class_hash.read();
            assert!(!class_hash.is_zero(), "Budokan: rewards class hash not set");
            class_hash
        }

        // Entry count operations
        #[inline(always)]
        fn _increment_entry_count(ref self: ContractState, tournament_id: u64) -> u32 {
            self.registration.increment_entry_count(tournament_id)
        }

        //
        // GETTERS
        //

        #[inline(always)]
        fn get_score_for_token_id(
            self: @ContractState, contract_address: ContractAddress, token_id: felt252,
        ) -> u64 {
            let game_dispatcher = IMinigameTokenDataDispatcher { contract_address };
            game_dispatcher.score(token_id)
        }

        //
        // ASSERTIONS
        //

        #[inline(always)]
        fn _assert_valid_entry_requirement(
            self: @ContractState, entry_requirement: EntryRequirement, schedule: Schedule,
        ) {
            self._assert_gated_type_validates(entry_requirement, schedule);
        }

        #[inline(always)]
        fn _assert_valid_game_config(ref self: ContractState, game_config: @GameConfig) {
            let contract_address = *game_config.game_address;
            let src5_dispatcher = ISRC5Dispatcher { contract_address };
            self._assert_supports_game_interface(src5_dispatcher, contract_address);

            self._assert_settings_exists(contract_address, *game_config.settings_id);

            self.metagame.assert_game_registered(contract_address);
        }

        fn _assert_valid_entry_fee_shares(self: @ContractState, entry_fee: @EntryFee) {
            budokan::libs::validations::assert_valid_entry_fee_shares(
                *entry_fee.tournament_creator_share,
                *entry_fee.game_creator_share,
                *entry_fee.refund_share,
            );
            budokan::libs::validations::assert_valid_entry_fee_distribution_count(
                *entry_fee.tournament_creator_share,
                *entry_fee.game_creator_share,
                *entry_fee.refund_share,
                *entry_fee.distribution_count,
            );
            if let Distribution::Custom(shares) = *entry_fee.distribution {
                budokan::libs::validations::assert_valid_custom_distribution_shares(
                    shares, *entry_fee.distribution_count,
                );
            }
        }

        fn _assert_game_fee_met(
            self: @ContractState, game_address: ContractAddress, game_creator_share: u16,
        ) {
            let game_fee_info = get_game_fee_info(game_address);
            assert!(
                game_creator_share >= game_fee_info.fee_numerator,
                "Budokan: game_creator_share ({}) is below the game's required fee ({})",
                game_creator_share,
                game_fee_info.fee_numerator,
            );
        }

        #[inline(always)]
        fn _assert_supports_game_interface(
            self: @ContractState, src5_dispatcher: ISRC5Dispatcher, address: ContractAddress,
        ) {
            let address_felt: felt252 = address.into();
            assert!(
                src5_dispatcher.supports_interface(IMINIGAME_ID),
                "Budokan: Game address {} does not support IGame interface",
                address_felt,
            );
        }

        #[inline(always)]
        fn _assert_settings_exists(self: @ContractState, game: ContractAddress, settings_id: u32) {
            let minigame_dispatcher = IMinigameDispatcher { contract_address: game };
            let settings_address = minigame_dispatcher.settings_address();
            let settings_dispatcher = IMinigameSettingsDispatcher {
                contract_address: settings_address,
            };
            let settings_exist = settings_dispatcher.settings_exist(settings_id);
            let game_address: felt252 = game.into();
            assert!(
                settings_exist,
                "Budokan: Settings id {} is not found on game address {}",
                settings_id,
                game_address,
            );
        }

        fn _assert_gated_type_validates(
            self: @ContractState, entry_requirement: EntryRequirement, schedule: Schedule,
        ) {
            // Validate SRC5 interfaces (ERC721 for token, IEntryRequirementExtension for extension)
            self.entry_requirement.assert_valid_entry_requirement(entry_requirement);

            // Extension-specific budokan logic: add_config then check bannable
            if let EntryRequirementType::extension(extension_config) = entry_requirement
                .entry_requirement_type {
                let entry_validator_dispatcher = IEntryRequirementExtensionDispatcher {
                    contract_address: extension_config.address,
                };
                let tournament_id = self.total_tournaments.read();
                entry_validator_dispatcher
                    .add_config(
                        tournament_id + 1, entry_requirement.entry_limit, extension_config.config,
                    );
                let bannable = entry_validator_dispatcher
                    .bannable(starknet::get_contract_address(), tournament_id + 1);
                if bannable {
                    schedule.assert_has_registration_period_before_game_start();
                }
            }
        }

        fn _assert_tournament_exists(self: @ContractState, tournament_id: u64) {
            assert!(
                tournament_id <= self.total_tournaments.read(),
                "Budokan: Tournament {} does not exist",
                tournament_id,
            );
        }

        //
        // INTERNALS
        //

        fn _mint_game(
            ref self: ContractState,
            game_address: ContractAddress,
            player_name: Option<felt252>,
            settings_id: Option<u32>,
            start: Option<u64>,
            end: Option<u64>,
            objective_id: Option<u32>,
            context: Option<GameContextDetails>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            skills_address: Option<ContractAddress>,
            to: ContractAddress,
            soulbound: bool,
            paymaster: bool,
            salt: u16,
            metadata: u16,
        ) -> felt252 {
            let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
            let game_token_address = game_dispatcher.token_address();
            IMinigameTokenDispatcher { contract_address: game_token_address }
                .mint(
                    game_address,
                    player_name,
                    settings_id,
                    start,
                    end,
                    objective_id,
                    context,
                    client_url,
                    renderer_address,
                    skills_address,
                    to,
                    soulbound,
                    paymaster,
                    salt,
                    metadata,
                )
        }

        /// Validates tournament-specific rules for score submission
        fn _validate_score_submission(
            self: @ContractState,
            tournament_id: u64,
            schedule: Schedule,
            created_at: u64,
            registration: @Registration,
        ) {
            let game_end: u64 = created_at
                + schedule.game_start_delay.into()
                + schedule.game_end_delay.into();
            assert!(get_block_timestamp() >= game_end, "Budokan: Not in submission period");

            // Allow re-submission if the entry was evicted from the leaderboard
            if *registration.has_submitted {
                let stored_pos = LeaderboardStore::get_token_position(
                    self.leaderboard, tournament_id, *registration.game_token_id,
                );
                assert!(stored_pos == 0, "Registration: Score already submitted");
                assert!(!*registration.is_banned, "Registration: Game ID is banned");
            } else {
                self.registration.assert_valid_for_submission(registration, tournament_id);
            }
        }

        fn _mark_score_submitted(
            ref self: ContractState,
            tournament_id: u64,
            token_id: felt252,
            game_address: ContractAddress,
        ) {
            let entry_id = self.token_to_entry.entry((tournament_id, token_id)).read();
            self.registration.mark_entry_submitted(tournament_id, entry_id);

            // Emit native event with has_submitted=true
            let registration = self.registration._get_entry(tournament_id, entry_id);
            let game_token_address = IMinigameDispatcher { contract_address: game_address }
                .token_address();
            let player_address = IERC721Dispatcher { contract_address: game_token_address }
                .owner_of(token_id.into());
            self
                .emit(
                    events::TournamentRegistration {
                        tournament_id,
                        game_token_id: token_id,
                        game_address,
                        player_address,
                        entry_number: registration.entry_id,
                        has_submitted: registration.has_submitted,
                        is_banned: registration.is_banned,
                    },
                );
        }

        fn _process_entry_requirement(
            ref self: ContractState,
            tournament_id: u64,
            entry_requirement: EntryRequirement,
            qualifier: Option<QualificationProof>,
        ) -> ContractAddress {
            let qualifier = match qualifier {
                Option::Some(q) => q,
                Option::None => {
                    panic!(
                        "Budokan: Tournament {} has an entry requirement but no qualification was provided",
                        tournament_id,
                    )
                },
            };

            let recipient = self
                .entry_requirement
                .validate_qualification(tournament_id, entry_requirement, qualifier);

            self
                .entry_requirement
                .update_qualification_entries(tournament_id, qualifier, entry_requirement);

            // Emit native event for non-extension entry requirements with entry limits
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::extension(_) => { // Extension handles its own entry tracking
                },
                _ => {
                    if entry_requirement.entry_limit != 0 {
                        let qualification_entries = self
                            .entry_requirement
                            ._get_qualification_entries(tournament_id, qualifier);
                        self
                            .emit(
                                events::QualificationEntriesUpdated {
                                    tournament_id,
                                    qualification_proof: qualifier,
                                    entry_count: qualification_entries.entry_count,
                                },
                            );
                    }
                },
            }

            recipient
        }

        fn _create_context(self: @ContractState, tournament_id: u64) -> GameContextDetails {
            let context = array![
                GameContext {
                    name: 'Tournament ID', value: u128_to_ascii_felt(tournament_id.into()),
                },
            ]
                .span();
            GameContextDetails {
                name: "Budokan",
                description: "The onchain tournament system",
                id: Option::Some(tournament_id.try_into().unwrap()),
                context: context,
            }
        }
    }

    impl LeaderboardHooksImpl of LeaderboardComponent::LeaderboardHooksTrait<ContractState> {
        fn on_score_submitted(
            ref self: ContractState, context_id: u64, token_id: felt252, score: u64, position: u32,
        ) {}

        fn on_configured(
            ref self: ContractState,
            context_id: u64,
            max_entries: u32,
            ascending: bool,
            game_address: starknet::ContractAddress,
        ) {}

        fn on_cleared(ref self: ContractState, context_id: u64) {}

        fn on_ownership_transferred(
            ref self: ContractState,
            previous_owner: starknet::ContractAddress,
            new_owner: starknet::ContractAddress,
        ) {}
    }
}
