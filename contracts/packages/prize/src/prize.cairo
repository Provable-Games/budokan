// SPDX-License-Identifier: BUSL-1.1

/// PrizeComponent handles prize storage, deposits, and claims for any context.
/// This component manages:
/// - Prize storage and retrieval
/// - Prize deposit processing
/// - Prize claim tracking
/// - Total prize count metrics

#[starknet::component]
pub mod PrizeComponent {
    use budokan_interfaces::prize::IPrize;
    use budokan_prize::models::{Prize, PrizeType};
    use budokan_token_validator::models::TokenTypeData;
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
        Prize_prizes: Map<u64, Prize>,
        /// Prize claims keyed by (context_id, prize_type_hash)
        /// where prize_type_hash is poseidon hash of serialized PrizeType
        Prize_claims: Map<(u64, felt252), bool>,
        /// Total prizes created across all contexts
        Prize_total_prizes: u64,
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
        /// Get a prize by its ID (internal)
        fn _get_prize(self: @ComponentState<TContractState>, prize_id: u64) -> Prize {
            self.Prize_prizes.entry(prize_id).read()
        }

        /// Set/store a prize
        fn set_prize(ref self: ComponentState<TContractState>, prize: @Prize) {
            self.Prize_prizes.entry(*prize.id).write(*prize);
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
            self.Prize_claims.entry((context_id, prize_type_hash)).read()
        }

        /// Mark a prize as claimed
        fn set_prize_claimed(
            ref self: ComponentState<TContractState>, context_id: u64, prize_type: PrizeType,
        ) {
            let prize_type_hash = self.hash_prize_type(prize_type);
            self.Prize_claims.entry((context_id, prize_type_hash)).write(true);
        }

        /// Assert that a prize exists (has non-zero token address)
        fn assert_prize_exists(self: @ComponentState<TContractState>, prize_id: u64) {
            let prize = self.Prize_prizes.entry(prize_id).read();
            assert!(!prize.token_address.is_zero(), "Prize: Prize key {} does not exist", prize_id);
        }

        /// Assert that a prize has not been claimed
        fn assert_prize_not_claimed(
            self: @ComponentState<TContractState>, context_id: u64, prize_type: PrizeType,
        ) {
            let prize_type_hash = self.hash_prize_type(prize_type);
            let claimed = self.Prize_claims.entry((context_id, prize_type_hash)).read();
            assert!(!claimed, "Prize: Prize has already been claimed");
        }

        /// Add a prize: deposits tokens, increments count, and stores the prize
        /// Returns the new prize with its assigned ID
        fn add_prize(
            ref self: ComponentState<TContractState>,
            context_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            payout_position: u32,
        ) -> Prize {
            // Deposit the prize tokens
            self.deposit_prize(token_address, token_type);

            // Get next prize ID
            let id = self.increment_prize_count();

            // Create and store the prize
            let prize = Prize {
                id,
                context_id,
                token_address,
                token_type,
                payout_position,
                sponsor_address: get_caller_address(),
            };
            self.set_prize(@prize);

            prize
        }

        /// Deposit a prize by transferring tokens from caller to contract
        fn deposit_prize(
            ref self: ComponentState<TContractState>,
            token_address: ContractAddress,
            token_type: TokenTypeData,
        ) {
            match token_type {
                TokenTypeData::erc20(erc20_token) => {
                    let token_dispatcher = IERC20Dispatcher { contract_address: token_address };
                    assert!(
                        erc20_token.amount > 0,
                        "Prize: ERC20 prize token amount must be greater than 0",
                    );
                    token_dispatcher
                        .transfer_from(
                            get_caller_address(), get_contract_address(), erc20_token.amount.into(),
                        );
                },
                TokenTypeData::erc721(erc721_token) => {
                    let token_dispatcher = IERC721Dispatcher { contract_address: token_address };
                    token_dispatcher
                        .transfer_from(
                            get_caller_address(), get_contract_address(), erc721_token.id.into(),
                        );
                },
            }
        }

        /// Payout a prize to a recipient
        fn payout(
            ref self: ComponentState<TContractState>, prize: @Prize, recipient: ContractAddress,
        ) {
            match *prize.token_type {
                TokenTypeData::erc20(erc20_token) => {
                    let erc20 = IERC20Dispatcher { contract_address: *prize.token_address };
                    erc20.transfer(recipient, erc20_token.amount.into());
                },
                TokenTypeData::erc721(erc721_token) => {
                    let erc721 = IERC721Dispatcher { contract_address: *prize.token_address };
                    erc721.transfer_from(get_contract_address(), recipient, erc721_token.id.into());
                },
            }
        }
    }
}
