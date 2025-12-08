// SPDX-License-Identifier: BUSL-1.1

//! Pure calculation functions for distribution share computation.
//! These functions are stateless and can be used without the DistributionComponent.

use budokan_distribution::models::Distribution;
use math::{FixedTrait, ONE};

/// Calculate the distribution share for a given payout index in basis points
/// Returns the share (0-10000) for the specified payout index
///
/// # Arguments
/// * `distribution` - The distribution type to use (includes custom shares if Custom variant)
/// * `payout_index` - 1-indexed payout (1 = first payout, 2 = second payout, etc.)
/// * `total_payouts` - Total number of payouts to distribute across
/// * `available_share` - Total share to distribute in basis points (10000 = 100%)
///
/// # Returns
/// Share for the payout index in basis points
pub fn calculate_share(
    distribution: Distribution, payout_index: u32, total_payouts: u32, available_share: u16,
) -> u16 {
    if payout_index == 0 || payout_index > total_payouts || available_share == 0 {
        return 0;
    }

    match distribution {
        Distribution::Linear(weight) => {
            calculate_linear_share(payout_index, total_payouts, available_share, weight)
        },
        Distribution::Exponential(weight) => {
            calculate_exponential_share(payout_index, total_payouts, available_share, weight)
        },
        Distribution::Uniform => calculate_uniform_share(total_payouts, available_share),
        Distribution::Custom(shares) => calculate_custom_share(payout_index, shares),
    }
}

/// Calculate the sum of all payout shares to verify they equal available_share
/// This is useful for validation and ensuring no rounding errors cause issues
/// Returns total in basis points
pub fn calculate_total(
    distribution: Distribution, total_payouts: u32, available_share: u16,
) -> u16 {
    let mut total: u16 = 0;
    let mut p: u32 = 1;
    loop {
        if p > total_payouts {
            break;
        }
        total +=
            calculate_share(distribution, p.try_into().unwrap(), total_payouts, available_share);
        p += 1;
    }
    total
}

/// Calculate the rounding dust (difference between available_share and sum of all shares)
/// This dust should be added to the last payout to ensure 100% distribution
/// Returns the dust amount in basis points
pub fn calculate_dust(
    distribution: Distribution, total_payouts: u32, available_share: u16,
) -> u16 {
    let total = calculate_total(distribution, total_payouts, available_share);
    if total > available_share {
        // This shouldn't happen, but handle gracefully
        0
    } else {
        available_share - total
    }
}

/// Calculate share with dust allocation for payout_index 1 (winner)
/// This ensures that all available_share is distributed by giving the rounding remainder
/// to payout_index 1 (winner) (the winner). Use this for actual prize distribution to prevent stuck funds.
///
/// # Arguments
/// * `distribution` - The distribution type to use (includes custom shares if Custom variant)
/// * `payout_index` - 1-indexed payout (1 = first payout, 2 = second payout, etc.)
/// * `total_payouts` - Total number of payouts to distribute across
/// * `available_share` - Total share to distribute in basis points (10000 = 100%)
///
/// # Returns
/// Share for the payout index in basis points, with dust added to payout_index 1 (winner)
pub fn calculate_share_with_dust(
    distribution: Distribution, payout_index: u32, total_payouts: u32, available_share: u16,
) -> u16 {
    let base_share = calculate_share(distribution, payout_index, total_payouts, available_share);

    // If this is payout_index 1 (winner), add any rounding dust
    if payout_index == 1 {
        let dust = calculate_dust(distribution, total_payouts, available_share);
        base_share + dust
    } else {
        base_share
    }
}

/// Calculate linear decreasing distribution with weight
/// First place gets most, decreasing linearly to last payout
/// Formula: payout index i gets (n - i + 1)^(weight/10) shares
/// Weight is scaled by 10 (e.g., 10 = 1.0, 25 = 2.5, 100 = 10.0)
/// Returns share in basis points
fn calculate_linear_share(
    payout_index: u32, total_payouts: u32, available_share: u16, weight: u16,
) -> u16 {
    // For weighted linear distribution with fractional exponents:
    // Payout index i gets (n - i + 1)^(weight/10) shares
    // Weight = 10 (1.0): standard linear (1st=n, 2nd=n-1, ... last=1)
    // Weight = 20 (2.0): steeper (1st=n^2, 2nd=(n-1)^2, ... last=1)
    // Weight = 25 (2.5): fractional (1st=n^2.5, 2nd=(n-1)^2.5, ... last=1)

    let n: u32 = total_payouts;

    // Convert weight to fixed-point: weight / 10
    // Cubit uses 32.32 fixed point, so ONE = 2^32 = 4294967296
    let weight_fp = FixedTrait::new((weight.into() * ONE) / 10, false); // (weight * ONE) / 10

    // Calculate payout_value = (n - payout_index + 1)
    let payout_value: u32 = n - payout_index.into() + 1;
    let payout_value_fp = FixedTrait::new_unscaled(payout_value.into(), false);

    // Calculate payout_shares = payout_value^(weight/10) using Cubit's pow
    let payout_shares_fp = payout_value_fp.pow(weight_fp);

    // Calculate total_shares = sum of all payout powers
    let mut total_shares_fp = FixedTrait::ZERO();
    let mut pos: u32 = 1;
    loop {
        if pos > n {
            break;
        }
        let pos_fp = FixedTrait::new_unscaled(pos.into(), false);
        total_shares_fp = total_shares_fp + pos_fp.pow(weight_fp);
        pos += 1;
    }

    // Calculate share: (payout_shares / total_shares) * available_share
    let ratio_fp = payout_shares_fp / total_shares_fp;
    let available_fp = FixedTrait::new_unscaled(available_share.into(), false);
    let share_fp = ratio_fp * available_fp;

    // Convert back to u16
    let share_u64: u64 = share_fp.try_into().unwrap_or(0);
    share_u64.try_into().unwrap_or(0)
}

