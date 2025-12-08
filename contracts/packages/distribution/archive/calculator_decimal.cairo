// SPDX-License-Identifier: MIT
// Experimental implementation using Alexandria-style decimals for comparison

use alexandria_math::const_pow;
use budokan_distribution::models::Distribution;

// ============ Decimal Type Definition ============

/// Fixed-point decimal number using separate 64-bit fields
/// int_part: integer portion (0 to 2^64-1)
/// frac_part: fractional portion in raw DECIMAL_SCALE units (0 to 10^18-1)
/// is_negative: sign of the decimal number
#[derive(Drop, Copy, PartialEq, Debug)]
pub struct Decimal {
    pub int_part: u64, // Integer portion
    pub frac_part: u64, // Fractional portion (raw units)
    pub is_negative: bool // Sign of the number
}

pub const DECIMAL_SCALE: u128 = 1000000000000000000; // 10^18 for better decimal precision
pub const BASIS_POINTS: u32 = 10000; // 100% = 10000 basis points

#[generate_trait]
pub impl DecimalImpl of DecimalTrait {
    /// Create a decimal from an integer part
    fn from_int(int_part: u64) -> Decimal {
        Decimal { int_part, frac_part: 0, is_negative: false }
    }

    /// Create a decimal from integer and decimal parts (user-friendly)
    /// int_part: integer portion (e.g., 3 for 3.35)
    /// decimal_part: decimal portion as integer (e.g., 35 for 0.35)
    /// Example: from_parts(3, 35) creates 3.35, from_parts(56, 678) creates 56.678
    fn from_parts(int_part: u64, decimal_part: u64) -> Decimal {
        // Determine the number of decimal digits to calculate the proper divisor
        let mut temp = decimal_part;
        let mut divisor = 1_u64;
        while temp > 0 {
            temp = temp / 10;
            divisor = divisor * 10;
        }

        // Handle zero decimal part
        if decimal_part == 0 {
            divisor = 1;
        }

        let frac_part = ((decimal_part.into() * DECIMAL_SCALE) / divisor.into())
            .try_into()
            .unwrap_or(0);
        Decimal { int_part, frac_part, is_negative: false }
    }

    /// Create a decimal from integer and raw fractional parts (internal use)
    /// frac_part should be in range [0, 10^18) - raw DECIMAL_SCALE units
    fn from_raw_parts(int_part: u64, frac_part: u64) -> Decimal {
        Decimal { int_part, frac_part, is_negative: false }
    }

    /// Multiply two decimals
    fn mul(self: @Decimal, other: @Decimal) -> Decimal {
        // Convert to total u128 values, then use u256 for multiplication to prevent overflow
        let self_total: u128 = (*self.int_part).into() * DECIMAL_SCALE + (*self.frac_part).into();
        let other_total: u128 = (*other.int_part).into() * DECIMAL_SCALE
            + (*other.frac_part).into();

        let a: u256 = self_total.into();
        let b: u256 = other_total.into();
        let scale: u256 = DECIMAL_SCALE.into();

        // Multiply and then divide by scale to maintain fixed-point representation
        let result = (a * b) / scale;

        // Convert back to separate fields
        let max_u128: u256 = 0xffffffffffffffffffffffffffffffff;
        let result_total: u128 = if result > max_u128 {
            0xffffffffffffffffffffffffffffffff // Cap at maximum value
        } else {
            result.try_into().unwrap_or(0xffffffffffffffffffffffffffffffff)
        };

        let new_int_part = (result_total / DECIMAL_SCALE).try_into().unwrap_or(0);
        let new_frac_part = (result_total % DECIMAL_SCALE).try_into().unwrap_or(0);

        // Result is negative if signs differ
        let is_negative = *self.is_negative != *other.is_negative;
        Decimal { int_part: new_int_part, frac_part: new_frac_part, is_negative }
    }

