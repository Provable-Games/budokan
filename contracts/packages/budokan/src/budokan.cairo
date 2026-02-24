// SPDX-License-Identifier: BUSL-1.1

#[starknet::contract]
pub mod Budokan {
    use budokan::events;
    use budokan::libs::schedule::{
        ScheduleAssertionsImpl, ScheduleAssertionsTrait, ScheduleImpl, ScheduleTrait,
    };
    use budokan::structs::budokan::{
        AdditionalShare, Distribution, EntryFee, EntryFeeClaimType, EntryFeeRewardType,
        EntryRequirement, EntryRequirementType, GameConfig, Metadata, PrizeData, PrizeType,
        QualificationEntries, QualificationProof, Registration, RewardType, TokenTypeData,
        Tournament as TournamentModel,
    };
    use budokan::structs::constants::GAME_CREATOR_TOKEN_ID;
    use budokan::structs::packed_storage::{
        PackedDistribution, PackedDistributionStorePacking, TournamentConfig,
        TournamentConfigStorePacking, unpack_created_at, unpack_game_schedule,
        unpack_game_start_delay, unpack_registration_end_delay, unpack_registration_start_delay,
    };
    use budokan::structs::schedule::{Phase, Schedule};
    use budokan_interfaces::budokan::IBudokan;
    use core::num::traits::Zero;
    use game_components_embeddable_game_standard::metagame::extensions::context::context::ContextComponent;
    use game_components_embeddable_game_standard::metagame::extensions::context::interface::{
        IMetagameContext, IMetagameContextDetails,
    };
    use game_components_embeddable_game_standard::metagame::extensions::context::structs::{
        GameContext, GameContextDetails,
    };
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
    use game_components_interfaces::prize::{Prize as PrizeInput, PrizeConfig};
    use game_components_interfaces::registry::{
        IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
    };
    use game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent;
    use game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent::EntryFeeInternalTrait;
    use game_components_metagame::entry_requirement::entry_requirement_component::EntryRequirementComponent;
    use game_components_metagame::entry_requirement::entry_requirement_component::EntryRequirementComponent::EntryRequirementInternalTrait;
    use game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent;
    use game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardInternalTrait;
    use game_components_metagame::leaderboard::store::Store as LeaderboardStore;
    use game_components_metagame::prize::prize_component::PrizeComponent;
    use game_components_metagame::prize::prize_component::PrizeComponent::PrizeInternalTrait;
    use game_components_metagame::registration::registration_component::RegistrationComponent;
    use game_components_metagame::registration::registration_component::RegistrationComponent::RegistrationInternalTrait;
    use game_components_utilities::distribution::calculator;
    use game_components_utilities::distribution::structs::{
        BASIS_POINTS, DIST_TYPE_CUSTOM, DIST_TYPE_EXPONENTIAL, DIST_TYPE_LINEAR, DIST_TYPE_UNIFORM,
    };
    use interfaces::entry_requirement_extension::{
        IEntryRequirementExtensionDispatcher, IEntryRequirementExtensionDispatcherTrait,
    };
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use openzeppelin_interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_introspection::src5::SRC5Component;
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
        // Distribution config per tournament (packed into felt252)
        tournament_distribution: Map<u64, PackedDistribution>,
        // Position-based entry fee claims: (tournament_id, position) -> claimed
        entry_fee_position_claimed: Map<(u64, u32), bool>,
        // Prize position mapping: prize_id -> position (for Single prizes)
        prize_position: Map<u64, u32>,
        // Map (context_id, game_token_id) → entry_id for reverse lookups
        token_to_entry: Map<(u64, felt252), u32>,
        // Map game_token_id → context_id (tournament_id) for global token lookups
        token_context_id: Map<felt252, u64>,
        // Monotonically increasing nonce for unique token ID generation (used as mint salt)
        mint_nonce: u16,
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
                GameContext { name: "Tournament ID", value: format!("{}", tournament_id) },
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