/// Calculate exponential distribution using the formula:
/// raw_share = available * (1 - (i-1)/positions)^(weight/10)
/// Weight is scaled by 10 (e.g., 10 = 1.0, 25 = 2.5, 100 = 10.0)
/// Then normalize all shares to sum to available_share
/// Returns share in basis points
fn calculate_exponential_share(
    payout_index: u32, total_payouts: u32, available_share: u16, weight: u16,
) -> u16 {
    // For payout_index i (1-indexed), calculate (1 - (i-1)/n)^(weight/10)
    // where i-1 because payout_index 1 (winner) should get full weight
    let i: u64 = (payout_index - 1).into();
    let n: u64 = total_payouts.into();

    // Convert weight to fixed-point: weight / 10
    let weight_fp = FixedTrait::new((weight.into() * ONE) / 10, false); // (weight * ONE) / 10

    // Calculate base = (1 - i/n) = (n - i) / n in fixed-point
    let numerator_fp = FixedTrait::new_unscaled(n - i, false);
    let denominator_fp = FixedTrait::new_unscaled(n, false);
    let base_fp = numerator_fp / denominator_fp;

    // Calculate base^(weight/10) using Cubit's pow
    let raw_share_fp = base_fp.pow(weight_fp);

    // Now we need to normalize: calculate total of all raw shares
    let mut total_raw_fp = FixedTrait::ZERO();
    let mut p: u32 = 1;
    loop {
        if p > total_payouts {
            break;
        }
        let pi: u64 = (p - 1).into();
        let num_fp = FixedTrait::new_unscaled(n - pi, false);
        let base_p_fp = num_fp / denominator_fp;
        total_raw_fp = total_raw_fp + base_p_fp.pow(weight_fp);
        p += 1;
    }

    // Calculate this payout's share of available_share
    let ratio_fp = raw_share_fp / total_raw_fp;
    let available_fp = FixedTrait::new_unscaled(available_share.into(), false);
    let share_fp = ratio_fp * available_fp;

    // Convert back to u16
    let share_u64: u64 = share_fp.try_into().unwrap_or(0);
    share_u64.try_into().unwrap_or(0)
}

/// Calculate uniform distribution - all payouts get equal share
/// Returns share in basis points
fn calculate_uniform_share(total_payouts: u32, available_share: u16) -> u16 {
    if total_payouts == 0 {
        return 0;
    }
    // Each payout gets available_share / total_payouts
    let share: u32 = available_share.into() / total_payouts;
    share.try_into().unwrap_or(0)
}

/// Calculate custom distribution share from provided shares array
/// Returns share in basis points
fn calculate_custom_share(payout_index: u32, shares: Span<u16>) -> u16 {
    // payout_index is 1-indexed, array is 0-indexed
    let index: u32 = payout_index - 1;
    if index >= shares.len() {
        return 0;
    }
    let share: u16 = *shares.at(index);
    share
}

#[cfg(test)]
mod tests {
    use budokan_distribution::models::{BASIS_POINTS, Distribution};
    use super::{calculate_dust, calculate_share, calculate_share_with_dust, calculate_total};

    #[test]
    fn test_linear_distribution_3_payouts() {
        // With 3 payouts and weight 10 (1.0): sum = 1+2+3 = 6
        // Payout index 1 gets 3/6 = 50%, Position 2 gets 2/6 = 33%, Position 3 gets 1/6 = 17%
        let dist = Distribution::Linear(10);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        assert!(share1 >= 4950 && share1 <= 5050, "Payout index 1 should get ~50%");
        assert!(share2 >= 3300 && share2 <= 3400, "Payout index 2 should get ~33%");
        assert!(share3 >= 1600 && share3 <= 1700, "Payout index 3 should get ~17%");
    }

    #[test]
    fn test_uniform_distribution() {
        let dist = Distribution::Uniform;

        let share1 = calculate_share(dist, 1, 4, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 4, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 4, BASIS_POINTS);
        let share4 = calculate_share(dist, 4, 4, BASIS_POINTS);

        // Each payout gets 10000 / 4 = 2500 bp (25%)
        assert!(share1 == 2500, "All payouts should get 25%");
        assert!(share2 == 2500, "All payouts should get 25%");
        assert!(share3 == 2500, "All payouts should get 25%");
        assert!(share4 == 2500, "All payouts should get 25%");
    }

    #[test]
    fn test_custom_distribution() {
        let dist = Distribution::Custom(
            array![5000_u16, 3000_u16, 2000_u16].span(),
        ); // 50%, 30%, 20%

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        assert!(share1 == 5000, "Payout index 1 should get 50%");
        assert!(share2 == 3000, "Payout index 2 should get 30%");
        assert!(share3 == 2000, "Payout index 3 should get 20%");
    }

    #[test]
    fn test_exponential_distribution_low_weight() {
        // Test with low weight (2) - should be close to linear
        let dist = Distribution::Exponential(2);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // Payout index 1 should get more than payout index 2, which gets more than payout index 3
        assert!(share1 > share2, "Payout index 1 should get more than payout index 2");
        assert!(share2 > share3, "Payout index 2 should get more than payout index 3");

        // Total should sum to approximately 100%
        let total = share1 + share2 + share3;
        assert!(total >= 9900 && total <= BASIS_POINTS, "Total should be close to 100%");
    }

