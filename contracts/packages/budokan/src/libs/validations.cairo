// SPDX-License-Identifier: BUSL-1.1

//! Pure validation functions for tournament operations
//! These functions operate only on inputs without any storage access

use core::num::traits::Zero;
use game_components_utilities::distribution::structs::BASIS_POINTS;
use starknet::ContractAddress;

/// Validates that entry fee shares don't exceed 100% (BASIS_POINTS)
/// Returns true if valid, false otherwise
pub fn validate_entry_fee_shares(
    tournament_creator_share: u16, game_creator_share: u16, refund_share: u16,
) -> bool {
    tournament_creator_share + game_creator_share + refund_share <= BASIS_POINTS
}

/// Asserts that entry fee shares don't exceed 100%
pub fn assert_valid_entry_fee_shares(
    tournament_creator_share: u16, game_creator_share: u16, refund_share: u16,
) {
    assert!(
        validate_entry_fee_shares(tournament_creator_share, game_creator_share, refund_share),
        "Budokan: Entry fee shares exceed 100%",
    );
}

/// Validates the position-distribution config against the share split.
/// `distribution_count = 0` means "dynamic — use the actual leaderboard size
/// at payout time" and is valid whenever any pool exists. The only invalid
/// combo is a non-zero `distribution_count` when there's no pool to
/// distribute (the slots would all compute to 0, polluting claim UIs and
/// indexed data).
pub fn validate_entry_fee_distribution_count(
    tournament_creator_share: u16,
    game_creator_share: u16,
    refund_share: u16,
    distribution_count: u32,
) -> bool {
    if distribution_count == 0 {
        return true;
    }
    let shares_total: u32 = tournament_creator_share.into()
        + game_creator_share.into()
        + refund_share.into();
    shares_total < BASIS_POINTS.into()
}

/// Asserts the position-distribution config matches the share split.
pub fn assert_valid_entry_fee_distribution_count(
    tournament_creator_share: u16,
    game_creator_share: u16,
    refund_share: u16,
    distribution_count: u32,
) {
    assert!(
        validate_entry_fee_distribution_count(
            tournament_creator_share, game_creator_share, refund_share, distribution_count,
        ),
        "Budokan: distribution_count > 0 requires a non-zero prize pool",
    );
}

/// Validates that a position is within valid range (1 to winner_count inclusive)
pub fn validate_position(position: u32, winner_count: u32) -> bool {
    position > 0 && position <= winner_count
}

/// Asserts that a position is valid
pub fn assert_position_is_valid(position: u32, winner_count: u32) {
    assert!(validate_position(position, winner_count), "Budokan: Invalid position");
}

/// Validates that a payout index is valid (must be > 0)
pub fn validate_payout_index(payout_index: u32) -> bool {
    payout_index > 0
}

/// Asserts that a payout index is valid
pub fn assert_payout_index_is_valid(payout_index: u32) {
    assert!(validate_payout_index(payout_index), "Budokan: Payout index must be greater than zero");
}

/// Checks if an address is contained in a span of addresses
pub fn contains_address(addresses: Span<ContractAddress>, target: ContractAddress) -> bool {
    let mut i: u32 = 0;
    let len = addresses.len();
    loop {
        if i >= len {
            break false;
        }
        if *addresses.at(i) == target {
            break true;
        }
        i += 1;
    }
}

/// Validates that a prize exists (token address is not zero)
pub fn validate_prize_exists(token_address: ContractAddress) -> bool {
    !token_address.is_zero()
}

/// Asserts that a prize exists
pub fn assert_prize_exists(token_address: ContractAddress, prize_id: u64) {
    assert!(validate_prize_exists(token_address), "Budokan: Prize key {} does not exist", prize_id);
}

#[cfg(test)]
mod tests {
    use super::{
        contains_address, validate_entry_fee_distribution_count, validate_entry_fee_shares,
        validate_position,
    };

    #[test]
    fn test_validate_entry_fee_shares_valid() {
        // 50% + 30% + 20% = 100%
        assert!(validate_entry_fee_shares(5000, 3000, 2000));
    }

    #[test]
    fn test_validate_entry_fee_shares_under_100() {
        // 30% + 20% = 50%
        assert!(validate_entry_fee_shares(3000, 2000, 0));
    }

    #[test]
    fn test_validate_entry_fee_shares_exceeds_100() {
        // 60% + 50% = 110%
        assert!(!validate_entry_fee_shares(6000, 5000, 0));
    }

    #[test]
    fn test_validate_entry_fee_shares_all_zero() {
        assert!(validate_entry_fee_shares(0, 0, 0));
    }

    #[test]
    fn test_validate_distribution_count_pool_with_slots() {
        // 90% shares → 10% pool, 3 fixed slots: OK
        assert!(validate_entry_fee_distribution_count(3000, 3000, 3000, 3));
    }

    #[test]
    fn test_validate_distribution_count_no_shares_with_slots() {
        // 0% shares → full pool, 10 slots: OK
        assert!(validate_entry_fee_distribution_count(0, 0, 0, 10));
    }

    #[test]
    fn test_validate_distribution_count_pool_with_dynamic_count() {
        // Non-zero pool + count=0 (dynamic, uses leaderboard size): OK
        assert!(validate_entry_fee_distribution_count(1000, 500, 0, 0));
        assert!(validate_entry_fee_distribution_count(0, 0, 0, 0));
    }

    #[test]
    fn test_validate_distribution_count_full_shares_zero_count() {
        // 100% shares → no pool, count=0: OK
        assert!(validate_entry_fee_distribution_count(5000, 5000, 0, 0));
        // 5% game + 95% refund, count=0: OK (nothing to distribute)
        assert!(validate_entry_fee_distribution_count(0, 500, 9500, 0));
    }

    #[test]
    fn test_validate_distribution_count_full_shares_with_slots() {
        // 100% shares + 10 slots = invalid (slots would all compute to 0)
        assert!(!validate_entry_fee_distribution_count(0, 500, 9500, 10));
        assert!(!validate_entry_fee_distribution_count(5000, 5000, 0, 1));
    }

    #[test]
    fn test_validate_position_valid() {
        assert!(validate_position(1, 10));
        assert!(validate_position(5, 10));
        assert!(validate_position(10, 10));
    }

    #[test]
    fn test_validate_position_invalid_zero() {
        assert!(!validate_position(0, 10));
    }

    #[test]
    fn test_validate_position_invalid_exceeds() {
        assert!(!validate_position(11, 10));
    }

    #[test]
    fn test_contains_address_found() {
        let addr1 = 0x1.try_into().unwrap();
        let addr2 = 0x2.try_into().unwrap();
        let addr3 = 0x3.try_into().unwrap();
        let addresses = array![addr1, addr2, addr3].span();

        assert!(contains_address(addresses, addr2));
    }

    #[test]
    fn test_contains_address_not_found() {
        let addr1 = 0x1.try_into().unwrap();
        let addr2 = 0x2.try_into().unwrap();
        let addr3 = 0x3.try_into().unwrap();
        let addr4 = 0x4.try_into().unwrap();
        let addresses = array![addr1, addr2, addr3].span();

        assert!(!contains_address(addresses, addr4));
    }

    #[test]
    fn test_contains_address_empty() {
        let addr = 0x1.try_into().unwrap();
        let addresses: Span<starknet::ContractAddress> = array![].span();

        assert!(!contains_address(addresses, addr));
    }
}
