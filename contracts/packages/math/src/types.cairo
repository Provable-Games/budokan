// SPDX-License-Identifier: MIT
// Based on Cubit by Influence - https://github.com/influenceth/cubit

use core::num::traits::Sqrt;
use core::traits::{Into, TryInto};

// Helper function for safe division and remainder
fn safe_divmod(a: u64, b: u64) -> (u64, u64) {
    let div = a / b;
    let rem = a % b;
    (div, rem)
}

/// Fixed point number with 32.32 bit representation
/// Magnitude is stored as u64, sign as bool
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct Fixed {
    pub mag: u64,
    pub sign: bool,
}

/// Constants for 32.32 fixed point math
pub const ONE: u64 = 4294967296; // 2^32
pub const HALF: u64 = 2147483648; // 2^31

pub trait FixedTrait {
    fn ZERO() -> Fixed;
    fn ONE() -> Fixed;
    fn new(mag: u64, sign: bool) -> Fixed;
    fn new_unscaled(val: u64, sign: bool) -> Fixed;
    fn from_felt(val: felt252) -> Fixed;
    fn abs(self: Fixed) -> Fixed;
    fn ceil(self: Fixed) -> Fixed;
    fn floor(self: Fixed) -> Fixed;
    fn round(self: Fixed) -> Fixed;
    fn sqrt(self: Fixed) -> Fixed;
    fn exp(self: Fixed) -> Fixed;
    fn exp2(self: Fixed) -> Fixed;
    fn ln(self: Fixed) -> Fixed;
    fn log2(self: Fixed) -> Fixed;
    fn log10(self: Fixed) -> Fixed;
    fn pow(self: Fixed, b: Fixed) -> Fixed;
}

impl FixedImpl of FixedTrait {
    fn ZERO() -> Fixed {
        Fixed { mag: 0, sign: false }
    }

    fn ONE() -> Fixed {
        Fixed { mag: ONE, sign: false }
    }

    fn new(mag: u64, sign: bool) -> Fixed {
        Fixed { mag, sign }
    }

    fn new_unscaled(val: u64, sign: bool) -> Fixed {
        Fixed { mag: val * ONE, sign }
    }

    fn from_felt(val: felt252) -> Fixed {
        let val_u256: u256 = val.into();
        let mag_u64: u64 = val_u256.low.try_into().unwrap();
        Fixed { mag: mag_u64, sign: false }
    }

    fn abs(self: Fixed) -> Fixed {
        Fixed { mag: self.mag, sign: false }
    }

    fn ceil(self: Fixed) -> Fixed {
        let (div, rem) = safe_divmod(self.mag, ONE);

        if rem == 0 {
            return self;
        } else if !self.sign {
            return Self::new_unscaled(div + 1, false);
        } else if div == 0 {
            return Self::new_unscaled(0, false);
        } else {
            return Self::new_unscaled(div, true);
        }
    }

    fn floor(self: Fixed) -> Fixed {
        let (div, rem) = safe_divmod(self.mag, ONE);

        if rem == 0 {
            return self;
        } else if !self.sign {
            return Self::new_unscaled(div, false);
        } else {
            return Self::new_unscaled(div + 1, true);
        }
    }

    fn round(self: Fixed) -> Fixed {
        let (div, rem) = safe_divmod(self.mag, ONE);

        if (HALF <= rem) {
            return Self::new_unscaled(div + 1, self.sign);
        } else {
            return Self::new_unscaled(div, self.sign);
        }
    }

    fn sqrt(self: Fixed) -> Fixed {
        assert(!self.sign, 'sqrt of negative');
        let val: u128 = self.mag.into() * ONE.into();
        let root = Sqrt::<u128>::sqrt(val);
        Self::new(root.try_into().unwrap(), false)
    }

    fn exp(self: Fixed) -> Fixed {
        crate::math::exp(self)
    }

    fn exp2(self: Fixed) -> Fixed {
        crate::math::exp2(self)
    }

    fn ln(self: Fixed) -> Fixed {
        crate::math::ln(self)
    }

    fn log2(self: Fixed) -> Fixed {
        crate::math::log2(self)
    }

    fn log10(self: Fixed) -> Fixed {
        crate::math::log10(self)
    }

    fn pow(self: Fixed, b: Fixed) -> Fixed {
        crate::math::pow(self, b)
    }
}

// Implement Add trait
impl FixedAdd of core::traits::Add<Fixed> {
    fn add(lhs: Fixed, rhs: Fixed) -> Fixed {
        crate::math::add(lhs, rhs)
    }
}

// Implement Sub trait
impl FixedSub of core::traits::Sub<Fixed> {
    fn sub(lhs: Fixed, rhs: Fixed) -> Fixed {
        crate::math::sub(lhs, rhs)
    }
}

// Implement Mul trait
impl FixedMul of core::traits::Mul<Fixed> {
    fn mul(lhs: Fixed, rhs: Fixed) -> Fixed {
        crate::math::mul(lhs, rhs)
    }
}

// Implement Div trait
impl FixedDiv of core::traits::Div<Fixed> {
    fn div(lhs: Fixed, rhs: Fixed) -> Fixed {
        crate::math::div(lhs, rhs)
    }
}

// Implement Neg trait
impl FixedNeg of core::traits::Neg<Fixed> {
    fn neg(a: Fixed) -> Fixed {
        crate::math::neg(a)
    }
}

// Implement PartialOrd
impl FixedPartialOrd of core::traits::PartialOrd<Fixed> {
    fn lt(lhs: Fixed, rhs: Fixed) -> bool {
        crate::math::lt(lhs, rhs)
    }
    fn le(lhs: Fixed, rhs: Fixed) -> bool {
        crate::math::le(lhs, rhs)
    }
    fn gt(lhs: Fixed, rhs: Fixed) -> bool {
        crate::math::gt(lhs, rhs)
    }
    fn ge(lhs: Fixed, rhs: Fixed) -> bool {
        crate::math::ge(lhs, rhs)
    }
}

// Implement TryInto for converting Fixed to u64
impl FixedIntoU64 of TryInto<Fixed, u64> {
    fn try_into(self: Fixed) -> Option<u64> {
        if self.sign {
            Option::None
        } else {
            let (div, _rem) = safe_divmod(self.mag, ONE);
            Option::Some(div)
        }
    }
}

// Implement Into for felt252
impl FixedIntoFelt252 of Into<Fixed, felt252> {
    fn into(self: Fixed) -> felt252 {
        let val: u256 = self.mag.into();
        if self.sign {
            return (val.low * 0xffffffffffffffffffffffffffffffff).into();
        } else {
            return val.low.into();
        }
    }
}