    #[test]
    fn test_exponential_distribution_medium_weight() {
        // Test with medium weight (50) - moderate steepness
        let dist = Distribution::Exponential(50);

        let share1 = calculate_share(dist, 1, 5, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 5, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 5, BASIS_POINTS);
        let share4 = calculate_share(dist, 4, 5, BASIS_POINTS);
        let share5 = calculate_share(dist, 5, 5, BASIS_POINTS);

        // Verify decreasing shares - payout index 1 should get most
        assert!(share1 > share2, "Payout index 1 > Payout index 2");
        assert!(share1 > share3, "Payout index 1 > Payout index 3");
        assert!(share1 > share4, "Payout index 1 > Payout index 4");
        assert!(share1 > share5, "Payout index 1 > Payout index 5");

        // Payout index 1 should get significantly more than last payout
        assert!(share1 > share5 * 10, "Payout index 1 should get >10x payout index 5 with weight 50");

        // Total should sum to approximately 100%
        let total = share1 + share2 + share3 + share4 + share5;
        assert!(total >= 9900 && total <= BASIS_POINTS, "Total should be close to 100%");
    }

    #[test]
    fn test_exponential_distribution_high_weight() {
        // Test with high weight (90) - very steep distribution
        let dist = Distribution::Exponential(90);

        let share1 = calculate_share(dist, 1, 5, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 5, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 5, BASIS_POINTS);
        let share4 = calculate_share(dist, 4, 5, BASIS_POINTS);
        let share5 = calculate_share(dist, 5, 5, BASIS_POINTS);

        // Verify payout index 1 gets most
        assert!(share1 > share2, "Payout index 1 > Payout index 2");
        assert!(share1 > share3, "Payout index 1 > Payout index 3");
        assert!(share1 > share5, "Payout index 1 > Payout index 5");

        // With high weight, payout index 1 should dominate
        assert!(share1 > 7000, "High weight should give payout index 1 >70%");

        // Lower payout indices should get very small shares
        assert!(share5 < 100, "Payout index 5 should get <1% with high weight");

        // Total should sum to approximately 100%
        let total = share1 + share2 + share3 + share4 + share5;
        assert!(total >= 9900 && total <= BASIS_POINTS, "Total should be close to 100%");
    }

    #[test]
    fn test_exponential_weight_1() {
        // Weight 1 should give linear-like distribution
        let dist = Distribution::Exponential(1);

        let share1 = calculate_share(dist, 1, 4, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 4, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 4, BASIS_POINTS);
        let share4 = calculate_share(dist, 4, 4, BASIS_POINTS);

        // Weight 1 means no exponentiation, so shares decrease linearly
        assert!(share1 > share2, "Payout index 1 > Payout index 2");
        assert!(share2 > share3, "Payout index 2 > Payout index 3");
        assert!(share3 > share4, "Payout index 3 > Payout index 4");

        // Total should sum to approximately 100%
        let total = share1 + share2 + share3 + share4;
        assert!(total >= 9900 && total <= BASIS_POINTS, "Total should be close to 100%");
    }

    #[test]
    fn test_exponential_weight_100() {
        // Weight 1000 (100.0) - extremely steep
        let dist = Distribution::Exponential(1000);

        let share1 = calculate_share(dist, 1, 10, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 10, BASIS_POINTS);
        let share10 = calculate_share(dist, 10, 10, BASIS_POINTS);

        // Payout index 1 should get almost everything
        assert!(share1 > 9000, "Weight 100 should give payout index 1 >90%");

        // Payout index 2 should still get something, but very little
        assert!(share2 < 1000, "Payout index 2 should get <10%");

        // Last payout should get negligible amount
        assert!(share10 < 10, "Payout index 10 should get <0.1%");
    }

    #[test]
    fn test_calculate_total_linear() {
        let dist = Distribution::Linear(1);
        let total = calculate_total(dist, 3, BASIS_POINTS);
        // Due to rounding, total may be slightly less than BASIS_POINTS
        assert!(total >= 9900 && total <= BASIS_POINTS, "Total should be close to 100%");
    }

    #[test]
    fn test_calculate_total_uniform() {
        let dist = Distribution::Uniform;
        let total = calculate_total(dist, 4, BASIS_POINTS);
        assert!(total == BASIS_POINTS, "Uniform total should be exactly 100%");
    }

    #[test]
    fn test_calculate_total_custom() {
        let dist = Distribution::Custom(array![5000_u16, 3000_u16, 2000_u16].span());
        let total = calculate_total(dist, 3, BASIS_POINTS);
        assert!(total == BASIS_POINTS, "Custom total should be exactly 100%");
    }

    #[test]
    fn test_invalid_payout_index_returns_zero() {
        let dist = Distribution::Linear(1);

        // Payout index 0 is invalid
        let share0 = calculate_share(dist, 0, 3, BASIS_POINTS);
        assert!(share0 == 0, "Payout index 0 should return 0");

        // Payout index beyond total_payouts is invalid
        let share4 = calculate_share(dist, 4, 3, BASIS_POINTS);
        assert!(share4 == 0, "Payout index beyond total should return 0");
    }

    #[test]
    fn test_zero_available_share() {
        let dist = Distribution::Linear(1);
        let share = calculate_share(dist, 1, 3, 0);
        assert!(share == 0, "Zero available share should return 0");
    }

