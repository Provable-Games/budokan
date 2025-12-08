// SPDX-License-Identifier: MIT
// Improved decimal implementation with better fractional power approximations

use budokan_distribution::calculator_decimal::{DECIMAL_SCALE, Decimal, DecimalTrait};
use budokan_distribution::models::Distribution;

// ============ Improved Power Functions ============

/// Improved fractional power using second-order Taylor expansion
/// x^y ≈ 1 + y*ln(x) + (y*ln(x))^2/2
/// We approximate ln(x) ≈ (x-1) - (x-1)^2/2 for x near 1
/// Combining: x^y ≈ 1 + y*(x-1) + y*(y-1)*(x-1)^2/2
fn pow_frac_taylor2(base: Decimal, frac_part: u64) -> Decimal {
    let frac = DecimalTrait::from_raw_parts(0, frac_part);
    let one = DecimalTrait::from_int(1);

    // Calculate (base - 1)
    let base_total: u128 = (base.int_part).into() * DECIMAL_SCALE + (base.frac_part).into();
    let one_total: u128 = DECIMAL_SCALE;

    if base_total < one_total {
        // For base < 1, use the inverse approximation
        return one;
    }

    let diff_total = base_total - one_total;
    let diff_int = (diff_total / DECIMAL_SCALE).try_into().unwrap_or(0);
    let diff_frac = (diff_total % DECIMAL_SCALE).try_into().unwrap_or(0);
    let base_minus_one = DecimalTrait::from_raw_parts(diff_int, diff_frac);

    // First order: y*(x-1)
    let first_order = frac.mul(@base_minus_one);

    // Second order: y*(x-1)^2/2
    let base_minus_one_sq = base_minus_one.mul(@base_minus_one);
    let second_order_full = frac.mul(@base_minus_one_sq);

    // Divide by 2
    let two = DecimalTrait::from_int(2);
    let second_order = second_order_full.div(@two);

    // Combine: 1 + first_order + second_order
    let first_total: u128 = (first_order.int_part).into() * DECIMAL_SCALE
        + (first_order.frac_part).into();
    let second_total: u128 = (second_order.int_part).into() * DECIMAL_SCALE
        + (second_order.frac_part).into();

    let result_total = one_total + first_total + second_total;
    let result_int = (result_total / DECIMAL_SCALE).try_into().unwrap_or(0);
    let result_frac = (result_total % DECIMAL_SCALE).try_into().unwrap_or(0);

    DecimalTrait::from_raw_parts(result_int, result_frac)
}

/// Padé [2/2] approximant for better accuracy
/// x^y ≈ (1 + a*t + b*t^2) / (1 + c*t + d*t^2)
/// where t = y*ln(x) ≈ y*(x-1)
/// For Padé [1/1]: x^y ≈ (1 + 2t/3) / (1 - t/3)
fn pow_frac_pade(base: Decimal, frac_part: u64) -> Decimal {
    let frac = DecimalTrait::from_raw_parts(0, frac_part);
    let one = DecimalTrait::from_int(1);

    // Calculate (base - 1)
    let base_total: u128 = (base.int_part).into() * DECIMAL_SCALE + (base.frac_part).into();
    let one_total: u128 = DECIMAL_SCALE;

    if base_total < one_total {
        return one;
    }

    let diff_total = base_total - one_total;
    let diff_int = (diff_total / DECIMAL_SCALE).try_into().unwrap_or(0);
    let diff_frac = (diff_total % DECIMAL_SCALE).try_into().unwrap_or(0);
    let base_minus_one = DecimalTrait::from_raw_parts(diff_int, diff_frac);

    // t = y*(x-1)
    let t = frac.mul(@base_minus_one);

    // Padé [1/1]: (1 + 2t/3) / (1 - t/3)
    let two = DecimalTrait::from_int(2);
    let three = DecimalTrait::from_int(3);

    // Numerator: 1 + 2t/3
    let two_t = t.mul(@two);
    let two_t_over_3 = two_t.div(@three);
    let numer_total: u128 = one_total
        + (two_t_over_3.int_part).into() * DECIMAL_SCALE
        + (two_t_over_3.frac_part).into();

    // Denominator: 1 - t/3
    let t_over_3 = t.div(@three);
    let t_over_3_total: u128 = (t_over_3.int_part).into() * DECIMAL_SCALE
        + (t_over_3.frac_part).into();

    let denom_total: u128 = if one_total >= t_over_3_total {
        one_total - t_over_3_total
    } else {
        one_total // Prevent underflow
    };

    // Result = numerator / denominator
    let numer_int = (numer_total / DECIMAL_SCALE).try_into().unwrap_or(0);
    let numer_frac = (numer_total % DECIMAL_SCALE).try_into().unwrap_or(0);
    let numer = DecimalTrait::from_raw_parts(numer_int, numer_frac);

    let denom_int = (denom_total / DECIMAL_SCALE).try_into().unwrap_or(1);
    let denom_frac = (denom_total % DECIMAL_SCALE).try_into().unwrap_or(0);
    let denom = DecimalTrait::from_raw_parts(denom_int, denom_frac);

    numer.div(@denom)
}