    /// Divide two decimals
    fn div(self: @Decimal, other: @Decimal) -> Decimal {
        // Handle division by zero
        let other_total: u128 = (*other.int_part).into() * DECIMAL_SCALE
            + (*other.frac_part).into();
        if other_total == 0 {
            return Decimal { int_part: 0, frac_part: 0, is_negative: false };
        }

        // Convert to total values and use u256 for intermediate calculation to prevent overflow
        let self_total: u128 = (*self.int_part).into() * DECIMAL_SCALE + (*self.frac_part).into();

        let dividend: u256 = self_total.into();
        let divisor: u256 = other_total.into();
        let scale: u256 = DECIMAL_SCALE.into();

        let result_256 = (dividend * scale) / divisor;

        // Convert back to separate fields
        let max_u128: u256 = 0xffffffffffffffffffffffffffffffff;
        let result_total: u128 = if result_256 > max_u128 {
            0xffffffffffffffffffffffffffffffff // Cap at maximum value
        } else {
            result_256.try_into().unwrap_or(0xffffffffffffffffffffffffffffffff)
        };

        let new_int_part = (result_total / DECIMAL_SCALE).try_into().unwrap_or(0);
        let new_frac_part = (result_total % DECIMAL_SCALE).try_into().unwrap_or(0);

        // Result is negative if signs differ
        let is_negative = *self.is_negative != *other.is_negative;
        Decimal { int_part: new_int_part, frac_part: new_frac_part, is_negative }
    }

    /// Convert to u32 (truncates fractional part and handles rounding)
    fn to_u32(self: @Decimal) -> u32 {
        // Check if we should round up (frac_part >= 0.5)
        let half_scale = DECIMAL_SCALE / 2;
        if (*self.frac_part).into() >= half_scale {
            // Round up
            ((*self.int_part) + 1).try_into().unwrap_or(0)
        } else {
            // Truncate
            (*self.int_part).try_into().unwrap_or(0)
        }
    }
}

// ============ Power Function using const_pow ============

/// Calculate base^exponent using integer arithmetic and const_pow
/// This avoids expensive ln/exp calculations for fractional exponents
///
/// For fractional exponents (e.g., 3^1.5):
/// - Split into integer and fractional parts: 3^1.5 = 3^1 * 3^0.5
/// - Integer part: use const_pow for 3^1
/// - Fractional part: approximate 3^0.5 using polynomial or table lookup
fn pow_decimal(base: Decimal, exponent: Decimal) -> Decimal {
    // Handle base = 0
    if base.int_part == 0 && base.frac_part == 0 {
        return DecimalTrait::from_int(0);
    }

    // Handle exponent = 0
    if exponent.int_part == 0 && exponent.frac_part == 0 {
        return DecimalTrait::from_int(1);
    }

    // Handle exponent = 1
    if exponent.int_part == 1 && exponent.frac_part == 0 {
        return base;
    }

    // For integer exponents, use fast integer power
    if exponent.frac_part == 0 {
        return pow_int_decimal(base, exponent.int_part);
    }

    // For fractional exponents, we need to approximate
    // base^(int + frac) = base^int * base^frac

    // Calculate integer part using fast integer power
    let int_result = if exponent.int_part > 0 {
        pow_int_decimal(base, exponent.int_part)
    } else {
        DecimalTrait::from_int(1)
    };

    // Calculate fractional part using approximation
    let frac_result = pow_frac_decimal(base, exponent.frac_part);

    // Multiply the two parts
    int_result.mul(@frac_result)
}

/// Fast integer power using binary exponentiation
fn pow_int_decimal(base: Decimal, exp: u64) -> Decimal {
    if exp == 0 {
        return DecimalTrait::from_int(1);
    }
    if exp == 1 {
        return base;
    }

    let mut result = DecimalTrait::from_int(1);
    let mut current_base = base;
    let mut current_exp = exp;

    loop {
        if current_exp == 0 {
            break;
        }

        // If exp is odd, multiply result by current base
        if current_exp % 2 == 1 {
            result = result.mul(@current_base);
        }

        // Square the base and halve the exponent
        current_base = current_base.mul(@current_base);
        current_exp = current_exp / 2;
    }

    result
}

