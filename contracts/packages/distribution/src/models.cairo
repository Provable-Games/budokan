// SPDX-License-Identifier: BUSL-1.1

/// Basis points constant: 10000 = 100%
pub const BASIS_POINTS: u16 = 10000;

/// Distribution type for asset payouts
/// Determines how shares are calculated across positions
#[derive(Drop, Copy, Serde, PartialEq)]
pub enum Distribution {
    /// Linear decreasing distribution with configurable weight
    /// Position i gets weight * (n - i + 1) / sum(weight * 1..n) of available share
    /// Weight is 10-1000 (scaled by 10 for 1 decimal place)
    /// E.g. 10 = 1.0, 15 = 1.5, 25 = 2.5, 100 = 10.0
    /// Higher weight = steeper drop from 1st to last
    /// Example with weight=10 (1.0) and 3 positions: 1st=50%, 2nd=33%, 3rd=17%
    /// Example with weight=100 (10.0) and 3 positions: 1st=~69%, 2nd=~23%, 3rd=~8%
    Linear: u16,
    /// Exponential distribution with configurable steepness
    /// Uses formula: share = (1 - (i-1)/n)^weight, then normalized
    /// Weight is 10-1000 (scaled by 10 for 1 decimal place)
    /// E.g. 10 = 1.0, 15 = 1.5, 25 = 2.5, 100 = 10.0
    /// Higher weight = steeper curve toward top positions
    Exponential: u16,
    /// Uniform distribution - all positions get equal share
    /// Each position gets available_share / total_positions
    /// Useful for quests, airdrops, participation rewards
    Uniform,
    /// Custom distribution with user-defined shares per position
    /// Span contains the share (in basis points) for each position
    /// Shares should sum to available_share (will be normalized with dust if not exact)
    Custom: Span<u16>,
}

// Distribution type constants for storage packing
pub const DIST_TYPE_LINEAR: u8 = 0;
pub const DIST_TYPE_EXPONENTIAL: u8 = 1;
pub const DIST_TYPE_UNIFORM: u8 = 2;
pub const DIST_TYPE_CUSTOM: u8 = 3;
