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
        AdditionalShare, EntryFee, EntryFeeData, EntryFeeDataStorePacking,
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
        /// Packed entry fee data keyed by context_id (amount + game_creator_share + refund_share)
        EntryFee_data: Map<u64, EntryFeeData>,
        /// Additional shares count per context
        EntryFee_additional_count: Map<u64, u8>,
        /// Additional shares per context: (context_id, index) -> recipient
        EntryFee_additional_recipient: Map<(u64, u8), ContractAddress>,
        /// Additional shares per context: (context_id, index) -> share_bps
        EntryFee_additional_share: Map<(u64, u8), u16>,
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
        fn _get_additional_shares(
            self: @ComponentState<TContractState>, context_id: u64,
        ) -> Span<AdditionalShare> {
            let count = self.EntryFee_additional_count.entry(context_id).read();
            if count == 0 {
                return array![].span();
            }

            let mut shares: Array<AdditionalShare> = ArrayTrait::new();
            let mut i: u8 = 0;
            loop {
                if i >= count {
                    break;
                }
                let recipient = self.EntryFee_additional_recipient.entry((context_id, i)).read();
                let share_bps = self.EntryFee_additional_share.entry((context_id, i)).read();
                shares.append(AdditionalShare { recipient, share_bps });
                i += 1;
            }

            shares.span()
        }

        /// Set entry fee for a context
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

            // Store packed data
            let data = EntryFeeData { amount: *entry_fee.amount, game_creator_share, refund_share };
            self.EntryFee_data.entry(context_id).write(data);

            // Store additional shares
            let additional_shares = *entry_fee.additional_shares;
            let count: u8 = additional_shares.len().try_into().unwrap();
            self.EntryFee_additional_count.entry(context_id).write(count);

            let mut i: u32 = 0;
            loop {
                if i >= additional_shares.len() {
                    break;
                }
                let share = *additional_shares.at(i);
                let idx: u8 = i.try_into().unwrap();
                self.EntryFee_additional_recipient.entry((context_id, idx)).write(share.recipient);
                self.EntryFee_additional_share.entry((context_id, idx)).write(share.share_bps);
                i += 1;
            };
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
    }
}