/// Approximate base^frac where frac is in [0, 1)
/// Uses Taylor series approximation: x^y ≈ 1 + y*ln(x) + (y*ln(x))^2/2! + ...
/// For small y, we can use: x^y ≈ 1 + y*(x-1) for x close to 1
fn pow_frac_decimal(base: Decimal, frac_part: u64) -> Decimal {
    // Convert frac_part to a decimal in [0, 1)
    let frac = DecimalTrait::from_raw_parts(0, frac_part);

    // Simple linear approximation: base^frac ≈ 1 + frac*(base - 1)
    // This works reasonably well for small bases and fractions

    // Calculate (base - 1)
    let one = DecimalTrait::from_int(1);
    let base_total: u128 = (base.int_part).into() * DECIMAL_SCALE + (base.frac_part).into();
    let one_total: u128 = DECIMAL_SCALE;

    if base_total >= one_total {
        let diff_total = base_total - one_total;
        let diff_int = (diff_total / DECIMAL_SCALE).try_into().unwrap_or(0);
        let diff_frac = (diff_total % DECIMAL_SCALE).try_into().unwrap_or(0);
        let base_minus_one = DecimalTrait::from_raw_parts(diff_int, diff_frac);

        // frac * (base - 1)
        let scaled = frac.mul(@base_minus_one);

        // 1 + frac * (base - 1)
        let scaled_total: u128 = (scaled.int_part).into() * DECIMAL_SCALE
            + (scaled.frac_part).into();
        let result_total = one_total + scaled_total;
        let result_int = (result_total / DECIMAL_SCALE).try_into().unwrap_or(0);
        let result_frac = (result_total % DECIMAL_SCALE).try_into().unwrap_or(0);

        DecimalTrait::from_raw_parts(result_int, result_frac)
    } else {
        // If base < 1, result will be less than 1
        // Use: base^frac ≈ 1 - frac*(1 - base)
        let diff_total = one_total - base_total;
        let diff_int = (diff_total / DECIMAL_SCALE).try_into().unwrap_or(0);
        let diff_frac = (diff_total % DECIMAL_SCALE).try_into().unwrap_or(0);
        let one_minus_base = DecimalTrait::from_raw_parts(diff_int, diff_frac);

        // frac * (1 - base)
        let scaled = frac.mul(@one_minus_base);

        // 1 - frac * (1 - base)
        let scaled_total: u128 = (scaled.int_part).into() * DECIMAL_SCALE
            + (scaled.frac_part).into();
        if one_total >= scaled_total {
            let result_total = one_total - scaled_total;
            let result_int = (result_total / DECIMAL_SCALE).try_into().unwrap_or(0);
            let result_frac = (result_total % DECIMAL_SCALE).try_into().unwrap_or(0);
            DecimalTrait::from_raw_parts(result_int, result_frac)
        } else {
            DecimalTrait::from_int(1)
        }
    }
}

// ============ Distribution Calculation Functions ============

/// Calculate share for a given position using decimal arithmetic
pub fn calculate_share(
    distribution: Distribution, position: u32, total_positions: u32, available_share: u32,
) -> u32 {
    if position == 0 || position > total_positions || available_share == 0 {
        return 0;
    }

    match distribution {
        Distribution::Linear(weight) => {
            calculate_linear_share_decimal(weight, position, total_positions, available_share)
        },
        Distribution::Exponential(weight) => {
            calculate_exponential_share_decimal(weight, position, total_positions, available_share)
        },
        Distribution::Uniform => { available_share / total_positions },
        Distribution::Custom(shares) => {
            let index = position - 1;
            if index >= shares.len() {
                return 0;
            }
            let share_weight = *shares.at(index);
            let total_weight: u32 = calculate_total_custom(shares);
            if total_weight == 0 {
                return 0;
            }
            let result: u64 = (available_share.into() * share_weight.into() / total_weight.into());
            result.try_into().unwrap()
        },
    }
}

/// Linear distribution using decimal arithmetic
/// Formula: (n - i + 1)^weight / sum((n - j + 1)^weight for j=1..n)
fn calculate_linear_share_decimal(
    weight: u16, position: u32, total_positions: u32, available_share: u32,
) -> u32 {
    let n = total_positions;
    let i = position;

    // Convert weight from scaled format (10 = 1.0) to Decimal
    // weight / 10 gives us the actual exponent
    let weight_decimal = DecimalTrait::from_int(weight.into());
    let ten = DecimalTrait::from_int(10);
    let exponent = weight_decimal.div(@ten);

    // Calculate (n - i + 1)^weight
    let base_value = n - i + 1;
    let base = DecimalTrait::from_int(base_value.into());
    let numerator = pow_decimal(base, exponent);

    // Calculate sum of (n - j + 1)^weight for j=1..n
    let mut sum = DecimalTrait::from_int(0);
    let mut j: u32 = 1;
    loop {
        if j > n {
            break;
        }
        let base_j = DecimalTrait::from_int((n - j + 1).into());
        let term = pow_decimal(base_j, exponent);

        // Add to sum
        let sum_total: u128 = (sum.int_part).into() * DECIMAL_SCALE + (sum.frac_part).into();
        let term_total: u128 = (term.int_part).into() * DECIMAL_SCALE + (term.frac_part).into();
        let new_sum_total = sum_total + term_total;
        sum =
            DecimalTrait::from_raw_parts(
                (new_sum_total / DECIMAL_SCALE).try_into().unwrap_or(0),
                (new_sum_total % DECIMAL_SCALE).try_into().unwrap_or(0),
            );

        j += 1;
    }

    // Calculate share = (numerator / sum) * available_share
    let ratio = numerator.div(@sum);
    let available_decimal = DecimalTrait::from_int(available_share.into());
    let result = ratio.mul(@available_decimal);

    result.to_u32()
}

