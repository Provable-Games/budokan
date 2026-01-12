// SPDX-License-Identifier: BUSL-1.1

/// PrizeComponent handles prize storage, deposits, and claims for any context.
/// This component manages:
/// - Prize storage and retrieval
/// - Prize deposit processing
/// - Prize claim tracking
/// - Total prize count metrics
///
/// TODO: Reclaim prize functionality for unclaimed prizes based on some context rules

#[starknet::component]
pub mod PrizeComponent {
    use budokan_interfaces::prize::IPrize;
    use budokan_prize::models::{
        CUSTOM_SHARES_PER_SLOT, CustomShares, CustomSharesImpl, CustomSharesTrait, ERC20Data, Prize,
        PrizeType, StoredPrize, StoredPrizeTrait, TokenTypeData,
    };
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    #[storage]
    pub struct Storage {
        /// Prize data keyed by prize_id
        /// Uses StoredPrize for storage (with Store trait)
        /// For ERC20: amount + distribution config packed efficiently
        Prize_prizes: Map<u64, StoredPrize>,
        /// Prize claims keyed by (context_id, prize_type_hash)
        /// where prize_type_hash is poseidon hash of serialized PrizeType
        Prize_claims: Map<(u64, felt252), bool>,
        /// Total prizes created across all contexts
        Prize_total_prizes: u64,
        /// Packed custom distribution shares: (prize_id, slot_index) -> CustomShares
        /// Each slot packs up to 15 u16 shares (16 bits each = 240 bits per felt252)
        /// slot_index = share_index / 15
        Prize_custom_shares_packed: Map<(u64, u8), CustomShares>,
        /// Number of custom shares for a prize
        Prize_custom_shares_count: Map<u64, u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[embeddable_as(PrizeImpl)]
    impl PrizeComponentImpl<
        TContractState, +HasComponent<TContractState>,
    > of IPrize<ComponentState<TContractState>> {
        fn get_prize(self: @ComponentState<TContractState>, prize_id: u64) -> Prize {
            self._get_prize(prize_id)
        }

        fn get_total_prizes(self: @ComponentState<TContractState>) -> u64 {
            self._get_total_prizes()
        }

        fn is_prize_claimed(
            self: @ComponentState<TContractState>, context_id: u64, prize_type: PrizeType,
        ) -> bool {
            self._is_prize_claimed(context_id, prize_type)
        }
    }

    #[generate_trait]
    pub impl PrizeInternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of PrizeInternalTrait<TContractState> {
        /// Get a prize by its ID
        /// The Prize struct is unpacked from storage and the id field is set
        fn _get_prize(self: @ComponentState<TContractState>, prize_id: u64) -> Prize {
            let stored = self.Prize_prizes.entry(prize_id).read();
            // Convert StoredPrize to Prize
            let mut prize = stored.to_prize(prize_id);

            // For custom distributions, restore the shares from separate storage
            prize.token_type = match prize.token_type {
                TokenTypeData::erc20(erc20_data) => {
                    let distribution = match erc20_data.distribution {
                        Option::Some(dist) => {
                            match dist {
                                budokan_distribution::models::Distribution::Custom(_) => {
                                    // Reconstruct custom shares from storage
                                    let shares = self._get_custom_shares(prize_id);
                                    Option::Some(
                                        budokan_distribution::models::Distribution::Custom(
                                            shares.span(),
                                        ),
                                    )
                                },
                                _ => Option::Some(dist),
                            }
                        },
                        Option::None => Option::None,
                    };
                    TokenTypeData::erc20(
                        ERC20Data {
                            amount: erc20_data.amount,
                            distribution,
                            distribution_count: erc20_data.distribution_count,
                        },
                    )
                },
                TokenTypeData::erc721(erc721_data) => TokenTypeData::erc721(erc721_data),
            };

            prize
        }

