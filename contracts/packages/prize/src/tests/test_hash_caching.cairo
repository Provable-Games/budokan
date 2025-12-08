// SPDX-License-Identifier: BUSL-1.1

/// Hash caching gas tests for PrizeComponent
/// These tests measure the gas savings from using pre-computed hashes
/// instead of computing the hash multiple times per operation.
///
/// Gas Comparison Summary:
/// ----------------------
/// Before optimization: hash_prize_type() called for each operation
///   - check if claimed: 1 hash computation
///   - set claimed: 1 hash computation
///   - assert not claimed + set: 2 hash computations
///
/// After optimization: hash computed once and reused via _by_hash functions
///   - check + set claimed: 1 hash computation (50% reduction)
///   - multiple operations: 1 hash computation (N times fewer)
///
/// Note: Poseidon hash computation is relatively cheap on Starknet, but
/// avoiding redundant computations still saves gas in hot paths.

use budokan_prize::models::PrizeType;
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use starknet::ContractAddress;

#[starknet::interface]
trait IPrizeMock<TContractState> {
    fn hash_prize_type(self: @TContractState, prize_type: PrizeType) -> felt252;
    fn is_claimed(self: @TContractState, context_id: u64, prize_type: PrizeType) -> bool;
    fn is_claimed_by_hash(self: @TContractState, context_id: u64, prize_type_hash: felt252) -> bool;
    fn set_claimed(ref self: TContractState, context_id: u64, prize_type: PrizeType);
    fn set_claimed_by_hash(ref self: TContractState, context_id: u64, prize_type_hash: felt252);
    fn check_and_set_claimed_no_cache(
        ref self: TContractState, context_id: u64, prize_type: PrizeType,
    ) -> bool;
    fn check_and_set_claimed_with_cache(
        ref self: TContractState, context_id: u64, prize_type: PrizeType,
    ) -> bool;
}

fn deploy_mock() -> IPrizeMockDispatcher {
    let contract_class = declare("PrizeMock").expect('declare failed').contract_class();
    let (contract_address, _) = contract_class.deploy(@array![]).expect('deploy failed');
    IPrizeMockDispatcher { contract_address }
}

/// Test gas for computing hash (baseline)
#[test]
fn test_gas_hash_computation() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC20Position((1, 1));
    let hash = mock.hash_prize_type(prize_type);

    // Verify hash is non-zero
    assert!(hash != 0, "hash should be non-zero");
}

/// Test gas for is_claimed (computes hash internally)
#[test]
fn test_gas_is_claimed_with_hash_computation() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC20Position((1, 1));
    let is_claimed = mock.is_claimed(1, prize_type);

    assert!(!is_claimed, "should not be claimed initially");
}

/// Test gas for is_claimed_by_hash (uses pre-computed hash)
#[test]
fn test_gas_is_claimed_with_precomputed_hash() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC20Position((1, 1));
    let hash = mock.hash_prize_type(prize_type);
    let is_claimed = mock.is_claimed_by_hash(1, hash);

    assert!(!is_claimed, "should not be claimed initially");
}

/// Test gas for set_claimed (computes hash internally)
#[test]
fn test_gas_set_claimed_with_hash_computation() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC20Position((1, 1));
    mock.set_claimed(1, prize_type);

    // Verify it was set
    assert!(mock.is_claimed(1, prize_type), "should be claimed");
}

/// Test gas for set_claimed_by_hash (uses pre-computed hash)
#[test]
fn test_gas_set_claimed_with_precomputed_hash() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC20Position((1, 1));
    let hash = mock.hash_prize_type(prize_type);
    mock.set_claimed_by_hash(1, hash);

    // Verify it was set
    assert!(mock.is_claimed_by_hash(1, hash), "should be claimed");
}

/// Test gas for check+set WITHOUT hash caching (2 hash computations)
/// This is the pattern that was common before the optimization
#[test]
fn test_gas_check_and_set_no_cache() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC20Position((1, 1));
    let was_claimed = mock.check_and_set_claimed_no_cache(1, prize_type);

    assert!(!was_claimed, "should not have been claimed");
    assert!(mock.is_claimed(1, prize_type), "should now be claimed");
}

/// Test gas for check+set WITH hash caching (1 hash computation)
/// This is the optimized pattern
#[test]
fn test_gas_check_and_set_with_cache() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC20Position((1, 1));
    let was_claimed = mock.check_and_set_claimed_with_cache(1, prize_type);

    assert!(!was_claimed, "should not have been claimed");
    assert!(mock.is_claimed(1, prize_type), "should now be claimed");
}

/// Test multiple operations with hash caching
/// Simulates claiming multiple positions for the same prize
#[test]
fn test_gas_multiple_claims_no_cache() {
    let mock = deploy_mock();

    // Claim 5 different positions (computes hash 5 times for set_claimed)
    mock.set_claimed(1, PrizeType::ERC20Position((1, 1)));
    mock.set_claimed(1, PrizeType::ERC20Position((1, 2)));
    mock.set_claimed(1, PrizeType::ERC20Position((1, 3)));
    mock.set_claimed(1, PrizeType::ERC20Position((1, 4)));
    mock.set_claimed(1, PrizeType::ERC20Position((1, 5)));

    // Verify all claimed
    assert!(mock.is_claimed(1, PrizeType::ERC20Position((1, 1))), "pos 1 should be claimed");
    assert!(mock.is_claimed(1, PrizeType::ERC20Position((1, 5))), "pos 5 should be claimed");
}

/// Test multiple operations with hash caching
/// Same as above but uses pre-computed hashes
#[test]
fn test_gas_multiple_claims_with_cache() {
    let mock = deploy_mock();

    // Pre-compute all hashes
    let hash1 = mock.hash_prize_type(PrizeType::ERC20Position((1, 1)));
    let hash2 = mock.hash_prize_type(PrizeType::ERC20Position((1, 2)));
    let hash3 = mock.hash_prize_type(PrizeType::ERC20Position((1, 3)));
    let hash4 = mock.hash_prize_type(PrizeType::ERC20Position((1, 4)));
    let hash5 = mock.hash_prize_type(PrizeType::ERC20Position((1, 5)));

    // Claim 5 different positions using pre-computed hashes
    mock.set_claimed_by_hash(1, hash1);
    mock.set_claimed_by_hash(1, hash2);
    mock.set_claimed_by_hash(1, hash3);
    mock.set_claimed_by_hash(1, hash4);
    mock.set_claimed_by_hash(1, hash5);

    // Verify all claimed
    assert!(mock.is_claimed_by_hash(1, hash1), "pos 1 should be claimed");
    assert!(mock.is_claimed_by_hash(1, hash5), "pos 5 should be claimed");
}

/// Test with complex PrizeType (ERC721 has more data to hash)
#[test]
fn test_gas_complex_prize_type() {
    let mock = deploy_mock();

    let prize_type = PrizeType::ERC721((999, 12345));
    let hash = mock.hash_prize_type(prize_type);

    mock.set_claimed_by_hash(1, hash);
    assert!(mock.is_claimed_by_hash(1, hash), "should be claimed");
}