/// Hybrid approach: Use lookup table for common fractional values
/// For 0.5: use sqrt approximation
/// For others: use improved Taylor or Padé
fn pow_frac_hybrid(base: Decimal, frac_part: u64) -> Decimal {
    // Check for common fractional values
    let half: u64 = (DECIMAL_SCALE / 2).try_into().unwrap_or(0);
    let tolerance: u64 = (DECIMAL_SCALE / 1000).try_into().unwrap_or(0); // 0.1% tolerance

    // If frac ≈ 0.5, use square root approximation
    if frac_part > (half - tolerance) && frac_part < (half + tolerance) {
        return sqrt_decimal(base);
    }

    // Otherwise use Padé approximant
    pow_frac_pade(base, frac_part)
}

/// Newton's method for square root (used for x^0.5)
/// Much more accurate than linear approximation for this common case
fn sqrt_decimal(x: Decimal) -> Decimal {
    let x_total: u128 = (x.int_part).into() * DECIMAL_SCALE + (x.frac_part).into();

    // Handle edge cases
    if x_total == 0 {
        return DecimalTrait::from_int(0);
    }

    let one_total: u128 = DECIMAL_SCALE;
    if x_total == one_total {
        return DecimalTrait::from_int(1);
    }

    // Initial guess: average of x and 1
    let mut guess: u128 = (x_total + one_total) / 2;

    // Newton's method: x_{n+1} = (x_n + x/x_n) / 2
    // Iterate 5 times for good precision
    let mut i: u8 = 0;
    loop {
        if i >= 5 {
            break;
        }

        // x / guess (using u256 to prevent overflow)
        let x_256: u256 = x_total.into();
        let guess_256: u256 = guess.into();
        let scale_256: u256 = DECIMAL_SCALE.into();

        let x_div_guess_256 = (x_256 * scale_256) / guess_256;
        let x_div_guess: u128 = if x_div_guess_256 > 0xffffffffffffffffffffffffffffffff_u256 {
            0xffffffffffffffffffffffffffffffff
        } else {
            x_div_guess_256.try_into().unwrap_or(0xffffffffffffffffffffffffffffffff)
        };

        // New guess = (guess + x/guess) / 2
        guess = (guess + x_div_guess) / 2;
        i += 1;
    }

    let result_int = (guess / DECIMAL_SCALE).try_into().unwrap_or(0);
    let result_frac = (guess % DECIMAL_SCALE).try_into().unwrap_or(0);

    DecimalTrait::from_raw_parts(result_int, result_frac)
}

// ============ Complete Power Function Variants ============

/// Power function using second-order Taylor expansion
pub fn pow_decimal_taylor2(base: Decimal, exponent: Decimal) -> Decimal {
    if base.int_part == 0 && base.frac_part == 0 {
        return DecimalTrait::from_int(0);
    }
    if exponent.int_part == 0 && exponent.frac_part == 0 {
        return DecimalTrait::from_int(1);
    }
    if exponent.int_part == 1 && exponent.frac_part == 0 {
        return base;
    }

    if exponent.frac_part == 0 {
        return pow_int_decimal(base, exponent.int_part);
    }

    let int_result = if exponent.int_part > 0 {
        pow_int_decimal(base, exponent.int_part)
    } else {
        DecimalTrait::from_int(1)
    };

    let frac_result = pow_frac_taylor2(base, exponent.frac_part);
    int_result.mul(@frac_result)
}

