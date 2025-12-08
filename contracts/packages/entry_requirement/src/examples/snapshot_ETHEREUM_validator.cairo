use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Entry {
    pub address: ContractAddress,
    pub count: u8,
}

#[derive(Copy, Drop, Serde, starknet::Store, PartialEq)]
pub enum SnapshotStatus {
    Created,
    InProgress,
    Locked,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct SnapshotMetadata {
    pub owner: ContractAddress,
    pub status: SnapshotStatus,
}

#[starknet::interface]
pub trait ISnapshotValidator<TState> {
    fn create_snapshot(ref self: TState) -> u64;
    fn upload_snapshot_data(ref self: TState, snapshot_id: u64, snapshot_values: Span<Entry>);
    fn lock_snapshot(ref self: TState, snapshot_id: u64);
    fn get_snapshot_metadata(self: @TState, snapshot_id: u64) -> Option<SnapshotMetadata>;
    fn get_snapshot_entry(self: @TState, snapshot_id: u64, player_address: ContractAddress) -> u8;
    fn is_snapshot_locked(self: @TState, snapshot_id: u64) -> bool;
}

#[starknet::contract]
pub mod SnapshotValidator {
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent;
    use budokan_entry_requirement::entry_validator::EntryValidatorComponent::EntryValidator;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::{Entry, SnapshotMetadata, SnapshotStatus};

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
        // New snapshot ID-based storage
        snapshot_metadata: Map<u64, SnapshotMetadata>,
        snapshot_entries: Map<(u64, ContractAddress), u8>,
        snapshot_exists: Map<u64, bool>,
        tournament_snapshot: Map<u64, u64>,
        tournament_address_entries_used: Map<(u64, ContractAddress), u8>,
        snapshot_id_counter: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        EntryValidatorEvent: EntryValidatorComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        SnapshotCreated: SnapshotCreated,
        SnapshotEntryAdded: SnapshotEntryAdded,
        SnapshotDataUploaded: SnapshotDataUploaded,
        SnapshotLocked: SnapshotLocked,
    }

    #[derive(Drop, starknet::Event)]
    struct SnapshotCreated {
        #[key]
        snapshot_id: u64,
        #[key]
        owner: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct SnapshotEntryAdded {
        #[key]
        snapshot_id: u64,
        address: ContractAddress,
        count: u8,
    }


    #[derive(Drop, starknet::Event)]
    struct SnapshotDataUploaded {
        #[key]
        snapshot_id: u64,
        entries_added: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct SnapshotLocked {
        #[key]
        snapshot_id: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, budokan_address: ContractAddress) {
        self.entry_validator.initializer(tournament_address);
    }

    // Implement the EntryValidator trait for the contract
    impl EntryValidatorImplInternal of EntryValidator<ContractState> {
        fn validate_entry(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> bool {
            let snapshot_id = self.tournament_snapshot.read(tournament_id);
            let address_entries = self.snapshot_entries.read((snapshot_id, player_address));
            address_entries > 0
        }

        fn entries_left(
            self: @ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) -> Option<u8> {
            let snapshot_id = self.tournament_snapshot.read(tournament_id);
            let address_entries = self.snapshot_entries.read((snapshot_id, player_address));
            let tournament_used_entries = self
                .tournament_address_entries_used
                .read((tournament_id, player_address));
            let remaining_entries = address_entries - tournament_used_entries;
            Option::Some(remaining_entries)
        }

        fn add_config(
            ref self: ContractState, tournament_id: u64, entry_limit: u8, config: Span<felt252>,
        ) {
            let snapshot_id_felt = *config.at(0);
            let snapshot_id: u64 = snapshot_id_felt.try_into().unwrap();
            assert!(self.snapshot_exists.read(snapshot_id), "Snapshot does not exist");
            assert!(self.is_snapshot_locked(snapshot_id), "Snapshot must be locked before use");
            self.tournament_snapshot.write(tournament_id, snapshot_id);
        }

        fn add_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let used_entries = self
                .tournament_address_entries_used
                .read((tournament_id, player_address));
            self
                .tournament_address_entries_used
                .write((tournament_id, player_address), used_entries + 1);
        }

