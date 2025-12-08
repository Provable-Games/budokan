// SPDX-License-Identifier: MIT
// Based on Cubit by Influence - https://github.com/influenceth/cubit

use core::num::traits::{Sqrt, WideMul};
use math::lut;
use math::types::{Fixed, FixedTrait, HALF, ONE};

// Helper function for safe division and remainder
fn safe_divmod(a: u64, b: u64) -> (u64, u64) {
    let div = a / b;
    let rem = a % b;
    (div, rem)
}

pub fn abs(a: Fixed) -> Fixed {
    return FixedTrait::new(a.mag, false);
}

pub fn add(a: Fixed, b: Fixed) -> Fixed {
    if a.sign == b.sign {
        return FixedTrait::new(a.mag + b.mag, a.sign);
    }

    if a.mag == b.mag {
        return FixedTrait::ZERO();
    }

    if (a.mag > b.mag) {
        return FixedTrait::new(a.mag - b.mag, a.sign);
    } else {
        return FixedTrait::new(b.mag - a.mag, b.sign);
    }
}

pub fn ceil(a: Fixed) -> Fixed {
    let (div, rem) = safe_divmod(a.mag, ONE);

    if rem == 0 {
        return a;
    } else if !a.sign {
        return FixedTrait::new_unscaled(div + 1, false);
    } else if div == 0 {
        return FixedTrait::new_unscaled(0, false);
    } else {
        return FixedTrait::new_unscaled(div, true);
    }
}

pub fn div(a: Fixed, b: Fixed) -> Fixed {
    let a_u128 = a.mag.wide_mul(ONE);
    let res_u128 = a_u128 / b.mag.into();

    // Re-apply sign
    return FixedTrait::new(res_u128.try_into().unwrap(), a.sign ^ b.sign);
}

pub fn eq(a: @Fixed, b: @Fixed) -> bool {
    return (*a.mag == *b.mag) && (*a.sign == *b.sign);
}

// Calculates the natural exponent of x: e^x
pub fn exp(a: Fixed) -> Fixed {
    return exp2(FixedTrait::new(6196328018, false) * a);
}

// Calculates the binary exponent of x: 2^x
pub fn exp2(a: Fixed) -> Fixed {
    if (a.mag == 0) {
        return FixedTrait::ONE();
    }

    let (int_part, frac_part) = safe_divmod(a.mag, ONE);
    let int_res = FixedTrait::new_unscaled(lut::exp2(int_part), false);
    let mut res_u = int_res;

    if frac_part != 0 {
        let frac = FixedTrait::new(frac_part, false);
        let r8 = FixedTrait::new(9707, false) * frac;
        let r7 = (r8 + FixedTrait::new(53974, false)) * frac;
        let r6 = (r7 + FixedTrait::new(677974, false)) * frac;
        let r5 = (r6 + FixedTrait::new(5713580, false)) * frac;
        let r4 = (r5 + FixedTrait::new(41315679, false)) * frac;
        let r3 = (r4 + FixedTrait::new(238386709, false)) * frac;
        let r2 = (r3 + FixedTrait::new(1031765214, false)) * frac;
        let r1 = (r2 + FixedTrait::new(2977044459, false)) * frac;
        res_u = res_u * (r1 + FixedTrait::ONE());
    }

    if (a.sign == true) {
        return FixedTrait::ONE() / res_u;
    } else {
        return res_u;
    }
}

pub fn floor(a: Fixed) -> Fixed {
    let (div, rem) = safe_divmod(a.mag, ONE);

    if rem == 0 {
        return a;
    } else if !a.sign {
        return FixedTrait::new_unscaled(div, false);
    } else {
        return FixedTrait::new_unscaled(div + 1, true);
    }
}

pub fn ge(a: Fixed, b: Fixed) -> bool {
    if a.sign != b.sign {
        return !a.sign;
    } else {
        return (a.mag == b.mag) || ((a.mag > b.mag) ^ a.sign);
    }
}

pub fn gt(a: Fixed, b: Fixed) -> bool {
    if a.sign != b.sign {
        return !a.sign;
    } else {
        return (a.mag != b.mag) && ((a.mag > b.mag) ^ a.sign);
    }
}

pub fn le(a: Fixed, b: Fixed) -> bool {
    if a.sign != b.sign {
        return a.sign;
    } else {
        return (a.mag == b.mag) || ((a.mag < b.mag) ^ a.sign);
    }
}