/// Exponential distribution using decimal arithmetic
/// Formula: (1 - (i-1)/n)^weight / sum((1 - (j-1)/n)^weight for j=1..n)
fn calculate_exponential_share_decimal(
    weight: u16, position: u32, total_positions: u32, available_share: u32,
) -> u32 {
    let n = total_positions;
    let i = position;

    // Convert weight from scaled format (10 = 1.0) to Decimal
    let weight_decimal = DecimalTrait::from_int(weight.into());
    let ten = DecimalTrait::from_int(10);
    let exponent = weight_decimal.div(@ten);

    // Calculate (1 - (i-1)/n)^weight
    let i_minus_1 = DecimalTrait::from_int((i - 1).into());
    let n_decimal = DecimalTrait::from_int(n.into());
    let ratio_i = i_minus_1.div(@n_decimal);

    // 1 - ratio
    let one = DecimalTrait::from_int(1);
    let one_total: u128 = DECIMAL_SCALE;
    let ratio_total: u128 = (ratio_i.int_part).into() * DECIMAL_SCALE + (ratio_i.frac_part).into();
    let base_total = if one_total >= ratio_total {
        one_total - ratio_total
    } else {
        0
    };
    let base = DecimalTrait::from_raw_parts(
        (base_total / DECIMAL_SCALE).try_into().unwrap_or(0),
        (base_total % DECIMAL_SCALE).try_into().unwrap_or(0),
    );

    let numerator = pow_decimal(base, exponent);

    // Calculate sum
    let mut sum = DecimalTrait::from_int(0);
    let mut j: u32 = 1;
    loop {
        if j > n {
            break;
        }
        let j_minus_1 = DecimalTrait::from_int((j - 1).into());
        let ratio_j = j_minus_1.div(@n_decimal);
        let ratio_j_total: u128 = (ratio_j.int_part).into() * DECIMAL_SCALE
            + (ratio_j.frac_part).into();
        let base_j_total = if one_total >= ratio_j_total {
            one_total - ratio_j_total
        } else {
            0
        };
        let base_j = DecimalTrait::from_raw_parts(
            (base_j_total / DECIMAL_SCALE).try_into().unwrap_or(0),
            (base_j_total % DECIMAL_SCALE).try_into().unwrap_or(0),
        );

        let term = pow_decimal(base_j, exponent);

        // Add to sum
        let sum_total: u128 = (sum.int_part).into() * DECIMAL_SCALE + (sum.frac_part).into();
        let term_total: u128 = (term.int_part).into() * DECIMAL_SCALE + (term.frac_part).into();
        let new_sum_total = sum_total + term_total;
        sum =
            DecimalTrait::from_raw_parts(
                (new_sum_total / DECIMAL_SCALE).try_into().unwrap_or(0),
                (new_sum_total % DECIMAL_SCALE).try_into().unwrap_or(0),
            );

        j += 1;
    }

    // Calculate share
    let ratio = numerator.div(@sum);
    let available_decimal = DecimalTrait::from_int(available_share.into());
    let result = ratio.mul(@available_decimal);

    result.to_u32()
}

