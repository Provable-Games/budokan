// SPDX-License-Identifier: BUSL-1.1

use budokan_entry_fee::models::{
    PackedAdditionalSharesImpl, PackedAdditionalSharesTrait, SHARES_PER_SLOT, StoredAdditionalShare,
};

/// Test basic pack/unpack roundtrip for a single share
#[test]
fn test_single_share_roundtrip() {
    let mut packed = PackedAdditionalSharesImpl::new();
    let share = StoredAdditionalShare { share_bps: 1000, claimed: false };

    packed.set_share(0, share);
    let retrieved = packed.get_share(0);

    assert!(retrieved.share_bps == 1000, "share_bps mismatch");
    assert!(retrieved.claimed == false, "claimed mismatch");
}

/// Test pack/unpack with claimed = true
#[test]
fn test_share_with_claimed_true() {
    let mut packed = PackedAdditionalSharesImpl::new();
    let share = StoredAdditionalShare { share_bps: 5000, claimed: true };

    packed.set_share(0, share);
    let retrieved = packed.get_share(0);

    assert!(retrieved.share_bps == 5000, "share_bps mismatch");
    assert!(retrieved.claimed == true, "claimed should be true");
}

/// Test maximum share_bps value (10000 = 100%)
#[test]
fn test_max_share_bps() {
    let mut packed = PackedAdditionalSharesImpl::new();
    let share = StoredAdditionalShare { share_bps: 10000, claimed: false };

    packed.set_share(0, share);
    let retrieved = packed.get_share(0);

    assert!(retrieved.share_bps == 10000, "max share_bps mismatch");
}

/// Test packing multiple shares at different indices
#[test]
fn test_multiple_shares_different_indices() {
    let mut packed = PackedAdditionalSharesImpl::new();

    // Set shares at different positions
    packed.set_share(0, StoredAdditionalShare { share_bps: 1000, claimed: false });
    packed.set_share(1, StoredAdditionalShare { share_bps: 2000, claimed: true });
    packed.set_share(2, StoredAdditionalShare { share_bps: 3000, claimed: false });
    packed.set_share(5, StoredAdditionalShare { share_bps: 5000, claimed: true });
    packed.set_share(15, StoredAdditionalShare { share_bps: 9999, claimed: true });

    // Verify each share
    let s0 = packed.get_share(0);
    assert!(s0.share_bps == 1000 && s0.claimed == false, "share 0 mismatch");

    let s1 = packed.get_share(1);
    assert!(s1.share_bps == 2000 && s1.claimed == true, "share 1 mismatch");

    let s2 = packed.get_share(2);
    assert!(s2.share_bps == 3000 && s2.claimed == false, "share 2 mismatch");

    let s5 = packed.get_share(5);
    assert!(s5.share_bps == 5000 && s5.claimed == true, "share 5 mismatch");

    let s15 = packed.get_share(15);
    assert!(s15.share_bps == 9999 && s15.claimed == true, "share 15 mismatch");
}

/// Test that all 16 slots can be used
#[test]
fn test_all_16_slots() {
    let mut packed = PackedAdditionalSharesImpl::new();

    // Fill all 16 slots
    let mut i: u8 = 0;
    while i < 16 {
        let share = StoredAdditionalShare {
            share_bps: (i.into() + 1_u16) * 100, claimed: i % 2 == 0,
        };
        packed.set_share(i, share);
        i += 1;
    }

    // Verify all 16 slots
    let mut j: u8 = 0;
    while j < 16 {
        let retrieved = packed.get_share(j);
        let expected_bps = (j.into() + 1_u16) * 100;
        let expected_claimed = j % 2 == 0;
        assert!(retrieved.share_bps == expected_bps, "share_bps mismatch at index");
        assert!(retrieved.claimed == expected_claimed, "claimed mismatch at index");
        j += 1;
    };
}

/// Test from_array helper
#[test]
fn test_from_array() {
    let shares = array![
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 2000, claimed: true },
        StoredAdditionalShare { share_bps: 3000, claimed: false },
    ];

    let packed = PackedAdditionalSharesImpl::from_array(shares.span());

    let s0 = packed.get_share(0);
    assert!(s0.share_bps == 1000 && s0.claimed == false, "share 0 mismatch");

    let s1 = packed.get_share(1);
    assert!(s1.share_bps == 2000 && s1.claimed == true, "share 1 mismatch");

    let s2 = packed.get_share(2);
    assert!(s2.share_bps == 3000 && s2.claimed == false, "share 2 mismatch");
}

