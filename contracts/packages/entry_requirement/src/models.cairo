// SPDX-License-Identifier: BUSL-1.1

use starknet::ContractAddress;
use starknet::storage_access::StorePacking;

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct EntryRequirement {
    pub entry_limit: u32, // Max ~4.3B entries per qualified address
    pub entry_requirement_type: EntryRequirementType,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum EntryRequirementType {
    token: ContractAddress,
    /// Context-based qualification (e.g., previous tournament winners/participants, quest
    /// completers)
    /// The qualifier_type is application-defined (e.g., 0=winners, 1=participants for tournaments)
    context: ContextQualification,
    allowlist: Span<ContractAddress>,
    extension: ExtensionConfig,
}

/// Generic context-based qualification
/// Applications define what qualifier_type means (e.g., for tournaments: 0=winners, 1=participants)
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct ContextQualification {
    pub context_ids: Span<u64>,
    pub qualifier_type: u8,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub struct ExtensionConfig {
    pub address: ContractAddress,
    pub config: Span<felt252>,
}

#[derive(Copy, Drop, Serde)]
pub struct QualificationEntries {
    pub context_id: u64,
    pub qualification_proof: QualificationProof,
    pub entry_count: u8,
}

#[derive(Copy, Drop, Serde, PartialEq)]
pub enum QualificationProof {
    /// For qualifying via previous context (tournament, quest, etc.)
    Context: ContextProof,
    /// For qualifying via NFT ownership
    NFT: NFTQualification,
    Address: ContractAddress,
    Extension: Span<felt252>,
}

/// Proof of qualification from a previous context
/// The data field is interpreted by the application (e.g., for tournaments it may contain token_id
/// and position)
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct ContextProof {
    pub context_id: u64,
    pub data: Span<felt252>,
}

#[derive(Copy, Drop, Serde, PartialEq, starknet::Store)]
pub struct NFTQualification {
    pub token_id: u256,
}

/// Entry requirement metadata
/// Packs: entry_limit (u32) | req_type (u8) into a single u64
/// Total: 32 + 8 = 40 bits -> fits in u64
/// req_type: 0=token, 1=context, 2=allowlist, 3=extension, 255=None
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
