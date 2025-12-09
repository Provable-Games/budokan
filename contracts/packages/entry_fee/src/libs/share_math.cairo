// SPDX-License-Identifier: BUSL-1.1

//! Pure mathematical functions for additional share packing
//! These functions operate only on inputs without any storage access

/// Number of additional shares packed per storage slot
/// Each share = 15 bits (14 bits share_bps + 1 bit claimed)
/// felt252 = 252 bits, so we can fit 16 shares per slot (16 * 15 = 240 bits)
pub const SHARES_PER_SLOT: u8 = 16;

// Bit masks
const MASK_1: u128 = 0x1; // 1 bit
const MASK_14: u128 = 0x3FFF; // 14 bits of 1s (max 16383)
const MASK_15: u256 = 0x7FFF; // 15 bits of 1s
const TWO_POW_14: u256 = 0x4000; // 2^14

/// Power of 2 for u256 (optimized for multiples of 15 used in share packing)
pub fn pow_2_u256_15(exp: u256) -> u256 {
    if exp == 0 {
        return 1;
    }
    if exp == 15 {
        return 0x8000;
    }
    if exp == 30 {
        return 0x40000000;
    }
    if exp == 45 {
        return 0x200000000000;
    }
    if exp == 60 {
        return 0x1000000000000000;
    }
    if exp == 75 {
        return 0x8000000000000000000;
    }
    if exp == 90 {
        return 0x40000000000000000000000;
    }
    if exp == 105 {
        return 0x200000000000000000000000000;
    }
    if exp == 120 {
        return 0x1000000000000000000000000000000;
    }
    if exp == 135 {
        return 0x8000000000000000000000000000000000;
    }
    if exp == 150 {
        return 0x40000000000000000000000000000000000000;
    }
    if exp == 165 {
        return 0x200000000000000000000000000000000000000000;
    }
    if exp == 180 {
        return 0x1000000000000000000000000000000000000000000000;
    }
    if exp == 195 {
        return 0x8000000000000000000000000000000000000000000000000;
    }
    if exp == 210 {
        return 0x40000000000000000000000000000000000000000000000000000;
    }
    if exp == 225 {
        return 0x200000000000000000000000000000000000000000000000000000000;
    }
    // Fallback (should not be reached for valid indices 0-15)
    let mut result: u256 = 1;
    let mut i: u256 = 0;
    while i < exp {
        result = result * 2;
        i += 1;
    }
    result
}

/// Extract a 15-bit share from a packed u256 value at the given index
/// Returns (share_bps, claimed)
/// index must be 0-15 (16 shares per slot)
pub fn get_packed_share(packed: u256, index: u8) -> (u16, bool) {
    assert!(index < SHARES_PER_SLOT, "Index out of bounds");
    let shift: u256 = (index.into() * 15_u32).into();
    let divisor: u256 = pow_2_u256_15(shift);
    let value: u256 = (packed / divisor) & MASK_15;
    let share_bps: u16 = (value & MASK_14.into()).try_into().unwrap();
    let claimed: bool = ((value / TWO_POW_14) & MASK_1.into()) == 1;
    (share_bps, claimed)
}

/// Set a 15-bit share in a packed u256 value at the given index
/// Returns the new packed value
/// index must be 0-15 (16 shares per slot)
pub fn set_packed_share(packed: u256, index: u8, share_bps: u16, claimed: bool) -> u256 {
    assert!(index < SHARES_PER_SLOT, "Index out of bounds");
    let shift: u256 = (index.into() * 15_u32).into();
    let multiplier: u256 = pow_2_u256_15(shift);
    let mask: u256 = MASK_15 * multiplier;
    let claimed_bit: u256 = if claimed {
        1
    } else {
        0
    };
    let share_value: u256 = share_bps.into() + (claimed_bit * TWO_POW_14);
    let shifted_value: u256 = share_value * multiplier;
    // Clear existing value at index and set new value
    (packed & ~mask) | shifted_value
}

/// Calculate the slot index and position within slot for a given share index
/// Returns (slot_index, index_within_slot)
pub fn calculate_slot_position(share_index: u32) -> (u8, u8) {
    let slot_index: u8 = (share_index / SHARES_PER_SLOT.into()).try_into().unwrap();
    let index_in_slot: u8 = (share_index % SHARES_PER_SLOT.into()).try_into().unwrap();
    (slot_index, index_in_slot)
}

#[cfg(test)]
mod tests {
    use super::{get_packed_share, pow_2_u256_15, set_packed_share, SHARES_PER_SLOT};

    #[test]
    fn test_pow_2_common_values() {
        assert!(pow_2_u256_15(0) == 1, "2^0 should be 1");
        assert!(pow_2_u256_15(15) == 0x8000, "2^15 mismatch");
        assert!(pow_2_u256_15(30) == 0x40000000, "2^30 mismatch");
    }

    #[test]
    fn test_get_set_packed_share() {
        let packed: u256 = 0;

        // Set share at index 0 (not claimed)
        let packed = set_packed_share(packed, 0, 1000, false);
        let (share_bps, claimed) = get_packed_share(packed, 0);
        assert!(share_bps == 1000, "share 0 bps mismatch");
        assert!(!claimed, "share 0 should not be claimed");

        // Set share at index 5 (claimed)
        let packed = set_packed_share(packed, 5, 5000, true);
        let (share_bps, claimed) = get_packed_share(packed, 5);
        assert!(share_bps == 5000, "share 5 bps mismatch");
        assert!(claimed, "share 5 should be claimed");

        // Verify share 0 unchanged
        let (share_bps, claimed) = get_packed_share(packed, 0);
        assert!(share_bps == 1000, "share 0 should be unchanged");
        assert!(!claimed, "share 0 claim status should be unchanged");
    }

    #[test]
    fn test_shares_per_slot_constant() {
        assert!(SHARES_PER_SLOT == 16, "SHARES_PER_SLOT should be 16");
    }
}
