// BudokanViewer Contract
// This contract implements IBudokanViewer for efficient RPC batching.
// It separates view logic from the main Budokan contract to reduce contract size.
// Includes OwnableComponent and UpgradeableComponent for access control and upgradability.

use budokan_interfaces::budokan::{IBudokanDispatcher, IBudokanDispatcherTrait, Phase, RewardType};
use budokan_interfaces::viewer::{
    IBudokanViewer, LeaderboardEntryView, RegistrationResult, RewardClaimResult, RewardClaimView,
    TournamentFilterResult, TournamentFullState,
};
use core::num::traits::Zero;
use game_components_interfaces::metagame::core::{IMetagameDispatcher, IMetagameDispatcherTrait};
use game_components_interfaces::prize::{
    IPrizeDispatcher, IPrizeDispatcherTrait, PrizeData, PrizeType, TokenTypeData,
};
use game_components_interfaces::registration::{
    IRegistrationDispatcher, IRegistrationDispatcherTrait, Registration,
};
use openzeppelin_access::ownable::OwnableComponent;
use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
use openzeppelin_upgrades::UpgradeableComponent;
use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
use starknet::{ClassHash, ContractAddress};

// ================================================================================================
// CONTRACT
// ================================================================================================

#[starknet::contract]
pub mod BudokanViewer {
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use super::*;

    // ================================================================================================
    // COMPONENT DECLARATIONS
    // ================================================================================================

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    // ================================================================================================
    // COMPONENT IMPLEMENTATIONS
    // ================================================================================================

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    #[abi(embed_v0)]
    impl OwnableCamelOnlyImpl =
        OwnableComponent::OwnableCamelOnlyImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // ================================================================================================
    // STORAGE
    // ================================================================================================

    #[storage]
    struct Storage {
        budokan_address: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
    }

