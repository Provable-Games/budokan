use starknet::ContractAddress;
use dojo::world::{WorldStorage};
use dojo::model::{ModelStorage};
use budokan::models::budokan::{
    Tournament, EntryCount, Prize, Leaderboard, Token, Registration, RegistrationBanned,
    TournamentTokenMetrics, PlatformMetrics, PrizeMetrics, PrizeClaim, PrizeType, Metadata,
    GameConfig, EntryFee, EntryRequirement, QualificationEntries, QualificationProof,
};
use budokan::models::schedule::Schedule;
use budokan::constants::{VERSION};

#[derive(Copy, Drop)]
pub struct Store {
    world: WorldStorage,
}

#[generate_trait]
pub impl StoreImpl of StoreTrait {
    #[inline(always)]
    fn new(world: WorldStorage) -> Store {
        (Store { world })
    }

    //
    // Getters
    //

    // Tournament

    #[inline(always)]
    fn get_platform_metrics(self: Store) -> PlatformMetrics {
        (self.world.read_model(VERSION))
    }

    #[inline(always)]
    fn get_tournament_count(self: Store) -> u64 {
        let metrics: PlatformMetrics = (self.world.read_model(VERSION));
        metrics.total_tournaments
    }


    #[inline(always)]
    fn get_token_metadata_metrics(self: Store, key: felt252) -> TournamentTokenMetrics {
        (self.world.read_model(key))
    }

    #[inline(always)]
    fn get_prize_metrics(self: Store, key: felt252) -> PrizeMetrics {
        (self.world.read_model(key))
    }

    #[inline(always)]
    fn get_tournament(self: Store, tournament_id: u64) -> Tournament {
        (self.world.read_model(tournament_id))
    }

    #[inline(always)]
    fn get_tournament_entry_count(self: Store, tournament_id: u64) -> EntryCount {
        (self.world.read_model(tournament_id))
    }

    #[inline(always)]
    fn get_registration(self: Store, game_address: ContractAddress, token_id: u64) -> Registration {
        (self.world.read_model((game_address, token_id)))
    }

    #[inline(always)]
    fn get_registration_banned(
        self: Store, game_address: ContractAddress, token_id: u64,
    ) -> RegistrationBanned {
        (self.world.read_model((game_address, token_id)))
    }


    #[inline(always)]
    fn get_leaderboard(self: Store, tournament_id: u64) -> Array<u64> {
        let leaderboard: Leaderboard = (self.world.read_model(tournament_id));
        leaderboard.token_ids
    }

    #[inline(always)]
    fn get_prize(self: Store, id: u64) -> Prize {
        (self.world.read_model(id))
    }

    #[inline(always)]
    fn get_token(self: Store, address: ContractAddress) -> Token {
        (self.world.read_model(address))
    }

    #[inline(always)]
    fn get_prize_claim(self: Store, tournament_id: u64, prize_type: PrizeType) -> PrizeClaim {
        (self.world.read_model((tournament_id, prize_type)))
    }

    #[inline(always)]
    fn get_qualification_entries(
        self: Store, tournament_id: u64, qualification_proof: QualificationProof,
    ) -> QualificationEntries {
        (self.world.read_model((tournament_id, qualification_proof)))
    }

    //
    // Setters
    //

    // Tournament

    #[inline(always)]
    fn create_tournament(
        ref self: Store,
        creator_token_id: u64,
        metadata: Metadata,
        schedule: Schedule,
        game_config: GameConfig,
        entry_fee: Option<EntryFee>,
        entry_requirement: Option<EntryRequirement>,
        soulbound: bool,
        play_url: ByteArray,
    ) -> Tournament {
        let tournament = Tournament {
            id: self.increment_and_get_tournament_count(),
            created_at: starknet::get_block_timestamp(),
            created_by: starknet::get_caller_address(),
            creator_token_id,
            metadata,
            schedule,
            game_config,
            entry_fee,
            entry_requirement,
            soulbound,
            play_url,
        };
        self.world.write_model(@tournament);
        tournament
    }

    #[inline(always)]
    fn set_tournament(ref self: Store, model: @Tournament) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn set_tournament_entry_count(ref self: Store, model: @EntryCount) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn increment_and_get_tournament_entry_count(ref self: Store, tournament_id: u64) -> u32 {
        let mut entries = self.get_tournament_entry_count(tournament_id);
        entries.count += 1;
        self.set_tournament_entry_count(@entries);
        entries.count
    }

    #[inline(always)]
    fn set_registration(ref self: Store, model: @Registration) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn set_registration_banned(ref self: Store, model: @RegistrationBanned) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn set_leaderboard(ref self: Store, model: @Leaderboard) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn set_prize(ref self: Store, model: @Prize) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn set_prize_metrics(ref self: Store, model: @PrizeMetrics) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn increment_and_get_prize_count(ref self: Store) -> u64 {
        let mut metrics = self.get_prize_metrics(VERSION);
        metrics.total_prizes += 1;
        self.set_prize_metrics(@metrics);
        metrics.total_prizes
    }


    #[inline(always)]
    fn set_token(ref self: Store, model: @Token) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn increment_and_get_token_supply(ref self: Store) -> u64 {
        let mut metrics = self.get_token_metadata_metrics(VERSION);
        metrics.total_supply += 1;
        self.set_token_metadata_metrics(@metrics);
        metrics.total_supply
    }

    #[inline(always)]
    fn set_token_metadata_metrics(ref self: Store, model: @TournamentTokenMetrics) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn increment_and_get_tournament_count(ref self: Store) -> u64 {
        let mut platform_metrics = self.get_platform_metrics();
        platform_metrics.total_tournaments += 1;
        self.set_platform_metrics(@platform_metrics);
        platform_metrics.total_tournaments
    }

    #[inline(always)]
    fn set_platform_metrics(ref self: Store, model: @PlatformMetrics) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn set_prize_claim(ref self: Store, model: @PrizeClaim) {
        self.world.write_model(model);
    }

    #[inline(always)]
    fn set_qualification_entries(ref self: Store, model: @QualificationEntries) {
        self.world.write_model(model);
    }
}