// Calculates the natural logarithm of x: ln(x)
// self must be greater than zero
pub fn ln(a: Fixed) -> Fixed {
    return FixedTrait::new(2977044472, false) * log2(a); // ln(2) = 0.693...
}

// Calculates the binary logarithm of x: log2(x)
// self must be greather than zero
pub fn log2(a: Fixed) -> Fixed {
    assert(a.sign == false, 'must be positive');

    if (a.mag == ONE) {
        return FixedTrait::ZERO();
    } else if (a.mag < ONE) {
        // Compute true inverse binary log if 0 < x < 1
        let div = FixedTrait::ONE() / a;
        return -log2(div);
    }

    let whole = a.mag / ONE;
    let (msb, div) = lut::msb(whole);

    if a.mag == div * ONE {
        return FixedTrait::new_unscaled(msb, false);
    } else {
        let norm = a / FixedTrait::new_unscaled(div, false);
        let r8 = FixedTrait::new(39036580, true) * norm;
        let r7 = (r8 + FixedTrait::new(531913440, false)) * norm;
        let r6 = (r7 + FixedTrait::new(3214171660, true)) * norm;
        let r5 = (r6 + FixedTrait::new(11333450393, false)) * norm;
        let r4 = (r5 + FixedTrait::new(25827501665, true)) * norm;
        let r3 = (r4 + FixedTrait::new(39883002199, false)) * norm;
        let r2 = (r3 + FixedTrait::new(42980322874, true)) * norm;
        let r1 = (r2 + FixedTrait::new(35024618493, false)) * norm;
        return r1 + FixedTrait::new(14711951564, true) + FixedTrait::new_unscaled(msb, false);
    }
}

// Calculates the base 10 log of x: log10(x)
// self must be greater than zero
pub fn log10(a: Fixed) -> Fixed {
    return FixedTrait::new(1292913986, false) * log2(a); // log10(2) = 0.301...
}

pub fn lt(a: Fixed, b: Fixed) -> bool {
    if a.sign != b.sign {
        return a.sign;
    } else {
        return (a.mag != b.mag) && ((a.mag < b.mag) ^ a.sign);
    }
}

pub fn mul(a: Fixed, b: Fixed) -> Fixed {
    let prod_u128 = a.mag.wide_mul(b.mag);

    // Re-apply sign
    return FixedTrait::new((prod_u128 / ONE.into()).try_into().unwrap(), a.sign ^ b.sign);
}

pub fn ne(a: @Fixed, b: @Fixed) -> bool {
    return (*a.mag != *b.mag) || (*a.sign != *b.sign);
}

pub fn neg(a: Fixed) -> Fixed {
    if a.mag == 0 {
        return a;
    } else if !a.sign {
        return FixedTrait::new(a.mag, !a.sign);
    } else {
        return FixedTrait::new(a.mag, false);
    }
}

// Calclates the value of x^y and checks for overflow before returning
// self is a Fixed point value
// b is a Fixed point value
pub fn pow(a: Fixed, b: Fixed) -> Fixed {
    let (_div, rem) = safe_divmod(b.mag, ONE);

    // use the more performant integer pow when y is an int
    if (rem == 0) {
        return pow_int(a, b.mag / ONE, b.sign);
    }

    // x^y = exp(y*ln(x)) for x > 0 will error for x < 0
    return exp(b * ln(a));
}

// Calclates the value of a^b and checks for overflow before returning
fn pow_int(a: Fixed, b: u64, sign: bool) -> Fixed {
    let mut x = a;
    let mut n = b;

    if sign == true {
        x = FixedTrait::ONE() / x;
    }

    if n == 0 {
        return FixedTrait::ONE();
    }

    let mut y = FixedTrait::ONE();

    loop {
        if n <= 1 {
            break;
        }

        let (div, rem) = safe_divmod(n, 2);

        if rem == 1 {
            y = x * y;
        }

        x = x * x;
        n = div;
    }

    return x * y;
}

pub fn round(a: Fixed) -> Fixed {
    let (div, rem) = safe_divmod(a.mag, ONE);

    if (HALF <= rem) {
        return FixedTrait::new_unscaled(div + 1, a.sign);
    } else {
        return FixedTrait::new_unscaled(div, a.sign);
    }
}

pub fn sqrt(a: Fixed) -> Fixed {
    assert(a.sign == false, 'must be positive');
    let val: u128 = a.mag.into() * ONE.into();
    let root = Sqrt::<u128>::sqrt(val);
    return FixedTrait::new(root.try_into().unwrap(), false);
}

pub fn sub(a: Fixed, b: Fixed) -> Fixed {
    return add(a, -b);
}
