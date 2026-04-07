use starknet::ContractAddress;

#[starknet::interface]
pub trait IERC721MockPublic<TState> {
    fn mint(ref self: TState, recipient: ContractAddress, token_id: u256);
}

#[starknet::contract]
pub mod erc721_mock {
    //-----------------------------------
    // OpenZeppelin start
    //
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use starknet::ContractAddress;
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    #[abi(embed_v0)]
    impl ERC721MixinImpl = ERC721Component::ERC721MixinImpl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;
    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
    }
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        ERC721Event: ERC721Component::Event,
    }
    //
    // OpenZeppelin end
    //-----------------------------------

    //*******************************
    fn TOKEN_NAME() -> ByteArray {
        ("Test ERC721")
    }
    fn TOKEN_SYMBOL() -> ByteArray {
        ("T721")
    }
    fn BASE_URI() -> ByteArray {
        ("https://testerc721.io")
    }
    //*******************************

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.erc721.initializer(TOKEN_NAME(), TOKEN_SYMBOL(), BASE_URI());
    }

    //-----------------------------------
    // Public
    //
    use super::{IERC721MockPublic};
    #[abi(embed_v0)]
    impl ERC721MockPublicImpl of IERC721MockPublic<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, token_id: u256) {
            self.erc721.mint(recipient, token_id);
        }
    }
}