        /// Get custom shares for a prize (used for Custom distribution)
        /// Uses packed storage: reads 1 slot per 15 shares instead of 1 slot per share
        fn _get_custom_shares(self: @ComponentState<TContractState>, prize_id: u64) -> Array<u16> {
            let count = self.Prize_custom_shares_count.entry(prize_id).read();
            let mut shares = ArrayTrait::new();
            if count == 0 {
                return shares;
            }

            let mut current_slot: u8 = 0;
            let mut packed_shares: CustomShares = CustomSharesImpl::new();

            let mut i: u32 = 0;
            while i < count {
                let slot_index: u8 = (i / CUSTOM_SHARES_PER_SLOT.into()).try_into().unwrap();
                let index_in_slot: u8 = (i % CUSTOM_SHARES_PER_SLOT.into()).try_into().unwrap();

                // Load new slot if needed
                if slot_index != current_slot || i == 0 {
                    packed_shares = self
                        .Prize_custom_shares_packed
                        .entry((prize_id, slot_index))
                        .read();
                    current_slot = slot_index;
                }

                shares.append(packed_shares.get_share(index_in_slot));
                i += 1;
            }
            shares
        }

        /// Store a prize (converts to StoredPrize for storage)
        fn set_prize(ref self: ComponentState<TContractState>, prize_id: u64, prize: Prize) {
            let stored = StoredPrizeTrait::from_prize(prize);
            self.Prize_prizes.entry(prize_id).write(stored);
        }

        /// Get total prizes count (internal)
        fn _get_total_prizes(self: @ComponentState<TContractState>) -> u64 {
            self.Prize_total_prizes.read()
        }

        /// Increment total prizes and return the new prize ID
        fn increment_prize_count(ref self: ComponentState<TContractState>) -> u64 {
            let current = self.Prize_total_prizes.read();
            let new_count = current + 1;
            self.Prize_total_prizes.write(new_count);
            new_count
        }

        /// Hash a prize type for use as storage key
        fn hash_prize_type(
            self: @ComponentState<TContractState>, prize_type: PrizeType,
        ) -> felt252 {
            let mut data = ArrayTrait::new();
            prize_type.serialize(ref data);
            poseidon_hash_span(data.span())
        }

        /// Check if a prize has been claimed (internal)
        fn _is_prize_claimed(
            self: @ComponentState<TContractState>, context_id: u64, prize_type: PrizeType,
        ) -> bool {
            let prize_type_hash = self.hash_prize_type(prize_type);
            self._is_prize_claimed_by_hash(context_id, prize_type_hash)
        }

        /// Check if a prize has been claimed using pre-computed hash (gas optimization)
        fn _is_prize_claimed_by_hash(
            self: @ComponentState<TContractState>, context_id: u64, prize_type_hash: felt252,
        ) -> bool {
            self.Prize_claims.entry((context_id, prize_type_hash)).read()
        }

        /// Mark a prize as claimed
        fn set_prize_claimed(
            ref self: ComponentState<TContractState>, context_id: u64, prize_type: PrizeType,
        ) {
            let prize_type_hash = self.hash_prize_type(prize_type);
            self._set_prize_claimed_by_hash(context_id, prize_type_hash);
        }

        /// Mark a prize as claimed using pre-computed hash (gas optimization)
        fn _set_prize_claimed_by_hash(
            ref self: ComponentState<TContractState>, context_id: u64, prize_type_hash: felt252,
        ) {
            self.Prize_claims.entry((context_id, prize_type_hash)).write(true);
        }

        /// Assert that a prize exists (has non-zero token address)
        fn assert_prize_exists(self: @ComponentState<TContractState>, prize_id: u64) {
            let stored = self.Prize_prizes.entry(prize_id).read();
            assert!(
                !stored.token_address.is_zero(), "Prize: Prize key {} does not exist", prize_id,
            );
        }

        /// Assert that a prize has not been claimed
        fn assert_prize_not_claimed(
            self: @ComponentState<TContractState>, context_id: u64, prize_type: PrizeType,
        ) {
            let prize_type_hash = self.hash_prize_type(prize_type);
            self._assert_prize_not_claimed_by_hash(context_id, prize_type_hash);
        }

        /// Assert that a prize has not been claimed using pre-computed hash (gas optimization)
        fn _assert_prize_not_claimed_by_hash(
            self: @ComponentState<TContractState>, context_id: u64, prize_type_hash: felt252,
        ) {
            let claimed = self.Prize_claims.entry((context_id, prize_type_hash)).read();
            assert!(!claimed, "Prize: Prize has already been claimed");
        }