    #[test]
    fn test_linear_distribution_10_payouts() {
        // Test linear with 10 payouts to verify the formula works with larger numbers
        let dist = Distribution::Linear(10); // weight 1.0

        let share1 = calculate_share(dist, 1, 10, BASIS_POINTS);
        let share5 = calculate_share(dist, 5, 10, BASIS_POINTS);
        let share10 = calculate_share(dist, 10, 10, BASIS_POINTS);

        // Verify decreasing pattern
        assert!(share1 > share5, "Payout index 1 should get more than payout index 5");
        assert!(share5 > share10, "Payout index 5 should get more than payout index 10");

        // Payout index 1 gets 10/55 ≈ 18.18%
        assert!(share1 >= 1800 && share1 <= 1820, "Payout index 1 should get ~18.18%");

        // Payout index 10 gets 1/55 ≈ 1.82%
        assert!(share10 >= 180 && share10 <= 200, "Payout index 10 should get ~1.82%");

        // Verify total sums correctly
        let total = calculate_total(dist, 10, BASIS_POINTS);
        assert!(total >= 9900 && total <= BASIS_POINTS, "Total should be close to 100%");
    }

    #[test]
    fn test_linear_distribution_exact_values() {
        // Test with 5 payouts: sum = 1+2+3+4+5 = 15
        let dist = Distribution::Linear(10); // weight 1.0

        let share1 = calculate_share(dist, 1, 5, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 5, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 5, BASIS_POINTS);
        let share4 = calculate_share(dist, 4, 5, BASIS_POINTS);
        let share5 = calculate_share(dist, 5, 5, BASIS_POINTS);

        // Payout index 1: 5/15 = 33.33%
        assert!(share1 >= 3330 && share1 <= 3340, "Payout index 1 should get ~33.33%");
        // Payout index 2: 4/15 = 26.67%
        assert!(share2 >= 2660 && share2 <= 2670, "Payout index 2 should get ~26.67%");
        // Payout index 3: 3/15 = 20%
        assert!(share3 >= 1995 && share3 <= 2005, "Payout index 3 should get ~20%");
        // Payout index 4: 2/15 = 13.33%
        assert!(share4 >= 1330 && share4 <= 1340, "Payout index 4 should get ~13.33%");
        // Payout index 5: 1/15 = 6.67%
        assert!(share5 >= 665 && share5 <= 670, "Payout index 5 should get ~6.67%");
    }

    #[test]
    fn test_uniform_distribution_10_payouts() {
        let dist = Distribution::Uniform;

        // Each payout gets 10000 / 10 = 1000 bp (10%)
        let share1 = calculate_share(dist, 1, 10, BASIS_POINTS);
        let share5 = calculate_share(dist, 5, 10, BASIS_POINTS);
        let share10 = calculate_share(dist, 10, 10, BASIS_POINTS);

        assert!(share1 == 1000, "Each payout should get exactly 10%");
        assert!(share5 == 1000, "Each payout should get exactly 10%");
        assert!(share10 == 1000, "Each payout should get exactly 10%");

        // Total should be exact
        let total = calculate_total(dist, 10, BASIS_POINTS);
        assert!(total == BASIS_POINTS, "Uniform total should be exactly 100%");
    }

    #[test]
    fn test_uniform_distribution_odd_payouts() {
        let dist = Distribution::Uniform;

        // 10000 / 3 = 3333 with remainder, so each gets 3333
        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        assert!(share1 == 3333, "Each payout should get 3333 bp");
        assert!(share2 == 3333, "Each payout should get 3333 bp");
        assert!(share3 == 3333, "Each payout should get 3333 bp");

        // Total will be 9999 due to integer division
        let total = calculate_total(dist, 3, BASIS_POINTS);
        assert!(total == 9999, "Total should be 9999 due to rounding");
    }

    #[test]
    fn test_custom_distribution_exact_100_percent() {
        // Test custom shares that sum to exactly 10000 (100%)
        let dist = Distribution::Custom(array![4000_u16, 3000_u16, 2000_u16, 1000_u16].span());

        let share1 = calculate_share(dist, 1, 4, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 4, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 4, BASIS_POINTS);
        let share4 = calculate_share(dist, 4, 4, BASIS_POINTS);

        assert!(share1 == 4000, "Payout index 1 should get 40%");
        assert!(share2 == 3000, "Payout index 2 should get 30%");
        assert!(share3 == 2000, "Payout index 3 should get 20%");
        assert!(share4 == 1000, "Payout index 4 should get 10%");

        let total = calculate_total(dist, 4, BASIS_POINTS);
        assert!(total == BASIS_POINTS, "Total should be exactly 100%");
    }

    #[test]
    fn test_custom_distribution_unequal_shares() {
        // Test custom shares with unequal distribution
        let dist = Distribution::Custom(array![9000_u16, 500_u16, 300_u16, 200_u16].span());

        let share1 = calculate_share(dist, 1, 4, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 4, BASIS_POINTS);
        let share4 = calculate_share(dist, 4, 4, BASIS_POINTS);

        assert!(share1 == 9000, "Payout index 1 gets 90%");
        assert!(share2 == 500, "Position 2 gets 5%");
        assert!(share4 == 200, "Position 4 gets 2%");
    }

