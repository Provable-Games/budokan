// SPDX-License-Identifier: BUSL-1.1

use budokan_prize::models::{CUSTOM_SHARES_PER_SLOT, CustomSharesImpl, CustomSharesTrait};

/// Test basic pack/unpack roundtrip for a single share
#[test]
fn test_single_share_roundtrip() {
    let mut packed = CustomSharesImpl::new();

    packed.set_share(0, 1000);
    let retrieved = packed.get_share(0);

    assert!(retrieved == 1000, "share mismatch");
}

/// Test maximum u16 value
#[test]
fn test_max_u16_value() {
    let mut packed = CustomSharesImpl::new();
    let max_u16: u16 = 65535;

    packed.set_share(0, max_u16);
    let retrieved = packed.get_share(0);

    assert!(retrieved == max_u16, "max u16 mismatch");
}

/// Test packing multiple shares at different indices
#[test]
fn test_multiple_shares_different_indices() {
    let mut packed = CustomSharesImpl::new();

    // Set shares at different positions
    packed.set_share(0, 1000);
    packed.set_share(1, 2000);
    packed.set_share(2, 3000);
    packed.set_share(7, 7000);
    packed.set_share(14, 14000);

    // Verify each share
    assert!(packed.get_share(0) == 1000, "share 0 mismatch");
    assert!(packed.get_share(1) == 2000, "share 1 mismatch");
    assert!(packed.get_share(2) == 3000, "share 2 mismatch");
    assert!(packed.get_share(7) == 7000, "share 7 mismatch");
    assert!(packed.get_share(14) == 14000, "share 14 mismatch");
}

/// Test that all 15 slots can be used
#[test]
fn test_all_15_slots() {
    let mut packed = CustomSharesImpl::new();

    // Fill all 15 slots
    let mut i: u8 = 0;
    while i < 15 {
        let value: u16 = (i.into() + 1_u16) * 100;
        packed.set_share(i, value);
        i += 1;
    }

    // Verify all 15 slots
    let mut j: u8 = 0;
    while j < 15 {
        let retrieved = packed.get_share(j);
        let expected: u16 = (j.into() + 1_u16) * 100;
        assert!(retrieved == expected, "share mismatch at index");
        j += 1;
    };
}

/// Test from_array helper
#[test]
fn test_from_array() {
    let shares: Array<u16> = array![1000, 2000, 3000, 4000, 5000];

    let packed = CustomSharesImpl::from_array(shares.span());

    assert!(packed.get_share(0) == 1000, "share 0 mismatch");
    assert!(packed.get_share(1) == 2000, "share 1 mismatch");
    assert!(packed.get_share(2) == 3000, "share 2 mismatch");
    assert!(packed.get_share(3) == 4000, "share 3 mismatch");
    assert!(packed.get_share(4) == 5000, "share 4 mismatch");
}

/// Test to_array helper
#[test]
fn test_to_array() {
    let mut packed = CustomSharesImpl::new();
    packed.set_share(0, 1000);
    packed.set_share(1, 2000);
    packed.set_share(2, 3000);

    let result = packed.to_array(3);

    assert!(result.len() == 3, "array length mismatch");
    assert!(*result.at(0) == 1000, "share 0 mismatch");
    assert!(*result.at(1) == 2000, "share 1 mismatch");
    assert!(*result.at(2) == 3000, "share 2 mismatch");
}

/// Test updating a share (overwriting)
#[test]
fn test_update_share() {
    let mut packed = CustomSharesImpl::new();

    // Set initial value
    packed.set_share(5, 1000);

    // Update to new value
    packed.set_share(5, 9000);

    let retrieved = packed.get_share(5);
    assert!(retrieved == 9000, "updated share mismatch");
}

/// Test that updating one share doesn't affect others
#[test]
fn test_update_isolation() {
    let mut packed = CustomSharesImpl::new();

    // Set multiple shares
    packed.set_share(0, 1000);
    packed.set_share(1, 2000);
    packed.set_share(2, 3000);

    // Update middle share
    packed.set_share(1, 9999);

    // Verify others unchanged
    assert!(packed.get_share(0) == 1000, "share 0 was affected");
    assert!(packed.get_share(2) == 3000, "share 2 was affected");

    // Verify updated share
    assert!(packed.get_share(1) == 9999, "share 1 not updated correctly");
}

/// Test empty packed struct has zero values
#[test]
fn test_empty_packed() {
    let packed = CustomSharesImpl::new();

    let s0 = packed.get_share(0);
    assert!(s0 == 0, "empty should have zero share");
}