/// Test to_array helper
#[test]
fn test_to_array() {
    let mut packed = PackedAdditionalSharesImpl::new();
    packed.set_share(0, StoredAdditionalShare { share_bps: 1000, claimed: false });
    packed.set_share(1, StoredAdditionalShare { share_bps: 2000, claimed: true });
    packed.set_share(2, StoredAdditionalShare { share_bps: 3000, claimed: false });

    let result = packed.to_array(3);

    assert!(result.len() == 3, "array length mismatch");
    assert!(*result.at(0).share_bps == 1000, "share 0 mismatch");
    assert!(*result.at(1).share_bps == 2000, "share 1 mismatch");
    assert!(*result.at(2).share_bps == 3000, "share 2 mismatch");
}

/// Test updating a share (overwriting)
#[test]
fn test_update_share() {
    let mut packed = PackedAdditionalSharesImpl::new();

    // Set initial value
    packed.set_share(5, StoredAdditionalShare { share_bps: 1000, claimed: false });

    // Update to new value
    packed.set_share(5, StoredAdditionalShare { share_bps: 9000, claimed: true });

    let retrieved = packed.get_share(5);
    assert!(retrieved.share_bps == 9000, "updated share_bps mismatch");
    assert!(retrieved.claimed == true, "updated claimed mismatch");
}

/// Test that updating one share doesn't affect others
#[test]
fn test_update_isolation() {
    let mut packed = PackedAdditionalSharesImpl::new();

    // Set multiple shares
    packed.set_share(0, StoredAdditionalShare { share_bps: 1000, claimed: false });
    packed.set_share(1, StoredAdditionalShare { share_bps: 2000, claimed: true });
    packed.set_share(2, StoredAdditionalShare { share_bps: 3000, claimed: false });

    // Update middle share
    packed.set_share(1, StoredAdditionalShare { share_bps: 9999, claimed: false });

    // Verify others unchanged
    let s0 = packed.get_share(0);
    assert!(s0.share_bps == 1000 && s0.claimed == false, "share 0 was affected");

    let s2 = packed.get_share(2);
    assert!(s2.share_bps == 3000 && s2.claimed == false, "share 2 was affected");

    // Verify updated share
    let s1 = packed.get_share(1);
    assert!(s1.share_bps == 9999 && s1.claimed == false, "share 1 not updated correctly");
}

/// Test empty packed struct has zero values
#[test]
fn test_empty_packed() {
    let packed = PackedAdditionalSharesImpl::new();

    let s0 = packed.get_share(0);
    assert!(s0.share_bps == 0, "empty should have zero share_bps");
    assert!(s0.claimed == false, "empty should have claimed = false");
}

/// Gas comparison test: Packing 8 shares
/// This test demonstrates the gas savings from packed storage
#[test]
fn test_gas_pack_8_shares() {
    let shares = array![
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 1000, claimed: false },
        StoredAdditionalShare { share_bps: 1000, claimed: false },
    ];

    // Pack 8 shares into a single felt252
    let packed = PackedAdditionalSharesImpl::from_array(shares.span());

    // Unpack and verify all 8
    let result = packed.to_array(8);
    assert!(result.len() == 8, "should have 8 shares");

    let mut i: u32 = 0;
    while i < 8 {
        assert!(*result.at(i).share_bps == 1000, "share mismatch");
        i += 1;
    };
}

/// Gas comparison test: Packing 16 shares (max per slot)
#[test]
fn test_gas_pack_16_shares() {
    let shares = array![
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
        StoredAdditionalShare { share_bps: 500, claimed: false },
        StoredAdditionalShare { share_bps: 500, claimed: true },
    ];

    // Pack 16 shares into a single felt252
    let packed = PackedAdditionalSharesImpl::from_array(shares.span());

    // Unpack and verify all 16
    let result = packed.to_array(16);
    assert!(result.len() == 16, "should have 16 shares");

    let mut i: u32 = 0;
    while i < 16 {
        assert!(*result.at(i).share_bps == 500, "share_bps mismatch");
        assert!(*result.at(i).claimed == (i % 2 == 1), "claimed mismatch");
        i += 1;
    };
}

/// Test boundary values for share_bps (14 bits max = 16383)
#[test]
fn test_boundary_share_bps() {
    let mut packed = PackedAdditionalSharesImpl::new();

    // Max 14-bit value
    let max_14_bit: u16 = 16383;
    packed.set_share(0, StoredAdditionalShare { share_bps: max_14_bit, claimed: true });

    let retrieved = packed.get_share(0);
    assert!(retrieved.share_bps == max_14_bit, "max 14-bit value mismatch");
    assert!(retrieved.claimed == true, "claimed mismatch");
}

/// Test SHARES_PER_SLOT constant
#[test]
fn test_shares_per_slot_constant() {
    assert!(SHARES_PER_SLOT == 16, "SHARES_PER_SLOT should be 16");
}