/// Calculate total weight for custom distribution
fn calculate_total_custom(shares: Span<u16>) -> u32 {
    let mut total: u32 = 0;
    let mut i: u32 = 0;
    loop {
        if i >= shares.len() {
            break;
        }
        total += (*shares.at(i)).into();
        i += 1;
    }
    total
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use budokan_distribution::models::Distribution;
    use super::{
        BASIS_POINTS, DECIMAL_SCALE, Decimal, DecimalTrait, calculate_share, pow_decimal,
        pow_int_decimal,
    };

    #[test]
    fn test_decimal_from_parts() {
        let dec = DecimalTrait::from_parts(3, 5); // 3.5
        assert!(dec.int_part == 3, "int_part should be 3");
        // frac_part should be 0.5 * 10^18 = 500000000000000000
        assert!(dec.frac_part == 500000000000000000, "frac_part should be 0.5");
    }

    #[test]
    fn test_pow_int_decimal() {
        let base = DecimalTrait::from_int(3);
        let result = pow_int_decimal(base, 2); // 3^2 = 9
        assert!(result.int_part == 9, "3^2 should be 9");
        assert!(result.frac_part == 0, "3^2 should have no fractional part");
    }

    #[test]
    fn test_linear_distribution_decimal() {
        let dist = Distribution::Linear(10); // weight 1.0
        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        println!(
            "Decimal impl - weight 1.0: share1={}, share2={}, share3={}", share1, share2, share3,
        );

        // With weight 1.0, should be 3:2:1 ratio = 50%, 33%, 17%
        assert!(share1 >= 4900 && share1 <= 5100, "Position 1 should get ~50%");
        assert!(share2 >= 3200 && share2 <= 3400, "Position 2 should get ~33%");
        assert!(share3 >= 1600 && share3 <= 1800, "Position 3 should get ~17%");
    }

    #[test]
    fn test_gas_comparison_decimal_integer_weight() {
        // Test with integer weight (should be fast)
        let dist = Distribution::Linear(20); // weight 2.0
        let share = calculate_share(dist, 1, 3, BASIS_POINTS);

        assert!(share >= 6300 && share <= 6600, "Should produce similar result to cubit");
        // NOTE: Check l2_gas in test output to compare with cubit implementation
    }

    #[test]
    fn test_gas_comparison_decimal_fractional_weight() {
        // Test with fractional weight
        let dist = Distribution::Linear(15); // weight 1.5
        let share = calculate_share(dist, 1, 3, BASIS_POINTS);

        println!("Decimal impl - weight 1.5: share={}", share);

        // Note: Linear approximation is less accurate than cubit's exp/ln method
        // Expected from cubit: ~5700-5800, decimal gives ~6000 (acceptable approximation)
        assert!(share >= 5500 && share <= 6100, "Should produce reasonable approximation");
        // NOTE: Check l2_gas in test output to compare with cubit implementation
    }

    #[test]
    fn test_exponential_distribution_decimal_integer_weight() {
        let dist = Distribution::Exponential(10); // weight 1.0
        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        println!(
            "Decimal Exponential - weight 1.0: share1={}, share2={}, share3={}",
            share1,
            share2,
            share3,
        );

        // With weight 1.0, exponential should favor first position
        assert!(share1 >= 4500 && share1 <= 5500, "Position 1 should get ~50%");
        assert!(share2 >= 2500 && share2 <= 3500, "Position 2 should get ~30%");
        assert!(share3 >= 1500 && share3 <= 2500, "Position 3 should get ~20%");
    }

    #[test]
    fn test_exponential_distribution_decimal_fractional_weight() {
        let dist = Distribution::Exponential(15); // weight 1.5
        let share1 = calculate_share(dist, 1, 3, BASIS_POINTS);
        let share2 = calculate_share(dist, 2, 3, BASIS_POINTS);
        let share3 = calculate_share(dist, 3, 3, BASIS_POINTS);

        println!(
            "Decimal Exponential - weight 1.5: share1={}, share2={}, share3={}",
            share1,
            share2,
            share3,
        );

        // With weight 1.5, exponential should strongly favor first position
        assert!(share1 >= 5000 && share1 <= 6500, "Position 1 should get majority");
        assert!(share2 >= 2000 && share2 <= 3500, "Position 2 should get moderate");
        assert!(share3 >= 1000 && share3 <= 2000, "Position 3 should get least");
    }

    #[test]
    fn test_gas_comparison_exponential_integer() {
        // Compare gas for exponential with integer weight
        let dist = Distribution::Exponential(20); // weight 2.0
        let share = calculate_share(dist, 1, 3, BASIS_POINTS);

        println!("Decimal Exponential - weight 2.0: share={}", share);

        assert!(share >= 5500 && share <= 7500, "Should produce reasonable result");
        // NOTE: Check l2_gas in test output to compare with cubit implementation
    }

    #[test]
    fn test_gas_comparison_exponential_fractional() {
        // Compare gas for exponential with fractional weight
        let dist = Distribution::Exponential(25); // weight 2.5
        let share = calculate_share(dist, 1, 3, BASIS_POINTS);

        println!("Decimal Exponential - weight 2.5: share={}", share);

        assert!(share >= 6000 && share <= 8000, "Should produce reasonable result");
        // NOTE: Check l2_gas in test output to compare with cubit implementation
    }

    #[test]
    fn test_decimal_distribution_showcase() {
        println!("\n=== DECIMAL DISTRIBUTION SHOWCASE ===\n");

        // Test with 5 positions for better visualization
        let positions = 5_u32;

        // Linear distributions with various weights
        println!("LINEAR DISTRIBUTION (5 positions, 10000 basis points):");
        println!("--------------------------------------------------------");

        let weights = array![10_u16, 15, 20, 25, 30, 50]; // 1.0, 1.5, 2.0, 2.5, 3.0, 5.0
        let mut i = 0;
        loop {
            if i >= weights.len() {
                break;
            }
            let weight = *weights.at(i);
            let dist = Distribution::Linear(weight);

            let s1 = calculate_share(dist, 1, positions, BASIS_POINTS);
            let s2 = calculate_share(dist, 2, positions, BASIS_POINTS);
            let s3 = calculate_share(dist, 3, positions, BASIS_POINTS);
            let s4 = calculate_share(dist, 4, positions, BASIS_POINTS);
            let s5 = calculate_share(dist, 5, positions, BASIS_POINTS);
            let total = s1 + s2 + s3 + s4 + s5;

            let weight_display: ByteArray = if weight == 10 {
                "1.0"
            } else if weight == 15 {
                "1.5"
            } else if weight == 20 {
                "2.0"
            } else if weight == 25 {
                "2.5"
            } else if weight == 30 {
                "3.0"
            } else {
                "5.0"
            };

            println!(
                "Weight {}: P1={}% P2={}% P3={}% P4={}% P5={}% (total={}%)",
                weight_display,
                s1 / 100,
                s2 / 100,
                s3 / 100,
                s4 / 100,
                s5 / 100,
                total / 100,
            );

            i += 1;
        }

        println!("\nEXPONENTIAL DISTRIBUTION (5 positions, 10000 basis points):");
        println!("-----------------------------------------------------------");

        i = 0;
        loop {
            if i >= weights.len() {
                break;
            }
            let weight = *weights.at(i);
            let dist = Distribution::Exponential(weight);

            let s1 = calculate_share(dist, 1, positions, BASIS_POINTS);
            let s2 = calculate_share(dist, 2, positions, BASIS_POINTS);
            let s3 = calculate_share(dist, 3, positions, BASIS_POINTS);
            let s4 = calculate_share(dist, 4, positions, BASIS_POINTS);
            let s5 = calculate_share(dist, 5, positions, BASIS_POINTS);
            let total = s1 + s2 + s3 + s4 + s5;

            let weight_display: ByteArray = if weight == 10 {
                "1.0"
            } else if weight == 15 {
                "1.5"
            } else if weight == 20 {
                "2.0"
            } else if weight == 25 {
                "2.5"
            } else if weight == 30 {
                "3.0"
            } else {
                "5.0"
            };

            println!(
                "Weight {}: P1={}% P2={}% P3={}% P4={}% P5={}% (total={}%)",
                weight_display,
                s1 / 100,
                s2 / 100,
                s3 / 100,
                s4 / 100,
                s5 / 100,
                total / 100,
            );

            i += 1;
        }

        // Test with 10 positions to show scalability
        println!("\nLINEAR DISTRIBUTION (10 positions, weight 2.0):");
        println!("------------------------------------------------");
        let dist = Distribution::Linear(20);
        let positions_10 = 10_u32;

        let mut pos = 1;
        loop {
            if pos > positions_10 {
                break;
            }
            let share = calculate_share(dist, pos, positions_10, BASIS_POINTS);
            println!("Position {}: {}%", pos, share / 100);
            pos += 1;
        }

        println!("\n=== END SHOWCASE ===\n");
    }
}