        fn create_tournament(
            ref self: ContractState,
            creator_rewards_address: ContractAddress,
            metadata: Metadata,
            schedule: Schedule,
            game_config: GameConfig,
            entry_fee: Option<EntryFee>,
            entry_requirement: Option<EntryRequirement>,
        ) -> TournamentModel {
            schedule.assert_is_valid();
            self._assert_valid_game_config(@game_config);

            // Extract distribution from entry_fee (default to Linear if no entry fee)
            let distribution = match @entry_fee {
                Option::Some(ef) => *ef.distribution,
                Option::None => Distribution::Linear(1),
            };

            // Validate entry fee shares don't exceed 100%
            if let Option::Some(ef) = @entry_fee {
                self._assert_valid_entry_fee_shares(ef);
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
                    creator_rewards_address,
                    false, // soulbound
                    false // paymaster
                );

            self
                ._create_tournament(
                    creator_token_id,
                    metadata,
                    schedule,
                    game_config,
                    entry_fee,
                    distribution,
                    entry_requirement,
                )
        }

        fn enter_tournament(
            ref self: ContractState,
            tournament_id: u64,
            player_name: felt252,
            player_address: ContractAddress,
            qualification: Option<QualificationProof>,
        ) -> (felt252, u32) {
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
                    mint_to_address, // to
                    tournament.game_config.soulbound, // soulbound
                    tournament.game_config.paymaster // paymaster
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

            // return game token id and entry number
            (game_token_id, entry_id)
        }

        fn ban_entry(
            ref self: ContractState,
            tournament_id: u64,
            game_token_id: felt252,
            proof: Span<felt252>,
        ) {
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

            // Ask the extension if this entry should be banned
            let should_ban = entry_validator_dispatcher
                .should_ban(tournament_id, game_token_id, current_owner, proof);

            // Assert should be banned to avoid wasting gas on invalid ban attempts
            assert!(should_ban, "Budokan: Entry should not be banned");

            // Notify the extension to update its entry tracking
            entry_validator_dispatcher
                .remove_entry(tournament_id, game_token_id, current_owner, proof);

            // Update registration to mark as banned using component
            self.registration.ban_entry(tournament_id, entry_id);

            // Emit native event
            let player_address = IERC721Dispatcher { contract_address: game_token_address }
                .owner_of(game_token_id.into());
            self
                .emit(
                    events::TournamentRegistration {
                        tournament_id,
                        game_token_id,
                        game_address: game_address,
                        player_address,
                        entry_number: registration.entry_id,
                        has_submitted: false,
                        is_banned: true,
                    },
                );
        }

        fn submit_score(
            ref self: ContractState, tournament_id: u64, token_id: felt252, position: u32,
        ) {
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
        }

        fn claim_reward(ref self: ContractState, tournament_id: u64, reward_type: RewardType) {
            let tournament = self._get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            tournament
                .schedule
                .assert_tournament_is_finalized(tournament.created_at, get_block_timestamp());

            match reward_type {
                RewardType::Prize(prize_type) => {
                    self._assert_prize_not_claimed(tournament_id, prize_type);
                    self._claim_prize(tournament_id, tournament, prize_type);
                },
                RewardType::EntryFee(entry_fee_type) => {
                    self._assert_entry_fee_reward_not_claimed(tournament_id, entry_fee_type);
                    self._claim_entry_fee_reward(tournament_id, tournament, entry_fee_type);
                },
            }

            self._set_reward_claim(tournament_id, reward_type);
        }