    #[test]
    fn test_partial_available_share() {
        // Test when available_share is less than 10000 (partial distribution)
        let dist = Distribution::Linear(10); // weight 1.0
        let available = 5000_u16; // Only 50% to distribute

        let share1 = calculate_share(dist, 1, 3, available);
        let share2 = calculate_share(dist, 2, 3, available);
        let _share3 = calculate_share(dist, 3, 3, available);

        // Payout index 1: 3/6 * 5000 = 2500 (25% of total)
        assert!(share1 == 2500, "Payout index 1 should get 25% when available is 50%");
        // Payout index 2: 2/6 * 5000 = 1666 (16.66% of total)
        assert!(share2 >= 1666 && share2 <= 1667, "Payout index 2 should get ~16.67%");

        let total = calculate_total(dist, 3, available);
        assert!(total >= 4900 && total <= available, "Total should be close to available");
    }

    #[test]
    fn test_exponential_different_payout_counts() {
        let dist = Distribution::Exponential(10);

        // Test with 2 payouts
        let share1_2pos = calculate_share(dist, 1, 2, BASIS_POINTS);
        let share2_2pos = calculate_share(dist, 2, 2, BASIS_POINTS);
        assert!(share1_2pos > share2_2pos, "Payout index 1 > Payout index 2 with 2 payouts");
        let total_2pos = share1_2pos + share2_2pos;
        assert!(total_2pos >= 9900 && total_2pos <= BASIS_POINTS, "Total should be close to 100%");

        // Test with 20 payouts
        let share1_20pos = calculate_share(dist, 1, 20, BASIS_POINTS);
        let share10_20pos = calculate_share(dist, 10, 20, BASIS_POINTS);
        let share20_20pos = calculate_share(dist, 20, 20, BASIS_POINTS);

        assert!(share1_20pos > share10_20pos, "Position 1 > Position 10 with 20 payouts");
        assert!(share10_20pos > share20_20pos, "Position 10 > Position 20 with 20 payouts");
    }

    #[test]
    fn test_linear_weight_1_standard() {
        // Weight 10 = 1.0 gives standard linear distribution
        let dist = Distribution::Linear(10);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // With weight=1.0: 1st=3, 2nd=2, 3rd=1, total=6
        assert!(share1 >= 4950 && share1 <= 5050, "Weight 1.0: Payout index 1 gets ~50%");
        assert!(share2 >= 3300 && share2 <= 3400, "Weight 1.0: Position 2 gets ~33%");
        assert!(share3 >= 1600 && share3 <= 1700, "Weight 1.0: Position 3 gets ~17%");
    }

    #[test]
    fn test_linear_weight_2_steeper() {
        // Weight 20 = 2.0 makes distribution steeper (squares the values)
        let dist = Distribution::Linear(20);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // With weight=2.0: 1st=9, 2nd=4, 3rd=1, total=14
        // 1st = 9/14 ≈ 64.3%, 2nd = 4/14 ≈ 28.6%, 3rd = 1/14 ≈ 7.1%
        assert!(share1 >= 6350 && share1 <= 6500, "Weight 2.0: Payout index 1 gets ~64%");
        assert!(share2 >= 2800 && share2 <= 2950, "Weight 2.0: Position 2 gets ~29%");
        assert!(share3 >= 650 && share3 <= 800, "Weight 2.0: Position 3 gets ~7%");

        // Verify payout index 1 gets much more with weight 2.0 than weight 1.0
        let dist1 = Distribution::Linear(10);
        let share1_w1 = calculate_share(dist1, 1, 3, BASIS_POINTS);
        assert!(share1 > share1_w1, "Higher weight gives payout index 1 more");
    }

    #[test]
    fn test_linear_weight_5_very_steep() {
        // Weight 50 = 5.0 creates very steep distribution
        let dist = Distribution::Linear(50);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // With weight=5.0: 1st=3^5=243, 2nd=2^5=32, 3rd=1^5=1, total=276
        // 1st = 243/276 ≈ 88%, 2nd = 32/276 ≈ 11.6%, 3rd = 1/276 ≈ 0.4%
        assert!(share1 >= 8750 && share1 <= 8900, "Weight 5.0: Position 1 dominates with ~88%");
        assert!(share2 >= 1100 && share2 <= 1250, "Weight 5.0: Position 2 gets ~12%");
        assert!(share3 >= 20 && share3 <= 100, "Weight 5.0: Position 3 gets negligible");

        // Position 1 should get much more than payout index 2
        assert!(share1 > share2 * 7, "Payout index 1 gets >7x more than payout index 2");
    }

    #[test]
    fn test_compare_exponential_weights() {
        // Compare how different weights affect payout index 1 with 5 total payouts
        let weight_low = Distribution::Exponential(2);
        let weight_medium = Distribution::Exponential(10);
        let weight_high = Distribution::Exponential(30);

        let share1_low = calculate_share(weight_low, 1, 5, BASIS_POINTS);
        let share1_medium = calculate_share(weight_medium, 1, 5, BASIS_POINTS);
        let share1_high = calculate_share(weight_high, 1, 5, BASIS_POINTS);

        // Higher weight should give payout index 1 more
        assert!(
            share1_low < share1_medium, "Medium weight should give more to payout_index 1 (winner) than low",
        );
        assert!(
            share1_medium < share1_high, "High weight should give more to payout_index 1 (winner) than medium",
        );

        // Verify the progression makes sense
        assert!(share1_low < 5000, "Low weight (2) should give payout index 1 <50%");
        assert!(
            share1_medium > share1_low + 200, "Medium weight should give notably more than low",
        );
        assert!(
            share1_high > share1_medium + 200, "High weight should give notably more than medium",
        );
    }

