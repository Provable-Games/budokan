// SPDX-License-Identifier: BUSL-1.1

#[starknet::contract]
pub mod Budokan {
    use budokan::libs::schedule::{
        ScheduleAssertionsImpl, ScheduleAssertionsTrait, ScheduleImpl, ScheduleTrait,
    };
    use budokan::models::budokan::{
        AdditionalShare, Distribution, EntryFee, EntryFeeClaimType, EntryFeeRewardType,
        EntryRequirement, EntryRequirementType, GameConfig, Metadata, Prize, PrizeType,
        QualificationEntries, QualificationProof, Registration, RewardType, StoredEntryFee,
        TokenTypeData, Tournament as TournamentModel,
    };
    use budokan::models::constants::GAME_CREATOR_TOKEN_ID;
    use budokan::models::packed_storage::{
        PackedDistribution, PackedDistributionStorePacking, TournamentMeta,
        TournamentMetaStorePacking,
    };
    use budokan::models::schedule::{Phase, Schedule};
    use budokan_distribution::calculator;
    use budokan_distribution::models::{
        BASIS_POINTS, DIST_TYPE_CUSTOM, DIST_TYPE_EXPONENTIAL, DIST_TYPE_LINEAR, DIST_TYPE_UNIFORM,
    };
    use budokan_entry_fee::entry_fee::EntryFeeComponent;
    use budokan_entry_fee::entry_fee::EntryFeeComponent::EntryFeeInternalTrait;
    use budokan_entry_requirement::entry_requirement::EntryRequirementComponent;
    use budokan_entry_requirement::entry_requirement::EntryRequirementComponent::EntryRequirementInternalTrait;
    use budokan_interfaces::budokan::IBudokan;
    use budokan_interfaces::entry_validator::{
        IENTRY_VALIDATOR_ID, IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
    };
    use budokan_interfaces::event_relayer::{
        IBudokanEventRelayerDispatcher, IBudokanEventRelayerDispatcherTrait,
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
        >, // StorePacking: created_at | creator_token_id | settings_id | soulbound
        tournament_game_address: Map<u64, ContractAddress>,
        tournament_metadata: Map<u64, Metadata>,
        tournament_schedule: Map<u64, Schedule>, // StorePacking handles packing
        tournament_play_url: Map<u64, ByteArray>,
        // Distribution config per tournament (packed into felt252)
        tournament_distribution: Map<u64, PackedDistribution>,
        // Position-based entry fee claims: (tournament_id, position) -> claimed
        entry_fee_position_claimed: Map<(u64, u32), bool>,
        // Prize position mapping: prize_id -> position (for Single prizes)
        prize_position: Map<u64, u32>,
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
        /// @title Upgrade contract
        /// @notice Upgrades the contract implementation to a new class hash.
        /// @dev Only callable by the contract owner.
        /// @param self A reference to the ContractState object.
        /// @param new_class_hash The new class hash to upgrade to.
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
        /// @notice Allows anyone to create a new tournament with specified configuration.
        /// @dev Validates schedule, game config, entry fees, and entry requirements before
        /// creation.
        ///      Mints a creator token for reward distribution purposes.
        /// @param self A reference to the ContractState object.
        /// @param creator_rewards_address The address to mint the creator's game token to.
        /// @param metadata The tournament metadata (name, description, etc.).
        /// @param schedule The tournament schedule (registration, game, submission periods).
        /// @param game_config The tournament game configuration (address, settings, soulbound flag,
        /// play URL).
        /// @param entry_fee Optional entry fee configuration with distribution settings.
        /// @param entry_requirement Optional entry requirement (token, allowlist, or
        /// extension-based).
        /// @return A TournamentModel struct containing the created tournament details.
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
                )
        }

        /// @title Enter tournament
        /// @notice Registers a player for a tournament and mints them a game token.
        /// @dev Validates tournament exists, registration is open, entry requirements are met, and
        /// processes entry fees.
        ///      The game token is minted to the qualifying address or player based on entry
        ///      requirements.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to enter.
        /// @param player_name The display name for the player.
        /// @param player_address The address to receive the game token (if no qualification
        /// override).
        /// @param qualification Optional qualification proof for gated tournaments.
        /// @return A tuple of (game_token_id, entry_number) for the registered player.
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

            let client_url = if tournament.game_config.play_url.len() == 0 {
                let _tournament_id = format!("{}", tournament.id);
                Option::Some("https://budokan.gg/tournament/" + _tournament_id)
            } else {
                Option::Some(tournament.game_config.play_url)
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
                    tournament.game_config.soulbound // soulbound
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
                    let entry_validator = IEntryValidatorDispatcher {
                        contract_address: extension_config.address,
                    };
                    entry_validator
                        .add_entry(
                            tournament_id, game_token_id, caller_address, qualification_proof,
                        );
                }
            }

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

        /// @title Ban entry
        /// @notice Bans a tournament entry if the extension determines it should be banned.
        /// @dev Only works with extension-based entry requirements. Can only be called between
        /// registration start and game start.
        ///      Uses the extension's should_ban method which has access to entry ordering context.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to ban entry for.
        /// @param game_token_id The game token ID to evaluate for banning.
        /// @param proof Proof data to pass to the entry validator extension.
        fn ban_entry(
            ref self: ContractState, tournament_id: u64, game_token_id: u64, proof: Span<felt252>,
        ) {
            let tournament = self._get_tournament(tournament_id);

            // Assert tournament exists
            self._assert_tournament_exists(tournament_id);

            // Ensure tournament has an extension entry requirement
            let entry_requirement = tournament.entry_requirement;
            assert!(entry_requirement.is_some(), "Budokan: No entry requirement set");

            let extension_config = match entry_requirement.unwrap().entry_requirement_type {
                EntryRequirementType::extension(config) => config,
                _ => panic!("Budokan: Entry requirement must be of type 'extension'"),
            };

            let extension_address = extension_config.address;

            // Can only ban from registration start up until game starts
            let current_time = get_block_timestamp();
            if let Option::Some(registration_period) = tournament.schedule.registration {
                assert!(
                    current_time >= registration_period.start
                        && current_time < tournament.schedule.game.start,
                    "Budokan: Can only ban from registration start until game starts",
                );
            } else {
                panic!("Budokan: Can only ban tournaments with registration period set");
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
                "Budokan: Game ID not registered for this tournament",
            );

            // Assert game ID is not already banned
            assert!(!registration.is_banned, "Budokan: Game ID is already banned");

            // Get the current owner of this game token
            let current_owner = game_dispatcher.owner_of(game_token_id.into());

            // Ask the extension if this entry should be banned
            // The extension has context about entry ordering and can make informed decisions
            let should_ban = entry_validator_dispatcher
                .should_ban(tournament_id, game_token_id, current_owner, proof);

            // Assert should be banned to avoid wasting gas on invalid ban attempts
            assert!(should_ban, "Budokan: Entry should not be banned");

            // Notify the extension to update its entry tracking
            entry_validator_dispatcher
                .remove_entry(tournament_id, game_token_id, current_owner, proof);

            // Update registration to mark as banned using component
            self.registration.ban_registration(game_address, game_token_id);

            // Emit event if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer
                    .emit_registration(
                        game_address,
                        game_token_id,
                        tournament_id,
                        0, // entry_number for banned registration
                        false, // has_submitted
                        true // is_banned
                    );
            }
        }

        /// @title Submit score
        /// @notice Submits a player's score to the tournament leaderboard.
        /// @dev Validates tournament phase (must be in Submission period), registration status, and
        /// leaderboard placement.
        ///      Position parameter allows players to claim their ranking efficiently.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to submit score for.
        /// @param token_id The game token ID containing the score.
        /// @param position The claimed position on the leaderboard (validated against actual
        /// score).
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

            // Submit score using leaderboard component (config is stored in leaderboard)
            let result = self
                .leaderboard
                .submit_score(tournament_id, token_id, submitted_score, position);

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
                        relayer.emit_leaderboard(tournament_id, leaderboard.span());
                    }
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

        /// @title Claim reward
        /// @notice Unified function for claiming both sponsored prizes and entry fee rewards.
        /// @dev Tournament must be finalized before any rewards can be claimed. Validates reward
        /// hasn't been claimed already.
        ///      Supports both Prize (single/distributed) and EntryFee (position/game
        ///      creator/refund/additional share) reward types.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to claim rewards from.
        /// @param reward_type The type of reward to claim (Prize or EntryFee variant).
        fn claim_reward(ref self: ContractState, tournament_id: u64, reward_type: RewardType) {
            let tournament = self._get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            tournament.schedule.assert_tournament_is_finalized(get_block_timestamp());

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

        /// @title Add prize
        /// @notice Adds a sponsored prize to an active tournament.
        /// @dev Tournament must be in the Live phase. Tokens are transferred from caller to
        /// contract upon addition.
        ///      Position parameter determines whether prize is single-position or distributed.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament to add the prize to.
        /// @param token_address The token address for the prize (ERC20 or ERC721).
        /// @param token_type The token type data (ERC20 with amount/distribution, or ERC721 with
        /// id).
        /// @param position Position for Single prizes, None for Distributed prizes:
        ///        - Some(n): Prize goes to position n on leaderboard (Single prize)
        ///        - None: Prize is distributed across positions (Distributed prize, requires
        ///        distribution in ERC20Data)
        /// @return A Prize struct containing the added prize details.
        fn add_prize(
            ref self: ContractState,
            tournament_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            position: Option<u32>,
        ) -> Prize {
            let tournament = self._get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            tournament.schedule.game.assert_is_active(get_block_timestamp());

            // Add prize (deposits tokens, increments count, stores prize with packed payout config)
            let prize = self.prize.add_prize(tournament_id, token_address, token_type);
            let prize_id = prize.id;

            // Store position mapping for Single prizes
            if let Option::Some(pos) = position {
                self.prize_position.entry(prize_id).write(pos);
            }

            // Emit event
            self._emit_prize_added(prize);

            // Return a fresh copy of the prize
            self.prize._get_prize(prize_id)
        }
    }

    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
        //
        // STORAGE HELPERS
        //

        // Leaderboard operations
        /// @title Get leaderboard (internal)
        /// @notice Retrieves the leaderboard from the leaderboard component and converts to an
        /// array.
        /// @dev Reads from the leaderboard component using the Store trait.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to query.
        /// @return An array of token IDs representing the leaderboard order.
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
                        *registration.has_submitted,
                        *registration.is_banned,
                    );
            }
        }

        // Tournament operations - reading from packed storage
        /// @title Get tournament (internal)
        /// @notice Reconstructs a complete tournament model from packed storage.
        /// @dev Reads from multiple storage locations and unpacks compressed data structures.
        ///      Reconstructs schedule, entry fees, distribution, and entry requirements.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to query.
        /// @return A TournamentModel struct with all tournament data.
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
            let schedule = packed_schedule;

            // Reconstruct game_config (includes soulbound and play_url)
            let game_config = GameConfig {
                address: game_address,
                settings_id: meta.settings_id,
                soulbound: meta.soulbound,
                play_url,
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

            // Convert positions: 0 in storage means None (dynamic)
            let distribution_positions = if packed_dist.positions == 0 {
                Option::None
            } else {
                Option::Some(packed_dist.positions)
            };

            // Reconstruct full EntryFee (with distribution) from stored data
            let entry_fee: Option<EntryFee> = match stored_entry_fee {
                Option::Some(stored) => {
                    // First additional_share is tournament_creator_share (if present)
                    let tournament_creator_share = if stored.additional_shares.len() > 0 {
                        Option::Some((*stored.additional_shares.at(0)).share_bps)
                    } else {
                        Option::None
                    };
                    Option::Some(
                        EntryFee {
                            token_address: stored.token_address,
                            amount: stored.amount,
                            distribution,
                            tournament_creator_share,
                            game_creator_share: stored.game_creator_share,
                            refund_share: stored.refund_share,
                            distribution_positions,
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
            }
        }

        /// @title Create tournament (internal)
        /// @notice Creates and stores a new tournament with all configuration.
        /// @dev Increments tournament counter, stores packed data, initializes leaderboard, and
        /// emits events.
        ///      Stores entry fees, distribution, and requirements using component storage.
        /// @param self A reference to the ContractState object.
        /// @param creator_token_id The token ID minted for the tournament creator.
        /// @param metadata The tournament metadata.
        /// @param schedule The tournament schedule.
        /// @param game_config The game configuration.
        /// @param entry_fee Optional entry fee configuration.
        /// @param distribution The prize distribution model.
        /// @param entry_requirement Optional entry requirement.
        /// @return The created TournamentModel.
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
        ) -> TournamentModel {
            // Increment total tournaments
            let tournament_id = self.total_tournaments.read() + 1;
            self.total_tournaments.write(tournament_id);

            let created_at = get_block_timestamp();
            let created_by = get_caller_address();

            // Store packed tournament meta (soulbound is part of game_config)
            let meta = TournamentMeta {
                created_at,
                creator_token_id,
                settings_id: game_config.settings_id,
                soulbound: game_config.soulbound,
            };
            self.tournament_meta.entry(tournament_id).write(meta);

            // Store other base fields
            self.tournament_created_by.entry(tournament_id).write(created_by);
            self.tournament_game_address.entry(tournament_id).write(game_config.address);
            self.tournament_metadata.entry(tournament_id).write(metadata.clone());
            self.tournament_schedule.entry(tournament_id).write(schedule);
            self.tournament_play_url.entry(tournament_id).write(game_config.play_url.clone());

            // Store entry fee using component (convert to storage format without distribution)
            if let Option::Some(fee) = @entry_fee {
                // Convert input EntryFee to StoredEntryFee (storage format without distribution)
                // tournament_creator_share becomes the first additional_share
                let additional_shares = match *fee.tournament_creator_share {
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

            // Store distribution using PackedDistribution
            let (dist_type, dist_param) = match distribution {
                Distribution::Linear(weight) => (DIST_TYPE_LINEAR, weight),
                Distribution::Exponential(weight) => (DIST_TYPE_EXPONENTIAL, weight),
                Distribution::Uniform => (DIST_TYPE_UNIFORM, 0_u16),
                Distribution::Custom(_) => (DIST_TYPE_CUSTOM, 0_u16),
            };
            // Get distribution_positions from entry_fee if present, otherwise 0 (dynamic)
            let positions: u32 = match @entry_fee {
                Option::Some(fee) => {
                    match *fee.distribution_positions {
                        Option::Some(pos) => pos,
                        Option::None => 0_u32,
                    }
                },
                Option::None => 0_u32,
            };
            let packed_dist = PackedDistribution { dist_type, dist_param, positions };
            self.tournament_distribution.entry(tournament_id).write(packed_dist);

            // Store entry requirement using component
            self.entry_requirement.set_entry_requirement(tournament_id, entry_requirement);

            // Configure leaderboard for this tournament
            self
                .leaderboard
                ._configure_tournament(
                    tournament_id,
                    0xFFFFFFFF_u32, // Unlimited leaderboard (u32::MAX = ~4.3B)
                    false, // Higher scores are better
                    game_config.address,
                );

            // Emit events if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer
                    .emit_tournament(
                        tournament_id,
                        created_at,
                        created_by,
                        creator_token_id,
                        metadata,
                        schedule,
                        game_config,
                        entry_fee,
                        entry_requirement,
                    );
                // Emit platform metrics update
                relayer.emit_platform_metrics('budokan', tournament_id);
            }

            // Return reconstructed tournament model from storage
            self._get_tournament(tournament_id)
        }

        // Prize operations
        #[inline(always)]
        fn _emit_prize_added(ref self: ContractState, prize: Prize) {
            // Emit events if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                // Read position from storage (0 means distributed prize)
                let payout_position = self.prize_position.entry(prize.id).read();
                relayer
                    .emit_prize(
                        prize.id,
                        prize.context_id,
                        payout_position,
                        prize.token_address,
                        prize.token_type,
                        prize.sponsor_address,
                    );
                // Emit prize metrics update
                let total_prizes = self.prize.get_total_prizes();
                relayer.emit_prize_metrics('budokan', total_prizes);
            }
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

            // Emit event if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer.emit_reward_claim(tournament_id, reward_type, true);
            }
        }

        fn _is_position_claim_made(
            self: @ContractState, tournament_id: u64, position: u32,
        ) -> bool {
            self.entry_fee_position_claimed.entry((tournament_id, position)).read()
        }

        // Entry count operations
        #[inline(always)]
        fn _increment_entry_count(ref self: ContractState, tournament_id: u64) -> u32 {
            let count = self.registration.increment_entry_count(tournament_id);

            // Emit entry count update if relayer is configured
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer.emit_entry_count(tournament_id, count);
            }

            count
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
        fn _assert_valid_game_config(ref self: ContractState, game_config: @GameConfig) {
            let contract_address = *game_config.address;
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
        fn _assert_supports_erc721(
            self: @ContractState, src5_dispatcher: ISRC5Dispatcher, address: ContractAddress,
        ) {
            let address_felt: felt252 = address.into();
            assert!(
                src5_dispatcher.supports_interface(IERC721_ID),
                "Budokan: Game token address {} does not support IERC721 interface",
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
                    // Tournament creator share is stored as AdditionalShare at index 0
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
            self: @ContractState, payout_position: u8, winner_token_ids: Span<u64>,
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
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::token(token) => {
                    // Verify the token contract supports ERC721 interface
                    let src5_dispatcher = ISRC5Dispatcher { contract_address: token };
                    self._assert_supports_erc721(src5_dispatcher, token);
                },
                EntryRequirementType::allowlist(_) => {},
                EntryRequirementType::extension(extension_config) => {
                    let extension_address = extension_config.address;
                    assert!(
                        !extension_address.is_zero(),
                        "Budokan: Qualification extension address can't be zero",
                    );

                    let src5_dispatcher = ISRC5Dispatcher { contract_address: extension_address };
                    let display_extension_address: felt252 = extension_address.into();
                    assert!(
                        src5_dispatcher.supports_interface(IENTRY_VALIDATOR_ID),
                        "Budokan: Qualification extension address {} doesn't support IEntryValidator interface",
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

        /// Claim entry fee reward based on entry fee reward type
        fn _claim_entry_fee_reward(
            ref self: ContractState,
            tournament_id: u64,
            tournament: TournamentModel,
            entry_fee_type: EntryFeeRewardType,
        ) {
            // Extract game config address before consuming tournament
            let game_config_address = tournament.game_config.address;
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
                        let stored_fee = self.entry_fee._get_entry_fee(tournament_id);
                        let stored = match stored_fee {
                            Option::Some(fee) => fee,
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
                        let share = if let Option::Some(game_creator_share) = entry_fee
                            .game_creator_share {
                            game_creator_share
                        } else {
                            panic!(
                                "Budokan: tournament {} does not have a game creator share",
                                tournament_id,
                            )
                        };

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
                        let registration = self
                            .registration
                            ._get_registration(game_config_address, token_id);
                        assert!(
                            registration.context_id == tournament_id,
                            "Budokan: token_id {} is not registered for tournament {}",
                            token_id,
                            tournament_id,
                        );

                        // Each participant gets the refund share divided by total entries
                        let share = if let Option::Some(refund_share) = entry_fee.refund_share {
                            // The refund_share is the total % to be refunded, divided equally
                            // among all participants
                            refund_share / total_entries.try_into().unwrap_or(1)
                        } else {
                            panic!(
                                "Budokan: tournament {} does not have a refund share",
                                tournament_id,
                            )
                        };

                        // Refund goes to the owner of the token_id
                        let recipient = self._get_owner(game_token_address, token_id.into());

                        (share, recipient)
                    },
                };

                let prize_amount = self._calculate_payout(share.into(), total_pool);
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
            creator_token_id: u64,
        ) {
            let total_entries = self.registration._get_entry_count(tournament_id);
            let total_pool = total_entries.into() * entry_fee.amount;

            // Get actual leaderboard size (number of players who submitted scores)
            let leaderboard = self.leaderboard.get_leaderboard(tournament_id);
            let leaderboard_size: u32 = leaderboard.len();

            // Validate position is at least 1
            assert!(position > 0, "Budokan: Position must be greater than zero");

            // Use fixed distribution_positions if set, otherwise use actual leaderboard size
            let total_positions: u32 = match entry_fee.distribution_positions {
                Option::Some(fixed_positions) => fixed_positions,
                Option::None => leaderboard_size,
            };

            // Calculate available share for position distribution (in basis points)
            let mut available_share: u16 = BASIS_POINTS;
            if let Option::Some(tournament_share) = entry_fee.tournament_creator_share {
                available_share -= tournament_share;
            }
            if let Option::Some(creator_share) = entry_fee.game_creator_share {
                available_share -= creator_share;
            }
            if let Option::Some(refund_share) = entry_fee.refund_share {
                available_share -= refund_share;
            }

            let share = calculator::calculate_share_with_dust(
                entry_fee.distribution, position, total_positions, available_share,
            );

            // Get recipient for this position
            let recipient_address = if position <= leaderboard_size {
                let winner_token_id = *leaderboard.at(position - 1);
                self._get_owner(game_token_address, winner_token_id.into())
            } else {
                // No entry at this position, default to tournament creator
                self._get_owner(game_token_address, creator_token_id.into())
            };

            let prize_amount = self._calculate_payout(share.into(), total_pool);
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
        /// Full amount goes to the winner at the specified position
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
                    contract_address: tournament.game_config.address,
                };
                let game_token_address = game_dispatcher.token_address();
                let winner_token_id = *leaderboard.at(position - 1);
                let recipient_address = self._get_owner(game_token_address, winner_token_id.into());

                match prize.token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        // Ensure this is NOT a distributed prize
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
                        // Ensure this is NOT a distributed prize
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
        /// payout_index determines which share of the distribution is being claimed
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

            // Handle payout or refund based on leaderboard size
            if payout_index <= leaderboard_size {
                // Position exists on leaderboard - pay the winner
                let game_dispatcher = IMinigameDispatcher {
                    contract_address: tournament.game_config.address,
                };
                let game_token_address = game_dispatcher.token_address();
                let winner_token_id = *leaderboard.at(payout_index - 1);
                let recipient_address = self._get_owner(game_token_address, winner_token_id.into());

                // Transfer calculated amount
                self.prize.payout_erc20(prize.token_address, payout_amount, recipient_address);
            } else {
                // No entry at this position - refund to sponsor
                self.prize.refund_prize_erc20(prize_id, payout_amount);
            }
        }

        /// Validates tournament-specific rules for score submission
        /// Leaderboard position/score validation is handled by game_components_leaderboard
        fn _validate_score_submission(
            self: @ContractState, tournament: @TournamentModel, registration: @Registration,
        ) {
            let schedule = *tournament.schedule;
            assert!(
                schedule.current_phase(get_block_timestamp()) == Phase::Submission,
                "Budokan: Not in submission period",
            );

            // Delegate validation to registration component
            self.registration.assert_valid_for_submission(registration, *tournament.id);
        }

        fn _mark_score_submitted(ref self: ContractState, tournament_id: u64, token_id: u64) {
            let tournament = self._get_tournament(tournament_id);
            let game_address = tournament.game_config.address;
            self.registration.mark_score_submitted(game_address, token_id);

            // Emit registration event with has_submitted=true
            let relayer_address = self.event_relayer.read();
            if !relayer_address.is_zero() {
                let registration = self.registration._get_registration(game_address, token_id);
                let relayer = IBudokanEventRelayerDispatcher { contract_address: relayer_address };
                relayer
                    .emit_registration(
                        game_address,
                        token_id,
                        registration.context_id,
                        registration.entry_number,
                        registration.has_submitted,
                        registration.is_banned,
                    );
            }
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
                ._validate_entry_requirement(tournament_id, entry_requirement, qualifier);

            self
                .entry_requirement
                .update_qualification_entries(tournament_id, qualifier, entry_requirement);

            // Emit qualification entries event if relayer is configured
            // (only for non-extension entry requirements which track entries internally)
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::extension(_) => { // Extension handles its own entry tracking
                },
                _ => {
                    if entry_requirement.entry_limit != 0 {
                        let relayer_address = self.event_relayer.read();
                        if !relayer_address.is_zero() {
                            let qualification_entries = self
                                .entry_requirement
                                ._get_qualification_entries(tournament_id, qualifier);
                            let relayer = IBudokanEventRelayerDispatcher {
                                contract_address: relayer_address,
                            };
                            relayer
                                .emit_qualification_entries(
                                    tournament_id, qualifier, qualification_entries.entry_count,
                                );
                        }
                    }
                },
            }

            recipient
        }

        fn _validate_entry_requirement(
            self: @ContractState,
            tournament_id: u64,
            entry_requirement: EntryRequirement,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            match entry_requirement.entry_requirement_type {
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

        fn _validate_nft_qualification(
            self: @ContractState, token_address: ContractAddress, qualifier: QualificationProof,
        ) -> ContractAddress {
            let qualification = match qualifier {
                QualificationProof::NFT(qual) => qual,
                _ => panic!("Budokan: Provided qualification proof is not of type 'Token'"),
            };

            let erc721_dispatcher = IERC721Dispatcher { contract_address: token_address };
            let token_owner = erc721_dispatcher.owner_of(qualification.token_id);

            // Return the owner of the qualifying NFT
            token_owner
        }

        #[inline(always)]
        fn _validate_allowlist_qualification(
            self: @ContractState,
            allowlist_addresses: Span<ContractAddress>,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            let qualifying_address = match qualifier {
                QualificationProof::Address(qual) => qual,
                _ => panic!("Budokan: Provided qualification proof is not of type 'Address'"),
            };

            assert!(
                self._contains_address(allowlist_addresses, qualifying_address),
                "Budokan: Qualifying address is not in allowlist",
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
                _ => panic!("Budokan: Provided qualification proof is not of type 'Extension'"),
            };

            let entry_validator_dispatcher = IEntryValidatorDispatcher {
                contract_address: extension_address,
            };
            let caller_address = get_caller_address();
            let display_extension_address: felt252 = extension_address.into();
            assert!(
                entry_validator_dispatcher
                    .valid_entry(tournament_id, caller_address, qualification),
                "Budokan: Invalid entry according to extension {}",
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
