use starknet::ContractAddress;

// ==============================================
// MAINNET CONTRACT ADDRESSES
// ==============================================

// Budokan contract address on mainnet
pub fn budokan_address() -> ContractAddress {
    0x58f888ba5897efa811eca5e5818540d35b664f4281660cd839cd5a4b0bf4582.try_into().unwrap()
}

// Minigame contract address on mainnet
pub fn minigame_address() -> ContractAddress {
    0x5e2dfbdc3c193de629e5beb116083b06bd944c1608c9c793351d5792ba29863.try_into().unwrap()
}

// Test account address on mainnet
pub fn test_account() -> ContractAddress {
    0x077b8Ed8356a7C1F0903Fc4bA6E15F9b09CF437ce04f21B2cBf32dC2790183d0.try_into().unwrap()
}

// ==============================================
// GOVERNANCE CONTRACT ADDRESSES
// ==============================================

// Governance token contract address on mainnet
pub fn governance_token_address() -> ContractAddress {
    0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b.try_into().unwrap()
}

// Governor contract address on mainnet
pub fn governor_address() -> ContractAddress {
    0x050897ea9df71b661b8eac53162be37552e729ee9d33a6f9ae0b61c95a11209e.try_into().unwrap()
}
