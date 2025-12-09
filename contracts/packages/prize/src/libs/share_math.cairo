// SPDX-License-Identifier: BUSL-1.1

//! Pure mathematical functions for share calculations and bit packing
//! These functions operate only on inputs without any storage access

/// Number of custom shares (u16) packed per storage slot
/// Each share = 16 bits, felt252 = 252 bits, so we can fit 15 shares per slot (15 * 16 = 240 bits)
pub const SHARES_PER_SLOT: u8 = 15;

const MASK_16: u256 = 0xFFFF;

/// Power of 2 for u256 (optimized for multiples of 16 used in share packing)
/// Returns 2^exp for common exponents used in 16-bit share packing
pub fn pow_2_u256_16(exp: u256) -> u256 {
    if exp == 0 {
        return 1;
    }
    if exp == 16 {
        return 0x10000;
    }
    if exp == 32 {
        return 0x100000000;
    }
    if exp == 48 {
        return 0x1000000000000;
    }
    if exp == 64 {
        return 0x10000000000000000;
    }
    if exp == 80 {
        return 0x100000000000000000000;
    }
    if exp == 96 {
        return 0x1000000000000000000000000;
    }
    if exp == 112 {
        return 0x10000000000000000000000000000;
    }
    if exp == 128 {
        return 0x100000000000000000000000000000000;
    }
    if exp == 144 {
        return 0x1000000000000000000000000000000000000;
    }
    if exp == 160 {
        return 0x10000000000000000000000000000000000000000;
    }
    if exp == 176 {
        return 0x100000000000000000000000000000000000000000000;
    }
    if exp == 192 {
        return 0x1000000000000000000000000000000000000000000000000;
    }
    if exp == 208 {
        return 0x10000000000000000000000000000000000000000000000000000;
    }
    if exp == 224 {
        return 0x100000000000000000000000000000000000000000000000000000000;
    }
    // Fallback (should not be reached for valid indices 0-14)
    let mut result: u256 = 1;
    let mut i: u256 = 0;
    while i < exp {
        result = result * 2;
        i += 1;
    }
    result
}

/// Extract a 16-bit share from a packed u256 value at the given index
/// index must be 0-14 (15 shares per slot)
pub fn get_packed_share(packed: u256, index: u8) -> u16 {
    assert!(index < SHARES_PER_SLOT, "Index out of bounds");
    let shift: u256 = (index.into() * 16_u32).into();
    let divisor: u256 = pow_2_u256_16(shift);
    let value: u256 = (packed / divisor) & MASK_16;
    value.try_into().unwrap()
}

/// Set a 16-bit share in a packed u256 value at the given index
/// index must be 0-14 (15 shares per slot)
/// Returns the new packed value
pub fn set_packed_share(packed: u256, index: u8, share: u16) -> u256 {
    assert!(index < SHARES_PER_SLOT, "Index out of bounds");
    let shift: u256 = (index.into() * 16_u32).into();
    let multiplier: u256 = pow_2_u256_16(shift);
    let mask: u256 = MASK_16 * multiplier;
    let shifted_value: u256 = share.into() * multiplier;
    (packed & ~mask) | shifted_value
}

/// Calculate the slot index and position within slot for a given share index
/// Returns (slot_index, index_within_slot)
pub fn calculate_slot_position(share_index: u32) -> (u8, u8) {
    let slot_index: u8 = (share_index / SHARES_PER_SLOT.into()).try_into().unwrap();
    let index_in_slot: u8 = (share_index % SHARES_PER_SLOT.into()).try_into().unwrap();
    (slot_index, index_in_slot)
}

/// Calculate the number of storage slots needed for a given number of shares
pub fn calculate_slots_needed(share_count: u32) -> u8 {
    if share_count == 0 {
        return 0;
    }
    let slots = (share_count + SHARES_PER_SLOT.into() - 1) / SHARES_PER_SLOT.into();
    slots.try_into().unwrap()
}

#[cfg(test)]
mod tests {
    use super::{
        calculate_slot_position, calculate_slots_needed, get_packed_share, pow_2_u256_16,
        set_packed_share, SHARES_PER_SLOT,
    };

    #[test]
    fn test_pow_2_common_values() {
        assert!(pow_2_u256_16(0) == 1, "2^0 should be 1");
        assert!(pow_2_u256_16(16) == 0x10000, "2^16 mismatch");
        assert!(pow_2_u256_16(32) == 0x100000000, "2^32 mismatch");
        assert!(pow_2_u256_16(64) == 0x10000000000000000, "2^64 mismatch");
    }

    #[test]
    fn test_get_set_packed_share() {
        let packed: u256 = 0;

        // Set share at index 0
        let packed = set_packed_share(packed, 0, 1000);
        assert!(get_packed_share(packed, 0) == 1000, "share 0 mismatch");

        // Set share at index 5
        let packed = set_packed_share(packed, 5, 5000);
        assert!(get_packed_share(packed, 5) == 5000, "share 5 mismatch");
        assert!(get_packed_share(packed, 0) == 1000, "share 0 should be unchanged");

        // Set share at index 14 (max)
        let packed = set_packed_share(packed, 14, 14000);
        assert!(get_packed_share(packed, 14) == 14000, "share 14 mismatch");
    }

    #[test]
    fn test_calculate_slot_position() {
        let (slot, pos) = calculate_slot_position(0);
        assert!(slot == 0 && pos == 0, "index 0 should be slot 0, pos 0");

        let (slot, pos) = calculate_slot_position(14);
        assert!(slot == 0 && pos == 14, "index 14 should be slot 0, pos 14");

        let (slot, pos) = calculate_slot_position(15);
        assert!(slot == 1 && pos == 0, "index 15 should be slot 1, pos 0");

        let (slot, pos) = calculate_slot_position(30);
        assert!(slot == 2 && pos == 0, "index 30 should be slot 2, pos 0");
    }

    #[test]
    fn test_calculate_slots_needed() {
        assert!(calculate_slots_needed(0) == 0, "0 shares = 0 slots");
        assert!(calculate_slots_needed(1) == 1, "1 share = 1 slot");
        assert!(calculate_slots_needed(15) == 1, "15 shares = 1 slot");
        assert!(calculate_slots_needed(16) == 2, "16 shares = 2 slots");
        assert!(calculate_slots_needed(30) == 2, "30 shares = 2 slots");
        assert!(calculate_slots_needed(31) == 3, "31 shares = 3 slots");
    }

    #[test]
    fn test_shares_per_slot_constant() {
        assert!(SHARES_PER_SLOT == 15, "SHARES_PER_SLOT should be 15");
    }
}
