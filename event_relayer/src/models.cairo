use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Introspect)]
pub enum Role {
    Organizer: ContractAddress,
    TokenHolder: u64,
}

#[derive(Copy, Drop, Serde, Introspect)]
pub enum PrizeType {
    EntryFees: Role,
    Sponsored: u64,
}
