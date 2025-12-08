// SPDX-License-Identifier: BUSL-1.1

/// Mock contract that embeds the EntryFeeComponent for testing storage gas
#[starknet::contract]
pub mod EntryFeeMock {
    use budokan_entry_fee::entry_fee::EntryFeeComponent;
    use budokan_entry_fee::models::{AdditionalShare, EntryFee, EntryFeeClaimType};
    use starknet::ContractAddress;

    component!(path: EntryFeeComponent, storage: entry_fee, event: EntryFeeEvent);

    #[abi(embed_v0)]
    impl EntryFeeImpl = EntryFeeComponent::EntryFeeImpl<ContractState>;

    impl EntryFeeInternalImpl = EntryFeeComponent::EntryFeeInternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        entry_fee: EntryFeeComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        EntryFeeEvent: EntryFeeComponent::Event,
    }

    #[external(v0)]
    fn set_entry_fee(ref self: ContractState, context_id: u64, entry_fee: EntryFee) {
        self.entry_fee.set_entry_fee(context_id, @entry_fee);
    }

    #[external(v0)]
    fn get_additional_shares(self: @ContractState, context_id: u64) -> Span<AdditionalShare> {
        self.entry_fee._get_additional_shares(context_id)
    }

    #[external(v0)]
    fn is_claimed(self: @ContractState, context_id: u64, claim_type: EntryFeeClaimType) -> bool {
        self.entry_fee.is_claimed(context_id, claim_type)
    }

    #[external(v0)]
    fn set_claimed(ref self: ContractState, context_id: u64, claim_type: EntryFeeClaimType) {
        self.entry_fee.set_claimed(context_id, claim_type);
    }
}
