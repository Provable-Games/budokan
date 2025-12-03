// SPDX-License-Identifier: BUSL-1.1

//! Pure calculation functions for distribution share computation.
//! These functions are stateless and can be used without the DistributionComponent.

use budokan_distribution::models::Distribution;

/// Calculate the distribution share for a given position in basis points
/// Returns the share (0-10000) for the specified position
///
/// # Arguments
/// * `distribution` - The distribution type to use
/// * `position` - 1-indexed position (1 = first place, 2 = second place, etc.)
/// * `total_positions` - Total number of positions to distribute across
/// * `available_share` - Total share to distribute in basis points (10000 = 100%)
/// * `custom_shares` - Optional span of shares for Custom distribution (must match total_positions)
///
/// # Returns
/// Share for the position in basis points
pub fn calculate_share(
    distribution: Distribution,
    position: u8,
    total_positions: u32,
    available_share: u16,
    custom_shares: Option<Span<u16>>,
) -> u16 {
    if position == 0 || position.into() > total_positions || available_share == 0 {
        return 0;
    }

    match distribution {
        Distribution::Linear => calculate_linear_share(position, total_positions, available_share),
        Distribution::Exponential(weight) => {
            calculate_exponential_share(position, total_positions, available_share, weight)
        },
        Distribution::Uniform => calculate_uniform_share(total_positions, available_share),
        Distribution::Custom => {
            match custom_shares {
                Option::Some(shares) => calculate_custom_share(position, shares),
                Option::None => 0 // No custom shares provided
            }
        },
    }
}

/// Calculate the sum of all position shares to verify they equal available_share
/// This is useful for validation and ensuring no rounding errors cause issues
/// Returns total in basis points
pub fn calculate_total(
    distribution: Distribution,
    total_positions: u32,
    available_share: u16,
    custom_shares: Option<Span<u16>>,
) -> u16 {
    let mut total: u16 = 0;
    let mut p: u32 = 1;
    loop {
        if p > total_positions {
            break;
        }
        total +=
            calculate_share(
                distribution,
                p.try_into().unwrap(),
                total_positions,
                available_share,
                custom_shares,
            );
        p += 1;
    }
    total
}

/// Calculate linear decreasing distribution
/// First place gets most, decreasing linearly to last place
/// Formula: position i gets (n - i + 1) shares out of sum(1..n)
/// Returns share in basis points
fn calculate_linear_share(position: u8, total_positions: u32, available_share: u16) -> u16 {
    // For linear distribution, position i gets (n - i + 1) shares out of sum(1..n)
    // sum(1..n) = n * (n + 1) / 2
    let n: u32 = total_positions;
    let total_shares: u32 = n * (n + 1) / 2;

    // Shares for this position = (n - position + 1)
    let position_shares: u32 = n - position.into() + 1;

    // Calculate share: (position_shares / total_shares) * available_share
    // Use u64 to avoid overflow
    let share: u64 = (position_shares.into() * available_share.into()) / total_shares.into();

    share.try_into().unwrap_or(0)
}

/// Calculate exponential distribution using the formula:
/// raw_share = available * (1 - (i-1)/positions)^weight
/// Then normalize all shares to sum to available_share
/// Returns share in basis points
fn calculate_exponential_share(
    position: u8, total_positions: u32, available_share: u16, weight: u8,
) -> u16 {
    // Use fixed-point arithmetic with 10000 as scale for precision (matches basis points)
    const SCALE: u64 = 10000;

    // For position i (1-indexed), calculate (1 - (i-1)/n)^weight
    // where i-1 because position 1 should get full weight
    let i: u64 = (position - 1).into();
    let n: u64 = total_positions.into();

    // Calculate (1 - i/n) * SCALE = (n - i) * SCALE / n
    let base_scaled: u64 = ((n - i) * SCALE) / n;

    // Calculate base^weight using repeated multiplication
    let raw_share = pow_scaled(base_scaled, weight.into(), SCALE);

    // Now we need to normalize: calculate total of all raw shares
    let mut total_raw: u64 = 0;
    let mut p: u32 = 1;
    loop {
        if p > total_positions {
            break;
        }
        let pi: u64 = (p - 1).into();
        let base_p: u64 = ((n - pi) * SCALE) / n;
        total_raw += pow_scaled(base_p, weight.into(), SCALE);
        p += 1;
    }

    if total_raw == 0 {
        return 0;
    }

    // Calculate this position's share of available_share
    let share: u64 = (raw_share * available_share.into()) / total_raw;

    share.try_into().unwrap_or(0)
}

/// Calculate uniform distribution - all positions get equal share
/// Returns share in basis points
fn calculate_uniform_share(total_positions: u32, available_share: u16) -> u16 {
    if total_positions == 0 {
        return 0;
    }
    // Each position gets available_share / total_positions
    let share: u32 = available_share.into() / total_positions;
    share.try_into().unwrap_or(0)
}

