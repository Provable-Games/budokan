// SPDX-License-Identifier: UNLICENSED
//
// Test suite for distributed prize functionality and the conflicting configuration bug
// where both position and distribution are set on the same prize.
//
// This test suite covers:
// 1. Normal distributed prize claiming
// 2. The conflicting configuration (position + distribution) bug
// 3. Refund scenarios (no entrants, partial entrants)
// 4. Edge cases with distribution_count

use budokan::structs::budokan::{Distribution, ERC20Data, PrizeType, RewardType, TokenTypeData};
use budokan::tests::constants::{
    OWNER, TEST_GAME_END_DELAY, TEST_GAME_START_DELAY, TEST_REGISTRATION_START_DELAY,
    TEST_SUBMISSION_DURATION,
};
use budokan::tests::helpers::create_basic_tournament;
use budokan::tests::interfaces::{IERC20MockDispatcher, IERC20MockDispatcherTrait};
use budokan::tests::test_budokan::{deploy_erc20_mock, setup};
use budokan_interfaces::budokan::IBudokanDispatcherTrait;
use game_components_test_common::mocks::minigame_mock::IMinigameMockDispatcherTrait;
use snforge_std::{
    start_cheat_block_timestamp, start_cheat_caller_address, stop_cheat_block_timestamp,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// ==================== Distributed Prize Basic Tests ====================

/// Test basic distributed prize claim with all positions filled
#[test]
fn test_distributed_prize_claim_all_positions_filled() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10000; // 10000 tokens for easy percentage math

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint tokens to sponsor and approve
    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Sponsor adds a distributed prize (Linear distribution across 3 positions)
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Linear(10)), // weight 1.0
                    distribution_count: Option::Some(3),
                },
            ),
            Option::None // No position = distributed prize
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Enter 3 players - warp to registration period
    let mut time: u64 = TEST_REGISTRATION_START_DELAY().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player1'), owner, Option::None, 1, 0);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player2'), owner, Option::None, 2, 0);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player3'), owner, Option::None, 3, 0);

    // Move to submission period (game end)
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1.into(), 100);
    contracts.minigame.end_game(token_id2.into(), 50);
    contracts.minigame.end_game(token_id3.into(), 25);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);
    contracts.budokan.submit_score(tournament.id, token_id3, 3);

    // Move to finalized
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let owner_balance_before = contracts.erc20.balance_of(owner);

    // Claim all 3 distributed positions
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 1))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 2))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 3))));

    let owner_balance_after = contracts.erc20.balance_of(owner);

    // Owner should receive all tokens (as owner of all 3 winning tokens)
    // Due to rounding, might be slightly less than prize_amount
    let total_received = owner_balance_after - owner_balance_before;
    assert!(
        total_received >= (prize_amount - 10).into() && total_received <= prize_amount.into(),
        "Owner should receive approximately all prize tokens",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Conflicting Configuration Prevention Tests ====================

/// Test that adding prize with BOTH position AND distribution is now REJECTED
/// This is the fix for the bug where conflicting configs were previously allowed
#[should_panic(
    expected: "Budokan: Cannot set position for distributed prize (position and distribution are mutually exclusive)",
)]
#[test]
fn test_conflicting_config_position_and_distribution_rejected() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 34954498885072017424384; // Exact amount from the transaction

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint tokens to sponsor and approve
    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Attempt to add prize with CONFLICTING configuration: position=1 AND distribution set
    // This should now PANIC with the validation error
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Exponential(100)), // weight 10.0
                    distribution_count: Option::Some(10),
                },
            ),
            Option::Some(1) // Position set - should be rejected!
        );
}

