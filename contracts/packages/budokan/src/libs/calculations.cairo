// SPDX-License-Identifier: BUSL-1.1

//! Pure calculation functions for tournament operations
//! These functions operate only on inputs without any storage access

use budokan_distribution::models::BASIS_POINTS;

/// Calculate payout amount from basis points and total value
/// Returns: (basis_points * total_value) / BASIS_POINTS
pub fn calculate_payout(basis_points: u128, total_value: u128) -> u128 {
    (basis_points * total_value) / BASIS_POINTS.into()
}

/// Calculate the remaining share after subtracting fixed shares
/// Returns the share available for distribution (in basis points)
pub fn calculate_remaining_share(
    tournament_creator_share: Option<u16>,
    game_creator_share: Option<u16>,
    refund_share: Option<u16>,
) -> u16 {
    let mut total_fixed: u16 = 0;

    if let Option::Some(share) = tournament_creator_share {
        total_fixed += share;
    }

    if let Option::Some(share) = game_creator_share {
        total_fixed += share;
    }

    if let Option::Some(share) = refund_share {
        total_fixed += share;
    }

    if total_fixed >= BASIS_POINTS {
        0
    } else {
        BASIS_POINTS - total_fixed
    }
}

/// Determine the effective payout count for distribution
/// If distribution_count is set (non-zero), use it; otherwise use actual count
pub fn effective_payout_count(distribution_count: u32, actual_count: u32) -> u32 {
    if distribution_count == 0 {
        actual_count
    } else {
        distribution_count
    }
}

#[cfg(test)]
mod tests {
    use super::{calculate_payout, calculate_remaining_share, effective_payout_count};

    #[test]
    fn test_calculate_payout_full() {
        // 100% of 1000 = 1000
        let result = calculate_payout(10000, 1000);
        assert!(result == 1000, "expected 1000");
    }

    #[test]
    fn test_calculate_payout_half() {
        // 50% of 1000 = 500
        let result = calculate_payout(5000, 1000);
        assert!(result == 500, "expected 500");
    }

    #[test]
    fn test_calculate_payout_quarter() {
        // 25% of 1000 = 250
        let result = calculate_payout(2500, 1000);
        assert!(result == 250, "expected 250");
    }

    #[test]
    fn test_calculate_payout_zero() {
        let result = calculate_payout(0, 1000);
        assert!(result == 0, "expected 0");
    }

    #[test]
    fn test_calculate_remaining_share_all_none() {
        let result = calculate_remaining_share(Option::None, Option::None, Option::None);
        assert!(result == 10000, "expected 10000 (100%)");
    }

    #[test]
    fn test_calculate_remaining_share_partial() {
        // 30% + 20% = 50%, so 50% remaining
        let result = calculate_remaining_share(
            Option::Some(3000), Option::Some(2000), Option::None,
        );
        assert!(result == 5000, "expected 5000 (50%)");
    }

    #[test]
    fn test_calculate_remaining_share_full() {
        // 40% + 35% + 25% = 100%, so 0% remaining
        let result = calculate_remaining_share(
            Option::Some(4000), Option::Some(3500), Option::Some(2500),
        );
        assert!(result == 0, "expected 0");
    }

    #[test]
    fn test_calculate_remaining_share_exceeds() {
        // 60% + 50% = 110%, should clamp to 0
        let result = calculate_remaining_share(
            Option::Some(6000), Option::Some(5000), Option::None,
        );
        assert!(result == 0, "expected 0 when exceeds");
    }

    #[test]
    fn test_effective_payout_count_dynamic() {
        // distribution_count = 0 means use actual count
        let result = effective_payout_count(0, 15);
        assert!(result == 15, "expected 15");
    }

    #[test]
    fn test_effective_payout_count_fixed() {
        // distribution_count > 0 means use fixed count
        let result = effective_payout_count(10, 15);
        assert!(result == 10, "expected 10");
    }
}