/// Gas comparison test: Packing 10 shares (common tournament size)
/// Before optimization: 10 storage reads
/// After optimization: 1 storage read (all 10 in single felt252)
#[test]
fn test_gas_pack_10_shares() {
    let shares: Array<u16> = array![5000, 2500, 1250, 625, 312, 156, 78, 39, 20, 20];

    // Pack 10 shares into a single felt252
    let packed = CustomSharesImpl::from_array(shares.span());

    // Unpack and verify all 10
    let result = packed.to_array(10);
    assert!(result.len() == 10, "should have 10 shares");

    assert!(*result.at(0) == 5000, "share 0 mismatch");
    assert!(*result.at(1) == 2500, "share 1 mismatch");
    assert!(*result.at(2) == 1250, "share 2 mismatch");
    assert!(*result.at(9) == 20, "share 9 mismatch");
}

/// Gas comparison test: Packing 15 shares (max per slot)
/// Before optimization: 15 storage reads
/// After optimization: 1 storage read (all 15 in single felt252)
#[test]
fn test_gas_pack_15_shares() {
    let shares: Array<u16> = array![
        1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 90, 80, 70, 60, 100,
    ];

    // Pack 15 shares into a single felt252
    let packed = CustomSharesImpl::from_array(shares.span());

    // Unpack and verify all 15
    let result = packed.to_array(15);
    assert!(result.len() == 15, "should have 15 shares");

    // Verify first and last
    assert!(*result.at(0) == 1000, "first share mismatch");
    assert!(*result.at(14) == 100, "last share mismatch");

    // Verify sum is reasonable for a distribution (should be close to 10000 bps)
    let mut sum: u32 = 0;
    let mut i: u32 = 0;
    while i < 15 {
        sum += (*result.at(i)).into();
        i += 1;
    }
    assert!(sum == 5900, "sum of shares mismatch");
}

/// Test typical exponential-like distribution (common use case)
#[test]
fn test_exponential_distribution_pattern() {
    // Simulating a typical exponential prize distribution
    let shares: Array<u16> = array![
        4000, // 1st place: 40%
        2000, // 2nd place: 20%
        1000, // 3rd place: 10%
        750, // 4th place: 7.5%
        500, // 5th place: 5%
        400, // 6th place: 4%
        350, // 7th place: 3.5%
        300, // 8th place: 3%
        250, // 9th place: 2.5%
        200, // 10th place: 2%
        150, // 11th-15th split remaining 2.5%
        50, 25, 15, 10,
    ];

    let packed = CustomSharesImpl::from_array(shares.span());
    let result = packed.to_array(15);

    // Verify the distribution maintains its values after pack/unpack
    assert!(*result.at(0) == 4000, "1st place mismatch");
    assert!(*result.at(1) == 2000, "2nd place mismatch");
    assert!(*result.at(2) == 1000, "3rd place mismatch");
    assert!(*result.at(9) == 200, "10th place mismatch");

    // Calculate total
    let mut total: u32 = 0;
    let mut i: u32 = 0;
    while i < 15 {
        total += (*result.at(i)).into();
        i += 1;
    }
    assert!(total == 10000, "total should be 10000 bps (100%)");
}

/// Test CUSTOM_SHARES_PER_SLOT constant
#[test]
fn test_custom_shares_per_slot_constant() {
    assert!(CUSTOM_SHARES_PER_SLOT == 15, "CUSTOM_SHARES_PER_SLOT should be 15");
}

/// Test zero value shares
#[test]
fn test_zero_value_shares() {
    let mut packed = CustomSharesImpl::new();

    // Set some shares to zero explicitly
    packed.set_share(0, 1000);
    packed.set_share(1, 0);
    packed.set_share(2, 500);

    assert!(packed.get_share(0) == 1000, "share 0 mismatch");
    assert!(packed.get_share(1) == 0, "share 1 should be 0");
    assert!(packed.get_share(2) == 500, "share 2 mismatch");
}

/// Test that sparse array (gaps) works correctly
#[test]
fn test_sparse_shares() {
    let mut packed = CustomSharesImpl::new();

    // Only set a few shares, leave gaps
    packed.set_share(0, 5000);
    packed.set_share(5, 3000);
    packed.set_share(14, 2000);

    // Verify set values
    assert!(packed.get_share(0) == 5000, "share 0 mismatch");
    assert!(packed.get_share(5) == 3000, "share 5 mismatch");
    assert!(packed.get_share(14) == 2000, "share 14 mismatch");

    // Verify gaps are zero
    assert!(packed.get_share(1) == 0, "share 1 should be 0");
    assert!(packed.get_share(4) == 0, "share 4 should be 0");
    assert!(packed.get_share(10) == 0, "share 10 should be 0");
}
