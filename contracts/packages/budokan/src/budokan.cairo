// SPDX-License-Identifier: BUSL-1.1

#[starknet::contract]
pub mod Budokan {
    use budokan::libs::schedule::{
        ScheduleAssertionsImpl, ScheduleAssertionsTrait, ScheduleImpl, ScheduleTrait,
    };
    use budokan::models::budokan::{
        AdditionalShare, ContextProof, ContextQualification, Distribution, EntryFee,
        EntryRequirement, EntryRequirementType, GameConfig, Metadata, Prize, PrizeType,
        QUALIFIER_TYPE_WINNERS, QualificationEntries, QualificationProof, Registration, Role,
        StoredEntryFee, TokenTypeData, Tournament as TournamentModel,
    };
    use budokan::models::constants::GAME_CREATOR_TOKEN_ID;
    use budokan::models::packed_storage::{
        PackedSchedule, PackedScheduleStorePacking, TournamentMeta, TournamentMetaStorePacking,
    };
    use budokan::models::schedule::{Period, Phase, Schedule};
    use budokan_distribution::calculator;
    use budokan_distribution::models::{
        BASIS_POINTS, DIST_TYPE_CUSTOM, DIST_TYPE_EXPONENTIAL, DIST_TYPE_LINEAR, DIST_TYPE_UNIFORM,
    };
    use budokan_entry_fee::entry_fee::EntryFeeComponent;
    use budokan_entry_fee::entry_fee::EntryFeeComponent::EntryFeeInternalTrait;
    use budokan_entry_requirement::entry_requirement::EntryRequirementComponent;
    use budokan_entry_requirement::entry_requirement::EntryRequirementComponent::EntryRequirementInternalTrait;
    use budokan_event_relayer::interfaces::{
        IBudokanEventRelayerDispatcher, IBudokanEventRelayerDispatcherTrait,
    };
    use budokan_interfaces::budokan::IBudokan;
    use budokan_interfaces::entry_validator::{
        IENTRY_VALIDATOR_ID, IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
    };
    use budokan_prize::prize::PrizeComponent;
    use budokan_prize::prize::PrizeComponent::PrizeInternalTrait;
    use budokan_registration::registration::RegistrationComponent;
    use budokan_registration::registration::RegistrationComponent::RegistrationInternalTrait;
    use core::num::traits::Zero;
    use game_components_leaderboard::interface::ILeaderboard;
    use game_components_leaderboard::leaderboard::leaderboard::LeaderboardResult;
    use game_components_leaderboard::leaderboard_component::LeaderboardComponent;
    use game_components_leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardInternalTrait;
    use game_components_leaderboard::leaderboard_store::LeaderboardStoreConfig;
    use game_components_leaderboard::store::Store as LeaderboardStore;
    use game_components_metagame::extensions::context::context::ContextComponent;
    use game_components_metagame::extensions::context::interface::{
        IMetagameContext, IMetagameContextDetails,
    };
    use game_components_metagame::extensions::context::structs::{GameContext, GameContextDetails};
    use game_components_metagame::metagame::MetagameComponent;
    use game_components_minigame::extensions::settings::interface::{
        IMinigameSettingsDispatcher, IMinigameSettingsDispatcherTrait,
    };
    use game_components_minigame::interface::{
        IMINIGAME_ID, IMinigameDispatcher, IMinigameDispatcherTrait, IMinigameTokenDataDispatcher,
        IMinigameTokenDataDispatcherTrait,
    };
    use game_components_token::core::interface::{
        IMinigameTokenDispatcher, IMinigameTokenDispatcherTrait,
    };
    use game_components_token::examples::minigame_registry_contract::{
        IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
    };
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait, IERC721_ID};
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
        // Event relayer for external indexing
        event_relayer: ContractAddress,
        // Platform-wide metrics
        total_tournaments: u64,
        // Tournament base data - using TournamentMeta for packed fields
        tournament_created_by: Map<u64, ContractAddress>,
        tournament_meta: Map<
            u64, TournamentMeta,
        >, // StorePacking: created_at | creator_token_id | settings_id | prize_spots | soulbound
        tournament_game_address: Map<u64, ContractAddress>,
        tournament_metadata: Map<u64, Metadata>,
        tournament_schedule: Map<u64, PackedSchedule>, // StorePacking for schedule
        tournament_play_url: Map<u64, ByteArray>,
        // Distribution config per tournament
        // Packed: distribution_type (8 bits) | distribution_param (8 bits)
        tournament_distribution: Map<u64, u16>,
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
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        default_token_address: ContractAddress,
        event_relayer: ContractAddress,
    ) {
        // Initialize ownable component with the provided owner
        self.ownable.initializer(owner);

        // Initialize metagame component
        self.context.initializer();
        self.metagame.initializer(Option::Some(get_contract_address()), default_token_address);

        // Initialize leaderboard component with this contract as owner
        self.leaderboard.initializer(get_contract_address());

        // Set event relayer
        self.event_relayer.write(event_relayer);
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
        fn has_context(self: @ContractState, token_id: u64) -> bool {
            let default_token_dispatcher = IMinigameTokenDispatcher {
                contract_address: self.default_token_address(),
            };
            let game_address = default_token_dispatcher.token_game_address(token_id);
            let tournament_id = self.registration._get_context_id_for_token(game_address, token_id);
            tournament_id != 0
        }
    }

    #[abi(embed_v0)]
    impl GameContextDetailsImpl of IMetagameContextDetails<ContractState> {
        fn context_details(self: @ContractState, token_id: u64) -> GameContextDetails {
            let default_token_dispatcher = IMinigameTokenDispatcher {
                contract_address: self.default_token_address(),
            };
            let game_address = default_token_dispatcher.token_game_address(token_id);
            let registration = self.registration._get_registration(game_address, token_id);
            let context = array![
                GameContext {
                    name: "Tournament ID", value: format!("{}", registration.context_id),
                },
            ]
                .span();
            GameContextDetails {
                name: "Budokan",
                description: "The onchain tournament system",
                id: Option::Some(registration.context_id.try_into().unwrap()),
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

        fn get_leaderboard(self: @ContractState, tournament_id: u64) -> Array<u64> {
            self._get_leaderboard(tournament_id)
        }

        fn current_phase(self: @ContractState, tournament_id: u64) -> Phase {
            let tournament = self._get_tournament(tournament_id);
            tournament.schedule.current_phase(get_block_timestamp())
        }

        /// @title Create tournament
        fn create_tournament(
            ref self: ContractState,
            creator_rewards_address: ContractAddress,
            metadata: Metadata,
            schedule: Schedule,
            game_config: GameConfig,
            entry_fee: Option<EntryFee>,
            entry_requirement: Option<EntryRequirement>,
            soulbound: bool,
            play_url: ByteArray,
        ) -> TournamentModel {
            schedule.assert_is_valid();
            self._assert_valid_game_config(game_config);

            // Extract distribution from entry_fee (default to Linear if no entry fee)
            let distribution = match @entry_fee {
                Option::Some(ef) => *ef.distribution,
                Option::None => Distribution::Linear,
            };

            if let Option::Some(ef) = @entry_fee {
                self._assert_valid_entry_fee(ef, game_config.prize_spots);
            }

            if let Option::Some(entry_requirement) = entry_requirement {
                self._assert_valid_entry_requirement(entry_requirement, schedule);
            }

            let empty_objective_ids: Span<u32> = array![].span();

            // mint a game to the tournament creator for reward distribution
            let creator_token_id = self
                ._mint_game(
                    game_config.address,
                    Option::Some('Tournament Creator'),
                    Option::Some(game_config.settings_id),
                    Option::Some(schedule.game.start),
                    Option::Some(schedule.game.end),
                    Option::Some(empty_objective_ids),
                    Option::None, // creator token, so we don't want to give it context
                    Option::None, // client_url
                    Option::None, // renderer_address
                    creator_rewards_address,
                    false,
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
                    soulbound,
                    play_url,
                )
        }

        /// @title Enter tournament
        fn enter_tournament(
            ref self: ContractState,
            tournament_id: u64,
            player_name: felt252,
            player_address: ContractAddress,
            qualification: Option<QualificationProof>,
        ) -> (u64, u32) {
            let tournament = self._get_tournament(tournament_id);

            self._assert_tournament_exists(tournament_id);

            tournament.schedule.assert_registration_open(get_block_timestamp());

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
                // Convert to StoredEntryFee for component (only needs token_address and amount)
                let stored_fee = StoredEntryFee {
                    token_address: entry_fee.token_address,
                    amount: entry_fee.amount,
                    game_creator_share: entry_fee.game_creator_share,
                    refund_share: entry_fee.refund_share,
                    additional_shares: array![].span(),
                };
                self.entry_fee.deposit_entry_fee(@stored_fee);
            }

            let empty_objective_ids: Span<u32> = array![].span();
            let context = self._create_context(tournament_id);

            let client_url = if tournament.play_url.len() == 0 {
                let _tournament_id = format!("{}", tournament.id);
                Option::Some("https://budokan.gg/tournament/" + _tournament_id)
            } else {
                Option::Some(tournament.play_url)
            };

            // mint game to the determined recipient
            let game_token_id = self
                ._mint_game(
                    tournament.game_config.address,
                    Option::Some(player_name),
                    Option::Some(tournament.game_config.settings_id),
                    Option::Some(tournament.schedule.game.start),
                    Option::Some(tournament.schedule.game.end),
                    Option::Some(empty_objective_ids),
                    Option::Some(context),
                    client_url,
                    Option::None, // renderer_address
                    mint_to_address, // to
                    tournament.soulbound // soulbound
                );

            let entry_number = self._increment_entry_count(tournament_id);

            // associate game token with tournament via registration
            let registration = Registration {
                game_token_id,
                game_address: tournament.game_config.address,
                context_id: tournament_id,
                entry_number,
                has_submitted: false,
                is_banned: false,
            };
            self._set_registration(@registration);

            // return game token id and entry number
            (game_token_id, entry_number)
        }

        /// @title Validate entries
        fn validate_entry(
            ref self: ContractState, tournament_id: u64, game_token_id: u64, proof: Span<felt252>,
        ) {
            let tournament = self._get_tournament(tournament_id);

            // Assert tournament exists
            self._assert_tournament_exists(tournament_id);

            // Ensure tournament has an extension entry requirement
            let entry_requirement = tournament.entry_requirement;
            assert!(entry_requirement.is_some(), "Tournament: No entry requirement set");

            let extension_config = match entry_requirement.unwrap().entry_requirement_type {
                EntryRequirementType::extension(config) => config,
                _ => panic!("Tournament: Entry requirement must be of type 'extension'"),
            };

            let extension_address = extension_config.address;

            // Can only ban from registration start up until game starts
            let current_time = get_block_timestamp();
            if let Option::Some(registration) = tournament.schedule.registration {
                assert!(
                    current_time >= registration.start
                        && current_time < tournament.schedule.game.start,
                    "Tournament: Can only ban from registration start until game starts",
                );
            } else {
                panic!("Tournament: Can only ban tournaments with registration period set");
            }

            // Validate and potentially ban the provided game token ID
            let game_address = tournament.game_config.address;
            let game_token_address = IMinigameDispatcher { contract_address: game_address }
                .token_address();
            let game_dispatcher = IERC721Dispatcher { contract_address: game_token_address };
            let entry_validator_dispatcher = IEntryValidatorDispatcher {
                contract_address: extension_address,
            };

            let registration = self.registration._get_registration(game_address, game_token_id);

            // Verify this registration belongs to this tournament
            assert!(
                registration.context_id == tournament_id,
                "Tournament: Game ID not registered for this tournament",
            );

            // Assert game ID is not already banned
            assert!(!registration.is_banned, "Tournament: Game ID is already banned");

            // Get the owner of this game token
            let token_owner = game_dispatcher.owner_of(game_token_id.into());

            // Check if the owner has valid entry according to the extension
            let is_valid = entry_validator_dispatcher
                .valid_entry(tournament_id, token_owner, proof);

            // Ban if not valid
            if !is_valid {
                // Update registration to mark as banned using component
                self.registration.ban_registration(game_address, game_token_id);

                // Emit event if relayer is configured
                let relayer_address = self.event_relayer.read();
                if !relayer_address.is_zero() {
                    let relayer = IBudokanEventRelayerDispatcher {
                        contract_address: relayer_address,
                    };
                    relayer.emit_registration(game_address, game_token_id, tournament_id, 0, true);
                }
            }
        }

        /// @title Submit score
        fn submit_score(ref self: ContractState, tournament_id: u64, token_id: u64, position: u8) {
            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            // get tournament
            let tournament = self._get_tournament(tournament_id);

            // get registration details for provided game token
            let registration = self._get_registration(tournament.game_config.address, token_id);

            // get score for token id
            let submitted_score = self
                .get_score_for_token_id(tournament.game_config.address, token_id);

            // validate tournament-specific rules (phase, registration, etc.)
            self._validate_score_submission(@tournament, @registration);

            // Create leaderboard config
            let config = LeaderboardStoreConfig {
                max_entries: tournament.game_config.prize_spots.try_into().unwrap(),
                ascending: false, // Higher scores are better
                game_address: tournament.game_config.address,
            };

            // Submit score using leaderboard component
            let result = self
                .leaderboard
                .submit_score(tournament_id, token_id, submitted_score, position, config);

            // Handle result
            match result {
                LeaderboardResult::Success => {
                    // mark score as submitted
                    self._mark_score_submitted(tournament_id, token_id);

                    // Emit event to relayer if configured
                    let relayer_address = self.event_relayer.read();
                    if !relayer_address.is_zero() {
                        let leaderboard = self._get_leaderboard(tournament_id);
                        let relayer = IBudokanEventRelayerDispatcher {
                            contract_address: relayer_address,
                        };
                        relayer.emit_leaderboard_update(tournament_id, leaderboard.span());
                    }
                },
                LeaderboardResult::InvalidPosition => { panic!("Tournament: Invalid position"); },
                LeaderboardResult::DuplicateEntry => {
                    panic!("Tournament: Token already on leaderboard");
                },
                LeaderboardResult::ScoreTooLow => {
                    panic!("Tournament: Score too low for position");
                },
                LeaderboardResult::ScoreTooHigh => {
                    panic!("Tournament: Score too high for position");
                },
                LeaderboardResult::LeaderboardFull => {
                    panic!("Tournament: Leaderboard is full");
                },
                LeaderboardResult::InvalidConfig => {
                    panic!("Tournament: Invalid leaderboard config");
                },
            }
        }

        /// @title Claim prize
        fn claim_prize(ref self: ContractState, tournament_id: u64, prize_type: PrizeType) {
            let tournament = self._get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            tournament.schedule.assert_tournament_is_finalized(get_block_timestamp());

            self._assert_prize_not_claimed(tournament_id, prize_type);

            match prize_type {
                PrizeType::EntryFees(role) => {
                    self._claim_entry_fees(tournament_id, tournament, role);
                },
                PrizeType::Sponsored(prize_id) => {
                    self._claim_sponsored_prize(tournament_id, tournament, prize_id);
                },
            }

            self._set_prize_claim(tournament_id, prize_type);
        }

        /// @title Add prize
        fn add_prize(
            ref self: ContractState,
            tournament_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            position: u8,
        ) -> u64 {
            let tournament = self._get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            tournament.schedule.game.assert_is_active(get_block_timestamp());
            self._assert_position_on_leaderboard(tournament.game_config.prize_spots, position);

            // Add prize (deposits tokens, increments count, stores prize)
            let prize = self
                .prize
                .add_prize(tournament_id, token_address, token_type, position.into());

            // Emit event
            self._emit_prize_added(@prize);

            prize.id
        }
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        //
        // STORAGE HELPERS
        //

        // Leaderboard operations
        // This function reads from the leaderboard component using the Store trait
        #[inline(always)]
        fn _get_leaderboard(self: @ContractState, tournament_id: u64) -> Array<u64> {
            let span = LeaderboardStore::get_leaderboard(self.leaderboard, tournament_id);
            let mut result = ArrayTrait::new();
            let mut i: u32 = 0;
            loop {
                if i >= span.len() {
                    break;
                }
                result.append(*span.at(i));
                i += 1;
            }
            result
        }

        // Registration operations
        #[inline(always)]
        fn _get_registration(
            self: @ContractState, game_address: ContractAddress, token_id: u64,
        ) -> Registration {
            self.registration._get_registration(game_address, token_id)
        }

        #[inline(always)]
        fn _set_registration(ref self: ContractState, registration: @Registration) {
            self.registration.set_registration(registration);

            // Emit event if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer
                    .emit_registration(
                        *registration.game_address,
                        *registration.game_token_id,
                        *registration.context_id,
                        *registration.entry_number,
                        false,
                    );
            }
        }

        // Tournament operations - reading from packed storage
        #[inline(always)]
        fn _get_tournament(self: @ContractState, tournament_id: u64) -> TournamentModel {
            // Read packed meta data
            let meta = self.tournament_meta.entry(tournament_id).read();

            // Read other fields
            let created_by = self.tournament_created_by.entry(tournament_id).read();
            let game_address = self.tournament_game_address.entry(tournament_id).read();
            let metadata = self.tournament_metadata.entry(tournament_id).read();
            let packed_schedule = self.tournament_schedule.entry(tournament_id).read();
            let play_url = self.tournament_play_url.entry(tournament_id).read();

            // Reconstruct schedule from packed format
            let schedule = self._unpack_schedule(packed_schedule);

            // Reconstruct game_config
            let game_config = GameConfig {
                address: game_address, settings_id: meta.settings_id, prize_spots: meta.prize_spots,
            };

            // Get stored entry_fee from component (without distribution)
            let stored_entry_fee = self.entry_fee._get_entry_fee(tournament_id);

            // Get distribution from storage (unpack type and param from u16)
            let packed_distribution = self.tournament_distribution.entry(tournament_id).read();
            let dist_type: u8 = (packed_distribution & 0xFF).try_into().unwrap();
            let dist_param: u8 = ((packed_distribution / 256) & 0xFF).try_into().unwrap();
            let distribution = if dist_type == DIST_TYPE_LINEAR {
                Distribution::Linear
            } else if dist_type == DIST_TYPE_EXPONENTIAL {
                Distribution::Exponential(dist_param)
            } else if dist_type == DIST_TYPE_UNIFORM {
                Distribution::Uniform
            } else {
                Distribution::Custom
            };

            // Reconstruct full EntryFee (with distribution) from stored data
            let entry_fee: Option<EntryFee> = match stored_entry_fee {
                Option::Some(stored) => {
                    // First additional_share is context_creator_share (if present)
                    let context_creator_share = if stored.additional_shares.len() > 0 {
                        Option::Some((*stored.additional_shares.at(0)).share_bps)
                    } else {
                        Option::None
                    };
                    Option::Some(
                        EntryFee {
                            token_address: stored.token_address,
                            amount: stored.amount,
                            distribution,
                            context_creator_share,
                            game_creator_share: stored.game_creator_share,
                            refund_share: stored.refund_share,
                        },
                    )
                },
                Option::None => Option::None,
            };

            // Get entry_requirement from component
            let entry_requirement = self.entry_requirement._get_entry_requirement(tournament_id);

            // Return reconstructed tournament model
            TournamentModel {
                id: tournament_id,
                created_at: meta.created_at,
                created_by,
                creator_token_id: meta.creator_token_id,
                metadata,
                schedule,
                game_config,
                entry_fee,
                entry_requirement,
                soulbound: meta.soulbound,
                play_url,
            }
        }

        #[inline(always)]
        fn _unpack_schedule(self: @ContractState, packed: PackedSchedule) -> Schedule {
            let registration = if packed.registration_start == 0 {
                Option::None
            } else {
                Option::Some(
                    Period { start: packed.registration_start, end: packed.registration_end },
                )
            };

            Schedule {
                registration,
                game: Period { start: packed.game_start, end: packed.game_end },
                submission_duration: packed.submission_duration,
            }
        }

        #[inline(always)]
        fn _pack_schedule(self: @ContractState, schedule: Schedule) -> PackedSchedule {
            let (reg_start, reg_end) = match schedule.registration {
                Option::Some(reg) => (reg.start, reg.end),
                Option::None => (0, 0),
            };

            PackedSchedule {
                registration_start: reg_start,
                registration_end: reg_end,
                game_start: schedule.game.start,
                game_end: schedule.game.end,
                submission_duration: schedule.submission_duration,
            }
        }

        #[inline(always)]
        fn _create_tournament(
            ref self: ContractState,
            creator_token_id: u64,
            metadata: Metadata,
            schedule: Schedule,
            game_config: GameConfig,
            entry_fee: Option<EntryFee>,
            distribution: Distribution,
            entry_requirement: Option<EntryRequirement>,
            soulbound: bool,
            play_url: ByteArray,
        ) -> TournamentModel {
            // Increment total tournaments
            let tournament_id = self.total_tournaments.read() + 1;
            self.total_tournaments.write(tournament_id);

            let created_at = get_block_timestamp();
            let created_by = get_caller_address();

            // Store name/description before metadata is consumed (Metadata doesn't implement Copy)
            let metadata_name = metadata.name;
            let metadata_description = metadata.description.clone();

            // Store packed tournament meta
            let meta = TournamentMeta {
                created_at,
                creator_token_id,
                settings_id: game_config.settings_id,
                prize_spots: game_config.prize_spots,
                soulbound,
            };
            self.tournament_meta.entry(tournament_id).write(meta);

            // Store other base fields
            self.tournament_created_by.entry(tournament_id).write(created_by);
            self.tournament_game_address.entry(tournament_id).write(game_config.address);
            self.tournament_metadata.entry(tournament_id).write(metadata);
            self.tournament_schedule.entry(tournament_id).write(self._pack_schedule(schedule));
            self.tournament_play_url.entry(tournament_id).write(play_url.clone());

            // Store entry fee using component (convert to storage format without distribution)
            if let Option::Some(fee) = @entry_fee {
                // Convert input EntryFee to StoredEntryFee (storage format without distribution)
                // context_creator_share becomes the first additional_share
                let additional_shares = match *fee.context_creator_share {
                    Option::Some(share) => array![
                        AdditionalShare { recipient: created_by, share_bps: share },
                    ]
                        .span(),
                    Option::None => array![].span(),
                };
                let stored_fee = StoredEntryFee {
                    token_address: *fee.token_address,
                    amount: *fee.amount,
                    game_creator_share: *fee.game_creator_share,
                    refund_share: *fee.refund_share,
                    additional_shares,
                };
                self.entry_fee.set_entry_fee(tournament_id, @stored_fee);
            }

            // Store distribution (pack type and param into u16)
            let packed_distribution: u16 = match distribution {
                Distribution::Linear => DIST_TYPE_LINEAR.into(),
                Distribution::Exponential(weight) => {
                    DIST_TYPE_EXPONENTIAL.into() | (weight.into() * 256)
                },
                Distribution::Uniform => DIST_TYPE_UNIFORM.into(),
                Distribution::Custom => DIST_TYPE_CUSTOM.into(),
            };
            self.tournament_distribution.entry(tournament_id).write(packed_distribution);

            // Store entry requirement using component
            self.entry_requirement.set_entry_requirement(tournament_id, entry_requirement);

            // Emit event if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer
                    .emit_tournament_created(
                        tournament_id,
                        created_at,
                        created_by,
                        creator_token_id,
                        metadata_name,
                        metadata_description.clone(),
                        game_config.address,
                        game_config.settings_id,
                        game_config.prize_spots.try_into().unwrap(),
                        soulbound,
                    );
            }

            // Return reconstructed tournament model
            // Re-read metadata from storage since it was moved
            let stored_metadata = self.tournament_metadata.entry(tournament_id).read();
            TournamentModel {
                id: tournament_id,
                created_at,
                created_by,
                creator_token_id,
                metadata: stored_metadata,
                schedule,
                game_config,
                entry_fee,
                entry_requirement,
                soulbound,
                play_url,
            }
        }

        // Prize operations
        #[inline(always)]
        fn _emit_prize_added(ref self: ContractState, prize: @Prize) {
            // Emit event if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer
                    .emit_prize_added(
                        *prize.id,
                        *prize.context_id,
                        *prize.token_address,
                        (*prize.payout_position).try_into().unwrap(),
                        *prize.sponsor_address,
                    );
            }
        }

        fn _set_prize_claim(ref self: ContractState, tournament_id: u64, prize_type: PrizeType) {
            self.prize.set_prize_claimed(tournament_id, prize_type);

            // Emit event if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer.emit_prize_claimed(tournament_id, prize_type);
            }
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
            self: @ContractState, contract_address: ContractAddress, token_id: u64,
        ) -> u32 {
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
            self: @ContractState, game_address: ContractAddress, leaderboard: Span<u64>, score: u32,
        ) -> bool {
            let num_scores = leaderboard.len();

            if num_scores == 0 {
                return true;
            }

            let last_place_id = *leaderboard.at(num_scores - 1);
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
        fn _assert_valid_entry_fee(self: @ContractState, entry_fee: @EntryFee, prize_spots: u32) {
            // Entry fee token will be validated when transfers occur
            self._assert_valid_payout_distribution(entry_fee, prize_spots);
        }

        #[inline(always)]
        fn _assert_valid_game_config(ref self: ContractState, game_config: GameConfig) {
            let contract_address = game_config.address;
            let src5_dispatcher = ISRC5Dispatcher { contract_address };
            self._assert_supports_game_interface(src5_dispatcher, contract_address);

            self._assert_winners_count_greater_than_zero(game_config.prize_spots);
            self._assert_settings_exists(contract_address, game_config.settings_id);

            self.metagame.assert_game_registered(contract_address);
        }

        #[inline(always)]
        fn _assert_winners_count_greater_than_zero(self: @ContractState, prize_spots: u32) {
            assert!(prize_spots > 0, "Tournament: Winners count must be greater than zero");
        }

        fn _assert_valid_payout_distribution(
            self: @ContractState, entry_fee: @EntryFee, prize_spots: u32,
        ) {
            // Calculate available share for position distribution (in basis points)
            let mut available_share: u16 = BASIS_POINTS;

            if let Option::Some(context_share) = *entry_fee.context_creator_share {
                available_share -= context_share;
            }

            if let Option::Some(creator_share) = *entry_fee.game_creator_share {
                available_share -= creator_share;
            }

            if let Option::Some(refund_share) = *entry_fee.refund_share {
                available_share -= refund_share;
            }

            // Calculate total distribution sum using the Distribution enum from entry_fee
            let distribution_sum = calculator::calculate_total(
                *entry_fee.distribution, prize_spots, available_share, Option::None,
            );

            // Add back all shares for final validation
            let mut total_sum = distribution_sum;
            if let Option::Some(context_share) = *entry_fee.context_creator_share {
                total_sum += context_share;
            }
            if let Option::Some(creator_share) = *entry_fee.game_creator_share {
                total_sum += creator_share;
            }
            if let Option::Some(refund_share) = *entry_fee.refund_share {
                total_sum += refund_share;
            }

            // Due to integer rounding, allow a small tolerance (within 2% = 200 basis points)
            assert!(
                total_sum >= 9800 && total_sum <= BASIS_POINTS,
                "Tournament: Entry fee distribution needs to be ~100%. Distribution: {} bp",
                total_sum,
            );
        }

        #[inline(always)]
        fn _assert_supports_game_interface(
            self: @ContractState, src5_dispatcher: ISRC5Dispatcher, address: ContractAddress,
        ) {
            let address_felt: felt252 = address.into();
            assert!(
                src5_dispatcher.supports_interface(IMINIGAME_ID),
                "Tournament: Game address {} does not support IGame interface",
                address_felt,
            );
        }

        #[inline(always)]
        fn _assert_supports_erc721(
            self: @ContractState, src5_dispatcher: ISRC5Dispatcher, address: ContractAddress,
        ) {
            let address_felt: felt252 = address.into();
            assert!(
                src5_dispatcher.supports_interface(IERC721_ID),
                "Tournament: Game token address {} does not support IERC721 interface",
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
                "Tournament: Settings id {} is not found on game address {}",
                settings_id,
                game_address,
            );
        }

        #[inline(always)]
        fn _assert_scores_count_valid(self: @ContractState, prize_spots: u32, scores_count: u32) {
            assert!(
                scores_count <= prize_spots,
                "Tournament: The length of scores submissions {} is greater than the winners count {}",
                scores_count,
                prize_spots,
            );
        }

        #[inline(always)]
        fn _assert_position_on_leaderboard(self: @ContractState, prize_spots: u32, position: u8) {
            assert!(
                position.into() <= prize_spots,
                "Tournament: Prize position {} is greater than the winners count {}",
                position,
                prize_spots,
            );
        }

        #[inline(always)]
        fn _assert_prize_exists(self: @ContractState, token: ContractAddress, id: u64) {
            assert!(!token.is_zero(), "Tournament: Prize key {} does not exist", id);
        }

        #[inline(always)]
        fn _assert_prize_not_claimed(
            self: @ContractState, tournament_id: u64, prize_type: PrizeType,
        ) {
            self.prize.assert_prize_not_claimed(tournament_id, prize_type);
        }

        #[inline(always)]
        fn _assert_payout_is_top_score(
            self: @ContractState, payout_position: u8, winner_token_ids: Span<u64>,
        ) {
            assert!(
                payout_position.into() <= winner_token_ids.len(),
                "Tournament: Prize payout position {} is not a top score",
                payout_position,
            );
        }

        fn _assert_gated_type_validates(
            self: @ContractState, entry_requirement: EntryRequirement, schedule: Schedule,
        ) {
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::token(token) => {
                    // Verify the token contract supports ERC721 interface
                    let src5_dispatcher = ISRC5Dispatcher { contract_address: token };
                    self._assert_supports_erc721(src5_dispatcher, token);
                },
                EntryRequirementType::context(context_qualification) => {
                    let mut index = 0;
                    loop {
                        if index == context_qualification.context_ids.len() {
                            break;
                        }
                        self
                            ._assert_tournament_exists(
                                *context_qualification.context_ids.at(index),
                            );
                        index += 1;
                    }
                },
                EntryRequirementType::allowlist(_) => {},
                EntryRequirementType::extension(extension_config) => {
                    let extension_address = extension_config.address;
                    assert!(
                        !extension_address.is_zero(),
                        "Tournament: Qualification extension address can't be zero",
                    );

                    let src5_dispatcher = ISRC5Dispatcher { contract_address: extension_address };
                    let display_extension_address: felt252 = extension_address.into();
                    assert!(
                        src5_dispatcher.supports_interface(IENTRY_VALIDATOR_ID),
                        "Tournament: Qualification extension address {} doesn't support IEntryValidator interface",
                        display_extension_address,
                    );
                    let entry_validator_dispatcher = IEntryValidatorDispatcher {
                        contract_address: extension_address,
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
                },
            }
        }

        fn _assert_tournament_exists(self: @ContractState, tournament_id: u64) {
            assert!(
                tournament_id <= self.total_tournaments.read(),
                "Tournament: Tournament {} does not exist",
                tournament_id,
            );
        }

        #[inline(always)]
        fn _validate_tournament_eligibility(
            self: @ContractState,
            context_qualification: ContextQualification,
            qualifying_context_id: u64,
        ) {
            assert!(
                self
                    ._is_qualifying_tournament(
                        context_qualification.context_ids, qualifying_context_id,
                    ),
                "Tournament: Not a qualifying tournament",
            );
        }

        fn _validate_position_requirements(
            self: @ContractState,
            leaderboard: Span<u64>,
            context_qualification: ContextQualification,
            qualification: ContextProof,
        ) {
            // For tournaments, data contains: [token_id, position]
            assert!(qualification.data.len() >= 2, "Tournament: Invalid context proof data");
            let token_id: u64 = (*qualification.data.at(0)).try_into().unwrap();
            let position: u8 = (*qualification.data.at(1)).try_into().unwrap();

            // Position must be greater than 0 for all qualification types
            assert!(position > 0, "Tournament: Position must be greater than 0");

            // For winners qualification type, verify position on leaderboard
            if context_qualification.qualifier_type == QUALIFIER_TYPE_WINNERS {
                assert!(
                    position.into() <= leaderboard.len(),
                    "Tournament: Position {} exceeds leaderboard length {}",
                    position,
                    leaderboard.len(),
                );

                assert!(
                    *leaderboard.at((position - 1).into()) == token_id,
                    "Tournament: Provided Token ID {} does not match Token ID at leaderboard position {} for context {}",
                    token_id,
                    position,
                    qualification.context_id,
                );
            }
        }

        fn _has_qualified_in_tournaments(
            self: @ContractState, context_qualification: ContextQualification, token_id: u64,
        ) -> bool {
            let requires_top_score = context_qualification.qualifier_type == QUALIFIER_TYPE_WINNERS;

            let mut loop_index = 0;
            let mut is_qualified = false;

            loop {
                if loop_index == context_qualification.context_ids.len() {
                    break;
                }

                let qualifying_tournament_id = *context_qualification.context_ids.at(loop_index);
                let tournament = self._get_tournament(qualifying_tournament_id);
                let game_address = tournament.game_config.address;
                let registration = self._get_registration(game_address, token_id);
                let game_token_address = IMinigameDispatcher { contract_address: game_address }
                    .token_address();
                let owner = self._get_owner(game_token_address, token_id.into());

                // Check basic registration: caller owns token and token was registered
                if owner == get_caller_address()
                    && registration.context_id == tournament.id
                    && registration.entry_number != 0 {
                    if requires_top_score {
                        // WINNERS: Must have submitted and have a top score on leaderboard
                        if registration.has_submitted {
                            let leaderboard = self._get_leaderboard(qualifying_tournament_id);
                            let score = self.get_score_for_token_id(game_address, token_id);
                            is_qualified = self
                                ._is_top_score(game_address, leaderboard.span(), score);
                        }
                    } else {
                        // PARTICIPANTS: Just needs to be registered (entry_number != 0)
                        is_qualified = true;
                    }

                    if is_qualified {
                        break;
                    }
                }

                loop_index += 1;
            }

            is_qualified
        }

        #[inline(always)]
        fn _assert_has_qualified_in_tournaments(
            self: @ContractState, context_qualification: ContextQualification, token_id: u64,
        ) {
            assert!(
                self._has_qualified_in_tournaments(context_qualification, token_id),
                "Tournament: game token id {} does not qualify for tournament",
                token_id,
            );
        }

        #[inline(always)]
        fn _assert_position_is_valid(self: @ContractState, position: u8, winner_count: u32) {
            assert!(
                position > 0 && position.into() <= winner_count, "Tournament: Invalid position",
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
            objective_ids: Option<Span<u32>>,
            context: Option<GameContextDetails>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            to: ContractAddress,
            soulbound: bool,
        ) -> u64 {
            let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
            let game_token_address = game_dispatcher.token_address();
            IMinigameTokenDispatcher { contract_address: game_token_address }
                .mint(
                    Option::Some(game_address),
                    player_name,
                    settings_id,
                    start,
                    end,
                    objective_ids,
                    context,
                    client_url,
                    renderer_address,
                    to,
                    soulbound,
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

        fn _claim_entry_fees(
            ref self: ContractState, tournament_id: u64, tournament: TournamentModel, role: Role,
        ) {
            if let Option::Some(entry_fee) = tournament.entry_fee {
                let total_entries = self.registration._get_entry_count(tournament_id);
                let total_pool = total_entries.into() * entry_fee.amount;

                // Calculate share based on recipient type (in basis points)
                let share: u16 = match role {
                    Role::TournamentCreator => {
                        if let Option::Some(context_creator_share) = entry_fee
                            .context_creator_share {
                            context_creator_share
                        } else {
                            panic!(
                                "Tournament: tournament {} does not have a host tip", tournament_id,
                            )
                        }
                    },
                    Role::GameCreator => {
                        if let Option::Some(game_creator_share) = entry_fee.game_creator_share {
                            game_creator_share
                        } else {
                            panic!(
                                "Tournament: tournament {} does not have a game creator tip",
                                tournament_id,
                            )
                        }
                    },
                    Role::Position(position) => {
                        self
                            ._assert_position_is_valid(
                                position, tournament.game_config.prize_spots,
                            );
                        // Calculate available share for position distribution (in basis points)
                        let mut available_share: u16 = BASIS_POINTS;
                        if let Option::Some(context_share) = entry_fee.context_creator_share {
                            available_share -= context_share;
                        }
                        if let Option::Some(creator_share) = entry_fee.game_creator_share {
                            available_share -= creator_share;
                        }
                        if let Option::Some(refund_share) = entry_fee.refund_share {
                            available_share -= refund_share;
                        }
                        calculator::calculate_share(
                            entry_fee.distribution,
                            position,
                            tournament.game_config.prize_spots,
                            available_share,
                            Option::None,
                        )
                    },
                    Role::Refund(game_id) => {
                        // Get game token address to verify registration
                        let game_dispatcher = IMinigameDispatcher {
                            contract_address: tournament.game_config.address,
                        };
                        let game_token_address = game_dispatcher.token_address();
                        // Verify the game_id is registered for this tournament
                        let registration = self
                            .registration
                            ._get_registration(game_token_address, game_id.try_into().unwrap());
                        assert!(
                            registration.context_id == tournament_id,
                            "Tournament: game_id {} is not registered for tournament {}",
                            game_id,
                            tournament_id,
                        );
                        // Each participant gets the refund share divided by total entries
                        if let Option::Some(refund_share) = entry_fee.refund_share {
                            // The refund_share is the total % to be refunded, divided equally
                            // among all participants
                            refund_share / total_entries.try_into().unwrap_or(1)
                        } else {
                            panic!(
                                "Tournament: tournament {} does not have a refund share",
                                tournament_id,
                            )
                        }
                    },
                };

                let prize_amount = self._calculate_payout(share.into(), total_pool);

                let game_dispatcher = IMinigameDispatcher {
                    contract_address: tournament.game_config.address,
                };
                let game_token_address = game_dispatcher.token_address();

                // Get recipient address
                let recipient_address = match role {
                    Role::TournamentCreator => {
                        // Tournament creator is owner of the tournament creator token
                        self._get_owner(game_token_address, tournament.creator_token_id.into())
                    },
                    Role::GameCreator => {
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
                        if !minigame_registry_address.is_zero() {
                            let game_id = minigame_registry
                                .game_id_from_address(tournament.game_config.address);
                            self._get_owner(minigame_registry_address, game_id.into())
                        } else {
                            // Otherwise, the game creator is the owner of token ID 0
                            self._get_owner(game_token_address, GAME_CREATOR_TOKEN_ID.into())
                        }
                    },
                    Role::Position(position) => {
                        let leaderboard = self._get_leaderboard(tournament_id);
                        // Check if leaderboard has enough entries for the position
                        if position.into() <= leaderboard.len() {
                            let winner_token_id = *leaderboard.at(position.into() - 1);
                            self._get_owner(game_token_address, winner_token_id.into())
                        } else {
                            // No entry at this position, default to tournament creator
                            self._get_owner(game_token_address, tournament.creator_token_id.into())
                        }
                    },
                    Role::Refund(game_id) => {
                        // Refund goes to the owner of the game_id token
                        self._get_owner(game_token_address, game_id.into())
                    },
                };

                self.entry_fee.payout(entry_fee.token_address, recipient_address, prize_amount);
            } else {
                panic!("Tournament: tournament {} has no entry fees", tournament_id);
            }
        }

        fn _claim_sponsored_prize(
            ref self: ContractState, tournament_id: u64, tournament: TournamentModel, prize_id: u64,
        ) {
            let prize = self.prize._get_prize(prize_id);

            // Validate prize
            assert!(
                prize.context_id == tournament_id,
                "Tournament: Prize {} is for tournament {}",
                prize_id,
                prize.context_id,
            );

            // Get winner address
            let leaderboard = self._get_leaderboard(tournament_id);
            self
                ._assert_position_is_valid(
                    prize.payout_position.try_into().unwrap(), tournament.game_config.prize_spots,
                );

            let game_dispatcher = IMinigameDispatcher {
                contract_address: tournament.game_config.address,
            };
            let game_token_address = game_dispatcher.token_address();

            // Check if leaderboard has enough entries for the position
            let recipient_address = if prize.payout_position <= leaderboard.len() {
                let winner_token_id = *leaderboard.at(prize.payout_position - 1);
                self._get_owner(game_token_address, winner_token_id.into())
            } else {
                // No entry at this position, default to tournament creator
                self._get_owner(game_token_address, tournament.creator_token_id.into())
            };

            // Transfer prize using component
            self.prize.payout(@prize, recipient_address);
        }

        /// Validates tournament-specific rules for score submission
        /// Leaderboard position/score validation is handled by game_components_leaderboard
        fn _validate_score_submission(
            self: @ContractState, tournament: @TournamentModel, registration: @Registration,
        ) {
            let schedule = *tournament.schedule;
            assert!(
                schedule.current_phase(get_block_timestamp()) == Phase::Submission,
                "Tournament: Not in submission period",
            );

            // Delegate validation to registration component
            self.registration.assert_valid_for_submission(registration, *tournament.id);
        }

        fn _mark_score_submitted(ref self: ContractState, tournament_id: u64, token_id: u64) {
            let tournament = self._get_tournament(tournament_id);
            let game_address = tournament.game_config.address;
            self.registration.mark_score_submitted(game_address, token_id);
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
                        "Tournament: Tournament {} has an entry requirement but no qualification was provided",
                        tournament_id,
                    )
                },
            };

            let recipient = self
                ._validate_entry_requirement(tournament_id, entry_requirement, qualifier);

            self
                .entry_requirement
                .update_qualification_entries(tournament_id, qualifier, entry_requirement);

            recipient
        }

        fn _validate_entry_requirement(
            self: @ContractState,
            tournament_id: u64,
            entry_requirement: EntryRequirement,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::context(context_qualification) => {
                    self
                        ._validate_tournament_qualification(
                            tournament_id, context_qualification, qualifier,
                        )
                },
                EntryRequirementType::token(token_address) => {
                    self._validate_nft_qualification(token_address, qualifier)
                },
                EntryRequirementType::allowlist(addresses) => {
                    self._validate_allowlist_qualification(addresses, qualifier)
                },
                EntryRequirementType::extension(extension_config) => {
                    self
                        ._validate_extension_qualification(
                            extension_config.address, tournament_id, qualifier,
                        )
                },
            }
        }

        fn _validate_tournament_qualification(
            self: @ContractState,
            tournament_id: u64,
            context_qualification: ContextQualification,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            let qualifying_proof = match qualifier {
                QualificationProof::Context(qual) => qual,
                _ => panic!("Tournament: Provided qualification proof is not of type 'Context'"),
            };

            // verify qualifying tournament is in qualifying set
            self
                ._validate_tournament_eligibility(
                    context_qualification, qualifying_proof.context_id,
                );

            // verify qualifying tournament is finalized
            let qualifying_tournament = self._get_tournament(qualifying_proof.context_id);

            qualifying_tournament.schedule.assert_tournament_is_finalized(get_block_timestamp());

            // verify position requirements
            let leaderboard = self._get_leaderboard(qualifying_proof.context_id);
            self
                ._validate_position_requirements(
                    leaderboard.span(), context_qualification, qualifying_proof,
                );

            let tournament = self._get_tournament(tournament_id);

            let game_dispatcher = IMinigameDispatcher {
                contract_address: tournament.game_config.address,
            };
            let game_token_address = game_dispatcher.token_address();

            // Extract token_id from context proof data (format: [token_id, position, ...])
            assert!(qualifying_proof.data.len() >= 1, "Tournament: Invalid context proof data");
            let token_id: u64 = (*qualifying_proof.data.at(0)).try_into().unwrap();

            // Return the owner of the qualifying token
            let token_owner = self._get_owner(game_token_address, token_id.into());

            token_owner
        }

        fn _validate_nft_qualification(
            self: @ContractState, token_address: ContractAddress, qualifier: QualificationProof,
        ) -> ContractAddress {
            let qualification = match qualifier {
                QualificationProof::NFT(qual) => qual,
                _ => panic!("Tournament: Provided qualification proof is not of type 'Token'"),
            };

            let erc721_dispatcher = IERC721Dispatcher { contract_address: token_address };
            let token_owner = erc721_dispatcher.owner_of(qualification.token_id);

            // Return the owner of the qualifying NFT
            token_owner
        }

        fn _is_qualifying_tournament(
            self: @ContractState, qualifying_tournaments: Span<u64>, tournament_id: u64,
        ) -> bool {
            let mut i = 0;
            loop {
                if i >= qualifying_tournaments.len() {
                    break false;
                }
                if *qualifying_tournaments.at(i) == tournament_id {
                    break true;
                }
                i += 1;
            }
        }

        #[inline(always)]
        fn _validate_allowlist_qualification(
            self: @ContractState,
            allowlist_addresses: Span<ContractAddress>,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            let qualifying_address = match qualifier {
                QualificationProof::Address(qual) => qual,
                _ => panic!("Tournament: Provided qualification proof is not of type 'Address'"),
            };

            assert!(
                self._contains_address(allowlist_addresses, qualifying_address),
                "Tournament: Qualifying address is not in allowlist",
            );

            // Return the qualifying address
            qualifying_address
        }

        #[inline(always)]
        fn _validate_extension_qualification(
            self: @ContractState,
            extension_address: ContractAddress,
            tournament_id: u64,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            let qualification = match qualifier {
                QualificationProof::Extension(qual) => qual,
                _ => panic!("Tournament: Provided qualification proof is not of type 'Extension'"),
            };

            let entry_validator_dispatcher = IEntryValidatorDispatcher {
                contract_address: extension_address,
            };
            let caller_address = get_caller_address();
            let display_extension_address: felt252 = extension_address.into();
            assert!(
                entry_validator_dispatcher
                    .valid_entry(tournament_id, caller_address, qualification),
                "Tournament: Invalid entry according to extension {}",
                display_extension_address,
            );
            caller_address
        }

        fn _contains_address(
            self: @ContractState, addresses: Span<ContractAddress>, target: ContractAddress,
        ) -> bool {
            let mut i = 0;
            loop {
                if i >= addresses.len() {
                    break false;
                }
                if *addresses.at(i) == target {
                    break true;
                }
                i += 1;
            }
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
}
