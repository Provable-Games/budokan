// SPDX-License-Identifier: MIT
// Distribution calculator using optimized bit-shift exp function
// Based on efficient 64.64 fixed-point exponential calculation

use budokan_distribution::models::Distribution;

// ============ Helper Math Functions ============

// Multiply and divide with u256 to prevent overflow
fn muldiv(a: u256, b: u256, denominator: u256, round_up: bool) -> Option<u256> {
    let product = a * b;
    let mut result = product / denominator;

    if round_up {
        let remainder = product % denominator;
        if remainder > 0 {
            result += 1;
        }
    }

    Option::Some(result)
}

// Unsafe multiply and shift - assumes result fits in u256
fn unsafe_mul_shift(a: u256, b: u128) -> u256 {
    let b_u256: u256 = b.into();
    let product = a * b_u256;
    // Shift right by 128 bits (divide by 2^128)
    product / 0x100000000000000000000000000000000_u256
}

// ============ Exponential Function (64.64 fixed-point) ============

// Computes e^x where x is a fixed point 64.64 number and the result is a fixed point 128.128 number
pub fn exp(x: u128) -> u256 {
    if (x >= 0x20000000000000000) {
        let half = exp(x / 2);
        muldiv(half, half, u256 { high: 1, low: 0 }, false).expect('EXP_FRACTIONAL_OVERFLOW')
    } else {
        exp_inner(x)
    }
}

// Computes e^x where x is a fixed point 64.64 number that is less than the real number 2
fn exp_inner(x: u128) -> u256 {
    assert(x < 0x20000000000000000, 'EXP_X_MAGNITUDE');

    let mut ratio = 0x100000000000000000000000000000000_u256;
    if ((x & 0x1) != 0) {
        ratio = u256 { high: 0, low: 0xffffffffffffffff0000000000000000 };
    }
    if ((x & 0x2) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffffffe0000000000000002);
    }
    if ((x & 0x4) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffffffc0000000000000008);
    }
    if ((x & 0x8) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffffff80000000000000020);
    }
    if ((x & 0x10) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffffff00000000000000080);
    }
    if ((x & 0x20) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffffffe00000000000000200);
    }
    if ((x & 0x40) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffffffc00000000000000800);
    }
    if ((x & 0x80) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffffff800000000000002000);
    }
    if ((x & 0x100) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffffff000000000000008000);
    }
    if ((x & 0x200) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffffe000000000000020000);
    }
    if ((x & 0x400) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffffc000000000000080000);
    }
    if ((x & 0x800) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffff8000000000000200000);
    }
    if ((x & 0x1000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffff0000000000000800000);
    }
    if ((x & 0x2000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffffe0000000000002000000);
    }
    if ((x & 0x4000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffffc0000000000008000000);
    }
    if ((x & 0x8000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffff80000000000020000000);
    }
    if ((x & 0x10000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffff00000000000080000000);
    }
    if ((x & 0x20000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffe00000000000200000000);
    }
    if ((x & 0x40000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffffc00000000000800000000);
    }
    if ((x & 0x80000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffff800000000002000000000);
    }
    if ((x & 0x100000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffff000000000008000000000);
    }
    if ((x & 0x200000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffe000000000020000000000);
    }
    if ((x & 0x400000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffffc00000000007ffffffffff);
    }
    if ((x & 0x800000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffff80000000001ffffffffffb);
    }
    if ((x & 0x1000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffff00000000007fffffffffd5);
    }
    if ((x & 0x2000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffe0000000001fffffffffeab);
    }
    if ((x & 0x4000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffffc0000000007fffffffff555);
    }
    if ((x & 0x8000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffff8000000001fffffffffaaab);
    }
    if ((x & 0x10000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffff0000000007ffffffffd5555);
    }
    if ((x & 0x20000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffe000000001ffffffffeaaaab);
    }
    if ((x & 0x40000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffffc000000007ffffffff555555);
    }
    if ((x & 0x80000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffff800000001ffffffffaaaaaab);
    }
    if ((x & 0x100000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffff000000007fffffffd5555555);
    }
    if ((x & 0x200000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffe00000001fffffffeaaaaaaab);
    }
    if ((x & 0x400000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffffc00000007fffffff555555560);
    }
    if ((x & 0x800000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffff80000001fffffffaaaaaaab55);
    }
    if ((x & 0x1000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffff00000007ffffffd5555556000);
    }
    if ((x & 0x2000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffe0000001ffffffeaaaaaab5555);
    }
    if ((x & 0x4000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffffc0000007ffffff555555600000);
    }
    if ((x & 0x8000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffff8000001ffffffaaaaaab555555);
    }
    if ((x & 0x10000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffff0000007fffffd555555ffffffe);
    }
    if ((x & 0x20000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffe000001fffffeaaaaab55555511);
    }
    if ((x & 0x40000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffffc000007fffff555555ffffff777);
    }
    if ((x & 0x80000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffff800001fffffaaaaab5555544444);
    }
    if ((x & 0x100000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffff000007ffffd55555fffffddddde);
    }
    if ((x & 0x200000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffe00001ffffeaaaab555551111128);
    }
    if ((x & 0x400000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffffc00007ffff55555fffff77777d28);
    }
    if ((x & 0x800000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffff80001ffffaaaab5555444445b05b);
    }
    if ((x & 0x1000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffff00007fffd5555ffffdddde38e381);
    }
    if ((x & 0x2000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffe0001fffeaaab5555111127d276a7);
    }
    if ((x & 0x4000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfffc0007fff5555ffff7777d27cf3cf5);
    }
    if ((x & 0x8000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfff8001fffaaab55544445b0596597f9);
    }
    if ((x & 0x10000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfff0007ffd555fffddde38e2be2d82d5);
    }
    if ((x & 0x20000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffe001ffeaab55511127d21522f2295c);
    }
    if ((x & 0x40000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xffc007ff555fff777d279e7b87acece0);
    }
    if ((x & 0x80000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xff801ffaab554445b04105b043e8f48d);
    }
    if ((x & 0x100000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xff007fd55ffdde38d68f08c257e0ce3f);
    }
    if ((x & 0x200000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfe01feab551127cbfe5f89994c44216f);
    }
    if ((x & 0x400000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xfc07f55ff77d2493e885eeaa756ad523);
    }
    if ((x & 0x800000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xf81fab5445aebc8a58055fcbbb139ae9);
    }
    if ((x & 0x1000000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xf07d5fde38151e72f18ff03049ac5d7f);
    }
    if ((x & 0x2000000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xe1eb51276c110c3c3eb1269f2f5d4afb);
    }
    if ((x & 0x4000000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0xc75f7cf564105743415cbc9d6368f3b9);
    }
    if ((x & 0x8000000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0x9b4597e37cb04ff3d675a35530cdd768);
    }
    if ((x & 0x10000000000000000) != 0) {
        ratio = unsafe_mul_shift(ratio, 0x5e2d58d8b3bcdf1abadec7829054f90e);
    }

    if (x != 0) {
        ratio =
            u256 {
                high: 0xffffffffffffffffffffffffffffffff, low: 0xffffffffffffffffffffffffffffffff,
            }
            / ratio;
    }

    ratio
}

