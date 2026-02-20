// SPDX-License-Identifier: UNLICENSED
//
// Gas cost stress tests for finalize_leaderboard_batch.
//
// Uses snforge's `store` and `map_entry_address` cheatcodes to directly populate
// registration entries and mock scores, then measures the cost of batched
// leaderboard finalization.

use budokan::tests::constants::{OWNER, TEST_END_TIME};
use budokan::tests::helpers::create_basic_tournament;
use budokan_interfaces::budokan::IBudokanDispatcherTrait;
use snforge_std::{
    map_entry_address, start_cheat_block_timestamp, start_cheat_caller_address,
    stop_cheat_block_timestamp, stop_cheat_caller_address, store,
};
use super::test_budokan::setup;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/// Populate `token_context_id` mapping for fake tokens.
fn populate_token_context(budokan_addr: starknet::ContractAddress, tournament_id: u64, count: u32) {
    let mut i: u32 = 0;
    while i < count {
        let token_id: felt252 = (0x100000 + count - i).into();
        let addr = map_entry_address(selector!("token_context_id"), array![token_id].span());
        store(budokan_addr, addr, array![tournament_id.into()].span());
        i += 1;
    };
}

/// Populate the minigame mock's `scores` storage for the fake tokens.
/// Scores are descending: highest score for position 0.
fn populate_mock_scores(minigame_addr: starknet::ContractAddress, count: u32) {
    let mut i: u32 = 0;
    while i < count {
        let token_id: felt252 = (0x100000 + count - i).into();
        let score: u64 = ((count - i) * 100).into();

        let score_addr = map_entry_address(selector!("scores"), array![token_id].span());
        store(minigame_addr, score_addr, array![score.into()].span());

        let game_over_addr = map_entry_address(selector!("game_over"), array![token_id].span());
        store(minigame_addr, game_over_addr, array![1].span()); // true
        i += 1;
    };
}

/// Build a pre-sorted token_ids array (descending score order).
fn build_sorted_token_ids(count: u32) -> Array<felt252> {
    let mut token_ids = ArrayTrait::new();
    let mut i: u32 = 0;
    while i < count {
        let token_id: felt252 = (0x100000 + count - i).into();
        token_ids.append(token_id);
        i += 1;
    }
    token_ids
}

/// Shared test body: create tournament, pre-populate registrations and scores,
/// then call finalize_leaderboard_batch.
fn run_finalize_leaderboard_batch(count: u32) {
    let contracts = setup();
    let owner = OWNER;
    let budokan_addr = contracts.budokan.contract_address;
    let minigame_addr = contracts.minigame.contract_address;

    start_cheat_caller_address(budokan_addr, owner);
    let tournament = create_basic_tournament(contracts.budokan, minigame_addr);

    // Populate fake registrations (token_context_id) and mock scores
    populate_token_context(budokan_addr, tournament.id, count);
    populate_mock_scores(minigame_addr, count);

    // Advance to finalized phase
    let finalized_time: u64 = TEST_END_TIME();
    start_cheat_block_timestamp(budokan_addr, finalized_time);
    start_cheat_block_timestamp(minigame_addr, finalized_time);

    // Build sorted token_ids array and finalize
    let token_ids = build_sorted_token_ids(count);
    contracts.budokan.finalize_leaderboard_batch(tournament.id, token_ids.span());

    // Verify leaderboard
    let leaderboard = contracts.budokan.get_leaderboard(tournament.id);
    assert!(leaderboard.len() == count, "Leaderboard should have N entries");

    stop_cheat_caller_address(budokan_addr);
    stop_cheat_block_timestamp(budokan_addr);
    stop_cheat_block_timestamp(minigame_addr);
}

// ---------------------------------------------------------------------------
// 10 entries (sanity check)
// ---------------------------------------------------------------------------

#[test]
fn test_stress_finalize_leaderboard_10() {
    run_finalize_leaderboard_batch(10);
}