/// Test that a valid Single prize (position set, no distribution) works correctly
#[test]
fn test_single_prize_without_distribution_works() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint and approve
    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Add valid Single prize: position set, NO distribution
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::None, // No distribution = Single prize
                    distribution_count: Option::None,
                },
            ),
            Option::Some(1) // Position 1
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Enter tournament and submit score - warp to registration
    let mut time: u64 = TEST_REGISTRATION_START_DELAY().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player1'), owner, Option::None, 1, 0);

    // Move to submission (game end)
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id.into(), 100);
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    // Move to finalized
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let owner_balance_before = contracts.erc20.balance_of(owner);

    // Claim as Single prize - should work
    contracts.budokan.claim_reward(tournament.id, RewardType::Prize(PrizeType::Single(prize.id)));

    let owner_balance_after = contracts.erc20.balance_of(owner);
    let received = owner_balance_after - owner_balance_before;

    assert!(received == prize_amount.into(), "Should receive full prize amount");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

/// Test that a valid Distributed prize (no position, distribution set) works correctly
#[test]
fn test_distributed_prize_without_position_works() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint and approve
    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Add valid Distributed prize: NO position, distribution set
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Linear(10)),
                    distribution_count: Option::Some(3),
                },
            ),
            Option::None // No position = Distributed prize
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Enter 3 players - warp to registration
    let mut time: u64 = TEST_REGISTRATION_START_DELAY().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player1'), owner, Option::None, 1, 0);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player2'), owner, Option::None, 2, 0);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player3'), owner, Option::None, 3, 0);

    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1.into(), 100);
    contracts.minigame.end_game(token_id2.into(), 50);
    contracts.minigame.end_game(token_id3.into(), 25);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);
    contracts.budokan.submit_score(tournament.id, token_id3, 3);

    // Finalize
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let owner_balance_before = contracts.erc20.balance_of(owner);

    // Claim as Distributed prize
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 1))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 2))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 3))));

    let owner_balance_after = contracts.erc20.balance_of(owner);
    let total_received = owner_balance_after - owner_balance_before;

    // Should receive approximately all tokens
    assert!(
        total_received >= (prize_amount - 10).into(),
        "Should receive full prize amount via Distributed claims",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Refund Scenario Tests ====================

/// Test distributed prize refund when NO entrants (empty leaderboard)
#[test]
fn test_distributed_prize_refund_no_entrants() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint and approve
    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Add distributed prize
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Linear(10)),
                    distribution_count: Option::Some(3),
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // NO ENTRANTS - just wait for tournament to finalize
    let time: u64 = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION())
        .into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);

    // Verify leaderboard is empty
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 0, "Leaderboard should be empty");

    let sponsor_balance_before = contracts.erc20.balance_of(sponsor);

    // Claim all positions - should all be refunded to sponsor
    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 1))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 2))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 3))));

    let sponsor_balance_after = contracts.erc20.balance_of(sponsor);
    let total_refunded = sponsor_balance_after - sponsor_balance_before;

    // All tokens should be refunded to sponsor
    assert!(
        total_refunded >= (prize_amount - 10).into(),
        "All tokens should be refunded to sponsor when no entrants",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
}

/// Test distributed prize partial refund (fewer entrants than distribution_count)
#[test]
fn test_distributed_prize_partial_entrants_partial_refund() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let player2: ContractAddress = 'PLAYER2'.try_into().unwrap();
    let prize_amount: u128 = 10000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint and approve
    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Add distributed prize for 5 positions
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Linear(10)),
                    distribution_count: Option::Some(5),
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Only 2 entrants (less than distribution_count of 5)
    let mut time: u64 = TEST_REGISTRATION_START_DELAY().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player1'), owner, Option::None, 1, 0);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player2'), player2, Option::None, 2, 0);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Submit scores
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1.into(), 100);
    contracts.minigame.end_game(token_id2.into(), 50);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Finalize
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    // Verify leaderboard has 2 entries
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 2, "Leaderboard should have 2 entries");

    let owner_balance_before = contracts.erc20.balance_of(owner);
    let player2_balance_before = contracts.erc20.balance_of(player2);
    let sponsor_balance_before = contracts.erc20.balance_of(sponsor);

    // Claim all 5 positions
    // Positions 1-2: paid to winners
    // Positions 3-5: refunded to sponsor
    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 1))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 2))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 3))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 4))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 5))));
    stop_cheat_caller_address(contracts.budokan.contract_address);

    let owner_balance_after = contracts.erc20.balance_of(owner);
    let player2_balance_after = contracts.erc20.balance_of(player2);
    let sponsor_balance_after = contracts.erc20.balance_of(sponsor);

    let owner_received = owner_balance_after - owner_balance_before;
    let player2_received = player2_balance_after - player2_balance_before;
    let sponsor_refunded = sponsor_balance_after - sponsor_balance_before;

    // Owner (1st place) should get most
    assert!(owner_received > 0, "Owner should receive prize for 1st place");
    // Player2 (2nd place) should get something
    assert!(player2_received > 0, "Player2 should receive prize for 2nd place");
    // Sponsor should get refund for positions 3-5
    assert!(sponsor_refunded > 0, "Sponsor should receive refund for unfilled positions");

    // Total distributed should equal prize_amount (minus rounding)
    let total = owner_received + player2_received + sponsor_refunded;
    assert!(
        total >= (prize_amount - 10).into() && total <= prize_amount.into(),
        "Total distributed should equal prize amount",
    );

    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Exponential Distribution Tests ====================

