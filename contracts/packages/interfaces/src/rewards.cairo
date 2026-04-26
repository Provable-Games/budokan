// SPDX-License-Identifier: BUSL-1.1

//! Interface for the BudokanRewards library class.
//!
//! BudokanRewards is invoked via `library_call_syscall` from the main Budokan
//! contract: the bytecode lives in a separate declared class but executes in
//! Budokan's storage context. This split keeps the main contract under the
//! 81,920-felt limit while allowing aggressive inlining in the hot paths.
//!
//! These selectors must match Budokan's external selectors (`add_prize`,
//! `claim_reward`) so that callers and indexers see identical event/return
//! semantics regardless of which class the code lives in.

use crate::budokan::{PrizeData, RewardType, TokenTypeData};
use starknet::ContractAddress;

#[starknet::interface]
pub trait IBudokanRewards<TState> {
    fn claim_reward(ref self: TState, tournament_id: u64, reward_type: RewardType);

    fn add_prize(
        ref self: TState,
        tournament_id: u64,
        token_address: ContractAddress,
        token_type: TokenTypeData,
        position: Option<u32>,
    ) -> PrizeData;
}
