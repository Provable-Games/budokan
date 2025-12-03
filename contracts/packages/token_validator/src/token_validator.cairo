// SPDX-License-Identifier: BUSL-1.1

/// TokenValidatorComponent handles token registration and validation.
/// This component manages:
/// - Token registration status tracking
/// - Token validation (ERC20/ERC721 legitimacy checks)
/// - Token type storage
/// - SRC5 interface registration
///
/// This component can be used standalone for an isolated token registry
/// or embedded in a larger contract like Budokan.

#[starknet::component]
pub mod TokenValidatorComponent {
    use budokan_interfaces::token_validator::{ITOKEN_VALIDATOR_ID, ITokenValidator};
    use budokan_token_validator::models::{
        SEPOLIA_CHAIN_ID, TWO_POW_128, Token, TokenData, TokenType, TokenTypeData,
    };
    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    #[storage]
    pub struct Storage {
        /// Token data keyed by token address
        /// Stores: token_type, is_registered
        TokenValidator_tokens: Map<ContractAddress, Token>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        TokenRegistered: TokenRegistered,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TokenRegistered {
        #[key]
        pub token_address: ContractAddress,
        pub token_type: TokenType,
    }

    #[embeddable_as(TokenValidatorImpl)]
    impl TokenValidatorComponentImpl<
        TContractState,
        +HasComponent<TContractState>,
        +SRC5Component::HasComponent<TContractState>,
        +Drop<TContractState>,
    > of ITokenValidator<ComponentState<TContractState>> {
        fn get_token(self: @ComponentState<TContractState>, address: ContractAddress) -> Token {
            self._get_token(address)
        }

        fn is_token_registered(
            self: @ComponentState<TContractState>, address: ContractAddress,
        ) -> bool {
            self._is_address_registered(address)
        }

        fn register_token(
            ref self: ComponentState<TContractState>,
            address: ContractAddress,
            token_type: TokenTypeData,
        ) {
            let token = self._get_token(address);
            self.assert_token_not_registered(@token);
            self._register_token(address, token_type);
        }
    }

