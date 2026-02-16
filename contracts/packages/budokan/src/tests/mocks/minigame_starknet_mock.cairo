// Copied from game_components_embeddable_game_standard::token::tests::mocks::minigame_starknet_mock
// (no longer exported from game_components_test_common)

use starknet::ContractAddress;

#[starknet::interface]
pub trait IMinigameStarknetMock<TContractState> {
    fn mint(
        ref self: TContractState,
        player_name: Option<felt252>,
        settings_id: Option<u32>,
        start_time: Option<u64>,
        end_time: Option<u64>,
        objective_id: Option<u32>,
        context: Option<ByteArray>,
        client_url: Option<ByteArray>,
        renderer_address: Option<ContractAddress>,
        player_address: ContractAddress,
        soulbound: bool,
    ) -> felt252;
    fn start_game(ref self: TContractState, token_id: felt252);
    fn end_game(ref self: TContractState, token_id: felt252, score: u64);
    fn create_objective_score(ref self: TContractState, score: u64);
    fn create_objective_score_with_settings(ref self: TContractState, score: u64, settings_id: u32);
    fn create_settings_difficulty(
        ref self: TContractState, name: ByteArray, description: ByteArray, difficulty: u8,
    );
}

#[starknet::interface]
pub trait IMinigameStarknetMockInit<TContractState> {
    fn initializer(
        ref self: TContractState,
        game_creator: ContractAddress,
        game_name: ByteArray,
        game_description: ByteArray,
        game_developer: ByteArray,
        game_publisher: ByteArray,
        game_genre: ByteArray,
        game_image: ByteArray,
        game_color: Option<ByteArray>,
        client_url: Option<ByteArray>,
        renderer_address: Option<ContractAddress>,
        settings_address: Option<ContractAddress>,
        objectives_address: Option<ContractAddress>,
        minigame_token_address: ContractAddress,
        royalty_fraction: Option<u128>,
    );
}