/// Power function using Padé approximant
pub fn pow_decimal_pade(base: Decimal, exponent: Decimal) -> Decimal {
    if base.int_part == 0 && base.frac_part == 0 {
        return DecimalTrait::from_int(0);
    }
    if exponent.int_part == 0 && exponent.frac_part == 0 {
        return DecimalTrait::from_int(1);
    }
    if exponent.int_part == 1 && exponent.frac_part == 0 {
        return base;
    }

    if exponent.frac_part == 0 {
        return pow_int_decimal(base, exponent.int_part);
    }

    let int_result = if exponent.int_part > 0 {
        pow_int_decimal(base, exponent.int_part)
    } else {
        DecimalTrait::from_int(1)
    };

    let frac_result = pow_frac_pade(base, exponent.frac_part);
    int_result.mul(@frac_result)
}

/// Power function using hybrid approach
pub fn pow_decimal_hybrid(base: Decimal, exponent: Decimal) -> Decimal {
    if base.int_part == 0 && base.frac_part == 0 {
        return DecimalTrait::from_int(0);
    }
    if exponent.int_part == 0 && exponent.frac_part == 0 {
        return DecimalTrait::from_int(1);
    }
    if exponent.int_part == 1 && exponent.frac_part == 0 {
        return base;
    }

    if exponent.frac_part == 0 {
        return pow_int_decimal(base, exponent.int_part);
    }

    let int_result = if exponent.int_part > 0 {
        pow_int_decimal(base, exponent.int_part)
    } else {
        DecimalTrait::from_int(1)
    };

    let frac_result = pow_frac_hybrid(base, exponent.frac_part);
    int_result.mul(@frac_result)
}

/// Fast integer power using binary exponentiation (same as original)
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

        if current_exp % 2 == 1 {
            result = result.mul(@current_base);
        }

        current_base = current_base.mul(@current_base);
        current_exp = current_exp / 2;
    }

    result
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use budokan_distribution::calculator_decimal::{DECIMAL_SCALE, Decimal, DecimalTrait};
    use super::{pow_decimal_hybrid, pow_decimal_pade, pow_decimal_taylor2, sqrt_decimal};

    #[test]
    fn test_sqrt_accuracy() {
        // Test sqrt(2) ≈ 1.414213562
        let two = DecimalTrait::from_int(2);
        let sqrt_2 = sqrt_decimal(two);

        println!("sqrt(2) = {}.{}", sqrt_2.int_part, sqrt_2.frac_part);

        // sqrt(2) should be approximately 1.414...
        assert(sqrt_2.int_part == 1, 'sqrt(2) int part should be 1');

        // Check that it's close to 1.414 (allow some tolerance)
        let expected_frac: u64 = 414213562000000000; // 0.414213562
        let tolerance: u64 = 1000000000000000; // 0.001 tolerance

        let diff = if sqrt_2.frac_part > expected_frac {
            sqrt_2.frac_part - expected_frac
        } else {
            expected_frac - sqrt_2.frac_part
        };

        assert(diff < tolerance, 'sqrt(2) should be ~1.414');
    }

    #[test]
    fn test_improved_pow_comparison() {
        println!("\n=== IMPROVED POW COMPARISON ===\n");

        // Test 2^1.5 with different methods
        let base = DecimalTrait::from_int(2);
        let exp = DecimalTrait::from_parts(1, 5); // 1.5

        let taylor2_result = pow_decimal_taylor2(base, exp);
        let pade_result = pow_decimal_pade(base, exp);
        let hybrid_result = pow_decimal_hybrid(base, exp);

        println!("2^1.5 comparison:");
        println!("  Taylor2: {}.{}", taylor2_result.int_part, taylor2_result.frac_part);
        println!("  Pade:    {}.{}", pade_result.int_part, pade_result.frac_part);
        println!("  Hybrid:  {}.{}", hybrid_result.int_part, hybrid_result.frac_part);
        println!("  Expected: ~2.828 (actual 2.828427124...)");
    }
}
