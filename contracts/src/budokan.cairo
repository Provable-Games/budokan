#[dojo::contract]
pub mod Budokan {
    use starknet::{ContractAddress, get_block_timestamp, get_contract_address, get_caller_address};
    use core::num::traits::Zero;

    use budokan::constants::{TWO_POW_128, DEFAULT_NS, SEPOLIA_CHAIN_ID, GAME_CREATOR_TOKEN_ID};
    use budokan::models::budokan::{
        Tournament as TournamentModel, Registration, RegistrationBanned, Leaderboard, Prize, Token,
        TokenType, TokenTypeData, TournamentType, PrizeType, Role, PrizeClaim, Metadata, GameConfig,
        EntryFee, EntryRequirement, QualificationProof, TournamentQualification,
        EntryRequirementType, TokenData,
    };
    use budokan::models::schedule::{Schedule, Phase};
    use budokan::interfaces::{IBudokan};
    use budokan::libs::store::{Store, StoreTrait};
    use budokan::libs::schedule::{
        ScheduleTrait, ScheduleImpl, ScheduleAssertionsTrait, ScheduleAssertionsImpl,
    };
    use budokan::libs::metadata_helper::get_token_metadata;

    use openzeppelin_introspection::interface::{ISRC5Dispatcher, ISRC5DispatcherTrait};
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin_token::erc721::interface::{
        IERC721Dispatcher, IERC721DispatcherTrait, IERC721_ID,
    };

    use game_components_minigame::interface::{
        IMinigameDispatcher, IMinigameDispatcherTrait, IMinigameTokenDataDispatcher,
        IMinigameTokenDataDispatcherTrait, IMINIGAME_ID,
    };
    use game_components_minigame::extensions::settings::interface::{
        IMinigameSettingsDispatcher, IMinigameSettingsDispatcherTrait,
    };
    use game_components_metagame::extensions::context::structs::{GameContextDetails, GameContext};
    use game_components_metagame::metagame::MetagameComponent;
    use game_components_metagame::extensions::context::interface::{
        IMetagameContext, IMetagameContextDetails,
    };
    use game_components_metagame::extensions::context::context::ContextComponent;
    use game_components_token::core::interface::{
        IMinigameTokenDispatcher, IMinigameTokenDispatcherTrait,
    };
    use game_components_token::examples::minigame_registry_contract::{
        IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
    };

    use openzeppelin_introspection::src5::SRC5Component;

    use budokan_extensions::entry_validator::interface::{
        IENTRY_VALIDATOR_ID, IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
    };

    // Components needed: metagame requires SRC5
    component!(path: MetagameComponent, storage: metagame, event: MetagameEvent);
    component!(path: ContextComponent, storage: context, event: ContextEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl MetagameImpl = MetagameComponent::MetagameImpl<ContractState>;
    impl MetagameInternalImpl = MetagameComponent::InternalImpl<ContractState>;

    impl MetagameInternalContextImpl = ContextComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        metagame: MetagameComponent::Storage,
        #[substorage(v0)]
        context: ContextComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
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
    }

    fn dojo_init(
        ref self: ContractState,
        default_token_address: ContractAddress,
        registered_tokens: Span<TokenData>,
    ) {
        // Initialize tournament config
        let mut world = self.world(@DEFAULT_NS());
        let mut store: Store = StoreTrait::new(world);

        // Initialize metagame component
        self.context.initializer();
        self.metagame.initializer(Option::Some(get_contract_address()), default_token_address);

        // Initialize registered tokens
        let mut tokens_index = 0;
        loop {
            if tokens_index >= registered_tokens.len() {
                break;
            }
            let token_data = *registered_tokens.at(tokens_index);
            let token_model = store.get_token(token_data.token_address);
            self._assert_token_not_registered(token_model);
            let (name, symbol) = get_token_metadata(
                token_data.token_address, token_data.token_type,
            );
            let new_token = @Token {
                address: token_data.token_address,
                name: name,
                symbol: symbol,
                token_type: token_data.token_type,
                is_registered: true,
            };
            store.set_token(new_token);
            tokens_index += 1;
        }
    }

    #[abi(embed_v0)]
    impl GameContextImpl of IMetagameContext<ContractState> {
        fn has_context(self: @ContractState, token_id: u64) -> bool {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            let default_token_dispatcher = IMinigameTokenDispatcher {
                contract_address: self.default_token_address(),
            };
            let game_address = default_token_dispatcher.token_game_address(token_id);
            let registration = store.get_registration(game_address, token_id);
            registration.tournament_id != 0
        }
    }

    #[abi(embed_v0)]
    impl GameContextDetailsImpl of IMetagameContextDetails<ContractState> {
        fn context_details(self: @ContractState, token_id: u64) -> GameContextDetails {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            let default_token_dispatcher = IMinigameTokenDispatcher {
                contract_address: self.default_token_address(),
            };
            let game_address = default_token_dispatcher.token_game_address(token_id);
            let registration = store.get_registration(game_address, token_id);
            let context = array![
                GameContext {
                    name: "Tournament ID", value: format!("{}", registration.tournament_id),
                },
            ]
                .span();
            GameContextDetails {
                name: "Budokan",
                description: "The onchain tournament system",
                id: Option::Some(registration.tournament_id.try_into().unwrap()),
                context: context,
            }
        }
    }

    #[abi(embed_v0)]
    impl BudokanImpl of IBudokan<ContractState> {
        fn total_tournaments(self: @ContractState) -> u64 {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_platform_metrics().total_tournaments
        }
        fn tournament(self: @ContractState, tournament_id: u64) -> TournamentModel {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_tournament(tournament_id)
        }
        fn get_registration(
            self: @ContractState, game_address: ContractAddress, token_id: u64,
        ) -> Registration {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_registration(game_address, token_id)
        }
        fn get_registration_banned(
            self: @ContractState, game_address: ContractAddress, token_id: u64,
        ) -> RegistrationBanned {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_registration_banned(game_address, token_id)
        }
        fn tournament_entries(self: @ContractState, tournament_id: u64) -> u32 {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_tournament_entry_count(tournament_id).count
        }