/// Test Exponential(100) distribution - the exact config from the reported bug
#[test]
fn test_exponential_100_distribution_with_10_positions() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 100000; // 100k for easier percentage verification

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Mint and approve
    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // Add prize with Exponential(100) distribution (weight 10.0 - very steep)
    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Exponential(100)),
                    distribution_count: Option::Some(10),
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Enter only 1 player (to test refund for positions 2-10)
    let mut time: u64 = TEST_REGISTRATION_START_DELAY().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, Option::Some('player1'), owner, Option::None, 1, 0);

    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1.into(), 100);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);

    // Finalize
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let owner_balance_before = contracts.erc20.balance_of(owner);
    let sponsor_balance_before = contracts.erc20.balance_of(sponsor);

    // Claim positions 1-6 (positions 7-10 have 0 tokens due to steep distribution)
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 1))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 2))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 3))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 4))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 5))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 6))));

    let owner_balance_after = contracts.erc20.balance_of(owner);
    let sponsor_balance_after = contracts.erc20.balance_of(sponsor);

    let owner_received = owner_balance_after - owner_balance_before;
    let sponsor_refunded = sponsor_balance_after - sponsor_balance_before;

    assert!(
        owner_received >= 60000 && owner_received <= 70000,
        "Position 1 should receive ~67% with Exponential(100)",
    );

    assert!(sponsor_refunded > 0, "Sponsor should receive some refund for empty positions 2-6");

    let total_claimed = owner_received + sponsor_refunded;

    assert!(
        total_claimed >= (prize_amount - 10).into() && total_claimed <= prize_amount.into(),
        "Total claimed should equal prize amount due to dust handling",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

// ==================== Edge Case Tests ====================

/// Test that claiming distributed prize with payout_index=0 fails
#[should_panic(expected: "Budokan: Payout index must be greater than zero")]
#[test]
fn test_distributed_prize_payout_index_zero_fails() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Linear(10)),
                    distribution_count: Option::Some(3),
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Finalize
    let time: u64 = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION())
        .into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    // This should panic - payout_index 0 is invalid
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 0))));
}

/// Test that claiming distributed prize beyond distribution_count fails (returns 0 share)
#[should_panic(expected: "Budokan: Position 11 has 0 tokens to claim")]
#[test]
fn test_distributed_prize_beyond_distribution_count_fails() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Linear(10)),
                    distribution_count: Option::Some(10) // Only 10 positions
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Finalize
    let time: u64 = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION())
        .into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    // This should panic - payout_index 11 is beyond distribution_count
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 11))));
}

/// Test that already claimed distributed position cannot be claimed again
#[should_panic(expected: "Prize: Prize has already been claimed")]
#[test]
fn test_distributed_prize_double_claim_fails() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);

    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Linear(10)),
                    distribution_count: Option::Some(3),
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Finalize
    let time: u64 = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION())
        .into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);

    // First claim succeeds (refunds to sponsor since no entrants)
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 1))));

    // Second claim for same position should fail
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, 1))));
}

