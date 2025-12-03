// SPDX-License-Identifier: BUSL-1.1

/// Basis points constant: 10000 = 100%
pub const BASIS_POINTS: u16 = 10000;

/// Distribution type for asset payouts
/// Determines how shares are calculated across positions
#[derive(Copy, Drop, Serde, PartialEq)]
pub enum Distribution {
    /// Linear decreasing distribution
    /// Position i gets (n - i + 1) / sum(1..n) of available share
    /// Example with 3 positions: 1st=50%, 2nd=33%, 3rd=17%
    Linear,
    /// Exponential distribution with configurable steepness
    /// Uses formula: share = (1 - (i-1)/n)^weight, then normalized
    /// Weight is 1-100 where higher = steeper curve toward top positions
    Exponential: u8,
    /// Uniform distribution - all positions get equal share
    /// Each position gets available_share / total_positions
    /// Useful for quests, airdrops, participation rewards
    Uniform,
    /// Custom distribution with user-defined shares per position
    /// Shares are passed directly to calculate functions
    /// Shares must sum to available_share
    Custom,
}

// Distribution type constants for storage packing
pub const DIST_TYPE_LINEAR: u8 = 0;
pub const DIST_TYPE_EXPONENTIAL: u8 = 1;
pub const DIST_TYPE_UNIFORM: u8 = 2;
pub const DIST_TYPE_CUSTOM: u8 = 3;