        fn is_token_registered(self: @ContractState, address: ContractAddress) -> bool {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            let token = store.get_token(address);
            self._is_token_registered(@token)
        }

        fn register_token(
            ref self: ContractState, address: ContractAddress, token_type: TokenTypeData,
        ) {
            let mut world = self.world(@DEFAULT_NS());
            let mut store: Store = StoreTrait::new(world);
            let token_model = store.get_token(address);
            self._assert_token_not_registered(token_model);
            let (name, symbol) = self._register_token(address, token_type);
            match token_type {
                TokenTypeData::erc20(_) => {
                    let token_model = Token {
                        address, name, symbol, token_type: TokenType::erc20, is_registered: true,
                    };
                    store.set_token(@token_model);
                },
                TokenTypeData::erc721(_) => {
                    let token_model = Token {
                        address, name, symbol, token_type: TokenType::erc721, is_registered: true,
                    };
                    store.set_token(@token_model);
                },
            }
        }

        fn get_leaderboard(self: @ContractState, tournament_id: u64) -> Array<u64> {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_leaderboard(tournament_id)
        }

        fn current_phase(self: @ContractState, tournament_id: u64) -> Phase {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            let tournament = store.get_tournament(tournament_id);
            tournament.schedule.current_phase(get_block_timestamp())
        }

        fn get_tournament_id_for_token_id(
            self: @ContractState, game_address: ContractAddress, token_id: u64,
        ) -> u64 {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_registration(game_address, token_id).tournament_id
        }

        fn get_prize(self: @ContractState, prize_id: u64) -> Prize {
            let mut world = self.world(@DEFAULT_NS());
            let store: Store = StoreTrait::new(world);
            store.get_prize(prize_id)
        }

        /// @title Create tournament
        /// @notice Allows anyone to create a tournament.
        /// @param self A reference to the ContractState object.
        /// @param creator_rewards_address the address to mint the creator's game token to.
        /// @param metadata the tournament metadata.
        /// @param schedule the tournament schedule.
        /// @param game_config the tournament game configuration.
        /// @param entry_fee and optional entry fee for the tournament.
        /// @param entry_requirement and optional entry requirement.
        /// @param soulbound if the games of the tournament should be soulbound.
        /// @param play_url the url for which the game will be played.
        /// @return A struct of the tournament details.
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
            let mut world = self.world(@DEFAULT_NS());
            let mut store: Store = StoreTrait::new(world);

            schedule.assert_is_valid();
            self._assert_valid_game_config(game_config);

            if let Option::Some(entry_fee) = entry_fee {
                self._assert_valid_entry_fee(store, entry_fee, game_config.prize_spots);
            }

            if let Option::Some(entry_requirement) = entry_requirement {
                self._assert_valid_entry_requirement(store, entry_requirement, schedule);
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

            store
                .create_tournament(
                    creator_token_id,
                    metadata,
                    schedule,
                    game_config,
                    entry_fee,
                    entry_requirement,
                    soulbound,
                    play_url,
                )
        }