        /// Add a prize: deposits tokens, increments count, and stores the prize
        /// Distribution configuration is packed into storage via StorePacking
        fn add_prize(
            ref self: ComponentState<TContractState>,
            context_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
        ) -> Prize {
            // Deposit the prize tokens
            match @token_type {
                TokenTypeData::erc20(erc20_data) => {
                    let amount = *erc20_data.amount;
                    let token_dispatcher = IERC20Dispatcher { contract_address: token_address };
                    assert!(amount > 0, "Prize: ERC20 prize token amount must be greater than 0");
                    token_dispatcher
                        .transfer_from(get_caller_address(), get_contract_address(), amount.into());
                },
                TokenTypeData::erc721(erc721_data) => {
                    let token_id = *erc721_data.id;
                    let token_dispatcher = IERC721Dispatcher { contract_address: token_address };
                    token_dispatcher
                        .transfer_from(
                            get_caller_address(), get_contract_address(), token_id.into(),
                        );
                },
            }

            // Get next prize ID
            let id = self.increment_prize_count();

            // Store custom shares if this is a Custom distribution (using packed storage)
            if let TokenTypeData::erc20(erc20_data) = @token_type {
                if let Option::Some(dist) = erc20_data.distribution {
                    if let budokan_distribution::models::Distribution::Custom(shares) = dist {
                        let shares_len: u32 = (*shares).len().try_into().unwrap();
                        self.Prize_custom_shares_count.entry(id).write(shares_len);

                        // Pack shares into slots (15 shares per slot)
                        let mut current_slot: u8 = 0;
                        let mut packed_shares: CustomShares = CustomSharesImpl::new();

                        let mut i: u32 = 0;
                        for share in *shares {
                            let slot_index: u8 = (i / CUSTOM_SHARES_PER_SLOT.into())
                                .try_into()
                                .unwrap();
                            let index_in_slot: u8 = (i % CUSTOM_SHARES_PER_SLOT.into())
                                .try_into()
                                .unwrap();

                            // If we moved to a new slot, write the previous one and start fresh
                            if slot_index != current_slot && i > 0 {
                                self
                                    .Prize_custom_shares_packed
                                    .entry((id, current_slot))
                                    .write(packed_shares);
                                packed_shares = CustomSharesImpl::new();
                                current_slot = slot_index;
                            }

                            packed_shares.set_share(index_in_slot, *share);
                            i += 1;
                        }

                        // Write the last slot if we have any shares
                        if shares_len > 0 {
                            self
                                .Prize_custom_shares_packed
                                .entry((id, current_slot))
                                .write(packed_shares);
                        }
                    }
                }
            }

            // Create the prize (StorePacking handles the packing in storage)
            let sponsor = get_caller_address();
            let prize = Prize {
                id, context_id, token_address, token_type, sponsor_address: sponsor,
            };

            // Store and return the prize
            self.set_prize(id, prize);

            // Return a copy by reconstructing from storage
            self._get_prize(id)
        }

        /// Payout full ERC20 amount to a recipient
        fn payout_erc20(
            ref self: ComponentState<TContractState>,
            token_address: ContractAddress,
            amount: u128,
            recipient: ContractAddress,
        ) {
            let erc20 = IERC20Dispatcher { contract_address: token_address };
            erc20.transfer(recipient, amount.into());
        }

        /// Payout ERC721 to a recipient
        fn payout_erc721(
            ref self: ComponentState<TContractState>,
            token_address: ContractAddress,
            token_id: u128,
            recipient: ContractAddress,
        ) {
            let erc721 = IERC721Dispatcher { contract_address: token_address };
            erc721.transfer_from(get_contract_address(), recipient, token_id.into());
        }

        /// Refund ERC20 prize to the original sponsor
        fn refund_prize_erc20(
            ref self: ComponentState<TContractState>, prize_id: u64, amount: u128,
        ) {
            let prize = self._get_prize(prize_id);
            let erc20 = IERC20Dispatcher { contract_address: prize.token_address };
            erc20.transfer(prize.sponsor_address, amount.into());
        }

        /// Refund ERC721 prize to the original sponsor
        fn refund_prize_erc721(
            ref self: ComponentState<TContractState>, prize_id: u64, token_id: u128,
        ) {
            let prize = self._get_prize(prize_id);
            let erc721 = IERC721Dispatcher { contract_address: prize.token_address };
            erc721.transfer_from(get_contract_address(), prize.sponsor_address, token_id.into());
        }
    }
}