    #[test]
    fn test_distribution_with_single_payout() {
        // When there's only 1 payout, it should get everything
        let linear = Distribution::Linear(1);
        let uniform = Distribution::Uniform;
        let exponential = Distribution::Exponential(50);

        let linear_share = calculate_share(linear, 1, 1, BASIS_POINTS);
        let uniform_share = calculate_share(uniform, 1, 1, BASIS_POINTS);
        let exp_share = calculate_share(exponential, 1, 1, BASIS_POINTS);

        assert!(linear_share == BASIS_POINTS, "Linear: Single payout gets 100%");
        assert!(uniform_share == BASIS_POINTS, "Uniform: Single payout gets 100%");
        assert!(exp_share == BASIS_POINTS, "Exponential: Single payout gets 100%");
    }

    // ============================================================================
    // DUST HANDLING TESTS - Critical for preventing stuck funds in contract
    // ============================================================================

    #[test]
    fn test_dust_calculation_linear() {
        // Linear with 3 payouts should have minimal dust
        let dist = Distribution::Linear(1);
        let dust = calculate_dust(dist, 3, BASIS_POINTS);

        // Verify dust is small (less than number of payouts)
        assert!(dust < 3, "Dust should be less than number of payouts");

        // Verify total + dust = 100%
        let total = calculate_total(dist, 3, BASIS_POINTS);
        assert!(total + dust == BASIS_POINTS, "Total + dust must equal 100%");
    }

    #[test]
    fn test_dust_calculation_uniform_with_rounding() {
        // Uniform with 3 payouts: 10000 / 3 = 3333 each, dust = 1
        let dist = Distribution::Uniform;
        let dust = calculate_dust(dist, 3, BASIS_POINTS);

        assert!(dust == 1, "Uniform with 3 payouts should have 1 bp dust");

        let total = calculate_total(dist, 3, BASIS_POINTS);
        assert!(total + dust == BASIS_POINTS, "Total + dust must equal 100%");
    }

    #[test]
    fn test_dust_calculation_exponential() {
        // Exponential distributions will likely have dust due to rounding
        let dist = Distribution::Exponential(50);
        let dust = calculate_dust(dist, 5, BASIS_POINTS);

        // Verify dust exists and is reasonable
        assert!(dust <= 100, "Dust should be small (<1%)");

        let total = calculate_total(dist, 5, BASIS_POINTS);
        assert!(total + dust == BASIS_POINTS, "Total + dust must equal 100%");
    }

    #[test]
    fn test_share_with_dust_ensures_exact_100_percent() {
        // Test that using calculate_share_with_dust gives exactly 100%
        let distributions = array![
            Distribution::Linear(1), Distribution::Uniform, Distribution::Exponential(10),
            Distribution::Exponential(50), Distribution::Exponential(90),
        ];

        let mut i = 0;
        loop {
            if i >= distributions.len() {
                break;
            }
            let dist = *distributions.at(i);

            // Test with 5 payouts
            let mut total: u16 = 0;
            let mut p: u32 = 1;
            loop {
                if p > 5 {
                    break;
                }
                total += calculate_share_with_dust(dist, p.try_into().unwrap(), 5, BASIS_POINTS);
                p += 1;
            }

            assert!(total == BASIS_POINTS, "With dust, total must be exactly 100%");
            i += 1;
        };
    }

    #[test]
    fn test_share_with_dust_last_position_gets_bonus() {
        // Verify that payout index 1 gets the dust
        let dist = Distribution::Uniform;
        let total_payouts = 3_u32;

        let share1 = calculate_share_with_dust(dist, 1, total_payouts, BASIS_POINTS);
        let share2 = calculate_share_with_dust(dist, 2, total_payouts, BASIS_POINTS);
        let share3 = calculate_share_with_dust(dist, 3, total_payouts, BASIS_POINTS);

        // Payout index 2 and 3 get 3333, payout index 1 gets 3333 + 1 (dust) = 3334
        assert!(share1 == 3334, "Payout index 1 gets base share + dust");
        assert!(share2 == 3333, "Position 2 gets base share");
        assert!(share3 == 3333, "Position 3 gets base share");

        assert!(share1 + share2 + share3 == BASIS_POINTS, "Total must be exactly 100%");
    }

    #[test]
    fn test_linear_with_dust_small_positions() {
        // Test linear distribution with small payout counts (removed large counts due to gas
        // limits)
        let dist = Distribution::Linear(10); // weight 1.0

        // Test with 3, 5, 7 positions (smaller set to avoid running out of gas)
        let position_counts = array![3_u32, 5, 7];

        let mut i = 0;
        loop {
            if i >= position_counts.len() {
                break;
            }
            let positions = *position_counts.at(i);

            let mut total: u16 = 0;
            let mut p: u32 = 1;
            loop {
                if p > positions {
                    break;
                }
                total +=
                    calculate_share_with_dust(dist, p.try_into().unwrap(), positions, BASIS_POINTS);
                p += 1;
            }

            assert!(total == BASIS_POINTS, "Linear with dust must sum to 100%");
            i += 1;
        };
    }

    // ============ Gas Comparison Tests ============

    /// Old integer-only pow implementation for comparison
    fn pow_int_only(base: u64, exp: u64) -> u64 {
        if exp == 0 {
            return 1;
        }
        let mut result: u64 = 1;
        let mut i: u64 = 0;
        loop {
            if i >= exp {
                break;
            }
            result *= base;
            i += 1;
        }
        result
    }

