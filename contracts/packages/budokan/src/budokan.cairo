// SPDX-License-Identifier: BUSL-1.1

#[starknet::contract]
pub mod Budokan {
    use budokan::events;
    use budokan::libs::schedule::{
        ScheduleAssertionsImpl, ScheduleAssertionsTrait, ScheduleImpl, ScheduleTrait,
    };
    use budokan::models::budokan::{
        AdditionalShare, Distribution, EntryFee, EntryFeeClaimType, EntryFeeRewardType,
        EntryRequirement, EntryRequirementType, GameConfig, Metadata, PrizeData, PrizeType,
        QualificationEntries, QualificationProof, Registration, RewardType, StoredEntryFee,
        TokenTypeData, Tournament as TournamentModel,
    };
    use budokan::models::constants::GAME_CREATOR_TOKEN_ID;
    use budokan::models::packed_storage::{
        PackedDistribution, PackedDistributionStorePacking, TournamentMeta,
        TournamentMetaStorePacking,
    };
    use budokan::models::schedule::{Phase, Schedule};
    use budokan_interfaces::budokan::IBudokan;
    use core::num::traits::Zero;
    use game_components_embeddable_game_standard::metagame::extensions::callback::callback::MetagameCallbackComponent;
    use game_components_embeddable_game_standard::metagame::extensions::context::context::ContextComponent;
    use game_components_embeddable_game_standard::metagame::extensions::context::interface::{
        IMetagameContext, IMetagameContextDetails,
    };
    use game_components_embeddable_game_standard::metagame::extensions::context::structs::{
        GameContext, GameContextDetails,
    };
    use game_components_embeddable_game_standard::metagame::metagame::MetagameComponent;
    use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
        IMinigameSettingsDispatcher, IMinigameSettingsDispatcherTrait,
    };
    use game_components_embeddable_game_standard::minigame::interface::{
        IMINIGAME_ID, IMinigameDispatcher, IMinigameDispatcherTrait, IMinigameTokenDataDispatcher,
        IMinigameTokenDataDispatcherTrait,
    };
    use game_components_embeddable_game_standard::token::core::interface::{
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
    use game_components_metagame::entry_fee::entry_fee::EntryFeeComponent;
    use game_components_metagame::entry_fee::entry_fee::EntryFeeComponent::EntryFeeInternalTrait;
    use game_components_metagame::entry_requirement::entry_requirement::EntryRequirementComponent;
    use game_components_metagame::entry_requirement::entry_requirement::EntryRequirementComponent::EntryRequirementInternalTrait;
    use game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent;
    use game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardInternalTrait;
    use game_components_metagame::leaderboard::store::Store as LeaderboardStore;
    use game_components_metagame::prize::prize::PrizeComponent;
    use game_components_metagame::prize::prize::PrizeComponent::PrizeInternalTrait;
    use game_components_metagame::registration::registration::RegistrationComponent;
    use game_components_metagame::registration::registration::RegistrationComponent::RegistrationInternalTrait;
    use game_components_utilities::distribution::calculator;
    use game_components_utilities::distribution::models::{
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
    component!(path: MetagameCallbackComponent, storage: callback, event: CallbackEvent);
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

    #[abi(embed_v0)]
    impl MetagameCallbackImpl =
        MetagameCallbackComponent::MetagameCallbackImpl<ContractState>;
    impl CallbackInternalImpl = MetagameCallbackComponent::InternalImpl<ContractState>;

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
        callback: MetagameCallbackComponent::Storage,
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
        // Tournament base data - using TournamentMeta for packed fields
        tournament_created_by: Map<u64, ContractAddress>,
        tournament_meta: Map<
            u64, TournamentMeta,
        >, // StorePacking: created_at | settings_id | soulbound
        tournament_creator_token_id: Map<u64, felt252>,
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
        CallbackEvent: MetagameCallbackComponent::Event,
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
        PrizeAdded: events::PrizeAdded,
        RewardClaimed: events::RewardClaimed,
        QualificationEntriesUpdated: events::QualificationEntriesUpdated,
        LeaderboardFinalized: events::LeaderboardFinalized,
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

        // Initialize callback component (registers IMETAGAME_CALLBACK_ID via SRC5)
        self.callback.initializer();

        // Initialize leaderboard component with this contract as owner
        self.leaderboard.initializer(get_contract_address());
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

            let empty_objective_id: Option<u32> = Option::None;

            // mint a game to the tournament creator for reward distribution
            let creator_token_id: felt252 = self
                ._mint_game(
                    game_config.address,
                    Option::Some('Tournament Creator'),
                    Option::Some(game_config.settings_id),
                    Option::Some(schedule.game.start),
                    Option::Some(schedule.game.end),
                    empty_objective_id,
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
        ) -> (felt252, u32) {
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
                // Convert to EntryFeeConfig for component deposit
                let deposit_config = EntryFeeConfig {
                    token_address: entry_fee.token_address,
                    amount: entry_fee.amount,
                    game_creator_share: entry_fee.game_creator_share,
                    refund_share: entry_fee.refund_share,
                    additional_shares: array![].span(),
                };
                self
                    .entry_fee
                    .deposit_entry_fee(tournament_id, EntryFeeDeposit::Config(deposit_config));
            }

            let empty_objective_id: Option<u32> = Option::None;
            let context = self._create_context(tournament_id);

            let client_url = if tournament.game_config.play_url.len() == 0 {
                Option::Some(format!("https://budokan.gg/tournament/{}", tournament.id))
            } else {
                Option::Some(tournament.game_config.play_url)
            };

            // mint game to the determined recipient
            let game_token_id: felt252 = self
                ._mint_game(
                    tournament.game_config.address,
                    Option::Some(player_name),
                    Option::Some(tournament.game_config.settings_id),
                    Option::Some(tournament.schedule.game.start),
                    Option::Some(tournament.schedule.game.end),
                    empty_objective_id,
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
            self._set_registration(tournament.game_config.address, @registration);

            // return game token id and entry number
            (game_token_id, entry_id)
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
            ref self: ContractState,
            tournament_id: u64,
            game_token_id: felt252,
            proof: Span<felt252>,
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
            // The extension has context about entry ordering and can make informed decisions
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
        ) -> PrizeData {
            let tournament = self._get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(tournament_id);

            tournament.schedule.game.assert_is_active(get_block_timestamp());

            // Validate that position and distribution are mutually exclusive
            // - Single prizes: position is Some, distribution must be None
            // - Distributed prizes: position is None, distribution must be Some
            if position.is_some() {
                match @token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        assert!(
                            erc20_data.distribution.is_none(),
                            "Budokan: Cannot set position for distributed prize (position and distribution are mutually exclusive)",
                        );
                    },
                    TokenTypeData::erc721(_) => { // ERC721 prizes don't have distribution, so position is always valid
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

        /// @notice Finalize a single leaderboard entry after the tournament ends.
        /// @dev Permissionless. Submits the token at an explicit position with
        ///      score validation via the leaderboard component.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to finalize.
        /// @param token_id Token ID to submit to the leaderboard.
        /// @param position 1-based position in the leaderboard (descending score order).
        fn finalize_leaderboard_entry(
            ref self: ContractState, tournament_id: u64, token_id: felt252, position: u32,
        ) {
            self._finalize_entry(tournament_id, token_id, position);
            let total_entries = self.leaderboard.get_leaderboard_length(tournament_id);
            self.emit(events::LeaderboardFinalized { tournament_id, batch_size: 1, total_entries });
        }

        /// @notice Builds the leaderboard in batches after the tournament ends.
        /// @dev Permissionless. Caller provides pre-sorted token_ids (descending score).
        ///      Each token's score is verified against the game contract.
        ///      Positions are assigned sequentially from current leaderboard length + 1.
        ///      Can be called multiple times to finalize in batches.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id The tournament ID to finalize.
        /// @param token_ids Pre-sorted token IDs (descending score order).
        fn finalize_leaderboard_batch(
            ref self: ContractState, tournament_id: u64, token_ids: Span<felt252>,
        ) {
            let existing_count = self.leaderboard.get_leaderboard_length(tournament_id);

            let mut i: u32 = 0;
            let batch_size = token_ids.len();
            while i < batch_size {
                let position = existing_count + i + 1; // 1-based
                self._finalize_entry(tournament_id, *token_ids.at(i), position);
                i += 1;
            }

            let total_entries = self.leaderboard.get_leaderboard_length(tournament_id);
            self.emit(events::LeaderboardFinalized { tournament_id, batch_size, total_entries });
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

        // Finalization operations

        /// @notice Validate and submit a single token to the leaderboard.
        /// @dev Asserts tournament exists and is finalized, verifies token registration,
        ///      reads score from game contract, and submits at explicit position.
        fn _finalize_entry(
            ref self: ContractState, tournament_id: u64, token_id: felt252, position: u32,
        ) {
            self._assert_tournament_exists(tournament_id);
            let tournament = self._get_tournament(tournament_id);
            tournament.schedule.assert_tournament_is_finalized(get_block_timestamp());

            // Verify token is registered for this tournament
            let ctx_id = self.token_context_id.entry(token_id).read();
            assert!(ctx_id == tournament_id, "Budokan: Token not registered for this tournament");

            // Read score from game contract
            let game_address = tournament.game_config.address;
            let game_data_dispatcher = IMinigameTokenDataDispatcher {
                contract_address: game_address,
            };
            let score = game_data_dispatcher.score(token_id);

            // Submit score at explicit position via component API (validates ordering)
            let result = self.leaderboard.submit_score(tournament_id, token_id, score, position);
            match result {
                LeaderboardResult::Success => {},
                _ => panic!("Budokan: Leaderboard finalization failed"),
            }

            // Zero token_context_id to prevent duplicate finalization
            self.token_context_id.entry(token_id).write(0);
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
                Option::Some(config) => {
                    // First additional_share is tournament_creator_share (if present)
                    let tournament_creator_share = if config.additional_shares.len() > 0 {
                        Option::Some((*config.additional_shares.at(0)).share_bps)
                    } else {
                        Option::None
                    };
                    Option::Some(
                        EntryFee {
                            token_address: config.token_address,
                            amount: config.amount,
                            distribution,
                            tournament_creator_share,
                            game_creator_share: config.game_creator_share,
                            refund_share: config.refund_share,
                            distribution_positions,
                        },
                    )
                },
                Option::None => Option::None,
            };

            // Get entry_requirement from component
            let entry_requirement = self.entry_requirement._get_entry_requirement(tournament_id);

            // Read creator_token_id from separate storage (too large for packed meta)
            let creator_token_id = self.tournament_creator_token_id.entry(tournament_id).read();

            // Return reconstructed tournament model
            TournamentModel {
                id: tournament_id,
                created_at: meta.created_at,
                created_by,
                creator_token_id,
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

            // Store packed tournament meta (soulbound is part of game_config)
            let meta = TournamentMeta {
                created_at, settings_id: game_config.settings_id, soulbound: game_config.soulbound,
            };
            self.tournament_meta.entry(tournament_id).write(meta);

            // Store creator_token_id separately (felt252, too large for packed storage)
            self.tournament_creator_token_id.entry(tournament_id).write(creator_token_id);

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
                let stored_config = EntryFeeConfig {
                    token_address: *fee.token_address,
                    amount: *fee.amount,
                    game_creator_share: *fee.game_creator_share,
                    refund_share: *fee.refund_share,
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
                ._configure(
                    tournament_id,
                    0xFFFFFFFF_u32, // Unlimited leaderboard (u32::MAX = ~4.3B)
                    false, // Higher scores are better
                    game_config.address,
                );

            // Emit native event
            self
                .emit(
                    events::TournamentCreated {
                        tournament_id,
                        game_address: game_config.address,
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

        fn _assert_gated_type_validates(
            self: @ContractState, entry_requirement: EntryRequirement, schedule: Schedule,
        ) {
            // Validate SRC5 interfaces (ERC721 for token, IEntryValidator for extension)
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
                    false, // paymaster
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
                        let entry_id = self.token_to_entry.entry((tournament_id, token_id)).read();
                        let registration = self.registration._get_entry(tournament_id, entry_id);
                        assert!(
                            registration.context_id == tournament_id,
                            "Budokan: token_id is not registered for tournament {}",
                            tournament_id,
                        );

                        // Each participant gets the refund share divided by total entries
                        let share = if let Option::Some(refund_share) = entry_fee.refund_share {
                            // The refund_share is the total % to be refunded, divided equally
                            // among all participants
                            // Convert to u32 for division, then back to u16
                            let share_u32: u32 = refund_share.into() / total_entries;
                            share_u32.try_into().expect('refund share calculation error')
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
                let winner_token_id: felt252 = *leaderboard.at(position - 1);
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
                    contract_address: tournament.game_config.address,
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

        fn _mark_score_submitted(ref self: ContractState, tournament_id: u64, token_id: felt252) {
            let tournament = self._get_tournament(tournament_id);
            let game_address = tournament.game_config.address;
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

    impl CallbackHooksImpl of MetagameCallbackComponent::MetagameCallbackHooksTrait<ContractState> {
        fn on_score_update(
            ref self: ContractState, token_id: u256, score: u64,
        ) { // No-op: we only care about final scores via on_game_over
        }

        fn on_game_over(ref self: ContractState, token_id: u256, final_score: u64) {
            let token_id_felt: felt252 = token_id.try_into().unwrap();

            // Look up tournament from token
            let tournament_id = self.token_context_id.entry(token_id_felt).read();
            assert!(tournament_id != 0, "Budokan: Token not registered for any tournament");

            // Get tournament
            let tournament = self._get_tournament(tournament_id);

            // Look up registration
            let entry_id = self.token_to_entry.entry((tournament_id, token_id_felt)).read();
            let registration = self.registration._get_entry(tournament_id, entry_id);

            // Validate: tournament is in Live phase
            let schedule = tournament.schedule;
            let phase = schedule.current_phase(get_block_timestamp());
            assert!(phase == Phase::Live, "Budokan: Tournament not in live phase");

            // Validate registration (not banned, not already submitted)
            self.registration.assert_valid_for_submission(@registration, tournament_id);

            // Mark score as submitted (leaderboard is built later via finalize_leaderboard_batch)
            self._mark_score_submitted(tournament_id, token_id_felt);
        }

        fn on_objective_complete(ref self: ContractState, token_id: u256) { // No-op for now
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