        fn remove_entry(
            ref self: ContractState,
            tournament_id: u64,
            player_address: ContractAddress,
            qualification: Span<felt252>,
        ) {
            let used_entries = self
                .tournament_address_entries_used
                .read((tournament_id, player_address));
            assert!(used_entries > 0, "Snapshot Validator: No entries to remove");
            self
                .tournament_address_entries_used
                .write((tournament_id, player_address), used_entries - 1);
        }
    }

    // Public interface implementation
    use super::ISnapshotValidator;
    #[abi(embed_v0)]
    impl SnapshotValidatorImpl of ISnapshotValidator<ContractState> {
        fn create_snapshot(ref self: ContractState) -> u64 {
            // Generate new snapshot ID
            let current_snapshot_id = self.snapshot_id_counter.read();
            let new_snapshot_id = current_snapshot_id + 1;
            let caller = get_caller_address();

            // Create new snapshot metadata
            let metadata = SnapshotMetadata { owner: caller, status: SnapshotStatus::Created };

            // Store metadata and mark as existing
            self.snapshot_metadata.write(new_snapshot_id, metadata);
            self.snapshot_exists.write(new_snapshot_id, true);
            self.snapshot_id_counter.write(new_snapshot_id);

            // Emit event
            self.emit(SnapshotCreated { snapshot_id: new_snapshot_id, owner: caller });

            new_snapshot_id
        }

        fn upload_snapshot_data(
            ref self: ContractState, snapshot_id: u64, snapshot_values: Span<Entry>,
        ) {
            // Check if snapshot exists
            assert!(self.snapshot_exists.read(snapshot_id), "Snapshot does not exist");

            // Get metadata
            let mut metadata = self.snapshot_metadata.read(snapshot_id);

            // Check if snapshot is locked
            assert!(metadata.status != SnapshotStatus::Locked, "Snapshot is locked");

            // Check if caller is the owner
            let caller = get_caller_address();
            assert!(metadata.owner == caller, "Caller is not the owner");

            // Upload the snapshot data
            let length = snapshot_values.len();
            let mut i: u32 = 0;
            while i < length {
                let entry = *snapshot_values.at(i);
                self.snapshot_entries.write((snapshot_id, entry.address), entry.count);
                self
                    .emit(
                        SnapshotEntryAdded {
                            snapshot_id, address: entry.address, count: entry.count,
                        },
                    );
                i += 1;
            }

            // Update metadata
            metadata.status = SnapshotStatus::InProgress;
            self.snapshot_metadata.write(snapshot_id, metadata);

            // Emit event
            self.emit(SnapshotDataUploaded { snapshot_id, entries_added: length })
        }

        fn lock_snapshot(ref self: ContractState, snapshot_id: u64) {
            // Check if snapshot exists
            assert!(self.snapshot_exists.read(snapshot_id), "Snapshot does not exist");

            // Get metadata
            let mut metadata = self.snapshot_metadata.read(snapshot_id);

            // Check if snapshot is already locked
            assert!(metadata.status != SnapshotStatus::Locked, "Snapshot is already locked");

            // Check if caller is the owner
            let caller = get_caller_address();
            assert!(metadata.owner == caller, "Caller is not the owner");

            // Lock the snapshot
            metadata.status = SnapshotStatus::Locked;
            self.snapshot_metadata.write(snapshot_id, metadata);

            // Emit event
            self.emit(SnapshotLocked { snapshot_id })
        }

        fn get_snapshot_metadata(
            self: @ContractState, snapshot_id: u64,
        ) -> Option<SnapshotMetadata> {
            if !self.snapshot_exists.read(snapshot_id) {
                return Option::None;
            }
            Option::Some(self.snapshot_metadata.read(snapshot_id))
        }

        fn get_snapshot_entry(
            self: @ContractState, snapshot_id: u64, player_address: ContractAddress,
        ) -> u8 {
            assert!(self.snapshot_exists.read(snapshot_id), "Snapshot does not exist");
            self.snapshot_entries.read((snapshot_id, player_address))
        }

        fn is_snapshot_locked(self: @ContractState, snapshot_id: u64) -> bool {
            assert!(self.snapshot_exists.read(snapshot_id), "Snapshot does not exist");
            let metadata = self.snapshot_metadata.read(snapshot_id);
            metadata.status == SnapshotStatus::Locked
        }
    }
}