        /// @title Enter tournament
        /// @notice Allows a player to enter a tournament for a particular tournament id.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id A u64 representing the unique ID of the tournament.
        /// @param player_name A felt252 representing the name of the player.
        /// @param player_address A ContractAddress which the game token will be minted to.
        /// @param qualifying_token_id A Option<QualificationProof> representing the token id of the
        /// qualifying token.
        /// @return A tuple containing the tournament token id and the entry number.
        fn enter_tournament(
            ref self: ContractState,
            tournament_id: u64,
            player_name: felt252,
            player_address: ContractAddress,
            qualification: Option<QualificationProof>,
        ) -> (u64, u32) {
            let mut world = self.world(@DEFAULT_NS());

            let mut store: Store = StoreTrait::new(world);

            let tournament = store.get_tournament(tournament_id);

            self._assert_tournament_exists(store, tournament_id);

            tournament.schedule.assert_registration_open(get_block_timestamp());

            let caller_address = get_caller_address();

            // Determine the actual recipient based on entry requirements and qualification
            let mint_to_address = if let Option::Some(entry_requirement) = tournament
                .entry_requirement {
                let recipient = self
                    ._process_entry_requirement(
                        ref store, tournament_id, entry_requirement, qualification,
                    );
                if recipient == caller_address {
                    player_address
                } else {
                    recipient
                }
            } else {
                player_address
            };

            if let Option::Some(entry_fee) = tournament.entry_fee {
                self._process_entry_fee(entry_fee);
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

            let entry_number = store.increment_and_get_tournament_entry_count(tournament_id);

            // associate game token with tournament via registration
            store
                .set_registration(
                    @Registration {
                        game_token_id,
                        game_address: tournament.game_config.address,
                        tournament_id,
                        entry_number,
                        has_submitted: false,
                    },
                );

            // return game token id and entry number
            (game_token_id, entry_number)
        }

        /// @title Validate entries
        /// @notice Allows anyone to ban game IDs that do not meet entry requirements via extension
        /// validation @dev Can only be called before the tournament game period starts
        /// @dev Only works for tournaments with extension entry requirements
        /// @dev Client must determine which game IDs should be validated and provide them
        /// @param self A reference to the ContractState object.
        /// @param tournament_id A u64 representing the unique ID of the tournament.
        /// @param game_token_ids A Span<u64> of game token IDs to validate and potentially ban.
        fn validate_entries(
            ref self: ContractState, tournament_id: u64, game_token_ids: Span<u64>,
        ) {
            let mut world = self.world(@DEFAULT_NS());
            let mut store: Store = StoreTrait::new(world);

            let tournament = store.get_tournament(tournament_id);

            // Assert tournament exists
            self._assert_tournament_exists(store, tournament_id);

            // Ensure tournament has an extension entry requirement
            let entry_requirement = tournament.entry_requirement;
            assert!(entry_requirement.is_some(), "Tournament: No entry requirement set");

            let extension_config = match entry_requirement.unwrap().entry_requirement_type {
                EntryRequirementType::extension(config) => config,
                _ => panic!("Tournament: Entry requirement must be of type 'extension'"),
            };

            let extension_address = extension_config.address;

            // Can only ban from registration start up until game starts
            // Tournament must have a registration period set
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

            // Validate and ban each provided game token ID
            let game_address = tournament.game_config.address;
            let game_token_address = IMinigameDispatcher { contract_address: game_address }
                .token_address();
            let game_dispatcher = IERC721Dispatcher { contract_address: game_token_address };
            let entry_validator_dispatcher = IEntryValidatorDispatcher {
                contract_address: extension_address,
            };

            let mut i = 0;
            loop {
                if i >= game_token_ids.len() {
                    break;
                }
                let game_token_id = *game_token_ids.at(i);
                let mut registration = store.get_registration(game_address, game_token_id);
                let mut registration_banned = store
                    .get_registration_banned(game_address, game_token_id);

                // Verify this registration belongs to this tournament
                assert!(
                    registration.tournament_id == tournament_id,
                    "Tournament: Game ID not registered for this tournament",
                );

                // Assert game ID is not already banned
                assert!(!registration_banned.is_banned, "Tournament: Game ID is already banned");

                // Get the owner of this game token
                let token_owner = game_dispatcher.owner_of(game_token_id.into());

                // Check if the owner has valid entry according to the extension
                let is_valid = entry_validator_dispatcher
                    .valid_entry(tournament_id, token_owner, extension_config.config);

                // Ban if not valid
                if !is_valid {
                    registration_banned.is_banned = true;
                    store.set_registration_banned(@registration_banned);
                }

                i += 1;
            };
        }

        /// @title Submit score
        /// @notice Allows a player to submit a score for a tournament
        /// @dev This function uses a 1-based index for the position parameter. Input 1 for first
        /// place, 2 for second, etc.
        /// @dev This function is permissionless, allowing anyone to submit a valid score for a
        /// tournament.
        /// @dev When tournament enters submission, save gas by multi-calling this with scores
        /// starting from first and going to last place.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id A u64 representing the unique ID of the tournament.
        /// @param token_id A u64 representing the unique ID of the game token.
        /// @param position A u8 representing the position on the leaderboard.
        fn submit_score(ref self: ContractState, tournament_id: u64, token_id: u64, position: u8) {
            let mut world = self.world(@DEFAULT_NS());
            let mut store: Store = StoreTrait::new(world);

            // assert tournament exists
            self._assert_tournament_exists(store, tournament_id);

            // get tournament
            let tournament = store.get_tournament(tournament_id);

            // get registration details for provided game token
            let registration = store.get_registration(tournament.game_config.address, token_id);

            let registration_banned = store
                .get_registration_banned(tournament.game_config.address, token_id);

            // get current leaderboard
            let mut leaderboard = store.get_leaderboard(tournament_id);

            // get score for token id
            let submitted_score = self
                .get_score_for_token_id(tournament.game_config.address, token_id);

            // validate submission
            self
                ._validate_score_submission(
                    @tournament,
                    @registration,
                    @registration_banned,
                    leaderboard.span(),
                    submitted_score,
                    position,
                    token_id,
                );

            // update leaderboard
            self._update_leaderboard(@tournament, token_id, position, ref leaderboard);

            // save new leaderboard
            store.set_leaderboard(@Leaderboard { tournament_id, token_ids: leaderboard });

            // mark score as submitted
            self._mark_score_submitted(ref store, tournament_id, token_id);
        }

        /// @title Claim prize
        /// @notice Allows anyone to claim a prize for a tournament for a particular tournament id.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id A u64 representing the unique ID of the tournament.
        /// @param prize_type A PrizeType representing the type of prize to claim.
        fn claim_prize(ref self: ContractState, tournament_id: u64, prize_type: PrizeType) {
            let mut world = self.world(@DEFAULT_NS());
            let mut store: Store = StoreTrait::new(world);
            let tournament = store.get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(store, tournament_id);

            tournament.schedule.assert_tournament_is_finalized(get_block_timestamp());

            self._assert_prize_not_claimed(store, tournament_id, prize_type);

            match prize_type {
                PrizeType::EntryFees(role) => {
                    self._claim_entry_fees(store, tournament_id, tournament, role);
                },
                PrizeType::Sponsored(prize_id) => {
                    self._claim_sponsored_prize(store, tournament_id, tournament, prize_id);
                },
            }

            store.set_prize_claim(@PrizeClaim { tournament_id, prize_type, claimed: true });
        }

        /// @title Add prize
        /// @notice Allows anyone to add a prize for a tournament for a particular tournament id.
        /// @param self A reference to the ContractState object.
        /// @param tournament_id A u64 representing the unique ID of the tournament.
        /// @param token A contract address representing the token to add as a prize.
        /// @param token_type A TokenType representing the type of token to add as a prize.
        /// @param position A u8 representing the scoreboard position to distribute the prize to.
        /// @return A u64 representing the unique ID of the prize.
        fn add_prize(
            ref self: ContractState,
            tournament_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            position: u8,
        ) -> u64 {
            let mut world = self.world(@DEFAULT_NS());
            let mut store: Store = StoreTrait::new(world);
            let mut tournament = store.get_tournament(tournament_id);

            // assert tournament exists
            self._assert_tournament_exists(store, tournament_id);

            tournament.schedule.game.assert_is_active(get_block_timestamp());
            self._assert_prize_token_registered(@store.get_token(token_address));
            self._assert_position_on_leaderboard(tournament.game_config.prize_spots, position);

            self._deposit_prize(tournament_id, token_address, token_type, position);

            // get next prize id (updates prize count)
            let id = store.increment_and_get_prize_count();

            // create and save new prize
            store
                .set_prize(
                    @Prize {
                        id,
                        tournament_id,
                        token_address,
                        token_type,
                        payout_position: position,
                        sponsor_address: get_caller_address(),
                    },
                );

            id
        }
    }


