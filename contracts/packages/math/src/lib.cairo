// SPDX-License-Identifier: MIT
// Based on Cubit by Influence - https://github.com/influenceth/cubit
// Fixed-point math library using 32.32 bit representation

pub mod lut;
pub mod math;
pub mod types;

// Re-export commonly used items
pub use types::{Fixed, FixedTrait, HALF, ONE};