/// Calculate custom distribution share from provided shares array
/// Returns share in basis points
fn calculate_custom_share(position: u8, shares: Span<u16>) -> u16 {
    // Position is 1-indexed, array is 0-indexed
    let index: u32 = (position - 1).into();
    if index >= shares.len() {
        return 0;
    }
    let share: u16 = *shares.at(index);
    share
}

/// Calculate base^exp using fixed-point arithmetic
/// base is already scaled by SCALE
fn pow_scaled(base: u64, exp: u64, scale: u64) -> u64 {
    if exp == 0 {
        return scale;
    }

    let mut result: u64 = scale;
    let mut i: u64 = 0;
    loop {
        if i >= exp {
            break;
        }
        result = (result * base) / scale;
        i += 1;
    }

    result
}

#[cfg(test)]
mod tests {
    use budokan_distribution::models::{BASIS_POINTS, Distribution};
    use super::{calculate_share, calculate_total};

    #[test]
    fn test_linear_distribution_3_positions() {
        // With 3 positions: sum = 1+2+3 = 6
        // Position 1 gets 3/6 = 50%, Position 2 gets 2/6 = 33%, Position 3 gets 1/6 = 17%
        let dist = Distribution::Linear;

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS, Option::None);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS, Option::None);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS, Option::None);

        assert!(share1 == 5000, "Position 1 should get 50%"); // 5000 bp = 50%
        assert!(share2 == 3333, "Position 2 should get ~33%"); // 3333 bp = 33.33%
        assert!(share3 == 1666, "Position 3 should get ~17%"); // 1666 bp = 16.66%
    }

    #[test]
    fn test_uniform_distribution() {
        let dist = Distribution::Uniform;

        let share1 = calculate_share(dist, 1, 4, BASIS_POINTS, Option::None);
        let share2 = calculate_share(dist, 2, 4, BASIS_POINTS, Option::None);
        let share3 = calculate_share(dist, 3, 4, BASIS_POINTS, Option::None);
        let share4 = calculate_share(dist, 4, 4, BASIS_POINTS, Option::None);

        // Each position gets 10000 / 4 = 2500 bp (25%)
        assert!(share1 == 2500, "All positions should get 25%");
        assert!(share2 == 2500, "All positions should get 25%");
        assert!(share3 == 2500, "All positions should get 25%");
        assert!(share4 == 2500, "All positions should get 25%");
    }

    #[test]
    fn test_custom_distribution() {
        let custom_shares = array![5000_u16, 3000_u16, 2000_u16].span(); // 50%, 30%, 20%
        let dist = Distribution::Custom;

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS, Option::Some(custom_shares));
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS, Option::Some(custom_shares));
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS, Option::Some(custom_shares));

        assert!(share1 == 5000, "Position 1 should get 50%");
        assert!(share2 == 3000, "Position 2 should get 30%");
        assert!(share3 == 2000, "Position 3 should get 20%");
    }

    #[test]
    fn test_exponential_distribution() {
        let dist = Distribution::Exponential(2); // weight = 2

        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS, Option::None);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS, Option::None);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS, Option::None);

        // Position 1 should get more than linear, position 3 should get less
        assert!(share1 > share2, "Position 1 should get more than position 2");
        assert!(share2 > share3, "Position 2 should get more than position 3");
    }

    #[test]
    fn test_calculate_total_linear() {
        let dist = Distribution::Linear;
        let total = calculate_total(dist, 3, BASIS_POINTS, Option::None);
        // Due to rounding, total may be slightly less than BASIS_POINTS
        assert!(total >= 9900 && total <= BASIS_POINTS, "Total should be close to 100%");
    }

    #[test]
    fn test_calculate_total_uniform() {
        let dist = Distribution::Uniform;
        let total = calculate_total(dist, 4, BASIS_POINTS, Option::None);
        assert!(total == BASIS_POINTS, "Uniform total should be exactly 100%");
    }

    #[test]
    fn test_calculate_total_custom() {
        let custom_shares = array![5000_u16, 3000_u16, 2000_u16].span();
        let dist = Distribution::Custom;
        let total = calculate_total(dist, 3, BASIS_POINTS, Option::Some(custom_shares));
        assert!(total == BASIS_POINTS, "Custom total should be exactly 100%");
    }

    #[test]
    fn test_invalid_position_returns_zero() {
        let dist = Distribution::Linear;

        // Position 0 is invalid
        let share0 = calculate_share(dist, 0, 3, BASIS_POINTS, Option::None);
        assert!(share0 == 0, "Position 0 should return 0");

        // Position beyond total_positions is invalid
        let share4 = calculate_share(dist, 4, 3, BASIS_POINTS, Option::None);
        assert!(share4 == 0, "Position beyond total should return 0");
    }

    #[test]
    fn test_zero_available_share() {
        let dist = Distribution::Linear;
        let share = calculate_share(dist, 1, 3, 0, Option::None);
        assert!(share == 0, "Zero available share should return 0");
    }
}