    #[generate_trait]
    pub impl InternalImpl of InternalTrait {
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

        #[inline(always)]
        fn _is_token_registered(self: @ContractState, token: @Token) -> bool {
            let chain_id = starknet::get_tx_info().unbox().chain_id;
            if chain_id == SEPOLIA_CHAIN_ID {
                true
            } else {
                *token.is_registered
            }
        }

        // @dev instead of iterating over all scores, we just check if the submitted score is
        // greater than the last place score. This is safe because we have already verified the
        // score was submitted
        fn _is_top_score(
            self: @ContractState, game_address: ContractAddress, leaderboard: Span<u64>, score: u32,
        ) -> bool {
            let num_scores = leaderboard.len();

            if num_scores == 0 {
                return true;
            }

            // technically this should be checking the score at the bottom of the leaderboard
            // regardless of if a score has been submitted for that position or not
            // we can safely do this using Array.get() and checking if it's None or Some
            let last_place_id = *leaderboard.at(num_scores - 1);
            let last_place_score = self.get_score_for_token_id(game_address, last_place_id);
            score >= last_place_score
        }

        //
        // ASSERTIONS
        //

        #[inline(always)]
        fn _assert_token_not_registered(self: @ContractState, token: Token) {
            let token_address: felt252 = token.address.into();
            assert!(
                !self._is_token_registered(@token),
                "Tournament: Token address {} is already registered",
                token_address,
            );
        }

        #[inline(always)]
        fn _assert_valid_entry_requirement(
            self: @ContractState,
            store: Store,
            entry_requirement: EntryRequirement,
            schedule: Schedule,
        ) {
            self._assert_gated_type_validates(store, entry_requirement, schedule);
        }