#[starknet::contract]
pub mod minigame_starknet_mock {
    use game_components_embeddable_game_standard::minigame::extensions::objectives::interface::{
        IMINIGAME_OBJECTIVES_ID, IMinigameObjectives, IMinigameObjectivesDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::objectives::objectives::ObjectivesComponent;
    use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::{
        GameObjective, GameObjectiveDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
        IMINIGAME_SETTINGS_ID, IMinigameSettings, IMinigameSettingsDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::settings::SettingsComponent;
    use game_components_embeddable_game_standard::minigame::extensions::settings::structs::{
        GameSetting, GameSettingDetails,
    };
    use game_components_embeddable_game_standard::minigame::interface::{
        IMinigameDetails, IMinigameTokenData,
    };
    use game_components_embeddable_game_standard::minigame::minigame::MinigameComponent;
    use game_components_embeddable_game_standard::minigame::structs::GameDetail;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_contract_address};

    component!(path: MinigameComponent, storage: minigame, event: MinigameEvent);
    component!(path: ObjectivesComponent, storage: objectives, event: ObjectivesEvent);
    component!(path: SettingsComponent, storage: settings, event: SettingsEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl MinigameImpl = MinigameComponent::MinigameImpl<ContractState>;
    impl MinigameInternalImpl = MinigameComponent::InternalImpl<ContractState>;
    impl ObjectivesInternalImpl = ObjectivesComponent::InternalImpl<ContractState>;
    impl SettingsInternalImpl = SettingsComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        minigame: MinigameComponent::Storage,
        #[substorage(v0)]
        objectives: ObjectivesComponent::Storage,
        #[substorage(v0)]
        settings: SettingsComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        scores: Map<felt252, u64>,
        game_over: Map<felt252, bool>,
        settings_count: u32,
        settings_difficulty: Map<u32, u8>,
        settings_details: Map<u32, (ByteArray, ByteArray, bool)>,
        objective_count: u32,
        objective_scores: Map<u32, (u64, bool)>,
        token_objective_count: Map<felt252, u32>,
        token_objective_at_index: Map<(felt252, u32), u32>,
        token_counter: felt252,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        MinigameEvent: MinigameComponent::Event,
        #[flat]
        ObjectivesEvent: ObjectivesComponent::Event,
        #[flat]
        SettingsEvent: SettingsComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[abi(embed_v0)]
    impl GameTokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            self.scores.entry(token_id).read()
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            self.game_over.entry(token_id).read()
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= token_ids.len() {
                    break;
                }
                results.append(self.score(*token_ids.at(index)));
                index += 1;
            }
            results
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= token_ids.len() {
                    break;
                }
                results.append(self.game_over(*token_ids.at(index)));
                index += 1;
            }
            results
        }
    }

    #[abi(embed_v0)]
    impl GameDetailsImpl of IMinigameDetails<ContractState> {
        fn token_name(self: @ContractState, token_id: felt252) -> ByteArray {
            "Test Token"
        }
        fn token_description(self: @ContractState, token_id: felt252) -> ByteArray {
            format!("Test Token Description for token {}", token_id)
        }

        fn game_details(self: @ContractState, token_id: felt252) -> Span<GameDetail> {
            array![
                GameDetail {
                    name: "Test Game Detail", value: format!("Test Value for token {}", token_id),
                },
            ]
                .span()
        }

        fn token_name_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<ByteArray> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= token_ids.len() {
                    break;
                }
                results.append(self.token_name(*token_ids.at(index)));
                index += 1;
            }
            results
        }

        fn token_description_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<ByteArray> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= token_ids.len() {
                    break;
                }
                results.append(self.token_description(*token_ids.at(index)));
                index += 1;
            }
            results
        }

        fn game_details_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<Span<GameDetail>> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= token_ids.len() {
                    break;
                }
                results.append(self.game_details(*token_ids.at(index)));
                index += 1;
            }
            results
        }
    }

    #[abi(embed_v0)]
    impl SettingsImpl of IMinigameSettings<ContractState> {
        fn settings_exist(self: @ContractState, settings_id: u32) -> bool {
            let (_, _, exists) = self.settings_details.entry(settings_id).read();
            exists
        }

        fn settings_exist_batch(self: @ContractState, settings_ids: Span<u32>) -> Array<bool> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= settings_ids.len() {
                    break;
                }
                results.append(self.settings_exist(*settings_ids.at(index)));
                index += 1;
            }
            results
        }
    }

    #[abi(embed_v0)]
    impl SettingsDetailsImpl of IMinigameSettingsDetails<ContractState> {
        fn settings_count(self: @ContractState) -> u32 {
            self.settings_count.read()
        }

        fn settings_details(self: @ContractState, settings_id: u32) -> GameSettingDetails {
            let (name, description, _) = self.settings_details.entry(settings_id).read();
            let difficulty = self.settings_difficulty.entry(settings_id).read();

            GameSettingDetails {
                name,
                description,
                settings: array![
                    GameSetting { name: "Difficulty", value: format!("{}", difficulty) },
                ]
                    .span(),
            }
        }

        fn settings_details_batch(
            self: @ContractState, settings_ids: Span<u32>,
        ) -> Array<GameSettingDetails> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= settings_ids.len() {
                    break;
                }
                results.append(self.settings_details(*settings_ids.at(index)));
                index += 1;
            }
            results
        }
    }

    #[abi(embed_v0)]
    impl ObjectivesImpl of IMinigameObjectives<ContractState> {
        fn objective_exists(self: @ContractState, objective_id: u32) -> bool {
            let (_, exists) = self.objective_scores.entry(objective_id).read();
            exists
        }

        fn completed_objective(self: @ContractState, token_id: felt252, objective_id: u32) -> bool {
            let (target_score, _) = self.objective_scores.entry(objective_id).read();
            let player_score = self.scores.entry(token_id).read();
            player_score >= target_score
        }

        fn objective_exists_batch(self: @ContractState, objective_ids: Span<u32>) -> Array<bool> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= objective_ids.len() {
                    break;
                }
                results.append(self.objective_exists(*objective_ids.at(index)));
                index += 1;
            }
            results
        }
    }

    #[abi(embed_v0)]
    impl ObjectivesDetailsImpl of IMinigameObjectivesDetails<ContractState> {
        fn objectives_count(self: @ContractState) -> u32 {
            self.objective_count.read()
        }

        fn objectives_details(self: @ContractState, objective_id: u32) -> GameObjectiveDetails {
            let (target_score, _) = self.objective_scores.entry(objective_id).read();

            GameObjectiveDetails {
                name: "Score Target",
                description: format!("Score Above {}", target_score),
                objectives: array![
                    GameObjective { name: "target", value: format!("{}", target_score) },
                ]
                    .span(),
            }
        }

        fn objective_settings_id(self: @ContractState, objective_id: u32) -> u32 {
            0
        }

        fn objectives_details_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<GameObjectiveDetails> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= objective_ids.len() {
                    break;
                }
                results.append(self.objectives_details(*objective_ids.at(index)));
                index += 1;
            }
            results
        }

        fn objective_settings_id_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<u32> {
            let mut results = array![];
            let mut index = 0;
            loop {
                if index >= objective_ids.len() {
                    break;
                }
                results.append(self.objective_settings_id(*objective_ids.at(index)));
                index += 1;
            }
            results
        }
    }

    #[abi(embed_v0)]
    impl GameMockImpl of super::IMinigameStarknetMock<ContractState> {
        fn mint(
            ref self: ContractState,
            player_name: Option<felt252>,
            settings_id: Option<u32>,
            start_time: Option<u64>,
            end_time: Option<u64>,
            objective_id: Option<u32>,
            context: Option<ByteArray>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            player_address: ContractAddress,
            soulbound: bool,
        ) -> felt252 {
            if settings_id.is_some() {
                let supports_settings = self.src5.supports_interface(IMINIGAME_SETTINGS_ID);
                assert!(supports_settings, "Settings not supported");
            }

            if objective_id.is_some() {
                let supports_objectives = self.src5.supports_interface(IMINIGAME_OBJECTIVES_ID);
                assert!(supports_objectives, "Objectives not supported");
            }

            let current_counter = self.token_counter.read();
            let token_id = current_counter + 1;
            self.token_counter.write(token_id);

            if let Option::Some(obj_id) = objective_id {
                self.store_token_objective(token_id, obj_id);
            }

            token_id
        }

        fn start_game(ref self: ContractState, token_id: felt252) {
            self.scores.entry(token_id).write(0);
            self.game_over.entry(token_id).write(false);
        }

        fn end_game(ref self: ContractState, token_id: felt252, score: u64) {
            self.scores.entry(token_id).write(score);
            self.game_over.entry(token_id).write(true);
        }

        fn create_objective_score(ref self: ContractState, score: u64) {
            self.create_objective_score_with_settings(score, 0_u32);
        }

        fn create_objective_score_with_settings(
            ref self: ContractState, score: u64, settings_id: u32,
        ) {
            let objective_count = self.objective_count.read();
            let new_objective_id = objective_count + 1;

            self.objective_scores.entry(new_objective_id).write((score, true));
            self.objective_count.write(new_objective_id);

            let objectives = array![
                GameObjective { name: "Score Target", value: format!("Score Above {}", score) },
            ];
            self
                .objectives
                .create_objective(
                    new_objective_id,
                    settings_id,
                    GameObjectiveDetails {
                        name: "Score Objective",
                        description: "Achieve target score",
                        objectives: objectives.span(),
                    },
                    self.minigame.token_address(),
                );
        }

        fn create_settings_difficulty(
            ref self: ContractState, name: ByteArray, description: ByteArray, difficulty: u8,
        ) {
            let settings_count = self.settings_count.read();
            let new_settings_id = settings_count + 1;

            self.settings_difficulty.entry(new_settings_id).write(difficulty);
            self
                .settings_details
                .entry(new_settings_id)
                .write((name.clone(), description.clone(), true));
            self.settings_count.write(new_settings_id);

            let settings = array![
                GameSetting { name: "Difficulty", value: format!("{}", difficulty) },
            ];

            self
                .settings
                .create_settings(
                    get_contract_address(),
                    new_settings_id,
                    GameSettingDetails { name, description, settings: settings.span() },
                    self.minigame.token_address(),
                );
        }
    }

    #[abi(embed_v0)]
    impl GameInitializerImpl of super::IMinigameStarknetMockInit<ContractState> {
        fn initializer(
            ref self: ContractState,
            game_creator: ContractAddress,
            game_name: ByteArray,
            game_description: ByteArray,
            game_developer: ByteArray,
            game_publisher: ByteArray,
            game_genre: ByteArray,
            game_image: ByteArray,
            game_color: Option<ByteArray>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            settings_address: Option<ContractAddress>,
            objectives_address: Option<ContractAddress>,
            minigame_token_address: ContractAddress,
            royalty_fraction: Option<u128>,
        ) {
            let settings_address = match settings_address {
                Option::Some(address) => {
                    self.settings.initializer();
                    Option::Some(address)
                },
                Option::None => {
                    self.settings.initializer();
                    Option::Some(get_contract_address())
                },
            };
            let objectives_address = match objectives_address {
                Option::Some(address) => {
                    self.objectives.initializer();
                    Option::Some(address)
                },
                Option::None => {
                    self.objectives.initializer();
                    Option::Some(get_contract_address())
                },
            };

            self
                .minigame
                .initializer(
                    game_creator,
                    game_name,
                    game_description,
                    game_developer,
                    game_publisher,
                    game_genre,
                    game_image,
                    game_color,
                    client_url,
                    renderer_address,
                    settings_address,
                    objectives_address,
                    minigame_token_address,
                    royalty_fraction,
                );
        }
    }

    #[generate_trait]
    impl HelperImpl of HelperTrait {
        fn store_token_objective(ref self: ContractState, token_id: felt252, objective_id: u32) {
            self.token_objective_count.entry(token_id).write(1);
            self.token_objective_at_index.entry((token_id, 0)).write(objective_id);
        }
    }
}
