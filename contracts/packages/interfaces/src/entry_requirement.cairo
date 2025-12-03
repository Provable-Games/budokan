// SPDX-License-Identifier: BUSL-1.1

use budokan_entry_requirement::models::{EntryRequirement, QualificationEntries, QualificationProof};

#[starknet::interface]
pub trait IEntryRequirement<TState> {
    /// Get entry requirement configuration for a context (tournament, quest, etc.)
    /// Returns None if no entry requirement is set
    fn get_entry_requirement(self: @TState, context_id: u64) -> Option<EntryRequirement>;

    /// Get qualification entries for a context and qualification proof
    fn get_qualification_entries(
        self: @TState, context_id: u64, proof: QualificationProof,
    ) -> QualificationEntries;
}