        #[inline(always)]
        fn _assert_valid_entry_fee(
            self: @ContractState, store: Store, entry_fee: EntryFee, prize_spots: u8,
        ) {
            self._assert_entry_fee_token_registered(@store.get_token(entry_fee.token_address));
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
        fn _assert_winners_count_greater_than_zero(self: @ContractState, prize_spots: u8) {
            assert!(prize_spots > 0, "Tournament: Winners count must be greater than zero");
        }

        fn _assert_valid_payout_distribution(
            self: @ContractState, entry_fee: EntryFee, prize_spots: u8,
        ) {
            // verify distribution length matches prize spots
            self
                ._assert_entry_fee_token_distribution_length_not_too_long(
                    entry_fee.distribution.len(), prize_spots.into(),
                );

            // check the sum of distributions is equal to 100%
            let mut distribution_sum: u8 = 0;
            let mut distribution_index: u32 = 0;
            loop {
                if distribution_index == entry_fee.distribution.len() {
                    break;
                }
                let distribution = *entry_fee.distribution.at(distribution_index);
                distribution_sum += distribution;
                distribution_index += 1;
            };

            if let Option::Some(host_share) = entry_fee.tournament_creator_share {
                distribution_sum += host_share;
            }

            if let Option::Some(creator_share) = entry_fee.game_creator_share {
                distribution_sum += creator_share;
            }

            assert!(
                distribution_sum == 100,
                "Tournament: Entry fee distribution needs to be 100%. Distribution: {}%",
                distribution_sum,
            );
        }

        #[inline(always)]
        fn _assert_supports_game_interface(
            self: @ContractState, src5_dispatcher: ISRC5Dispatcher, address: ContractAddress,
        ) {
            let address: felt252 = address.into();
            assert!(
                src5_dispatcher.supports_interface(IMINIGAME_ID),
                "Tournament: Game address {} does not support IGame interface",
                address,
            );
        }

        #[inline(always)]
        fn _assert_supports_erc721(
            self: @ContractState, src5_dispatcher: ISRC5Dispatcher, address: ContractAddress,
        ) {
            let address: felt252 = address.into();
            assert!(
                src5_dispatcher.supports_interface(IERC721_ID),
                "Tournament: Game token address {} does not support IERC721 interface",
                address,
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
        fn _assert_entry_fee_token_registered(self: @ContractState, token: @Token) {
            assert!(
                self._is_token_registered(token), "Tournament: Entry fee token is not registered",
            );
        }

        #[inline(always)]
        fn _assert_entry_fee_token_distribution_length_not_too_long(
            self: @ContractState, distribution_length: u32, prize_spots: u32,
        ) {
            assert!(
                distribution_length <= prize_spots,
                "Tournament: Entry fee distribution length {} is longer than prize spots {}",
                distribution_length,
                prize_spots,
            );
        }

        #[inline(always)]
        fn _assert_entry_fee_token_distribution_sum_is_100(
            self: @ContractState,
            player_percentage: u8,
            tournament_creator_share: u8,
            game_creator_share: u8,
        ) {
            assert!(
                player_percentage + tournament_creator_share + game_creator_share == 100,
                "Tournament: Entry fee distribution is not 100%. Player percentage: {}%, Tournament creator share: {}%, Game creator share: {}%",
                player_percentage,
                tournament_creator_share,
                game_creator_share,
            );
        }

        #[inline(always)]
        fn _assert_prize_token_registered(self: @ContractState, token: @Token) {
            assert!(self._is_token_registered(token), "Tournament: Prize token is not registered");
        }


        #[inline(always)]
        fn _assert_scores_count_valid(self: @ContractState, prize_spots: u8, scores_count: u32) {
            assert!(
                scores_count <= prize_spots.into(),
                "Tournament: The length of scores submissions {} is greater than the winners count {}",
                scores_count,
                prize_spots,
            );
        }

        #[inline(always)]
        fn _assert_position_on_leaderboard(self: @ContractState, prize_spots: u8, position: u8) {
            assert!(
                position <= prize_spots,
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
            self: @ContractState, store: Store, tournament_id: u64, prize_type: PrizeType,
        ) {
            let prize_claim = store.get_prize_claim(tournament_id, prize_type);
            assert!(!prize_claim.claimed, "Tournament: Prize has already been claimed");
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

        #[inline(always)]
        fn _assert_payout_is_not_top_score(
            self: @ContractState, payout_position: u8, winner_token_ids: Span<u64>,
        ) {
            assert!(
                payout_position.into() > winner_token_ids.len(),
                "Tournament: Prize payout position {} is a top score",
                payout_position,
            );
        }


        #[inline(always)]
        fn _assert_under_entry_limit(
            self: @ContractState, tournament_id: u64, current_entries: u8, entry_limit: u8,
        ) {
            assert!(
                current_entries < entry_limit,
                "Tournament: Maximum qualified entries reached for tournament {}",
                tournament_id,
            );
        }


        fn _assert_gated_type_validates(
            self: @ContractState,
            store: Store,
            entry_requirement: EntryRequirement,
            schedule: Schedule,
        ) {
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::token(token) => {
                    let token_model = store.get_token(token);
                    let token_address: felt252 = token.into();
                    assert!(
                        self._is_token_registered(@token_model),
                        "Tournament: Gated token address {} is not registered",
                        token_address,
                    )
                },
                EntryRequirementType::tournament(tournament_type) => {
                    match tournament_type {
                        TournamentType::winners(tournament_ids) => {
                            let mut index = 0;
                            loop {
                                if index == tournament_ids.len() {
                                    break;
                                }
                                self._assert_tournament_exists(store, *tournament_ids.at(index));
                                index += 1;
                            }
                        },
                        TournamentType::participants(tournament_ids) => {
                            let mut index = 0;
                            loop {
                                if index == tournament_ids.len() {
                                    break;
                                }
                                self._assert_tournament_exists(store, *tournament_ids.at(index));
                                index += 1;
                            }
                        },
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
                    let tournament_id = store.get_tournament_count();
                    entry_validator_dispatcher
                        .add_config(
                            tournament_id + 1,
                            entry_requirement.entry_limit,
                            extension_config.config,
                        );
                },
            }
        }


        fn _assert_tournament_exists(self: @ContractState, store: Store, tournament_id: u64) {
            assert!(
                tournament_id <= store.get_tournament_count(),
                "Tournament: Tournament {} does not exist",
                tournament_id,
            );
        }

        #[inline(always)]
        fn _validate_tournament_eligibility(
            self: @ContractState, tournament_type: TournamentType, tournament_id: u64,
        ) {
            let (qualifying_tournaments, _) = match tournament_type {
                TournamentType::winners(tournaments) => (tournaments, true),
                TournamentType::participants(tournaments) => (tournaments, false),
            };

            assert!(
                self._is_qualifying_tournament(qualifying_tournaments, tournament_id),
                "Tournament: Not a qualifying tournament",
            );
        }

        fn _validate_position_requirements(
            self: @ContractState,
            leaderboard: Span<u64>,
            tournament_type: TournamentType,
            qualification: TournamentQualification,
        ) {
            // Position must be greater than 0 for all tournament types
            assert!(qualification.position > 0, "Tournament: Position must be greater than 0");

            if let TournamentType::winners(_) = tournament_type {
                assert!(
                    qualification.position.into() <= leaderboard.len(),
                    "Tournament: Position {} exceeds leaderboard length {}",
                    qualification.position,
                    leaderboard.len(),
                );

                assert!(
                    *leaderboard.at((qualification.position - 1).into()) == qualification.token_id,
                    "Tournament: Provided Token ID {} does not match Token ID {} at leaderboard position {} for tournament {}",
                    qualification.token_id,
                    qualification.token_id,
                    qualification.position,
                    qualification.tournament_id,
                );
            }
        }

        fn _has_qualified_in_tournaments(
            self: @ContractState, store: Store, tournament_type: TournamentType, token_id: u64,
        ) -> bool {
            let (tournament_ids, requires_top_score) = match tournament_type {
                TournamentType::winners(ids) => (ids, true),
                TournamentType::participants(ids) => (ids, false),
            };

            let mut loop_index = 0;
            let mut is_qualified = false;

            loop {
                if loop_index == tournament_ids.len() {
                    break;
                }

                let tournament_id = *tournament_ids.at(loop_index);
                let tournament = store.get_tournament(tournament_id);
                let game_address = tournament.game_config.address;
                let leaderboard = store.get_leaderboard(tournament_id);
                let registration = store.get_registration(game_address, token_id);
                let game_token_address = IMinigameDispatcher { contract_address: game_address }
                    .token_address();
                let owner = self._get_owner(game_token_address, token_id.into());

                if owner == get_caller_address()
                    && registration.tournament_id == tournament.id
                    && registration.entry_number != 0
                    && registration.has_submitted {
                    if requires_top_score {
                        let score = self.get_score_for_token_id(game_address, token_id);
                        is_qualified = self._is_top_score(game_address, leaderboard.span(), score);
                    } else {
                        is_qualified = true;
                    }

                    if is_qualified {
                        break;
                    }
                }

                loop_index += 1;
            };

            is_qualified
        }

        #[inline(always)]
        fn _assert_has_qualified_in_tournaments(
            self: @ContractState, store: Store, tournament_type: TournamentType, token_id: u64,
        ) {
            assert!(
                self._has_qualified_in_tournaments(store, tournament_type, token_id),
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

        fn _register_token(
            ref self: ContractState, token: ContractAddress, token_data: TokenTypeData,
        ) -> (ByteArray, ByteArray) {
            // First get the metadata before doing the validation steps
            let token_type = match token_data {
                TokenTypeData::erc20(_) => TokenType::erc20,
                TokenTypeData::erc721(_) => TokenType::erc721,
            };
            let (name, symbol) = get_token_metadata(token, token_type);

            match token_data {
                TokenTypeData::erc20(_) => {
                    let token_dispatcher = IERC20Dispatcher { contract_address: token };
                    // check that the contract is approved for the minimal amount
                    let allowance = token_dispatcher
                        .allowance(get_caller_address(), get_contract_address());
                    let token_address: felt252 = token.into();
                    assert!(
                        allowance == 1,
                        "Tournament: Token address {} has invalid allowance",
                        token_address,
                    );
                    // take a reading of the current balance (incase contract has assets
                    // already)
                    let current_balance = token_dispatcher.balance_of(get_contract_address());
                    // trnsfer a minimal amount to the contract
                    token_dispatcher.transfer_from(get_caller_address(), get_contract_address(), 1);
                    // take a reading of the new balance
                    let new_balance = token_dispatcher.balance_of(get_contract_address());
                    assert!(
                        new_balance == current_balance + 1,
                        "Tournament: Token address {} has invalid balance",
                        token_address,
                    );
                    // transfer back the minimal amount
                    token_dispatcher.transfer(get_caller_address(), 1);
                    // check the total supply is legitimate
                    let total_supply = token_dispatcher.total_supply();
                    assert!(
                        total_supply < TWO_POW_128.into(),
                        "Tournament: Token address {} has a total supply that is too large",
                        token_address,
                    );
                },
                TokenTypeData::erc721(erc721_token) => {
                    let token_dispatcher = IERC721Dispatcher { contract_address: token };
                    // check that the contract is approved for the specific id
                    let approved = token_dispatcher.get_approved(erc721_token.id.into());
                    let token_address: felt252 = token.into();
                    assert!(
                        approved == get_contract_address(),
                        "Tournament: Token address {} has invalid approval",
                        token_address,
                    );
                    // transfer a specific id to the contract
                    token_dispatcher
                        .transfer_from(
                            get_caller_address(), get_contract_address(), erc721_token.id.into(),
                        );
                    // check the balance of the contract
                    let balance = token_dispatcher.balance_of(get_contract_address());
                    assert!(
                        balance == 1,
                        "Tournament: Token address {} has invalid balance",
                        token_address,
                    );
                    let owner = token_dispatcher.owner_of(erc721_token.id.into());
                    assert!(
                        owner == get_contract_address(),
                        "Tournament: Token address {} has invalid owner",
                        token_address,
                    );
                    // transfer back the token
                    token_dispatcher
                        .transfer_from(
                            get_contract_address(), get_caller_address(), erc721_token.id.into(),
                        );
                },
            }
            (name, symbol)
        }

        /// @title mint_game
        /// @notice Mints a new game token to the provided player address.
        /// @param game_address The address of the game contract.
        /// @param player_name The name of the player.
        /// @param settings_id The id of the game settings.
        /// @param start The start time of the game.
        /// @param end The end time of the game.
        /// @param objective_ids The ids of the objectives.
        /// @param context The context of the game.
        /// @param client_url The client url of the game.
        /// @param renderer_address The address of the renderer.
        /// @param to The address to mint the game token to.
        /// @param soulbound Whether the game token is soulbound.
        /// @param use_denshokan Whether the game is using denshokan.
        /// @return The game token id.
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
        fn _process_entry_fee(ref self: ContractState, entry_fee: EntryFee) {
            let erc20_dispatcher = IERC20Dispatcher { contract_address: entry_fee.token_address };
            erc20_dispatcher
                .transfer_from(
                    get_caller_address(), get_contract_address(), entry_fee.amount.into(),
                );
        }

        fn _deposit_prize(
            ref self: ContractState,
            tournament_id: u64,
            token: ContractAddress,
            token_type: TokenTypeData,
            position: u8,
        ) {
            match token_type {
                TokenTypeData::erc20(erc20_token) => {
                    let token_dispatcher = IERC20Dispatcher { contract_address: token };
                    assert!(
                        erc20_token.amount > 0,
                        "Tournament: ERC20 prize token amount must be greater than 0",
                    );
                    token_dispatcher
                        .transfer_from(
                            get_caller_address(), get_contract_address(), erc20_token.amount.into(),
                        );
                },
                TokenTypeData::erc721(erc721_token) => {
                    let token_dispatcher = IERC721Dispatcher { contract_address: token };
                    token_dispatcher
                        .transfer_from(
                            get_caller_address(), get_contract_address(), erc721_token.id.into(),
                        );
                },
            }
        }

        #[inline(always)]
        fn _calculate_payout(ref self: ContractState, bp: u128, total_value: u128) -> u128 {
            (bp * total_value) / 100
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
            ref self: ContractState,
            store: Store,
            tournament_id: u64,
            tournament: TournamentModel,
            role: Role,
        ) {
            if let Option::Some(entry_fee) = tournament.entry_fee {
                let total_entries = store.get_tournament_entry_count(tournament_id).count;
                let total_pool = total_entries.into() * entry_fee.amount;

                // Calculate share based on recipient type
                let share = match role {
                    Role::TournamentCreator => {
                        if let Option::Some(tournament_creator_share) = entry_fee
                            .tournament_creator_share {
                            tournament_creator_share
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
                                position, tournament.game_config.prize_spots.into(),
                            );
                        *entry_fee.distribution.at(position.into() - 1)
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
                        // tournament creator is owner of the tournament creator token
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
                        let leaderboard = store.get_leaderboard(tournament_id);
                        // Check if leaderboard has enough entries for the position
                        if position.into() <= leaderboard.len() {
                            let winner_token_id = *leaderboard.at(position.into() - 1);
                            self._get_owner(game_token_address, winner_token_id.into())
                        } else {
                            // No entry at this position, default to tournament creator
                            self._get_owner(game_token_address, tournament.creator_token_id.into())
                        }
                    },
                };

                if prize_amount > 0 {
                    let erc20_dispatcher = IERC20Dispatcher {
                        contract_address: entry_fee.token_address,
                    };
                    erc20_dispatcher.transfer(recipient_address, prize_amount.into());
                }
            } else {
                panic!("Tournament: tournament {} has no entry fees", tournament_id);
            }
        }

        fn _claim_sponsored_prize(
            ref self: ContractState,
            store: Store,
            tournament_id: u64,
            tournament: TournamentModel,
            prize_id: u64,
        ) {
            let prize = store.get_prize(prize_id);

            // Validate prize
            assert!(
                prize.tournament_id == tournament_id,
                "Tournament: Prize {} is for tournament {}",
                prize_id,
                prize.tournament_id,
            );

            // Get winner address
            let leaderboard = store.get_leaderboard(tournament_id);
            self
                ._assert_position_is_valid(
                    prize.payout_position, tournament.game_config.prize_spots.into(),
                );

            let game_dispatcher = IMinigameDispatcher {
                contract_address: tournament.game_config.address,
            };
            let game_token_address = game_dispatcher.token_address();

            // Check if leaderboard has enough entries for the position
            let recipient_address = if prize.payout_position.into() <= leaderboard.len() {
                let winner_token_id = *leaderboard.at(prize.payout_position.into() - 1);
                self._get_owner(game_token_address, winner_token_id.into())
            } else {
                // No entry at this position, default to tournament creator
                self._get_owner(game_token_address, tournament.creator_token_id.into())
            };

            // Transfer prize
            match prize.token_type {
                TokenTypeData::erc20(erc20_token) => {
                    let erc20 = IERC20Dispatcher { contract_address: prize.token_address };
                    erc20.transfer(recipient_address, erc20_token.amount.into());
                },
                TokenTypeData::erc721(erc721_token) => {
                    let erc721 = IERC721Dispatcher { contract_address: prize.token_address };
                    erc721
                        .transfer_from(
                            get_contract_address(), recipient_address, erc721_token.id.into(),
                        );
                },
            };
        }

        fn _validate_score_submission(
            self: @ContractState,
            tournament: @TournamentModel,
            registration: @Registration,
            registration_banned: @RegistrationBanned,
            current_leaderboard: Span<u64>,
            submitted_score: u32,
            submitted_position: u8,
            token_id: u64,
        ) {
            let schedule = *tournament.schedule;
            assert!(
                schedule.current_phase(get_block_timestamp()) == Phase::Submission,
                "Tournament: Not in submission period",
            );

            // Validate position is within prize spots (1-based indexing)
            assert!(
                submitted_position > 0
                    && submitted_position <= *tournament.game_config.prize_spots.into(),
                "Tournament: Invalid position",
            );

            // Validate provided token is registered for the specified tournament
            assert!(
                *registration.tournament_id == *tournament.id,
                "Tournament: Token not registered for tournament",
            );

            // Score can only be submitted once
            assert!(!*registration.has_submitted, "Tournament: Score already submitted");

            // Banned game IDs cannot submit scores
            assert!(!*registration_banned.is_banned, "Tournament: Game ID is banned");

            // Prevent gaps in leaderboard
            let position_index: u32 = submitted_position.into() - 1;
            assert!(
                position_index <= current_leaderboard.len(),
                "Tournament: Must submit for next available position",
            );

            let game_dispatcher = IMinigameTokenDataDispatcher {
                contract_address: *tournament.game_config.address,
            };

            // if the score being submitted is for a position already on the leaderboard
            if position_index < current_leaderboard.len() {
                // validate it's higher
                let game_id_at_position = *current_leaderboard.at(position_index);
                let score_at_position = game_dispatcher.score(game_id_at_position);

                assert!(
                    submitted_score >= score_at_position,
                    "Tournament: Score {} is less than current score of {} at position {}",
                    submitted_score,
                    score_at_position,
                    submitted_position,
                );

                if submitted_score == score_at_position {
                    assert!(
                        token_id < game_id_at_position,
                        "Tournament: Tie goes to game with lower id. Submitted game id {} is higher than current game id {}",
                        token_id,
                        game_id_at_position,
                    );
                }
            }

            // if score is being submitted for any position other than first
            if submitted_position > 1 {
                // validate it is less than or equal to the score above it
                let position_above = position_index - 1;
                let game_id_above = *current_leaderboard.at(position_above);
                let current_score_above_position = game_dispatcher.score(game_id_above);

                assert!(
                    submitted_score <= current_score_above_position,
                    "Tournament: Score {} qualifies for higher position than {}",
                    submitted_score,
                    submitted_position,
                );

                // If scores are equal, ensure the game ID is higher (lower priority in case of tie)
                if submitted_score == current_score_above_position {
                    assert!(
                        token_id > game_id_above,
                        "Tournament: For equal scores, game id {} should be higher than game id above {}",
                        token_id,
                        game_id_above,
                    );
                }
            }
        }

        fn _update_leaderboard(
            self: @ContractState,
            tournament: @TournamentModel,
            token_id: u64,
            position: u8,
            ref leaderboard: Array<u64>,
        ) {
            // convert position to 0-based index
            let position_index: u32 = position.into() - 1;

            // if the new score is in the last position, save gas and simply append it to the
            // leaderboard
            let next_position = leaderboard.len();

            let prize_spots = *tournament.game_config.prize_spots.into();

            // if the score being submitted is for the next position and there are still prize spots
            // available, save gas and simply append it to the leaderboard
            if position_index == next_position && leaderboard.len() < prize_spots.into() {
                leaderboard.append(token_id);
            } else {
                // otherwise we need to insert it into the leaderboard
                self
                    ._insert_into_leaderboard(
                        token_id, position_index, ref leaderboard, prize_spots,
                    );
            }
        }

        fn _append_to_leaderboard(
            self: @ContractState, token_id: u64, current_leaderboard: Span<u64>,
        ) -> Span<u64> {
            let mut new_leaderboard: Array<u64> = current_leaderboard.into();
            new_leaderboard.append(token_id);
            new_leaderboard.span()
        }

        fn _insert_into_leaderboard(
            self: @ContractState,
            token_id: u64,
            position_index: u32,
            ref current_leaderboard: Array<u64>,
            prize_spots: u8,
        ) {
            // Create new leaderboard with inserted score
            let mut new_leaderboard = ArrayTrait::new();
            let mut i = 0;

            // Copy scores up to the position
            loop {
                if i >= position_index {
                    break;
                }
                new_leaderboard.append(*current_leaderboard.at(i));
                i += 1;
            };

            // Insert new score
            new_leaderboard.append(token_id);

            // Copy remaining scores
            loop {
                if i >= current_leaderboard.len() || new_leaderboard.len() >= prize_spots.into() {
                    break;
                }
                new_leaderboard.append(*current_leaderboard.at(i));
                i += 1;
            };

            current_leaderboard = new_leaderboard;
        }

        fn _mark_score_submitted(
            ref self: ContractState, ref store: Store, tournament_id: u64, token_id: u64,
        ) {
            let game_address = store.get_tournament(tournament_id).game_config.address;
            let mut registration = store.get_registration(game_address, token_id);
            registration.has_submitted = true;
            store.set_registration(@registration);
        }

        fn _process_entry_requirement(
            self: @ContractState,
            ref store: Store,
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
                ._validate_entry_requirement(store, tournament_id, entry_requirement, qualifier);

            self
                ._update_qualification_entries(
                    ref store, tournament_id, qualifier, entry_requirement,
                );

            recipient
        }

        fn _update_qualification_entries(
            self: @ContractState,
            ref store: Store,
            tournament_id: u64,
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
                            "Tournament: Provided qualification proof is not of type 'Extension'",
                        ),
                    };

                    let entries_left = entry_validator_dispatcher
                        .entries_left(tournament_id, caller_address, qualification);

                    match entries_left {
                        Option::Some(entries_left) => {
                            assert!(
                                entries_left > 0,
                                "Tournament: No entries left according to extension {}",
                                display_extension_address,
                            );
                        },
                        Option::None => {},
                    }

                    entry_validator_dispatcher
                        .add_entry(tournament_id, caller_address, qualification);
                },
                _ => {
                    let entry_limit = entry_requirement.entry_limit;
                    if entry_limit != 0 {
                        let mut qualification_entries = store
                            .get_qualification_entries(tournament_id, qualifier);

                        self
                            ._assert_under_entry_limit(
                                tournament_id, qualification_entries.entry_count, entry_limit,
                            );

                        qualification_entries.entry_count += 1;

                        store.set_qualification_entries(@qualification_entries);
                    }
                },
            }
        }

        fn _validate_entry_requirement(
            self: @ContractState,
            store: Store,
            tournament_id: u64,
            entry_requirement: EntryRequirement,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            match entry_requirement.entry_requirement_type {
                EntryRequirementType::tournament(tournament_type) => {
                    self
                        ._validate_tournament_qualification(
                            store, tournament_id, tournament_type, qualifier,
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
            store: Store,
            tournament_id: u64,
            tournament_type: TournamentType,
            qualifier: QualificationProof,
        ) -> ContractAddress {
            let qualifying_proof_tournament = match qualifier {
                QualificationProof::Tournament(qual) => qual,
                _ => panic!("Tournament: Provided qualification proof is not of type 'Tournament'"),
            };

            // verify qualifying tournament is in qualifying set
            self
                ._validate_tournament_eligibility(
                    tournament_type, qualifying_proof_tournament.tournament_id,
                );

            // verify qualifying tournament is finalized
            let qualifying_tournament = store
                .get_tournament(qualifying_proof_tournament.tournament_id);

            qualifying_tournament.schedule.assert_tournament_is_finalized(get_block_timestamp());

            // verify position requirements
            let leaderboard = store.get_leaderboard(qualifying_proof_tournament.tournament_id);
            self
                ._validate_position_requirements(
                    leaderboard.span(), tournament_type, qualifying_proof_tournament,
                );

            let tournament = store.get_tournament(tournament_id);

            let game_dispatcher = IMinigameDispatcher {
                contract_address: tournament.game_config.address,
            };
            let game_token_address = game_dispatcher.token_address();

            // Return the owner of the qualifying token
            let token_owner = self
                ._get_owner(game_token_address, qualifying_proof_tournament.token_id.into());

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

            // Return the qualifying address - for allowlist, the game is minted to the allowlisted
            // address
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