    #[test]
    fn test_gas_comparison_integer_weight() {
        // Compare gas usage for integer weight (2.0) using both methods
        // Old method: simple integer exponentiation
        // New method: fixed-point with fractional support

        // Old way: Calculate 3^2 directly
        let base_old = 3_u64;
        let exp_old = 2_u64;
        let result_old = pow_int_only(base_old, exp_old);

        // New way: Use fixed-point for same calculation
        let dist_new = Distribution::Linear(20); // weight 2.0
        let share_new = calculate_share(dist_new, 1, 3, BASIS_POINTS);

        // Both should produce similar results
        assert!(result_old == 9, "Old method: 3^2 = 9");
        assert!(share_new >= 6350 && share_new <= 6500, "New method produces similar distribution");
        // NOTE: Check l2_gas in test output to compare:
    // - Old method would use minimal gas (simple multiplication loop)
    // - New method uses more gas (fixed-point pow with exp/ln)
    // The tradeoff: New method supports fractional exponents like 1.5, 2.5, etc.
    }

    #[test]
    fn test_fractional_weight_benefit() {
        // Demonstrate the benefit: fractional weights provide finer control
        // This is IMPOSSIBLE with integer-only exponentiation

        let weight_15 = Distribution::Linear(15); // 1.5 - between 1.0 and 2.0
        let weight_25 = Distribution::Linear(25); // 2.5 - between 2.0 and 3.0

        let share_15 = calculate_share(weight_15, 1, 3, BASIS_POINTS);
        let share_25 = calculate_share(weight_25, 1, 3, BASIS_POINTS);

        // Verify these produce intermediate values
        let weight_10 = Distribution::Linear(10); // 1.0
        let weight_20 = Distribution::Linear(20); // 2.0
        let weight_30 = Distribution::Linear(30); // 3.0

        let share_10 = calculate_share(weight_10, 1, 3, BASIS_POINTS);
        let share_20 = calculate_share(weight_20, 1, 3, BASIS_POINTS);
        let share_30 = calculate_share(weight_30, 1, 3, BASIS_POINTS);

        // Weight 1.5 should be between 1.0 and 2.0
        assert!(share_15 > share_10 && share_15 < share_20, "1.5 is between 1.0 and 2.0");

        // Weight 2.5 should be between 2.0 and 3.0
        assert!(share_25 > share_20 && share_25 < share_30, "2.5 is between 2.0 and 3.0");
        // This smooth gradient is the key benefit of the fixed-point approach!
    }

    #[test]
    fn test_exponential_with_dust_various_weights() {
        // Test exponential with different weights (scaled by 10) to ensure 100% distribution
        let weights = array![
            10_u16, 50, 100, 200, 500, 900, 1000,
        ]; // 1.0, 5.0, 10.0, 20.0, 50.0, 90.0, 100.0
        let positions = 10_u32;

        let mut i = 0;
        loop {
            if i >= weights.len() {
                break;
            }
            let weight = *weights.at(i);
            let dist = Distribution::Exponential(weight);

            let mut total: u16 = 0;
            let mut p: u32 = 1;
            loop {
                if p > positions {
                    break;
                }
                total +=
                    calculate_share_with_dust(dist, p.try_into().unwrap(), positions, BASIS_POINTS);
                p += 1;
            }

            assert!(total == BASIS_POINTS, "Exponential with dust must sum to 100%");
            i += 1;
        };
    }

    #[test]
    fn test_dust_with_partial_available_share() {
        // Test that dust handling works with partial shares (not just BASIS_POINTS)
        let dist = Distribution::Linear(1);
        let available = 5000_u16; // Only 50% to distribute

        let mut total: u16 = 0;
        let mut p: u32 = 1;
        loop {
            if p > 3 {
                break;
            }
            total += calculate_share_with_dust(dist, p.try_into().unwrap(), 3, available);
            p += 1;
        }

        assert!(total == available, "Total must equal available share exactly");
    }

