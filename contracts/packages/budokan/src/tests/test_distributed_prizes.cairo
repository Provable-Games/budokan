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

use budokan::models::budokan::{
    Distribution, ERC20Data, EntryFeeRewardType, PrizeType, RewardType, TokenTypeData,
};
use budokan::models::constants::MIN_SUBMISSION_PERIOD;
use budokan::tests::constants::{
    OWNER, STARTING_BALANCE, TEST_END_TIME, TEST_REGISTRATION_START_TIME,
};
use budokan::tests::helpers::create_basic_tournament;
use budokan::tests::interfaces::{IERC20MockDispatcher, IERC20MockDispatcherTrait};
use budokan::tests::test_budokan::setup;
use budokan_interfaces::budokan::IBudokanDispatcherTrait;
use budokan_interfaces::prize::IPrizeDispatcherTrait;
use game_components_test_starknet::minigame::mocks::minigame_starknet_mock::IMinigameStarknetMockDispatcherTrait;
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

    // Enter 3 players
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);

    // Move to submission period and submit scores
    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);
    contracts.minigame.end_game(token_id3, 25);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);
    contracts.budokan.submit_score(tournament.id, token_id3, 3);

    // Move to finalized
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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

    // Enter tournament and submit score
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id, 100);
    contracts.budokan.submit_score(tournament.id, token_id, 1);

    // Move to finalized
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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

    // Enter 3 players
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', owner, Option::None);
    let (token_id3, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player3', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);
    contracts.minigame.end_game(token_id3, 25);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);
    contracts.budokan.submit_score(tournament.id, token_id3, 3);

    // Finalize
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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
    let time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    let (token_id2, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player2', player2, Option::None);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Submit scores
    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.minigame.end_game(token_id2, 50);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    start_cheat_caller_address(contracts.budokan.contract_address, player2);
    contracts.budokan.submit_score(tournament.id, token_id2, 2);
    stop_cheat_caller_address(contracts.budokan.contract_address);

    // Finalize
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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
/// IMPORTANT: This test reveals that Exponential(100) is SO steep that positions 7-10
/// round to 0 tokens and CANNOT be claimed. This is a significant finding.
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
    let mut time = TEST_REGISTRATION_START_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    start_cheat_caller_address(contracts.budokan.contract_address, owner);
    let (token_id1, _) = contracts
        .budokan
        .enter_tournament(tournament.id, 'player1', owner, Option::None);

    time = TEST_END_TIME().into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    contracts.minigame.end_game(token_id1, 100);
    contracts.budokan.submit_score(tournament.id, token_id1, 1);

    // Finalize
    time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
    start_cheat_block_timestamp(contracts.budokan.contract_address, time);
    start_cheat_block_timestamp(contracts.minigame.contract_address, time);

    let owner_balance_before = contracts.erc20.balance_of(owner);
    let sponsor_balance_before = contracts.erc20.balance_of(sponsor);

    // Claim positions 1-6 (positions 7-10 have 0 tokens due to steep distribution)
    // With Exponential(100), the distribution is so steep that positions 7-10
    // round to 0 basis points and CANNOT be claimed (will panic with "0 tokens to claim")
    // This means some tokens will be STUCK in the contract!
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
    // Positions 7-10 would fail with "Position X has 0 tokens to claim"

    let owner_balance_after = contracts.erc20.balance_of(owner);
    let sponsor_balance_after = contracts.erc20.balance_of(sponsor);

    let owner_received = owner_balance_after - owner_balance_before;
    let sponsor_refunded = sponsor_balance_after - sponsor_balance_before;

    // With Exponential(100) = weight 10.0, position 1 should get ~67% of total
    // So winner should get roughly 67000 tokens
    assert!(
        owner_received >= 60000 && owner_received <= 70000,
        "Position 1 should receive ~67% with Exponential(100)",
    );

    // Sponsor should get refund for positions 2-6 (since position is empty)
    // Note: Positions 7-10 have 0 tokens and cannot be claimed, so some tokens are stuck!
    assert!(sponsor_refunded > 0, "Sponsor should receive some refund for empty positions 2-6");

    // The dust handling redistributes any rounding remainder to position 1,
    // so even though positions 7-10 have 0 share, the total from positions 1-6
    // should equal the full prize amount (dust goes to position 1)
    let total_claimed = owner_received + sponsor_refunded;

    // Verify that positions 1-6 received the full prize amount
    // (positions 7-10 have 0 share but dust handling gives their portion to position 1)
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
    let time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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
    let time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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
    let time = (TEST_END_TIME() + MIN_SUBMISSION_PERIOD).into();
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