    // ================================================================================================
    // EVENTS
    // ================================================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
    }

    // ================================================================================================
    // CONSTRUCTOR
    // ================================================================================================

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, budokan_address: ContractAddress,
    ) {
        assert!(!owner.is_zero(), "BudokanViewer: owner address cannot be zero");
        assert!(!budokan_address.is_zero(), "BudokanViewer: budokan address cannot be zero");
        self.ownable.initializer(owner);
        self.budokan_address.write(budokan_address);
    }

    // ================================================================================================
    // UPGRADEABLE IMPLEMENTATION
    // ================================================================================================

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    // ================================================================================================
    // DISPATCHER HELPERS
    // ================================================================================================

    #[generate_trait]
    impl DispatcherHelpers of DispatcherHelpersTrait {
        fn _budokan(self: @ContractState) -> IBudokanDispatcher {
            IBudokanDispatcher { contract_address: self.budokan_address.read() }
        }

        fn _registration(self: @ContractState) -> IRegistrationDispatcher {
            IRegistrationDispatcher { contract_address: self.budokan_address.read() }
        }

        fn _prize(self: @ContractState) -> IPrizeDispatcher {
            IPrizeDispatcher { contract_address: self.budokan_address.read() }
        }


        fn _build_full_state(self: @ContractState, tournament_id: u64) -> TournamentFullState {
            let budokan = self._budokan();
            TournamentFullState {
                tournament: budokan.tournament(tournament_id),
                entry_count: budokan.tournament_entries(tournament_id),
                phase: budokan.current_phase(tournament_id),
            }
        }
    }

    // ================================================================================================
    // VIEWER IMPLEMENTATION
    // ================================================================================================

    #[abi(embed_v0)]
    impl BudokanViewerImpl of IBudokanViewer<ContractState> {
        // === TOURNAMENT LISTING ===

        fn tournaments(self: @ContractState, offset: u64, limit: u64) -> TournamentFilterResult {
            let total = self._budokan().total_tournaments();
            let mut tournament_ids: Array<u64> = array![];

            // Direct range-based pagination (no filtering needed)
            let start = offset + 1; // tournament IDs are 1-based
            let end = if offset + limit > total {
                total
            } else {
                offset + limit
            };

            let mut id = start;
            while id <= end {
                tournament_ids.append(id);
                id += 1;
            }

            TournamentFilterResult { tournament_ids, total }
        }

        fn tournaments_by_game(
            self: @ContractState, game_address: ContractAddress, offset: u64, limit: u64,
        ) -> TournamentFilterResult {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut matched: u64 = 0;
            let mut skipped: u64 = 0;
            let mut tournament_ids: Array<u64> = array![];

            let mut id: u64 = 1;
            while id <= total {
                let t = budokan.tournament(id);
                if t.game_config.game_address == game_address {
                    if skipped < offset {
                        skipped += 1;
                    } else if tournament_ids.len().into() < limit {
                        tournament_ids.append(id);
                    }
                    matched += 1;
                }
                id += 1;
            }

            TournamentFilterResult { tournament_ids, total: matched }
        }

        fn tournaments_by_creator(
            self: @ContractState, creator: ContractAddress, offset: u64, limit: u64,
        ) -> TournamentFilterResult {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut matched: u64 = 0;
            let mut skipped: u64 = 0;
            let mut tournament_ids: Array<u64> = array![];

            let mut id: u64 = 1;
            while id <= total {
                let t = budokan.tournament(id);
                if t.created_by == creator {
                    if skipped < offset {
                        skipped += 1;
                    } else if tournament_ids.len().into() < limit {
                        tournament_ids.append(id);
                    }
                    matched += 1;
                }
                id += 1;
            }

            TournamentFilterResult { tournament_ids, total: matched }
        }

        fn tournaments_by_phase(
            self: @ContractState, phase: Phase, offset: u64, limit: u64,
        ) -> TournamentFilterResult {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut matched: u64 = 0;
            let mut skipped: u64 = 0;
            let mut tournament_ids: Array<u64> = array![];

            let mut id: u64 = 1;
            while id <= total {
                let current = budokan.current_phase(id);
                if current == phase {
                    if skipped < offset {
                        skipped += 1;
                    } else if tournament_ids.len().into() < limit {
                        tournament_ids.append(id);
                    }
                    matched += 1;
                }
                id += 1;
            }

            TournamentFilterResult { tournament_ids, total: matched }
        }

        // === COUNTS ===

        fn count_tournaments(self: @ContractState) -> u64 {
            self._budokan().total_tournaments()
        }

        fn count_tournaments_by_game(self: @ContractState, game_address: ContractAddress) -> u64 {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut count: u64 = 0;

            let mut id: u64 = 1;
            while id <= total {
                let t = budokan.tournament(id);
                if t.game_config.game_address == game_address {
                    count += 1;
                }
                id += 1;
            }

            count
        }

        fn count_tournaments_by_creator(self: @ContractState, creator: ContractAddress) -> u64 {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut count: u64 = 0;

            let mut id: u64 = 1;
            while id <= total {
                let t = budokan.tournament(id);
                if t.created_by == creator {
                    count += 1;
                }
                id += 1;
            }

            count
        }

        fn tournaments_by_phases(
            self: @ContractState, phases: Array<Phase>, offset: u64, limit: u64,
        ) -> TournamentFilterResult {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut matched: u64 = 0;
            let mut skipped: u64 = 0;
            let mut tournament_ids: Array<u64> = array![];
            let phases_snap = phases.span();

            let mut id: u64 = 1;
            while id <= total {
                let current = budokan.current_phase(id);
                let mut found = false;
                let mut i: u32 = 0;
                while i < phases_snap.len() {
                    if current == *phases_snap.at(i) {
                        found = true;
                        break;
                    }
                    i += 1;
                }
                if found {
                    if skipped < offset {
                        skipped += 1;
                    } else if tournament_ids.len().into() < limit {
                        tournament_ids.append(id);
                    }
                    matched += 1;
                }
                id += 1;
            }

            TournamentFilterResult { tournament_ids, total: matched }
        }

        fn count_tournaments_by_phases(self: @ContractState, phases: Array<Phase>) -> u64 {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut count: u64 = 0;
            let phases_snap = phases.span();

            let mut id: u64 = 1;
            while id <= total {
                let current = budokan.current_phase(id);
                let mut i: u32 = 0;
                while i < phases_snap.len() {
                    if current == *phases_snap.at(i) {
                        count += 1;
                        break;
                    }
                    i += 1;
                }
                id += 1;
            }

            count
        }

        fn count_tournaments_by_phase(self: @ContractState, phase: Phase) -> u64 {
            let budokan = self._budokan();
            let total = budokan.total_tournaments();
            let mut count: u64 = 0;

            let mut id: u64 = 1;
            while id <= total {
                if budokan.current_phase(id) == phase {
                    count += 1;
                }
                id += 1;
            }

            count
        }

        // === TOURNAMENT DETAIL ===

        fn tournament_detail(self: @ContractState, tournament_id: u64) -> TournamentFullState {
            self._build_full_state(tournament_id)
        }

        fn tournaments_batch(
            self: @ContractState, tournament_ids: Array<u64>,
        ) -> Array<TournamentFullState> {
            let mut results: Array<TournamentFullState> = array![];
            let mut i: u32 = 0;
            let ids = tournament_ids.span();
            while i < ids.len() {
                results.append(self._build_full_state(*ids[i]));
                i += 1;
            }
            results
        }

        // === REGISTRATIONS ===

        fn tournament_registrations(
            self: @ContractState, tournament_id: u64, offset: u32, limit: u32,
        ) -> RegistrationResult {
            let registration = self._registration();
            let total = registration.get_entry_count(tournament_id);
            let mut entries: Array<Registration> = array![];

            // Entry IDs are 1-based
            let start = offset + 1;
            let end = if offset + limit > total {
                total
            } else {
                offset + limit
            };

            let mut entry_id = start;
            while entry_id <= end {
                entries.append(registration.get_entry(tournament_id, entry_id));
                entry_id += 1;
            }

            RegistrationResult { entries, total }
        }

        // === LEADERBOARD ===

        fn leaderboard(
            self: @ContractState, tournament_id: u64, offset: u32, limit: u32,
        ) -> Array<LeaderboardEntryView> {
            let token_ids = self._budokan().get_leaderboard(tournament_id);
            let ids = token_ids.span();
            let mut results: Array<LeaderboardEntryView> = array![];

            let start = offset;
            let end = if offset + limit > ids.len() {
                ids.len()
            } else {
                offset + limit
            };

            let mut i = start;
            while i < end {
                results
                    .append(
                        LeaderboardEntryView {
                            position: i + 1, // 1-based positions
                            token_id: *ids[i],
                        },
                    );
                i += 1;
            }

            results
        }

        // === PRIZES ===

        fn tournament_prizes(self: @ContractState, tournament_id: u64) -> Array<PrizeData> {
            let prize_dispatcher = self._prize();
            let total_prizes = prize_dispatcher.get_total_prizes();
            let mut results: Array<PrizeData> = array![];

            // Prize IDs are 1-based, iterate all and filter by tournament (context_id)
            let mut prize_id: u64 = 1;
            while prize_id <= total_prizes {
                let prize = prize_dispatcher.get_prize(prize_id);
                if prize.context_id == tournament_id {
                    results.append(prize);
                }
                prize_id += 1;
            }

            results
        }

        // === REWARD CLAIMS ===

        fn tournament_reward_claims(
            self: @ContractState, tournament_id: u64, offset: u32, limit: u32,
        ) -> RewardClaimResult {
            let prize_dispatcher = self._prize();
            let total_prizes = prize_dispatcher.get_total_prizes();
            let mut claims: Array<RewardClaimView> = array![];
            let mut all_claims: Array<RewardClaimView> = array![];

            // Collect prize reward claims for this tournament
            let mut prize_id: u64 = 1;
            while prize_id <= total_prizes {
                let prize = prize_dispatcher.get_prize(prize_id);
                if prize.context_id == tournament_id {
                    // Check if this is a distributed prize (ERC20 with distribution_count)
                    let distribution_count = match @prize.token_type {
                        TokenTypeData::erc20(erc20_data) => {
                            match erc20_data.distribution_count {
                                Option::Some(count) => *count,
                                Option::None => 0,
                            }
                        },
                        TokenTypeData::erc721(_) => 0,
                    };

                    if distribution_count > 0 {
                        // Distributed prize: one claim per position
                        let mut pos: u32 = 1;
                        while pos <= distribution_count {
                            let prize_type = PrizeType::Distributed((prize_id, pos));
                            let claimed = prize_dispatcher
                                .is_prize_claimed(tournament_id, prize_type);
                            all_claims
                                .append(
                                    RewardClaimView {
                                        reward_type: RewardType::Prize(prize_type), claimed,
                                    },
                                );
                            pos += 1;
                        }
                    } else {
                        // Single prize: one claim
                        let prize_type = PrizeType::Single(prize_id);
                        let claimed = prize_dispatcher.is_prize_claimed(tournament_id, prize_type);
                        all_claims
                            .append(
                                RewardClaimView {
                                    reward_type: RewardType::Prize(prize_type), claimed,
                                },
                            );
                    }
                }
                prize_id += 1;
            }

            // Compute totals and apply pagination
            let total: u32 = all_claims.len();
            let mut total_claimed: u32 = 0;
            let mut total_unclaimed: u32 = 0;
            let mut idx: u32 = 0;
            let mut skipped: u32 = 0;
            let snap = all_claims.span();
            while idx < total {
                let claim = *snap.at(idx);
                if claim.claimed {
                    total_claimed += 1;
                } else {
                    total_unclaimed += 1;
                }
                if skipped < offset {
                    skipped += 1;
                } else if claims.len() < limit {
                    claims.append(claim);
                }
                idx += 1;
            }

            RewardClaimResult { claims, total, total_claimed, total_unclaimed }
        }

        // === PLAYER TOURNAMENTS ===

        fn player_tournaments(
            self: @ContractState, player_address: ContractAddress, offset: u64, limit: u64,
        ) -> TournamentFilterResult {
            let budokan = self._budokan();
            let registration = self._registration();
            let metagame = IMetagameDispatcher { contract_address: self.budokan_address.read() };
            let denshokan = IERC721Dispatcher { contract_address: metagame.context_address() };
            let total_tournaments = budokan.total_tournaments();
            let mut matched: u64 = 0;
            let mut skipped: u64 = 0;
            let mut tournament_ids: Array<u64> = array![];

            let mut tid: u64 = 1;
            while tid <= total_tournaments {
                let entry_count = registration.get_entry_count(tid);
                let mut found = false;
                let mut eid: u32 = 1;
                while eid <= entry_count {
                    if registration.entry_exists(tid, eid) {
                        let entry = registration.get_entry(tid, eid);
                        // Check if this entry's game token is owned by the player
                        let token_id: u256 = entry.game_token_id.into();
                        let owner = denshokan.owner_of(token_id);
                        if owner == player_address {
                            found = true;
                            break;
                        }
                    }
                    eid += 1;
                }
                if found {
                    if skipped < offset {
                        skipped += 1;
                    } else if tournament_ids.len().into() < limit {
                        tournament_ids.append(tid);
                    }
                    matched += 1;
                }
                tid += 1;
            }

            TournamentFilterResult { tournament_ids, total: matched }
        }
    }
}