// ==================== Custom Distribution Prize Tests ====================
//
// These exercise `Distribution::Custom` on sponsor-added prizes (the prize
// claim path in `budokan_rewards::_claim_distributed_prize`). The entry-fee
// Custom path is covered separately in `test_budokan.cairo`. Coverage here:
// - 50-position Custom shares across two independent prizes (packed-shares
//   storage spans 4 felt slots at 15 shares per slot, so 50 exercises slots
//   3 and 4 both at full and partial occupancy);
// - partial leaderboard with refund routing for unfilled positions;
// - upfront validation that Custom shares sum to 10000 and length matches
//   distribution_count (mirrors entry-fee Custom validation).

/// Build a 50-element Custom shares array summing to exactly 10000.
/// Positions 1..10 take 4000 bp combined (top-heavy), positions 11..50
/// each take 150 bp (uniform tail), so the total is exactly 10000.
fn fifty_position_shares() -> Span<u16> {
    let mut shares: Array<u16> = ArrayTrait::new();
    // Top 10 positions: hand-picked descending values summing to 4000.
    shares.append(800);
    shares.append(700);
    shares.append(600);
    shares.append(500);
    shares.append(400);
    shares.append(300);
    shares.append(250);
    shares.append(200);
    shares.append(150);
    shares.append(100);
    // Tail 40 positions: uniform 150 bp each (40 * 150 = 6000).
    let mut i: u32 = 0;
    loop {
        if i >= 40 {
            break;
        }
        shares.append(150);
        i += 1;
    }
    shares.span()
}