    #[test]
    fn test_custom_distribution_with_dust() {
        // Custom distributions that don't sum to exactly 100% should get dust added
        let dist = Distribution::Custom(
            array![4000_u16, 3000_u16, 2999_u16].span(),
        ); // Sums to 9999

        let share1 = calculate_share_with_dust(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share_with_dust(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share_with_dust(dist, 3, 3, BASIS_POINTS);

        // Position 1 should get 4000 + 1 (dust) = 4001
        assert!(share1 == 4001, "Payout index 1 gets base share + dust");
        assert!(share2 == 3000, "Position 2 gets base share");
        assert!(share3 == 2999, "Position 3 gets base share");

        assert!(share1 + share2 + share3 == BASIS_POINTS, "Total must be exactly 100%");
    }

    #[test]
    fn test_no_dust_when_exact() {
        // Uniform with 4 positions: 10000 / 4 = 2500 exactly, no dust
        let dist = Distribution::Uniform;
        let dust = calculate_dust(dist, 4, BASIS_POINTS);

        assert!(dust == 0, "Should have no dust with perfect division");
    }

    #[test]
    fn test_dust_never_exceeds_positions() {
        // Dust should always be less than number of payouts (worst case for linear/uniform)
        let distributions = array![
            (Distribution::Linear(1), 10_u32), (Distribution::Uniform, 7),
            (Distribution::Exponential(50), 15),
        ];

        let mut i = 0;
        loop {
            if i >= distributions.len() {
                break;
            }
            let (dist, positions) = *distributions.at(i);
            let dust = calculate_dust(dist, positions, BASIS_POINTS);

            assert!(
                dust <= positions.try_into().unwrap(), "Dust should not exceed number of payouts",
            );
            i += 1;
        };
    }

    // ============ Fractional Weight Tests ============

    #[test]
    fn test_debug_linear_weight_10() {
        // Debug test to see actual values
        let dist = Distribution::Linear(10);
        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // Print values
        println!("Weight 10 (1.0): share1={}, share2={}, share3={}", share1, share2, share3);

        // Basic sanity checks
        assert!(share1 > share2, "Payout index 1 > Payout index 2");
        assert!(share2 > share3, "Payout index 2 > Payout index 3");
        let total = share1 + share2 + share3;
        assert!(total >= 9900 && total <= 10100, "Total should be ~100%");
    }

    #[test]
    fn test_linear_fractional_weight_1_5() {
        // Weight 15 = 1.5 - fractional exponent between 1.0 and 2.0
        let dist = Distribution::Linear(15);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // With weight=1.5: 1st=3^1.5≈5.2, 2nd=2^1.5≈2.8, 3rd=1^1.5=1, total≈9
        // 1st ≈ 57.7%, 2nd ≈ 31.1%, 3rd ≈ 11.1%
        assert!(share1 >= 5650 && share1 <= 5850, "Weight 1.5: Payout index 1 gets ~58%");
        assert!(share2 >= 3000 && share2 <= 3200, "Weight 1.5: Position 2 gets ~31%");
        assert!(share3 >= 1050 && share3 <= 1250, "Weight 1.5: Position 3 gets ~11%");

        // Should be between weight 1.0 and weight 2.0
        let dist_1 = Distribution::Linear(10);
        let dist_2 = Distribution::Linear(20);
        let share1_w1 = calculate_share(dist_1, 1, 3, BASIS_POINTS);
        let share1_w2 = calculate_share(dist_2, 1, 3, BASIS_POINTS);

        assert!(share1 > share1_w1, "Weight 1.5 > Weight 1.0");
        assert!(share1 < share1_w2, "Weight 1.5 < Weight 2.0");
    }

    #[test]
    fn test_linear_fractional_weight_2_5() {
        // Weight 25 = 2.5 - fractional exponent
        let dist = Distribution::Linear(25);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // With weight=2.5: 1st=3^2.5≈15.6, 2nd=2^2.5≈5.7, 3rd=1^2.5=1, total≈22.3
        // 1st ≈ 70%, 2nd ≈ 25.4%, 3rd ≈ 4.5%
        assert!(share1 >= 6900 && share1 <= 7100, "Weight 2.5: Payout index 1 gets ~70%");
        assert!(share2 >= 2450 && share2 <= 2650, "Weight 2.5: Position 2 gets ~25%");
        assert!(share3 >= 400 && share3 <= 600, "Weight 2.5: Position 3 gets ~5%");
    }

    #[test]
    fn test_exponential_fractional_weight_1_5() {
        // Weight 15 = 1.5 for exponential distribution
        let dist = Distribution::Exponential(15);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // For exponential: (1-(i-1)/n)^weight
        // Payout index 1: (1-0/3)^1.5 = 1^1.5 = 1.0
        // Payout index 2: (1-1/3)^1.5 ≈ 0.544
        // Payout index 3: (1-2/3)^1.5 ≈ 0.192
        // After normalization: 1st≈57.5%, 2nd≈31.3%, 3rd≈11.1%
        assert!(share1 >= 5650 && share1 <= 5850, "Exp weight 1.5: Payout index 1 gets ~58%");
        assert!(share2 >= 3000 && share2 <= 3250, "Exp weight 1.5: Position 2 gets ~31%");
        assert!(share3 >= 1050 && share3 <= 1250, "Exp weight 1.5: Position 3 gets ~11%");

        // Should be between weight 1.0 and weight 2.0
        let dist_1 = Distribution::Exponential(10);
        let dist_2 = Distribution::Exponential(20);
        let share1_w1 = calculate_share(dist_1, 1, 3, BASIS_POINTS);
        let share1_w2 = calculate_share(dist_2, 1, 3, BASIS_POINTS);

        assert!(share1 > share1_w1, "Weight 1.5 > Weight 1.0");
        assert!(share1 < share1_w2, "Weight 1.5 < Weight 2.0");
    }

    #[test]
    fn test_exponential_fractional_weight_2_5() {
        // Weight 25 = 2.5 for exponential distribution
        let dist = Distribution::Exponential(25);

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        // Position 1 should get majority of the distribution with higher weight
        assert!(share1 >= 6500 && share1 <= 7500, "Exp weight 2.5: Position 1 dominates");
        assert!(share2 >= 2000 && share2 <= 3000, "Exp weight 2.5: Position 2 gets moderate");
        assert!(share3 >= 300 && share3 <= 1000, "Exp weight 2.5: Position 3 gets small");

        // Total should be 100%
        let total = share1 + share2 + share3;
        assert!(total >= 9900 && total <= 10100, "Total should be ~100%");
    }

    #[test]
    fn test_fractional_weights_monotonic() {
        // Test that fractional weights create smooth gradients
        // As weight increases from 1.0 to 3.0 in 0.5 steps, payout index 1 share should increase
        let weights = array![10, 15, 20, 25, 30]; // 1.0, 1.5, 2.0, 2.5, 3.0
        let mut prev_share = 0;

        let mut i = 0;
        loop {
            if i >= weights.len() {
                break;
            }
            let weight = *weights.at(i);
            let dist = Distribution::Linear(weight);
            let share = calculate_share(dist, 1, 5, BASIS_POINTS);

            if prev_share > 0 {
                assert!(share > prev_share, "Higher weight should give payout index 1 more");
            }
            prev_share = share;
            i += 1;
        };
    }
}
