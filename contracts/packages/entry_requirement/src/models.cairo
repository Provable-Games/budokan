// SPDX-License-Identifier: BUSL-1.1

// Re-export all types from budokan_interfaces::entry_requirement
pub use budokan_interfaces::entry_requirement::{
    EntryRequirement, EntryRequirementType, ExtensionConfig, NFTQualification, QualificationEntries,
    QualificationProof,
};
use starknet::storage_access::StorePacking;

/// Entry requirement metadata
/// Packs: entry_limit (u32) | req_type (u8) into a single u64
/// Total: 32 + 8 = 40 bits -> fits in u64
/// req_type: 0=token, 1=allowlist, 2=extension, 255=None
#[derive(Copy, Drop, Serde)]
pub struct EntryRequirementMeta {
    pub entry_limit: u32, // Max ~4.3B entries per qualified address
    pub req_type: u8 // 255 = None (no entry requirement)
}

pub impl EntryRequirementMetaStorePacking of StorePacking<EntryRequirementMeta, u64> {
    fn pack(value: EntryRequirementMeta) -> u64 {
        let packed: u64 = (value.entry_limit.into() * 0x100_u64) + value.req_type.into();
        packed
    }

    fn unpack(value: u64) -> EntryRequirementMeta {
        let entry_limit: u32 = (value / 0x100_u64).try_into().unwrap();
        let req_type: u8 = (value % 0x100_u64).try_into().unwrap();

        EntryRequirementMeta { entry_limit, req_type }
    }
}
