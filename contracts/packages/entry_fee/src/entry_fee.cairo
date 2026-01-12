// SPDX-License-Identifier: BUSL-1.1

/// EntryFeeComponent handles entry fee storage and deposits for any context.
/// This component manages:
/// - Entry fee configuration per context (tournament, quest, etc.)
/// - Token address and amount
/// - Game creator share and refund share (packed in EntryFeeData)
/// - Additional shares (stored separately)
/// - Entry fee deposit processing

#[starknet::component]
pub mod EntryFeeComponent {
    use budokan_entry_fee::models::{
        AdditionalShare, EntryFee, EntryFeeClaimType, EntryFeeData, EntryFeeDataStorePacking,
        PackedAdditionalShares, PackedAdditionalSharesImpl, PackedAdditionalSharesTrait,
        SHARES_PER_SLOT, StoredAdditionalShare,
    };
    use budokan_interfaces::entry_fee::IEntryFee;
    use core::num::traits::Zero;
    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    #[storage]
    pub struct Storage {
        /// Entry fee token address keyed by context_id
        EntryFee_token: Map<u64, ContractAddress>,
        /// Packed entry fee data keyed by context_id
        /// Contains: amount, game_creator_share, refund_share, game_creator_claimed,
        /// additional_count
        EntryFee_data: Map<u64, EntryFeeData>,
        /// Additional share recipients per context: (context_id, index) -> recipient
        /// Recipients must be stored separately as ContractAddress is 251 bits
        EntryFee_additional_recipient: Map<(u64, u8), ContractAddress>,
        /// Packed additional shares per context: (context_id, slot_index) -> PackedAdditionalShares
        /// Each slot packs up to 16 shares (15 bits each = 240 bits per felt252)
        /// slot_index = share_index / 16
        EntryFee_additional_shares_packed: Map<(u64, u8), PackedAdditionalShares>,
        /// Refund claimed: (context_id, token_id) -> claimed
        EntryFee_refund_claimed: Map<(u64, u64), bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[embeddable_as(EntryFeeImpl)]
    impl EntryFeeComponentImpl<
        TContractState, +HasComponent<TContractState>,
    > of IEntryFee<ComponentState<TContractState>> {
        fn get_entry_fee(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Option<EntryFee> {
            self._get_entry_fee(context_id)
        }
    }

    #[generate_trait]
    pub impl EntryFeeInternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of EntryFeeInternalTrait<TContractState> {
        /// Get entry fee for a context (internal)
        /// Returns None if no entry fee is set (token address is zero)
        fn _get_entry_fee(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Option<EntryFee> {
            let token_address = self.EntryFee_token.entry(context_id).read();

            // If token address is zero, no entry fee is set
            if token_address.is_zero() {
                return Option::None;
            }

            let data = self.EntryFee_data.entry(context_id).read();
            let additional_shares = self._get_additional_shares(context_id);

            // Convert stored shares back to Option<u16>
            // 0 means None
            let game_creator_share = if data.game_creator_share == 0 {
                Option::None
            } else {
                Option::Some(data.game_creator_share)
            };

            let refund_share = if data.refund_share == 0 {
                Option::None
            } else {
                Option::Some(data.refund_share)
            };

            Option::Some(
                EntryFee {
                    token_address,
                    amount: data.amount,
                    game_creator_share,
                    refund_share,
                    additional_shares,
                },
            )
        }

        /// Get additional shares for a context
        /// Uses packed storage: reads 1 slot per 16 shares instead of 1 slot per share
        fn _get_additional_shares(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Span<AdditionalShare> {
            let data = self.EntryFee_data.entry(context_id).read();
            let count = data.additional_count;
            if count == 0 {
                return array![].span();
            }

            let mut shares: Array<AdditionalShare> = ArrayTrait::new();
            let mut current_slot: u8 = 0;
            let mut packed_shares: PackedAdditionalShares = PackedAdditionalSharesImpl::new();

            let mut i: u8 = 0;
            while i < count {
                let slot_index: u8 = i / SHARES_PER_SLOT;
                let index_in_slot: u8 = i % SHARES_PER_SLOT;

                // Load new slot if needed
                if slot_index != current_slot || i == 0 {
                    packed_shares = self
                        .EntryFee_additional_shares_packed
                        .entry((context_id, slot_index))
                        .read();
                    current_slot = slot_index;
                }

                let recipient = self.EntryFee_additional_recipient.entry((context_id, i)).read();
                let stored = packed_shares.get_share(index_in_slot);
                shares.append(AdditionalShare { recipient, share_bps: stored.share_bps });
                i += 1;
            }

            shares.span()
        }

        /// Set entry fee for a context
        /// Uses packed storage: writes 1 slot per 16 shares instead of 1 slot per share
        fn set_entry_fee(
            ref self: ComponentState<TContractState>, context_id: u64, entry_fee: @EntryFee,
        ) {
            // Store token address
            self.EntryFee_token.entry(context_id).write(*entry_fee.token_address);

            // Convert Option<u16> to stored values
            let game_creator_share: u16 = match entry_fee.game_creator_share {
                Option::Some(share) => *share,
                Option::None => 0,
            };

            let refund_share: u16 = match entry_fee.refund_share {
                Option::Some(share) => *share,
                Option::None => 0,
            };

            // Get additional shares count
            let additional_shares = *entry_fee.additional_shares;
            let additional_count: u8 = additional_shares.len().try_into().unwrap();

            // Store packed data (game_creator_claimed starts as false)
            let data = EntryFeeData {
                amount: *entry_fee.amount,
                game_creator_share,
                refund_share,
                game_creator_claimed: false,
                additional_count,
            };
            self.EntryFee_data.entry(context_id).write(data);

            // Store additional shares using packed storage
            let mut current_slot: u8 = 0;
            let mut packed_shares: PackedAdditionalShares = PackedAdditionalSharesImpl::new();

            let mut i: u32 = 0;
            while i < additional_shares.len() {
                let idx: u8 = i.try_into().unwrap();
                let slot_index: u8 = idx / SHARES_PER_SLOT;
                let index_in_slot: u8 = idx % SHARES_PER_SLOT;

                // If we moved to a new slot, write the previous one and start fresh
                if slot_index != current_slot && i > 0 {
                    self
                        .EntryFee_additional_shares_packed
                        .entry((context_id, current_slot))
                        .write(packed_shares);
                    packed_shares = PackedAdditionalSharesImpl::new();
                    current_slot = slot_index;
                }

                let share = *additional_shares.at(i);
                // Store recipient separately (ContractAddress is 251 bits, can't pack)
                self.EntryFee_additional_recipient.entry((context_id, idx)).write(share.recipient);
                // Pack share data into current slot
                let stored = StoredAdditionalShare { share_bps: share.share_bps, claimed: false };
                packed_shares.set_share(index_in_slot, stored);
                i += 1;
            }

            // Write the last slot if we have any shares
            if additional_count > 0 {
                self
                    .EntryFee_additional_shares_packed
                    .entry((context_id, current_slot))
                    .write(packed_shares);
            }
        }

        /// Process entry fee deposit by transferring tokens from caller to contract
        fn deposit_entry_fee(ref self: ComponentState<TContractState>, entry_fee: @EntryFee) {
            let erc20_dispatcher = IERC20Dispatcher { contract_address: *entry_fee.token_address };
            erc20_dispatcher
                .transfer_from(
                    get_caller_address(), get_contract_address(), (*entry_fee.amount).into(),
                );
        }

        /// Payout to a recipient
        fn payout(
            ref self: ComponentState<TContractState>,
            token_address: ContractAddress,
            recipient: ContractAddress,
            amount: u128,
        ) {
            if amount > 0 {
                let erc20_dispatcher = IERC20Dispatcher { contract_address: token_address };
                erc20_dispatcher.transfer(recipient, amount.into());
            }
        }

        /// Check if a claim has been made
        fn is_claimed(
            self: @ComponentState<TContractState>, context_id: u64, claim_type: EntryFeeClaimType,
        ) -> bool {
            match claim_type {
                EntryFeeClaimType::GameCreator => {
                    let data = self.EntryFee_data.entry(context_id).read();
                    data.game_creator_claimed
                },
                EntryFeeClaimType::Refund(token_id) => {
                    self.EntryFee_refund_claimed.entry((context_id, token_id)).read()
                },
                EntryFeeClaimType::AdditionalShare(index) => {
                    let slot_index: u8 = index / SHARES_PER_SLOT;
                    let index_in_slot: u8 = index % SHARES_PER_SLOT;
                    let packed = self
                        .EntryFee_additional_shares_packed
                        .entry((context_id, slot_index))
                        .read();
                    let stored = packed.get_share(index_in_slot);
                    stored.claimed
                },
            }
        }

        /// Mark a claim as completed
        fn set_claimed(
            ref self: ComponentState<TContractState>,
            context_id: u64,
            claim_type: EntryFeeClaimType,
        ) {
            match claim_type {
                EntryFeeClaimType::GameCreator => {
                    // Read current data, update game_creator_claimed, write back
                    let mut data = self.EntryFee_data.entry(context_id).read();
                    data.game_creator_claimed = true;
                    self.EntryFee_data.entry(context_id).write(data);
                },
                EntryFeeClaimType::Refund(token_id) => {
                    self.EntryFee_refund_claimed.entry((context_id, token_id)).write(true);
                },
                EntryFeeClaimType::AdditionalShare(index) => {
                    // Read packed slot, update the specific share's claimed bit, write back
                    let slot_index: u8 = index / SHARES_PER_SLOT;
                    let index_in_slot: u8 = index % SHARES_PER_SLOT;
                    let mut packed = self
                        .EntryFee_additional_shares_packed
                        .entry((context_id, slot_index))
                        .read();
                    let mut stored = packed.get_share(index_in_slot);
                    stored.claimed = true;
                    packed.set_share(index_in_slot, stored);
                    self
                        .EntryFee_additional_shares_packed
                        .entry((context_id, slot_index))
                        .write(packed);
                },
            }
        }
    }
}