    #[generate_trait]
    pub impl TokenValidatorInternalImpl<
        TContractState,
        +HasComponent<TContractState>,
        impl SRC5: SRC5Component::HasComponent<TContractState>,
        +Drop<TContractState>,
    > of TokenValidatorInternalTrait<TContractState> {
        /// Initialize the token validator component
        /// Registers the SRC5 interface and pre-registers an array of tokens
        fn initializer(
            ref self: ComponentState<TContractState>, registered_tokens: Span<TokenData>,
        ) {
            // Register SRC5 interface
            let mut src5_component = get_dep_component_mut!(ref self, SRC5);
            src5_component.register_interface(ITOKEN_VALIDATOR_ID);

            // Pre-register tokens without validation (for constructor use)
            // Note: We skip the "not already registered" check here since initializer is
            // initializing fresh storage.
            let mut tokens_index = 0;
            loop {
                if tokens_index >= registered_tokens.len() {
                    break;
                }
                let token_data = *registered_tokens.at(tokens_index);
                let new_token = Token { token_type: token_data.token_type, is_registered: true };
                self.TokenValidator_tokens.entry(token_data.token_address).write(new_token);
                tokens_index += 1;
            }
        }

        /// Get token data by address (internal)
        fn _get_token(self: @ComponentState<TContractState>, address: ContractAddress) -> Token {
            self.TokenValidator_tokens.entry(address).read()
        }

        /// Set token data
        fn set_token(
            ref self: ComponentState<TContractState>, address: ContractAddress, token: @Token,
        ) {
            self.TokenValidator_tokens.entry(address).write(*token);
        }

        /// Check if a token is registered (by token struct)
        /// On Sepolia testnet, all tokens are considered registered for testing purposes
        fn is_token_struct_registered(
            self: @ComponentState<TContractState>, token: @Token,
        ) -> bool {
            let chain_id = starknet::get_tx_info().unbox().chain_id;
            if chain_id == SEPOLIA_CHAIN_ID {
                true
            } else {
                *token.is_registered
            }
        }

        /// Check if a token address is registered (internal)
        fn _is_address_registered(
            self: @ComponentState<TContractState>, address: ContractAddress,
        ) -> bool {
            let token = self.TokenValidator_tokens.entry(address).read();
            self.is_token_struct_registered(@token)
        }

        /// Register a token after validation (internal)
        /// This performs legitimacy checks on the token contract
        fn _register_token(
            ref self: ComponentState<TContractState>,
            token_address: ContractAddress,
            token_type_data: TokenTypeData,
        ) {
            // Validate the token
            self.validate_token(token_address, token_type_data);

            // Store the token as registered
            let token_type = match token_type_data {
                TokenTypeData::erc20(_) => TokenType::erc20,
                TokenTypeData::erc721(_) => TokenType::erc721,
            };

            let token = Token { token_type, is_registered: true };
            self.TokenValidator_tokens.entry(token_address).write(token);

            // Emit event
            self.emit(TokenRegistered { token_address, token_type });
        }

        /// Validate a token by performing transfer checks
        /// For ERC20: checks allowance, performs transfer and checks balance
        /// For ERC721: checks approval, performs transfer and checks ownership
        fn validate_token(
            ref self: ComponentState<TContractState>,
            token_address: ContractAddress,
            token_type_data: TokenTypeData,
        ) {
            match token_type_data {
                TokenTypeData::erc20(_) => { self.validate_erc20_token(token_address); },
                TokenTypeData::erc721(erc721_data) => {
                    self.validate_erc721_token(token_address, erc721_data.id);
                },
            }
        }

        /// Validate an ERC20 token
        fn validate_erc20_token(
            ref self: ComponentState<TContractState>, token_address: ContractAddress,
        ) {
            let token_dispatcher = IERC20Dispatcher { contract_address: token_address };
            let caller = get_caller_address();
            let this_contract = get_contract_address();
            let token_addr_felt: felt252 = token_address.into();

            // Check that the contract is approved for the minimal amount
            let allowance = token_dispatcher.allowance(caller, this_contract);
            assert!(
                allowance == 1,
                "TokenValidator: Token address {} has invalid allowance",
                token_addr_felt,
            );

            // Take a reading of the current balance
            let current_balance = token_dispatcher.balance_of(this_contract);

            // Transfer a minimal amount to the contract
            token_dispatcher.transfer_from(caller, this_contract, 1);

            // Take a reading of the new balance
            let new_balance = token_dispatcher.balance_of(this_contract);
            assert!(
                new_balance == current_balance + 1,
                "TokenValidator: Token address {} has invalid balance",
                token_addr_felt,
            );

            // Transfer back the minimal amount
            token_dispatcher.transfer(caller, 1);

            // Check the total supply is legitimate (< 2^128)
            let total_supply = token_dispatcher.total_supply();
            assert!(
                total_supply < TWO_POW_128.into(),
                "TokenValidator: Token address {} has a total supply that is too large",
                token_addr_felt,
            );
        }

        /// Validate an ERC721 token
        fn validate_erc721_token(
            ref self: ComponentState<TContractState>,
            token_address: ContractAddress,
            token_id: u128,
        ) {
            let token_dispatcher = IERC721Dispatcher { contract_address: token_address };
            let caller = get_caller_address();
            let this_contract = get_contract_address();
            let token_addr_felt: felt252 = token_address.into();

            // Check that the contract is approved for the specific id
            let approved = token_dispatcher.get_approved(token_id.into());
            assert!(
                approved == this_contract,
                "TokenValidator: Token address {} has invalid approval",
                token_addr_felt,
            );

            // Transfer the specific id to the contract
            token_dispatcher.transfer_from(caller, this_contract, token_id.into());

            // Check the balance of the contract
            let balance = token_dispatcher.balance_of(this_contract);
            assert!(
                balance == 1,
                "TokenValidator: Token address {} has invalid balance",
                token_addr_felt,
            );

            // Check ownership
            let owner = token_dispatcher.owner_of(token_id.into());
            assert!(
                owner == this_contract,
                "TokenValidator: Token address {} has invalid owner",
                token_addr_felt,
            );

            // Transfer back the token
            token_dispatcher.transfer_from(this_contract, caller, token_id.into());
        }

        /// Assert that a token is not already registered
        fn assert_token_not_registered(self: @ComponentState<TContractState>, token: @Token) {
            assert!(
                !self.is_token_struct_registered(token),
                "TokenValidator: Token is already registered",
            );
        }

        /// Assert that a token is registered
        fn assert_token_registered(self: @ComponentState<TContractState>, token: @Token) {
            assert!(
                self.is_token_struct_registered(token), "TokenValidator: Token is not registered",
            );
        }
    }
}
