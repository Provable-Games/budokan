// SPDX-License-Identifier: BUSL-1.1

//! Pure validation functions for tournament operations
//! These functions operate only on inputs without any storage access

use budokan_distribution::models::BASIS_POINTS;
use core::num::traits::Zero;
use starknet::ContractAddress;

/// Validates that entry fee shares don't exceed 100% (BASIS_POINTS)
/// Returns true if valid, false otherwise
pub fn validate_entry_fee_shares(
    tournament_creator_share: Option<u16>,
    game_creator_share: Option<u16>,
    refund_share: Option<u16>,
) -> bool {
    let mut total_shares: u16 = 0;

    if let Option::Some(share) = tournament_creator_share {
        total_shares += share;
    }

    if let Option::Some(share) = game_creator_share {
        total_shares += share;
    }

    if let Option::Some(share) = refund_share {
        total_shares += share;
    }

    total_shares <= BASIS_POINTS
}

/// Asserts that entry fee shares don't exceed 100%
pub fn assert_valid_entry_fee_shares(
    tournament_creator_share: Option<u16>,
    game_creator_share: Option<u16>,
    refund_share: Option<u16>,
) {
    assert!(
        validate_entry_fee_shares(tournament_creator_share, game_creator_share, refund_share),
        "Budokan: Entry fee shares exceed 100%",
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
        assert_position_is_valid, assert_valid_entry_fee_shares, contains_address,
        validate_entry_fee_shares, validate_position,
    };
    use starknet::contract_address_const;

    #[test]
    fn test_validate_entry_fee_shares_valid() {
        // 50% + 30% + 20% = 100%
        assert!(
            validate_entry_fee_shares(
                Option::Some(5000), Option::Some(3000), Option::Some(2000),
            ),
        );
    }

    #[test]
    fn test_validate_entry_fee_shares_under_100() {
        // 30% + 20% = 50%
        assert!(validate_entry_fee_shares(Option::Some(3000), Option::Some(2000), Option::None));
    }

    #[test]
    fn test_validate_entry_fee_shares_exceeds_100() {
        // 60% + 50% = 110%
        assert!(!validate_entry_fee_shares(Option::Some(6000), Option::Some(5000), Option::None));
    }

    #[test]
    fn test_validate_entry_fee_shares_all_none() {
        assert!(validate_entry_fee_shares(Option::None, Option::None, Option::None));
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
        let addr1 = contract_address_const::<0x1>();
        let addr2 = contract_address_const::<0x2>();
        let addr3 = contract_address_const::<0x3>();
        let addresses = array![addr1, addr2, addr3].span();

        assert!(contains_address(addresses, addr2));
    }

    #[test]
    fn test_contains_address_not_found() {
        let addr1 = contract_address_const::<0x1>();
        let addr2 = contract_address_const::<0x2>();
        let addr3 = contract_address_const::<0x3>();
        let addr4 = contract_address_const::<0x4>();
        let addresses = array![addr1, addr2, addr3].span();

        assert!(!contains_address(addresses, addr4));
    }

    #[test]
    fn test_contains_address_empty() {
        let addr = contract_address_const::<0x1>();
        let addresses: Span<starknet::ContractAddress> = array![].span();

        assert!(!contains_address(addresses, addr));
    }
}