// ============ Distribution Calculation ============

// Constants for 64.64 fixed-point
const ONE_64_64: u128 = 0x10000000000000000; // 2^64
const ONE_128_128: u256 = 0x100000000000000000000000000000000; // 2^128

/// Calculate exponential distribution share using bit-shift exp
/// This creates a curve: position^weight where lower positions get exponentially more
pub fn calculate_exponential_share(
    position: u8, total_positions: u32, weight_u16: u16, available: u16,
) -> u16 {
    if position == 0 || position > total_positions.try_into().unwrap() {
        return 0;
    }

    // Convert weight from scaled u16 (10 = 1.0) to 64.64 fixed point
    // weight_u16 = 15 means 1.5
    let weight_64_64: u128 = (weight_u16.into() * ONE_64_64) / 10;

    // Calculate the normalized position value (1.0 for first, 0.0 for last)
    // position_value = (total - position) / (total - 1)
    let total_minus_one = total_positions - 1;
    let position_from_end = total_positions - position.into();

    // Convert to 64.64: position_value_64_64 = (position_from_end * ONE_64_64) / total_minus_one
    let position_value_64_64: u128 = (position_from_end.into() * ONE_64_64)
        / total_minus_one.into();

    // Calculate exponent: weight * position_value (both in 64.64)
    // Result is in 128.128, so we need to shift back to 64.64
    let exponent_128: u256 = (weight_64_64.into() * position_value_64_64.into()) / ONE_64_64.into();
    let exponent_64_64: u128 = exponent_128.try_into().unwrap_or(0);

    // Calculate e^exponent using optimized bit-shift exp
    let exp_result_128_128 = exp(exponent_64_64);

    // Convert result from 128.128 to basis points
    // Divide by 2^128 to get the integer part, then scale to basis points
    let exp_value_int = exp_result_128_128 / ONE_128_128;

    // Now we need to calculate the share as a proportion of total
    // For now, return a simplified version - this would need full distribution logic
    let share_raw: u16 = (exp_value_int.low % available.into()).try_into().unwrap_or(0);

    share_raw
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::{ONE_128_128, ONE_64_64, calculate_exponential_share, exp};

    #[test]
    fn test_exp_zero() {
        let result = exp(0);
        // e^0 = 1 in 128.128 format
        assert(result == ONE_128_128, 'e^0 should be 1');
    }

    #[test]
    fn test_exp_one() {
        // e^1 in 64.64 format
        let result = exp(ONE_64_64);

        // e ≈ 2.718281828 in 128.128 format
        // Should be approximately 2.718 * 2^128
        let e_approx = u256 { high: 2, low: 0xb8aa3b295c17f0bbbe87fed0691d3e88 };

        println!("e^1 result: high={}, low={}", result.high, result.low);
        println!("expected:   high={}, low={}", e_approx.high, e_approx.low);

        // Check within 1% tolerance
        let diff = if result > e_approx {
            result - e_approx
        } else {
            e_approx - result
        };

        let tolerance = e_approx / 100; // 1% tolerance
        assert(diff < tolerance, 'e^1 not within tolerance');
    }

    #[test]
    fn test_bitshift_exp_gas() {
        // Test gas cost of exp calculation
        let x = ONE_64_64; // e^1
        let _result = exp(x);
    }

    #[test]
    fn test_exponential_distribution() {
        let positions = 5_u32;
        let weight = 15_u16; // 1.5
        let available = 10000_u16;

        println!("\n=== Bit-Shift Exp Distribution Test ===");
        println!("Weight 1.5, 5 positions:\n");

        let mut pos: u8 = 1;
        loop {
            if pos > 5 {
                break;
            }
            let share = calculate_exponential_share(pos, positions, weight, available);
            println!("Position {}: {}", pos, share);
            pos += 1;
        };
    }
}
