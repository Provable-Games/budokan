// SPDX-License-Identifier: UNLICENSED

use budokan::models::budokan::{Distribution, EntryFee};
use budokan::models::constants::MIN_SUBMISSION_PERIOD;
use budokan::models::schedule::Phase;
use budokan::tests::constants::{OWNER, TEST_END_TIME, TEST_REGISTRATION_START_TIME};
use budokan::tests::helpers::{test_game_config, test_metadata, test_schedule};
use budokan::tests::interfaces::IERC20MockDispatcherTrait;
use budokan::tests::test_budokan::{TestContracts, setup};
use budokan::tests::utils;
use budokan_interfaces::budokan::IBudokanDispatcherTrait;
use game_components_test_starknet::minigame::mocks::minigame_starknet_mock::IMinigameStarknetMockDispatcherTrait;
use starknet::testing;

#[test]
fn test_create_tournament_with_100_prize_spots() {
    let contracts: TestContracts = setup();

    utils::impersonate(OWNER);

    // Create a tournament with 100 prize spots
    let mut game_config = test_game_config(contracts.minigame.contract_address);
    game_config.prize_spots = 100;

    // Using basis points: 10000 = 100%, so 10000 means 100% to context creator
    let entry_fee = EntryFee {
        token_address: contracts.erc20.contract_address,
        amount: 10000000000,
        distribution: Distribution::Linear,
        context_creator_share: Option::Some(10000), // 100% to context creator
        game_creator_share: Option::None,
        refund_share: Option::None,
    };

    let tournament = contracts
        .budokan
        .create_tournament(
            OWNER,
            test_metadata(),
            test_schedule(),
            game_config,
            Option::Some(entry_fee),
            Option::None, // no entry requirement
            false,
            "",
        );
}
// #[test]
// fn test_submit_multiple_scores_stress_test() {
//     let contracts: TestContracts = setup();

//     utils::impersonate(OWNER);

//     // Create a tournament with 150 prize spots
//     let mut game_config = test_game_config(contracts.minigame.contract_address);
//     game_config.prize_spots = 150;

//     let tournament = contracts
//         .budokan
//         .create_tournament(
//             OWNER,
//             test_metadata(),
//             test_schedule(),
//             game_config,
//             Option::None, // no entry fee
//             Option::None // no entry requirement
//         );

//     // Move to registration period and enter 150 players
//     testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

//     let mut token_ids = array![];
//     let mut i: u64 = 0;
//     loop {
//         if i == 150 {
//             break;
//         }
//         let (token_id, _) = contracts
//             .budokan
//             .enter_tournament(tournament.id, 'player', OWNER, Option::None);
//         token_ids.append(token_id);
//         i += 1;
//     };

//     // Move to end of tournament and end games with scores
//     testing::set_block_timestamp(TEST_END_TIME().into());

//     let mut i: u64 = 0;
//     loop {
//         if i == 150 {
//             break;
//         }
//         // Give each player a score (player 0 gets score 150, player 1 gets 149, etc.)
//         contracts
//             .minigame
//             .end_game(*token_ids.at(i.try_into().unwrap()), (150 - i).try_into().unwrap());
//         i += 1;
//     };

//     // Submit scores for all players in order of their token_ids
//     let mut i: u64 = 0;
//     loop {
//         if i == 150 {
//             break;
//         }
//         // Player i has score (150-i), so their position should be i+1
//         let position: u8 = (i + 1).try_into().unwrap();
//         contracts
//             .budokan
//             .submit_score(tournament.id, *token_ids.at(i.try_into().unwrap()), position);
//         i += 1;
//     };

//     // Verify leaderboard has all 150 entries
//     let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
//     assert(leaderboard.len() == 150, 'Invalid leaderboard length');
// }

// #[test]
// fn test_distribute_many_prizes() {
//     let contracts: TestContracts = setup();

//     utils::impersonate(OWNER);

//     // Create tournament with 250 prize spots
//     let mut game_config = test_game_config(contracts.minigame.contract_address);
//     game_config.prize_spots = 250;

//     let tournament = contracts
//         .budokan
//         .create_tournament(
//             OWNER,
//             test_metadata(),
//             test_schedule(),
//             game_config,
//             Option::None, // no entry fee
//             Option::None // no entry requirement
//         );

//     // Add 250 prizes (1 token each)
//     contracts.erc20.approve(contracts.budokan.contract_address, 250);

//     let mut i: u64 = 0;
//     loop {
//         if i == 250 {
//             break;
//         }
//         contracts
//             .budokan
//             .add_prize(
//                 tournament.id,
//                 contracts.erc20.contract_address,
//                 TokenTypeData::erc20(ERC20Data { amount: 1 }),
//                 (i + 1).try_into().unwrap() // position 1 to 250
//             );
//         i += 1;
//     };

//     // Register and play with 250 players
//     testing::set_block_timestamp(TEST_REGISTRATION_START_TIME().into());

//     let mut token_ids = array![];
//     let mut i: u64 = 0;
//     loop {
//         if i == 250 {
//             break;
//         }
//         let (token_id, _) = contracts
//             .budokan
//             .enter_tournament(tournament.id, 'player', OWNER, Option::None);
//         token_ids.append(token_id);
//         i += 1;
//     };

//     // End tournament and submit scores
//     testing::set_block_timestamp(TEST_END_TIME().into());

//     let mut i: u64 = 0;
//     loop {
//         if i == 250 {
//             break;
//         }
//         // Give each player a score (player 0 gets score 250, player 1 gets 249, etc.)
//         contracts
//             .minigame
//             .end_game(*token_ids.at(i.try_into().unwrap()), (250 - i).try_into().unwrap());
//         i += 1;
//     };

//     // Submit scores for all players in order of their token_ids
//     let mut i: u64 = 0;
//     loop {
//         if i == 250 {
//             break;
//         }
//         // Player i has score (250-i), so their position should be i+1
//         let position: u8 = (i + 1).try_into().unwrap();
//         contracts
//             .budokan
//             .submit_score(tournament.id, *token_ids.at(i.try_into().unwrap()), position);
//         i += 1;
//     };

//     // Move to after submission period
//     testing::set_block_timestamp((TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into());

//     // Verify tournament is finalized and all prizes can be claimed
//     let state = contracts.budokan.current_phase(tournament.id);
//     assert(state == Phase::Finalized, 'Tournament should be finalized');

//     // Winners can now claim their prizes (not testing full claiming here as it's a stress test)
//     let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
//     assert(leaderboard.len() == 250, 'Invalid leaderboard length');
// }