/// Test A: 50-position Custom distribution across two distinct ERC20 prizes
/// with a fully populated leaderboard. Asserts each prize settles
/// independently to within ≤50 wei dust of its own escrowed amount, and that
/// the per-position split for prize 1 (position 1 = 800 bp) matches the
/// configured share.
#[test]
fn test_custom_distributed_prize_50_positions_two_prizes_full_leaderboard() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();

    // Two independent ERC20 tokens so per-prize accounting is unambiguous.
    let erc20_b_address = deploy_erc20_mock();
    let erc20_b = IERC20MockDispatcher { contract_address: erc20_b_address };

    let prize_amount_a: u128 = 10_000_000; // prize A pool (whole units)
    let prize_amount_b: u128 = 5_000_000; // prize B pool (different size)

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Sponsor escrows both prizes. Custom shares array is identical for both
    // prizes — what we're testing is that two distinct prize objects with the
    // same Custom config settle independently.
    contracts.erc20.mint(sponsor, prize_amount_a.into());
    erc20_b.mint(sponsor, prize_amount_b.into());

    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount_a.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);
    start_cheat_caller_address(erc20_b_address, sponsor);
    erc20_b.approve(contracts.budokan.contract_address, prize_amount_b.into());
    stop_cheat_caller_address(erc20_b_address);

    let shares = fifty_position_shares();

    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize_a = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount_a,
                    distribution: Option::Some(Distribution::Custom(shares)),
                    distribution_count: Option::Some(50),
                },
            ),
            Option::None,
        );
    let prize_b = contracts
        .budokan
        .add_prize(
            tournament.id,
            erc20_b_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount_b,
                    distribution: Option::Some(Distribution::Custom(shares)),
                    distribution_count: Option::Some(50),
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Enter 50 players (all owned by `owner`) during registration.
    let mut time: u64 = TEST_REGISTRATION_START_DELAY().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let mut tokens: Array<felt252> = ArrayTrait::new();
    let mut i: u32 = 0;
    loop {
        if i >= 50 {
            break;
        }
        let salt: u16 = i.try_into().unwrap();
        let player_name: felt252 = (i + 1).into();
        let (token_id, _) = contracts
            .budokan
            .enter_tournament(
                tournament.id, Option::Some(player_name), owner, Option::None, salt, 0,
            );
        tokens.append(token_id);
        i += 1;
    }

    // Move to submission phase, end games with strictly decreasing scores so
    // each player lands at position (i+1) on the leaderboard.
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let mut j: u32 = 0;
    loop {
        if j >= 50 {
            break;
        }
        let token_id = *tokens.at(j);
        let score: u64 = 100_000 - (j.into() * 10_u64);
        contracts.minigame.end_game(token_id.into(), score);
        contracts.budokan.submit_score(tournament.id, token_id, j + 1);
        j += 1;
    }

    // Sanity: leaderboard fully populated.
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == 50, "Leaderboard should have 50 entries");

    // Finalize.
    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let owner_a_before = contracts.erc20.balance_of(owner);
    let owner_b_before = erc20_b.balance_of(owner);
    let position_1_a_before = owner_a_before;
    let position_1_b_before = owner_b_before;

    // Claim position 1 for both prizes first to lock in the exact-share check
    // (position 1 also receives any rounding dust, so checking it before the
    // remaining claims keeps the equality clean).
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize_a.id, 1))));
    contracts
        .budokan
        .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize_b.id, 1))));

    // Position-1 share for both prizes is 800 bp (8%) plus any dust. With
    // exact-100% Custom shares, dust is 0.
    let position_1_a = contracts.erc20.balance_of(owner) - position_1_a_before;
    let position_1_b = erc20_b.balance_of(owner) - position_1_b_before;
    let expected_p1_a: u256 = (prize_amount_a.into() * 800_u256) / 10000_u256;
    let expected_p1_b: u256 = (prize_amount_b.into() * 800_u256) / 10000_u256;
    assert!(position_1_a == expected_p1_a, "Prize A position 1 should equal 8% of pool");
    assert!(position_1_b == expected_p1_b, "Prize B position 1 should equal 8% of pool");

    // Claim positions 2..=50 for both prizes.
    let mut k: u32 = 2;
    loop {
        if k > 50 {
            break;
        }
        contracts
            .budokan
            .claim_reward(
                tournament.id, RewardType::Prize(PrizeType::Distributed((prize_a.id, k))),
            );
        contracts
            .budokan
            .claim_reward(
                tournament.id, RewardType::Prize(PrizeType::Distributed((prize_b.id, k))),
            );
        k += 1;
    }

    let owner_a_after = contracts.erc20.balance_of(owner);
    let owner_b_after = erc20_b.balance_of(owner);
    let total_a = owner_a_after - owner_a_before;
    let total_b = owner_b_after - owner_b_before;

    // Per-prize accounting must independently reconcile to the prize amount.
    // Custom shares sum to exactly 10000, so dust is 0 — but we allow ≤50 wei
    // (one wei per position) as a defensive bound against any future rounding.
    assert!(
        total_a >= prize_amount_a.into() - 50 && total_a <= prize_amount_a.into(),
        "Prize A total payout must reconcile to escrow",
    );
    assert!(
        total_b >= prize_amount_b.into() - 50 && total_b <= prize_amount_b.into(),
        "Prize B total payout must reconcile to escrow",
    );

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