        fn add_prize(
            ref self: ContractState,
            tournament_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            position: Option<u32>,
        ) -> PrizeData {
            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            // Read packed config (1 SLOAD) and extract only game schedule fields
            let packed = self.tournament_config.entry(tournament_id).read();
            let (created_at, game_start_delay, game_end_delay) = unpack_game_schedule(packed);
            let game_end: u64 = created_at + game_start_delay.into() + game_end_delay.into();
            assert!(game_end > get_block_timestamp(), "Budokan: Tournament has ended");

            // Validate that position and distribution are mutually exclusive
            if position.is_some() {
                match @token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        assert!(
                            erc20_data.distribution.is_none(),
                            "Budokan: Cannot set position for distributed prize (position and distribution are mutually exclusive)",
                        );
                    },
                    TokenTypeData::erc721(_) => { // ERC721 prizes don't have distribution
                    },
                }
            }

            // Add prize (deposits tokens, increments count, stores prize with packed payout config)
            let prize_id = self
                .prize
                .add_prize(
                    tournament_id, PrizeInput::Config(PrizeConfig { token_address, token_type }),
                );

            // Store position mapping for Single prizes
            if let Option::Some(pos) = position {
                self.prize_position.entry(prize_id).write(pos);
            }

            // Emit event
            self._emit_prize_added(self.prize._get_prize(prize_id));

            // Return prize
            self.prize._get_prize(prize_id)
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

        // Tournament operations - reading from packed storage
        #[inline(always)]
        fn _get_tournament(self: @ContractState, tournament_id: u64) -> TournamentModel {
            // Read packed config felt252 and unpack
            let config = TournamentConfigStorePacking::unpack(
                self.tournament_config.entry(tournament_id).read(),
            );

            // Read other fields
            let created_by = self.tournament_created_by.entry(tournament_id).read();
            let game_address = self.tournament_game_address.entry(tournament_id).read();
            let metadata = self.tournament_metadata.entry(tournament_id).read();
            let client_url_raw = self.tournament_client_url.entry(tournament_id).read();
            let renderer_address = self.tournament_renderer_address.entry(tournament_id).read();

            // Reconstruct Schedule from packed config
            let schedule = Schedule {
                registration_start_delay: config.registration_start_delay,
                registration_end_delay: config.registration_end_delay,
                game_start_delay: config.game_start_delay,
                game_end_delay: config.game_end_delay,
                submission_duration: config.submission_duration,
            };

            // Reconstruct GameConfig
            let client_url = if client_url_raw.len() == 0 {
                Option::None
            } else {
                Option::Some(client_url_raw)
            };

            let renderer = if renderer_address.is_zero() {
                Option::None
            } else {
                Option::Some(renderer_address)
            };

            let game_config = GameConfig {
                game_address,
                settings_id: config.settings_id,
                soulbound: config.soulbound,
                paymaster: config.paymaster,
                client_url,
                renderer,
            };

            // Get stored entry_fee from component (without distribution)
            let stored_entry_fee = self.entry_fee._get_entry_fee(tournament_id);

            // Get distribution from packed storage
            let packed_dist = self.tournament_distribution.entry(tournament_id).read();
            let distribution = if packed_dist.dist_type == DIST_TYPE_LINEAR {
                Distribution::Linear(packed_dist.dist_param)
            } else if packed_dist.dist_type == DIST_TYPE_EXPONENTIAL {
                Distribution::Exponential(packed_dist.dist_param)
            } else if packed_dist.dist_type == DIST_TYPE_UNIFORM {
                Distribution::Uniform
            } else {
                // Custom distribution - shares not stored in packed format
                Distribution::Custom(array![].span())
            };

            // Convert positions: 0 in storage means 0 (dynamic)
            let distribution_count = packed_dist.positions;

            // Reconstruct full EntryFee (with distribution) from stored data
            let entry_fee: Option<EntryFee> = match stored_entry_fee {
                Option::Some(entry_fee_config) => {
                    // First additional_share is tournament_creator_share (if present)
                    let tournament_creator_share: u16 = if entry_fee_config
                        .additional_shares
                        .len() > 0 {
                        (*entry_fee_config.additional_shares.at(0)).share_bps
                    } else {
                        0
                    };
                    let game_creator_share: u16 = match entry_fee_config.game_creator_share {
                        Option::Some(share) => share,
                        Option::None => 0,
                    };
                    let refund_share: u16 = match entry_fee_config.refund_share {
                        Option::Some(share) => share,
                        Option::None => 0,
                    };
                    Option::Some(
                        EntryFee {
                            token_address: entry_fee_config.token_address,
                            amount: entry_fee_config.amount,
                            tournament_creator_share,
                            game_creator_share,
                            refund_share,
                            distribution,
                            distribution_count,
                        },
                    )
                },
                Option::None => Option::None,
            };

            // Get entry_requirement from component
            let entry_requirement = self.entry_requirement._get_entry_requirement(tournament_id);

            // Read creator_token_id from separate storage (too large for packed storage)
            let creator_token_id = self.tournament_creator_token_id.entry(tournament_id).read();

            // Return reconstructed tournament model
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
            distribution: Distribution,
            entry_requirement: Option<EntryRequirement>,
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

            // Store entry fee using component (convert to storage format without distribution)
            if let Option::Some(fee) = @entry_fee {
                // Convert input EntryFee to StoredEntryFee (storage format without distribution)
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
                };
                let component_fee = ComponentEntryFee::Config(stored_config);
                let _ = self.entry_fee.set_entry_fee(tournament_id, component_fee);
            }

            // Store distribution using PackedDistribution
            let (dist_type, dist_param) = match distribution {
                Distribution::Linear(weight) => (DIST_TYPE_LINEAR, weight),
                Distribution::Exponential(weight) => (DIST_TYPE_EXPONENTIAL, weight),
                Distribution::Uniform => (DIST_TYPE_UNIFORM, 0_u16),
                Distribution::Custom(_) => (DIST_TYPE_CUSTOM, 0_u16),
            };
            // Get distribution_count from entry_fee if present, otherwise 0 (dynamic)
            let positions: u32 = match @entry_fee {
                Option::Some(fee) => *fee.distribution_count,
                Option::None => 0_u32,
            };
            let packed_dist = PackedDistribution { dist_type, dist_param, positions };
            self.tournament_distribution.entry(tournament_id).write(packed_dist);

            // Store entry requirement using component
            self.entry_requirement.set_entry_requirement(tournament_id, entry_requirement);

            // Configure leaderboard for this tournament
            self
                .leaderboard
                ._configure(
                    tournament_id,
                    0xFFFFFFFF_u32, // Unlimited leaderboard (u32::MAX = ~4.3B)
                    false, // Higher scores are better
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
                    },
                );

            // Return reconstructed tournament model from storage
            self._get_tournament(tournament_id)
        }

        // Prize operations
        #[inline(always)]
        fn _emit_prize_added(ref self: ContractState, prize: PrizeData) {
            // Read position from storage (0 means distributed prize)
            let payout_position = self.prize_position.entry(prize.id).read();
            self
                .emit(
                    events::PrizeAdded {
                        tournament_id: prize.context_id,
                        prize_id: prize.id,
                        payout_position,
                        token_address: prize.token_address,
                        token_type: prize.token_type,
                        sponsor_address: prize.sponsor_address,
                    },
                );
        }

        fn _set_reward_claim(ref self: ContractState, tournament_id: u64, reward_type: RewardType) {
            // Set the claim state based on reward type
            match reward_type {
                RewardType::Prize(prize_type) => {
                    self.prize.set_prize_claimed(tournament_id, prize_type);
                },
                RewardType::EntryFee(entry_fee_type) => {
                    match entry_fee_type {
                        EntryFeeRewardType::Position(position) => {
                            self
                                .entry_fee_position_claimed
                                .entry((tournament_id, position))
                                .write(true);
                        },
                        EntryFeeRewardType::TournamentCreator => {
                            self
                                .entry_fee
                                .set_claimed(tournament_id, EntryFeeClaimType::AdditionalShare(0));
                        },
                        EntryFeeRewardType::GameCreator => {
                            self
                                .entry_fee
                                .set_claimed(tournament_id, EntryFeeClaimType::GameCreator);
                        },
                        EntryFeeRewardType::Refund(token_id) => {
                            self
                                .entry_fee
                                .set_claimed(tournament_id, EntryFeeClaimType::Refund(token_id));
                        },
                    }
                },
            }

            // Emit native event
            self.emit(events::RewardClaimed { tournament_id, reward_type, claimed: true });
        }

        fn _is_position_claim_made(
            self: @ContractState, tournament_id: u64, position: u32,
        ) -> bool {
            self.entry_fee_position_claimed.entry((tournament_id, position)).read()
        }

        // Entry count operations
        #[inline(always)]
        fn _increment_entry_count(ref self: ContractState, tournament_id: u64) -> u32 {
            self.registration.increment_entry_count(tournament_id)
        }

        // Qualification operations
        #[inline(always)]
        fn _get_qualification_entries(
            self: @ContractState, tournament_id: u64, proof: QualificationProof,
        ) -> QualificationEntries {
            self.entry_requirement._get_qualification_entries(tournament_id, proof)
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

        #[inline(always)]
        fn _get_owner(
            self: @ContractState, contract_address: ContractAddress, token_id: u256,
        ) -> ContractAddress {
            IERC721Dispatcher { contract_address }.owner_of(token_id)
        }

        fn _is_top_score(
            self: @ContractState,
            game_address: ContractAddress,
            leaderboard: Span<felt252>,
            score: u64,
        ) -> bool {
            let num_scores = leaderboard.len();

            if num_scores == 0 {
                return true;
            }

            let last_place_id: felt252 = *leaderboard.at(num_scores - 1);
            let last_place_score = self.get_score_for_token_id(game_address, last_place_id);
            score >= last_place_score
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

        #[inline(always)]
        fn _assert_prize_exists(self: @ContractState, token: ContractAddress, id: u64) {
            budokan::libs::validations::assert_prize_exists(token, id);
        }

        #[inline(always)]
        fn _assert_prize_not_claimed(
            self: @ContractState, tournament_id: u64, prize_type: PrizeType,
        ) {
            self.prize.assert_prize_not_claimed(tournament_id, prize_type);
        }

        #[inline(always)]
        fn _assert_entry_fee_reward_not_claimed(
            self: @ContractState, tournament_id: u64, entry_fee_type: EntryFeeRewardType,
        ) {
            match entry_fee_type {
                EntryFeeRewardType::Position(position) => {
                    assert!(
                        !self._is_position_claim_made(tournament_id, position),
                        "Budokan: Position {} entry fee already claimed",
                        position,
                    );
                },
                EntryFeeRewardType::TournamentCreator => {
                    assert!(
                        !self
                            .entry_fee
                            .is_claimed(tournament_id, EntryFeeClaimType::AdditionalShare(0)),
                        "Budokan: Tournament creator share already claimed",
                    );
                },
                EntryFeeRewardType::GameCreator => {
                    assert!(
                        !self.entry_fee.is_claimed(tournament_id, EntryFeeClaimType::GameCreator),
                        "Budokan: Game creator share already claimed",
                    );
                },
                EntryFeeRewardType::Refund(token_id) => {
                    assert!(
                        !self
                            .entry_fee
                            .is_claimed(tournament_id, EntryFeeClaimType::Refund(token_id)),
                        "Budokan: Refund share already claimed for token {}",
                        token_id,
                    );
                },
            }
        }

        #[inline(always)]
        fn _assert_payout_is_top_score(
            self: @ContractState, payout_position: u8, winner_token_ids: Span<felt252>,
        ) {
            assert!(
                payout_position.into() <= winner_token_ids.len(),
                "Budokan: Prize payout position {} is not a top score",
                payout_position,
            );
        }

        fn _assert_gated_type_validates(
            self: @ContractState, entry_requirement: EntryRequirement, schedule: Schedule,
        ) {
            // Validate SRC5 interfaces (ERC721 for token, IEntryRequirementExtension for extension)
            self.entry_requirement.assert_valid_entry_requirement(entry_requirement);

            // Extension-specific budokan logic: registration_only check and add_config
            if let EntryRequirementType::extension(extension_config) = entry_requirement
                .entry_requirement_type {
                let entry_validator_dispatcher = IEntryRequirementExtensionDispatcher {
                    contract_address: extension_config.address,
                };
                let registration_only = entry_validator_dispatcher.registration_only();
                if registration_only {
                    schedule.assert_has_registration_period_before_game_start();
                }
                let tournament_id = self.total_tournaments.read();
                entry_validator_dispatcher
                    .add_config(
                        tournament_id + 1,
                        entry_requirement.entry_limit.try_into().unwrap(),
                        extension_config.config,
                    );
            }
        }

        fn _assert_tournament_exists(self: @ContractState, tournament_id: u64) {
            assert!(
                tournament_id <= self.total_tournaments.read(),
                "Budokan: Tournament {} does not exist",
                tournament_id,
            );
        }

        #[inline(always)]
        fn _assert_position_is_valid(self: @ContractState, position: u32, winner_count: u32) {
            budokan::libs::validations::assert_position_is_valid(position, winner_count);
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
            to: ContractAddress,
            soulbound: bool,
            paymaster: bool,
        ) -> felt252 {
            // Increment mint nonce for unique token IDs
            let nonce = self.mint_nonce.read();
            self.mint_nonce.write(nonce + 1);

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
                    to,
                    soulbound,
                    paymaster,
                    nonce, // salt - unique per mint
                    0_u16 // metadata
                )
        }

        #[inline(always)]
        fn _calculate_payout(ref self: ContractState, bp: u128, total_value: u128) -> u128 {
            (bp * total_value) / BASIS_POINTS.into()
        }

        #[inline(always)]
        fn _get_game_creator_address(
            self: @ContractState, game_address: ContractAddress,
        ) -> ContractAddress {
            // Game creator is the owner of token ID 0
            let game_dispatcher = IERC721Dispatcher { contract_address: game_address };
            game_dispatcher.owner_of(0)
        }

        /// Claim entry fee reward based on entry fee reward type
        fn _claim_entry_fee_reward(
            ref self: ContractState,
            tournament_id: u64,
            tournament: TournamentModel,
            entry_fee_type: EntryFeeRewardType,
        ) {
            // Extract game config address before consuming tournament
            let game_config_address = tournament.game_config.game_address;
            let creator_token_id = tournament.creator_token_id;

            if let Option::Some(entry_fee) = tournament.entry_fee {
                let total_entries = self.registration._get_entry_count(tournament_id);
                let total_pool = total_entries.into() * entry_fee.amount;

                let game_dispatcher = IMinigameDispatcher { contract_address: game_config_address };
                let game_token_address = game_dispatcher.token_address();

                // Calculate share and recipient based on entry fee type
                let (share, recipient_address): (u16, ContractAddress) = match entry_fee_type {
                    EntryFeeRewardType::Position(position) => {
                        // Handle position-based distribution claim
                        self
                            ._claim_entry_fee_position(
                                tournament_id,
                                entry_fee,
                                position,
                                game_token_address,
                                creator_token_id,
                            );
                        return;
                    },
                    EntryFeeRewardType::TournamentCreator => {
                        // Get tournament creator share from additional shares at index 0
                        let stored = match self.entry_fee._get_entry_fee(tournament_id) {
                            Option::Some(config) => config,
                            Option::None => panic!("Budokan: no entry fee"),
                        };
                        assert!(
                            stored.additional_shares.len() > 0,
                            "Budokan: tournament {} does not have a tournament creator share",
                            tournament_id,
                        );
                        let additional_share = *stored.additional_shares.at(0);
                        (additional_share.share_bps, additional_share.recipient)
                    },
                    EntryFeeRewardType::GameCreator => {
                        let share = entry_fee.game_creator_share;
                        assert!(
                            share > 0,
                            "Budokan: tournament {} does not have a game creator share",
                            tournament_id,
                        );

                        // Check if the game token has a minigame registry
                        let game_token_dispatcher = IMinigameTokenDispatcher {
                            contract_address: game_token_address,
                        };
                        let minigame_registry_address = game_token_dispatcher
                            .game_registry_address();
                        let minigame_registry = IMinigameRegistryDispatcher {
                            contract_address: minigame_registry_address,
                        };
                        // If it has a registry, get the owner of the game creator token
                        let recipient = if !minigame_registry_address.is_zero() {
                            let game_id = minigame_registry
                                .game_id_from_address(game_config_address);
                            self._get_owner(minigame_registry_address, game_id.into())
                        } else {
                            // Otherwise, the game creator is the owner of token ID 0
                            self._get_owner(game_token_address, GAME_CREATOR_TOKEN_ID.into())
                        };

                        (share, recipient)
                    },
                    EntryFeeRewardType::Refund(token_id) => {
                        // Verify the token_id is registered for this tournament
                        let entry_id = self.token_to_entry.entry((tournament_id, token_id)).read();
                        let registration = self.registration._get_entry(tournament_id, entry_id);
                        assert!(
                            registration.context_id == tournament_id,
                            "Budokan: token_id is not registered for tournament {}",
                            tournament_id,
                        );

                        let refund_share = entry_fee.refund_share;
                        assert!(
                            refund_share > 0,
                            "Budokan: tournament {} does not have a refund share",
                            tournament_id,
                        );
                        // Each participant gets the refund share divided by total entries
                        let share_u32: u32 = refund_share.into() / total_entries;
                        let share: u16 = share_u32
                            .try_into()
                            .expect('refund share calculation error');

                        // Refund goes to the owner of the token_id
                        let recipient = self._get_owner(game_token_address, token_id.into());

                        (share, recipient)
                    },
                };

                let prize_amount = self._calculate_payout(share.into(), total_pool);

                // Prevent 0 token claims to save gas
                assert!(
                    prize_amount > 0,
                    "Budokan: Entry fee reward has 0 tokens to claim for tournament {}",
                    tournament_id,
                );

                self.entry_fee.payout(entry_fee.token_address, recipient_address, prize_amount);
            } else {
                panic!("Budokan: tournament {} has no entry fees", tournament_id);
            }
        }

        /// Claim position-based entry fee distribution
        fn _claim_entry_fee_position(
            ref self: ContractState,
            tournament_id: u64,
            entry_fee: EntryFee,
            position: u32,
            game_token_address: ContractAddress,
            creator_token_id: felt252,
        ) {
            let total_entries = self.registration._get_entry_count(tournament_id);
            let total_pool = total_entries.into() * entry_fee.amount;

            // Get actual leaderboard size (number of players who submitted scores)
            let leaderboard = self._get_leaderboard(tournament_id);
            let leaderboard_size: u32 = leaderboard.len();

            // Validate position is at least 1
            assert!(position > 0, "Budokan: Position must be greater than zero");

            // Use fixed distribution_count if set, otherwise use actual leaderboard size
            let total_positions: u32 = if entry_fee.distribution_count > 0 {
                entry_fee.distribution_count
            } else {
                leaderboard_size
            };

            // Calculate available share for position distribution (in basis points)
            let mut available_share: u16 = BASIS_POINTS;
            if entry_fee.tournament_creator_share > 0 {
                available_share -= entry_fee.tournament_creator_share;
            }
            if entry_fee.game_creator_share > 0 {
                available_share -= entry_fee.game_creator_share;
            }
            if entry_fee.refund_share > 0 {
                available_share -= entry_fee.refund_share;
            }

            let share = calculator::calculate_share_with_dust(
                entry_fee.distribution, position, total_positions, available_share,
            );

            // Get recipient for this position
            let recipient_address = if position <= leaderboard_size {
                let winner_token_id: felt252 = *leaderboard.at(position - 1);
                self._get_owner(game_token_address, winner_token_id.into())
            } else {
                // No entry at this position, default to tournament creator
                self._get_owner(game_token_address, creator_token_id.into())
            };

            let prize_amount = self._calculate_payout(share.into(), total_pool);

            // Prevent 0 token claims to save gas
            assert!(
                prize_amount > 0,
                "Budokan: Position {} has 0 tokens to claim from entry fees for tournament {}",
                position,
                tournament_id,
            );

            self.entry_fee.payout(entry_fee.token_address, recipient_address, prize_amount);
        }

        /// Dispatch prize claim based on prize type
        fn _claim_prize(
            ref self: ContractState,
            tournament_id: u64,
            tournament: TournamentModel,
            prize_type: PrizeType,
        ) {
            match prize_type {
                PrizeType::Single(prize_id) => {
                    // Get position from storage (set during add_prize)
                    let position = self.prize_position.entry(prize_id).read();
                    assert!(position > 0, "Budokan: Prize position not set");
                    self._claim_single_prize(tournament_id, tournament, prize_id, position);
                },
                PrizeType::Distributed((
                    prize_id, payout_index,
                )) => {
                    self
                        ._claim_distributed_prize(
                            tournament_id, tournament, prize_id, payout_index,
                        );
                },
            }
        }

        /// Claim a non-distributed prize for a given position
        fn _claim_single_prize(
            ref self: ContractState,
            tournament_id: u64,
            tournament: TournamentModel,
            prize_id: u64,
            position: u32,
        ) {
            let prize = self.prize._get_prize(prize_id);

            // Validate prize belongs to this tournament
            assert!(
                prize.context_id == tournament_id,
                "Budokan: Prize {} is for tournament {}",
                prize_id,
                prize.context_id,
            );

            // Get leaderboard and validate position is at least 1
            let leaderboard = self._get_leaderboard(tournament_id);
            let leaderboard_size: u32 = leaderboard.len();
            assert!(position > 0, "Budokan: Position must be greater than zero");

            // Handle payout or refund based on leaderboard size
            if position <= leaderboard_size {
                // Position exists on leaderboard - pay the winner
                let game_dispatcher = IMinigameDispatcher {
                    contract_address: tournament.game_config.game_address,
                };
                let game_token_address = game_dispatcher.token_address();
                let winner_token_id: felt252 = *leaderboard.at(position - 1);
                let recipient_address = self._get_owner(game_token_address, winner_token_id.into());

                match prize.token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        assert!(
                            erc20_data.distribution.is_none(),
                            "Budokan: Use SponsoredDistributed for distributed prizes",
                        );
                        self
                            .prize
                            .payout_erc20(
                                prize.token_address, erc20_data.amount, recipient_address,
                            );
                    },
                    TokenTypeData::erc721(erc721_data) => {
                        self
                            .prize
                            .payout_erc721(prize.token_address, erc721_data.id, recipient_address);
                    },
                };
            } else {
                // No entry at this position - refund to sponsor
                match prize.token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        assert!(
                            erc20_data.distribution.is_none(),
                            "Budokan: Use SponsoredDistributed for distributed prizes",
                        );
                        self.prize.refund_prize_erc20(prize_id, erc20_data.amount);
                    },
                    TokenTypeData::erc721(erc721_data) => {
                        self.prize.refund_prize_erc721(prize_id, erc721_data.id);
                    },
                };
            }
        }

        /// Claim from a distributed sponsored prize pool
        fn _claim_distributed_prize(
            ref self: ContractState,
            tournament_id: u64,
            tournament: TournamentModel,
            prize_id: u64,
            payout_index: u32,
        ) {
            let prize = self.prize._get_prize(prize_id);

            // Validate prize belongs to this tournament
            assert!(
                prize.context_id == tournament_id,
                "Budokan: Prize {} is for tournament {}",
                prize_id,
                prize.context_id,
            );

            // Get ERC20 data with distribution info
            let erc20_data = match prize.token_type {
                TokenTypeData::erc20(data) => data,
                TokenTypeData::erc721(_) => {
                    panic!("Budokan: ERC721 not supported for distributed prizes")
                },
            };

            // Ensure this is a distributed prize
            assert!(
                erc20_data.distribution.is_some(),
                "Budokan: Use Sponsored for non-distributed prizes",
            );

            // Get leaderboard
            let leaderboard = self._get_leaderboard(tournament_id);
            let leaderboard_size: u32 = leaderboard.len();

            // Validate payout_index (must be >= 1)
            assert!(payout_index > 0, "Budokan: Payout index must be greater than zero");

            // Use fixed distribution_count if set, otherwise use actual leaderboard size
            let total_positions: u32 = match erc20_data.distribution_count {
                Option::Some(count) => count,
                Option::None => leaderboard_size,
            };

            // Get distribution (already validated as Some above)
            let distribution = erc20_data.distribution.unwrap();

            // Calculate share for this payout_index (full 100% available for distribution)
            let share_bps = calculator::calculate_share_with_dust(
                distribution, payout_index, total_positions, BASIS_POINTS,
            );

            // Calculate payout amount
            let payout_amount = (share_bps.into() * erc20_data.amount) / BASIS_POINTS.into();

            // Prevent 0 token claims to save gas
            assert!(
                payout_amount > 0,
                "Budokan: Position {} has 0 tokens to claim for prize {}",
                payout_index,
                prize_id,
            );

            // Handle payout or refund based on leaderboard size
            if payout_index <= leaderboard_size {
                // Position exists on leaderboard - pay the winner
                let game_dispatcher = IMinigameDispatcher {
                    contract_address: tournament.game_config.game_address,
                };
                let game_token_address = game_dispatcher.token_address();
                let winner_token_id: felt252 = *leaderboard.at(payout_index - 1);
                let recipient_address = self._get_owner(game_token_address, winner_token_id.into());

                // Transfer calculated amount
                self.prize.payout_erc20(prize.token_address, payout_amount, recipient_address);
            } else {
                // No entry at this position - refund to sponsor
                self.prize.refund_prize_erc20(prize_id, payout_amount);
            }
        }

        /// Validates tournament-specific rules for score submission
        fn _validate_score_submission(
            self: @ContractState,
            tournament_id: u64,
            schedule: Schedule,
            created_at: u64,
            registration: @Registration,
        ) {
            assert!(
                schedule.current_phase(created_at, get_block_timestamp()) == Phase::Submission,
                "Budokan: Not in submission period",
            );

            // Delegate validation to registration component
            self.registration.assert_valid_for_submission(registration, tournament_id);
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
                GameContext { name: "Tournament ID", value: format!("{}", tournament_id) },
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
