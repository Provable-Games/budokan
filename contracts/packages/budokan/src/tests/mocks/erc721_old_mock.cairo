#[starknet::interface]
pub trait IERC721OldMock<TState> {
    // IERC721Metadata
    fn name(self: @TState) -> felt252;
    fn symbol(self: @TState) -> felt252;
}

#[starknet::contract]
pub mod erc721_old_mock {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::IERC721OldMock;

    #[storage]
    struct Storage {
        ERC721_name: felt252,
        ERC721_symbol: felt252,
    }

    //
    // Constructor
    //
    #[constructor]
    fn constructor(ref self: ContractState) {
        self.ERC721_name.write('Test ERC721 Old');
        self.ERC721_symbol.write('T721O');
    }

    //
    // Public
    //
    #[abi(embed_v0)]
    impl ERC721OldMockImpl of IERC721OldMock<ContractState> {
        /// Returns the NFT name.
        fn name(self: @ContractState) -> felt252 {
            self.ERC721_name.read()
        }

        /// Returns the NFT symbol.
        fn symbol(self: @ContractState) -> felt252 {
            self.ERC721_symbol.read()
        }
    }
}
