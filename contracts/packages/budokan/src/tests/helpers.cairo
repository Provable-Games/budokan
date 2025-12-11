use budokan::models::budokan::{GameConfig, Metadata, Tournament};
use budokan::models::constants::{
    MAX_REGISTRATION_PERIOD, MAX_TOURNAMENT_LENGTH, MIN_REGISTRATION_PERIOD, MIN_SUBMISSION_PERIOD,
};
use budokan::models::schedule::{Period, Schedule};
use budokan::tests::constants::{
    OWNER, TEST_END_TIME, TEST_REGISTRATION_END_TIME, TEST_REGISTRATION_START_TIME, TEST_START_TIME,
    TOURNAMENT_DESCRIPTION, TOURNAMENT_NAME,
};
use budokan_interfaces::budokan::{IBudokanDispatcher, IBudokanDispatcherTrait};
use starknet::ContractAddress;

//
// Test Helpers
//
pub fn test_metadata() -> Metadata {
    Metadata { name: TOURNAMENT_NAME(), description: TOURNAMENT_DESCRIPTION() }
}

pub fn test_game_config(game_address: ContractAddress) -> GameConfig {
    GameConfig { address: game_address, settings_id: 1, soulbound: false, play_url: "" }
}

pub fn test_schedule() -> Schedule {
    Schedule {
        registration: Option::Some(test_registration_period()),
        game: test_game_period(),
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    }
}

pub fn test_season_schedule() -> Schedule {
    Schedule {
        registration: Option::None,
        game: test_game_period(),
        submission_duration: MIN_SUBMISSION_PERIOD.into(),
    }
}

pub fn custom_schedule(
    registration: Option<Period>, game: Period, submission_duration: u64,
) -> Schedule {
    Schedule { registration, game, submission_duration }
}

pub fn start_time_too_soon() -> Period {
    Period { start: 0, end: TEST_REGISTRATION_END_TIME().into() }
}

pub fn tournament_too_long() -> Schedule {
    custom_schedule(
        Option::None,
        Period {
            start: TEST_REGISTRATION_START_TIME().into(),
            end: TEST_REGISTRATION_START_TIME().into() + MAX_TOURNAMENT_LENGTH.into() + 1,
        },
        MIN_SUBMISSION_PERIOD.into(),
    )
}

pub fn registration_period_too_short() -> Period {
    Period {
        start: TEST_REGISTRATION_START_TIME().into(),
        end: TEST_REGISTRATION_START_TIME().into() + MIN_REGISTRATION_PERIOD.into() - 1,
    }
}

pub fn registration_period_too_long() -> Period {
    Period {
        start: TEST_REGISTRATION_START_TIME().into(),
        end: TEST_REGISTRATION_START_TIME().into() + MAX_REGISTRATION_PERIOD.into() + 1,
    }
}

pub fn test_registration_period() -> Period {
    Period {
        start: TEST_REGISTRATION_START_TIME().into(), end: TEST_REGISTRATION_END_TIME().into(),
    }
}

pub fn test_game_period() -> Period {
    Period { start: TEST_START_TIME().into(), end: TEST_END_TIME().into() }
}

pub fn registration_open_beyond_tournament_end() -> Schedule {
    let tournament_period = Period { start: TEST_START_TIME().into(), end: TEST_END_TIME().into() };

    let registration_period = Period {
        start: TEST_REGISTRATION_START_TIME().into(), end: TEST_END_TIME().into() + 1,
    };

    custom_schedule(
        Option::Some(registration_period), tournament_period, MIN_SUBMISSION_PERIOD.into(),
    )
}

pub fn create_basic_tournament(budokan: IBudokanDispatcher, game: ContractAddress) -> Tournament {
    budokan
        .create_tournament(
            OWNER,
            test_metadata(),
            test_schedule(),
            test_game_config(game),
            Option::None,
            Option::None,
            false,
            "",
        )
}
// pub fn register_tokens_for_test(
//     tournament: ITournamentMockDispatcher,
//     erc20: IERC20MockDispatcher,
//     erc721: IERC721MockDispatcher,
// ) {
//     let tokens = array![
//         Token {
//             token: erc20.contract_address,
//             token_type: TokenType::erc20(ERC20Data { amount: 1 })
//         },
//         Token {
//             token: erc721.contract_address,
//             token_type: TokenType::erc721(ERC721Data { id: 1 })
//         },
//     ];

//     erc20.approve(tournament.contract_address, 1);
//     erc721.approve(tournament.contract_address, 1);

//     tournament.register_tokens(tokens);
// }


