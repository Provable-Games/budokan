// SPDX-License-Identifier: BUSL-1.1

use budokan_prize::models::{Prize, PrizeType};

#[starknet::interface]
pub trait IPrize<TState> {
    /// Get a prize by its ID
    fn get_prize(self: @TState, prize_id: u64) -> Prize;

    /// Get total prizes count
    fn get_total_prizes(self: @TState) -> u64;

    /// Check if a prize has been claimed
    fn is_prize_claimed(self: @TState, context_id: u64, prize_type: PrizeType) -> bool;
}