/// Test B: 50-position Custom distribution with a partially populated
/// leaderboard. Positions filled by entrants pay those entrants; positions
/// beyond the leaderboard refund to the sponsor. The per-prize total of
/// (winner payouts + sponsor refunds) must reconcile to the escrow.
#[test]
fn test_custom_distributed_prize_50_positions_partial_leaderboard_refunds_to_sponsor() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10_000_000;
    let entrant_count: u32 = 10;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    let shares = fifty_position_shares();

    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    let prize = contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Custom(shares)),
                    distribution_count: Option::Some(50),
                },
            ),
            Option::None,
        );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Enter only 10 players.
    let mut time: u64 = TEST_REGISTRATION_START_DELAY().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let mut tokens: Array<felt252> = ArrayTrait::new();
    let mut i: u32 = 0;
    loop {
        if i >= entrant_count {
            break;
        }
        let salt: u16 = i.try_into().unwrap();
        let player_name: felt252 = (i + 1).into();
        let (token_id, _) = contracts
            .budokan
            .enter_tournament(
                tournament.id, Option::Some(player_name), owner, Option::None, salt, 0,
            );
        tokens.append(token_id);
        i += 1;
    }

    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let mut j: u32 = 0;
    loop {
        if j >= entrant_count {
            break;
        }
        let token_id = *tokens.at(j);
        let score: u64 = 100_000 - (j.into() * 10_u64);
        contracts.minigame.end_game(token_id.into(), score);
        contracts.budokan.submit_score(tournament.id, token_id, j + 1);
        j += 1;
    }

    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == entrant_count, "Leaderboard should have 10 entries");

    time = (TEST_GAME_START_DELAY() + TEST_GAME_END_DELAY() + TEST_SUBMISSION_DURATION()).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let owner_before = contracts.erc20.balance_of(owner);
    let sponsor_before = contracts.erc20.balance_of(sponsor);

    // Claim all 50 positions. Positions 1..=10 pay owner (the entrant); 11..=50
    // refund to sponsor.
    let mut k: u32 = 1;
    loop {
        if k > 50 {
            break;
        }
        contracts
            .budokan
            .claim_reward(tournament.id, RewardType::Prize(PrizeType::Distributed((prize.id, k))));
        k += 1;
    }

    let owner_after = contracts.erc20.balance_of(owner);
    let sponsor_after = contracts.erc20.balance_of(sponsor);
    let owner_received = owner_after - owner_before;
    let sponsor_refunded = sponsor_after - sponsor_before;

    // Sanity: both buckets must be non-zero — winners get top 10 shares, and
    // positions 11..=50 (uniform 150 bp each) refund to sponsor.
    assert!(owner_received > 0, "Top-10 winners should receive payouts");
    assert!(sponsor_refunded > 0, "Positions 11..=50 should refund to sponsor");

    // Total accounting: winners + refunds must reconcile to escrow.
    let total = owner_received + sponsor_refunded;
    assert!(
        total >= prize_amount.into() - 50 && total <= prize_amount.into(),
        "Winner payouts + sponsor refunds must reconcile to escrow",
    );

    // Cross-check: refund quantum for positions 11..=50 is 150 bp * 40
    // positions = 6000 bp = 60% of pool. So sponsor must get at least
    // (prize_amount * 6000 / 10000) - 50 wei dust.
    let expected_min_refund: u256 = (prize_amount.into() * 6000_u256) / 10000_u256 - 50;
    assert!(sponsor_refunded >= expected_min_refund, "Sponsor refund must cover 40 tail positions");

    stop_cheat_caller_address(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.budokan.contract_address);
    stop_cheat_block_timestamp(contracts.minigame.contract_address);
}

/// Test C: malformed Custom prize shares are rejected upfront in `add_prize`.
/// Without this validation a sponsor could escrow a prize whose shares don't
/// sum to 10000 (or whose length doesn't match `distribution_count`), and the
/// failure mode would only surface mid-claim with `0 tokens to claim`.
#[should_panic(
    expected: "Budokan: Custom distribution shares length must equal distribution_count",
)]
#[test]
fn test_custom_distributed_prize_malformed_shares_rejected_at_add_prize() {
    let contracts = setup();
    let owner = OWNER;
    let sponsor: ContractAddress = 'SPONSOR'.try_into().unwrap();
    let prize_amount: u128 = 10_000;

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let tournament = create_basic_tournament(
        contracts.budokan, contracts.minigame.contract_address,
    );
    stop_cheat_caller_address(contracts.budokan.contract_address);

    contracts.erc20.mint(sponsor, prize_amount.into());
    start_cheat_caller_address(contracts.erc20.contract_address, sponsor);
    contracts.erc20.approve(contracts.budokan.contract_address, prize_amount.into());
    stop_cheat_caller_address(contracts.erc20.contract_address);

    // distribution_count = 50, but shares.len() = 3 — a length mismatch the
    // validation must catch before the prize is escrowed.
    let bad_shares = array![5000_u16, 3000_u16, 2000_u16].span();

    start_cheat_caller_address(contracts.budokan.contract_address, sponsor);
    contracts
        .budokan
        .add_prize(
            tournament.id,
            contracts.erc20.contract_address,
            TokenTypeData::erc20(
                ERC20Data {
                    amount: prize_amount,
                    distribution: Option::Some(Distribution::Custom(bad_shares)),
                    distribution_count: Option::Some(50),
                },
            ),
            Option::None,
        );
}
