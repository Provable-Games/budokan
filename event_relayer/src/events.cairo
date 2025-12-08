use starknet::ContractAddress;

#[derive(Drop, Serde)]
#[dojo::event]
pub struct TournamentCreated {
    #[key]
    pub tournament_id: u64,
    pub created_at: u64,
    pub created_by: ContractAddress,
    pub creator_token_id: u64,
    pub name: felt252,
    pub description: ByteArray,
    pub game_address: ContractAddress,
    pub settings_id: u32,
    pub prize_spots: u8,
    pub soulbound: bool,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct TournamentRegistration {
    #[key]
    pub game_address: ContractAddress,
    #[key]
    pub game_token_id: u64,
    pub tournament_id: u64,
    pub entry_number: u32,
    pub is_banned: bool,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct ScoreSubmitted {
    #[key]
    pub tournament_id: u64,
    #[key]
    pub game_token_id: u64,
    pub position: u8,
}

#[derive(Drop, Serde)]
#[dojo::event]
pub struct LeaderboardUpdate {
    #[key]
    pub tournament_id: u64,
    pub token_ids: Span<u64>,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct PrizeAdded {
    #[key]
    pub prize_id: u64,
    #[key]
    pub tournament_id: u64,
    pub token_address: ContractAddress,
    pub payout_position: u8,
    pub sponsor_address: ContractAddress,
}

use budokan_event_relayer::models::PrizeType;

#[derive(Drop, Serde)]
#[dojo::event]
pub struct PrizeClaimed {
    #[key]
    pub tournament_id: u64,
    pub prize_type: PrizeType,
}

#[derive(Drop, Serde)]
#[dojo::event]
pub struct TokenRegistered {
    #[key]
    pub token_address: ContractAddress,
    pub name: ByteArray,
    pub symbol: ByteArray,
}
