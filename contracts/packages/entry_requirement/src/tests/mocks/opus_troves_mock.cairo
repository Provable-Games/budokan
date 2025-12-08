use opus::types::AssetBalance;
use starknet::ContractAddress;
use wadray::Wad;

#[starknet::interface]
pub trait IAbbot<TContractState> {
    // getters
    fn get_trove_owner(self: @TContractState, trove_id: u64) -> Option<ContractAddress>;
    fn get_user_trove_ids(self: @TContractState, user: ContractAddress) -> Span<u64>;
    fn get_troves_count(self: @TContractState) -> u64;
    fn get_trove_asset_balance(self: @TContractState, trove_id: u64, yang: ContractAddress) -> u128;
    // external
    fn open_trove(
        ref self: TContractState,
        yang_assets: Span<AssetBalance>,
        forge_amount: Wad,
        max_forge_fee_pct: Wad,
    ) -> u64;
    fn close_trove(ref self: TContractState, trove_id: u64);
    fn deposit(ref self: TContractState, trove_id: u64, yang_asset: AssetBalance);
    fn withdraw(ref self: TContractState, trove_id: u64, yang_asset: AssetBalance);
    fn forge(ref self: TContractState, trove_id: u64, amount: Wad, max_forge_fee_pct: Wad);
    fn melt(ref self: TContractState, trove_id: u64, amount: Wad);
}

#[starknet::interface]
pub trait IEntryValidatorMock<TState> {
    fn get_trove_asset(self: @TState, tournament_id: u64) -> ContractAddress;
    fn get_trove_threshold(self: @TState, tournament_id: u64) -> u128;
}

#[starknet::contract]
pub mod opus_troves_validator_mock {
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent;
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent::EntryValidator;
    use core::num::traits::Zero;
    use openzeppelin_introspection::src5::SRC5Component;
    use opus::periphery::interfaces::{
        IFrontendDataProviderDispatcher, IFrontendDataProviderDispatcherTrait,
    };
    use opus::periphery::types::TroveInfo;
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use wadray::Wad;
    use super::{IAbbotDispatcher, IAbbotDispatcherTrait};

    // Opus mainnet addresses - use try_into for const addresses
    fn abbot_address() -> ContractAddress {
        0x04d0bb0a4c40012384e7c419e6eb3c637b28e8363fb66958b60d90505b9c072f.try_into().unwrap()
    }

    fn fdp_address() -> ContractAddress {
        0x023037703b187f6ff23b883624a0a9f266c9d44671e762048c70100c2f128ab9.try_into().unwrap()
    }

    component!(path: EntryValidatorComponent, storage: entry_validator, event: EntryValidatorEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl EntryValidatorImpl =
        EntryValidatorComponent::EntryValidatorImpl<ContractState>;
    impl EntryValidatorInternalImpl = EntryValidatorComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        entry_validator: EntryValidatorComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        tournament_trove_asset: Map<u64, ContractAddress>,
        tournament_trove_threshold: Map<u64, u128>,
        tournament_entry_limit: Map<u64, u8>,
        tournament_entries_per_address: Map<(u64, ContractAddress), u8>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        EntryValidatorEvent: EntryValidatorComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, budokan_address: ContractAddress) {
        self.entry_validator.initializer(budokan_address, true);
    }

    // Implement the EntryValidator trait for the contract
    impl EntryValidatorImplInternal of EntryValidator<ContractState> {
        fn validate_entry(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            assert!(qualification.len() == 0, "Opus Entry Validator: Qualification data invalid");
            let abbot = IAbbotDispatcher { contract_address: abbot_address() };
            let mut user_troves: Span<u64> = abbot.get_user_trove_ids(player_address);
            let trove_id: u64 = *user_troves.pop_front().unwrap();
            let fdp = IFrontendDataProviderDispatcher { contract_address: fdp_address() };
            let trove_info: TroveInfo = fdp.get_trove_info(trove_id);
            let trove_asset_felt = self.tournament_trove_asset.read(tournament_id);
            let trove_asset: ContractAddress = trove_asset_felt.try_into().unwrap();

            let mut deposited_value: Wad = Zero::zero();

            // Find the asset in the trove and check its value
            for trove_asset_info in trove_info.assets {
                if *trove_asset_info.shrine_asset_info.address == trove_asset {
                    deposited_value = *trove_asset_info.value;
                    break;
                }
            }

            // Check if deposited value meets the threshold
            let threshold = self.tournament_trove_threshold.read(tournament_id);
            let threshold_wad: Wad = threshold.into();
            deposited_value >= threshold_wad
        }

        fn entries_left(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8> {
            let entry_limit = self.tournament_entry_limit.read(tournament_id);
            if entry_limit == 0 {
                return Option::None; // Unlimited entries
            }
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries_per_address.read(key);
            let remaining_entries = entry_limit - current_entries;
            return Option::Some(remaining_entries);
        }

        fn add_config(
            ref self: ContractState, tournament_id: u64, entry_limit: u8, config: Span<felt252>,
        ) {
            // Extract trove asset address and threshold from config
            let trove_asset: ContractAddress = (*config.at(0)).try_into().unwrap();
            let trove_threshold: u128 = (*config.at(1)).try_into().unwrap();

            self.tournament_trove_asset.write(tournament_id, trove_asset);
            self.tournament_trove_threshold.write(tournament_id, trove_threshold);
            self.tournament_entry_limit.write(tournament_id, entry_limit);
        }

        fn add_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries_per_address.read(key);
            self.tournament_entries_per_address.write(key, current_entries + 1);
        }

        fn remove_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let key = (tournament_id, player_address);
            let current_entries = self.tournament_entries_per_address.read(key);
            assert!(current_entries > 0, "Opus Entry Validator: No entries to remove");
            self.tournament_entries_per_address.write(key, current_entries - 1);
        }
    }

    // Public interface implementation
    use super::IEntryValidatorMock;
    #[abi(embed_v0)]
    impl EntryValidatorMockImpl of IEntryValidatorMock<ContractState> {
        fn get_trove_asset(self: @ContractState, tournament_id: u64) -> ContractAddress {
            self.tournament_trove_asset.read(tournament_id)
        }

        fn get_trove_threshold(self: @ContractState, tournament_id: u64) -> u128 {
            self.tournament_trove_threshold.read(tournament_id)
        }
    }
}
