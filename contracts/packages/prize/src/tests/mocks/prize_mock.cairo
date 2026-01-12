// SPDX-License-Identifier: BUSL-1.1

/// Mock contract that embeds the PrizeComponent for testing storage gas
#[starknet::contract]
pub mod PrizeMock {
    use budokan_prize::models::PrizeType;
    use budokan_prize::prize::PrizeComponent;
    use starknet::ContractAddress;

    component!(path: PrizeComponent, storage: prize, event: PrizeEvent);

    #[abi(embed_v0)]
    impl PrizeImpl = PrizeComponent::PrizeImpl<ContractState>;

    impl PrizeInternalImpl = PrizeComponent::PrizeInternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        prize: PrizeComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PrizeEvent: PrizeComponent::Event,
    }

    /// Hash a prize type (exposes internal function for testing)
    #[external(v0)]
    fn hash_prize_type(self: @ContractState, prize_type: PrizeType) -> felt252 {
        self.prize.hash_prize_type(prize_type)
    }

    /// Check if prize is claimed (computes hash each time)
    #[external(v0)]
    fn is_claimed(self: @ContractState, context_id: u64, prize_type: PrizeType) -> bool {
        self.prize._is_prize_claimed(context_id, prize_type)
    }

    /// Check if prize is claimed using pre-computed hash
    #[external(v0)]
    fn is_claimed_by_hash(self: @ContractState, context_id: u64, prize_type_hash: felt252) -> bool {
        self.prize._is_prize_claimed_by_hash(context_id, prize_type_hash)
    }

    /// Set prize as claimed (computes hash each time)
    #[external(v0)]
    fn set_claimed(ref self: ContractState, context_id: u64, prize_type: PrizeType) {
        self.prize.set_prize_claimed(context_id, prize_type);
    }

    /// Set prize as claimed using pre-computed hash
    #[external(v0)]
    fn set_claimed_by_hash(ref self: ContractState, context_id: u64, prize_type_hash: felt252) {
        self.prize._set_prize_claimed_by_hash(context_id, prize_type_hash);
    }

    /// Check and set claimed in one operation (computes hash twice - before optimization pattern)
    #[external(v0)]
    fn check_and_set_claimed_no_cache(
        ref self: ContractState, context_id: u64, prize_type: PrizeType,
    ) -> bool {
        // This pattern computes the hash twice
        let was_claimed = self.prize._is_prize_claimed(context_id, prize_type);
        if !was_claimed {
            self.prize.set_prize_claimed(context_id, prize_type);
        }
        was_claimed
    }

    /// Check and set claimed in one operation (computes hash once - optimized pattern)
    #[external(v0)]
    fn check_and_set_claimed_with_cache(
        ref self: ContractState, context_id: u64, prize_type: PrizeType,
    ) -> bool {
        // This pattern computes the hash once and reuses it
        let prize_type_hash = self.prize.hash_prize_type(prize_type);
        let was_claimed = self.prize._is_prize_claimed_by_hash(context_id, prize_type_hash);
        if !was_claimed {
            self.prize._set_prize_claimed_by_hash(context_id, prize_type_hash);
        }
        was_claimed
    }
}
