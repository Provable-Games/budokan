// SPDX-License-Identifier: BUSL-1.1

//! BudokanRewards — claim/prize logic for the Budokan tournament system.
//!
//! This class is **never deployed as its own contract instance**. Instead, it
//! is declared on the network and its `class_hash` is registered with the
//! main Budokan contract, which dispatches `add_prize` and `claim_reward` to
//! it via `library_call_syscall`. The bytecode lives here, but it executes
//! in Budokan's storage context — so storage slots, component substorage,
//! and emitted events all behave as if Budokan executed them directly.
//!
//! Storage layout note: every component substorage and direct storage field
//! used here MUST be declared with the same field name as in the main Budokan
//! contract. Cairo derives storage slot addresses from field names, so any
//! mismatch corrupts data. Slots not used by the claim/prize flow are
//! intentionally omitted (they don't need to be present in the layout).

#[starknet::contract]
pub mod BudokanRewards {
    // Reuse the canonical event structs and packed-storage layout from the
    // main Budokan crate. Variant names (PrizeAdded, RewardClaimed) MUST match
    // the main contract's `enum Event` so the on-chain selectors are identical
    // — see the storage-mirror invariant note above.
    use budokan::events::{PrizeAdded, RewardClaimed};
    use budokan::libs::schedule::{ScheduleAssertionsImpl, ScheduleAssertionsTrait};
    use budokan::structs::packed_storage::{
        TournamentConfig, TournamentConfigStorePacking, unpack_game_schedule,
    };
    use budokan::structs::schedule::Schedule;
    use budokan_interfaces::budokan::{
        Distribution, EntryFee, EntryFeeRewardType, PrizeData, PrizeType, RewardType, TokenTypeData,
    };
    use budokan_interfaces::rewards::IBudokanRewards;
    use core::num::traits::Zero;
    use game_components_embeddable_game_standard::minigame::interface::{
        IMinigameDispatcher, IMinigameDispatcherTrait,
    };
    use game_components_embeddable_game_standard::token::interface::{
        IMinigameTokenDispatcher, IMinigameTokenDispatcherTrait,
    };
    use game_components_interfaces::entry_fee::{AdditionalShare, EntryFeeConfig};
    use game_components_interfaces::prize::{Prize as PrizeInput, PrizeConfig};
    use game_components_metagame::entry_fee::structs::EntryFeeClaimType;
    use game_components_interfaces::registry::{
        IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
    };
    use game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent;
    use game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent::EntryFeeInternalTrait;
    use game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent;
    use game_components_metagame::leaderboard::store::Store as LeaderboardStore;
    use game_components_metagame::prize::prize_component::PrizeComponent;
    use game_components_metagame::prize::prize_component::PrizeComponent::PrizeInternalTrait;
    use game_components_metagame::registration::registration_component::RegistrationComponent;
    use game_components_metagame::registration::registration_component::RegistrationComponent::RegistrationInternalTrait;
    use game_components_utilities::distribution::calculator;
    use game_components_utilities::distribution::structs::BASIS_POINTS;
    use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp};

    // The game-creator token id mirrors `budokan::structs::constants::GAME_CREATOR_TOKEN_ID`.
    // Hard-coded here to avoid pulling in the budokan crate (which would create a circular
    // dependency: budokan depends on budokan_rewards via the dispatcher).
    const GAME_CREATOR_TOKEN_ID: felt252 = 0;

    component!(path: PrizeComponent, storage: prize, event: PrizeEvent);
    component!(path: EntryFeeComponent, storage: entry_fee, event: EntryFeeEvent);
    component!(path: RegistrationComponent, storage: registration, event: RegistrationEvent);
    component!(path: LeaderboardComponent, storage: leaderboard, event: LeaderboardEvent);

    // Storage MUST mirror the corresponding fields in `Budokan::Storage` for the
    // slots this class reads/writes. Field names define storage paths in Cairo.
    #[storage]
    struct Storage {
        #[substorage(v0)]
        leaderboard: LeaderboardComponent::Storage,
        #[substorage(v0)]
        registration: RegistrationComponent::Storage,
        #[substorage(v0)]
        entry_fee: EntryFeeComponent::Storage,
        #[substorage(v0)]
        prize: PrizeComponent::Storage,
        total_tournaments: u64,
        tournament_config: Map<u64, felt252>,
        tournament_game_address: Map<u64, ContractAddress>,
        tournament_creator_token_id: Map<u64, felt252>,
        entry_fee_position_claimed: Map<(u64, u32), bool>,
        prize_position: Map<u64, u32>,
    }

    // Events use #[flat] for component variants so on-chain selectors match
    // what the main Budokan contract emits.
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        LeaderboardEvent: LeaderboardComponent::Event,
        #[flat]
        RegistrationEvent: RegistrationComponent::Event,
        #[flat]
        EntryFeeEvent: EntryFeeComponent::Event,
        #[flat]
        PrizeEvent: PrizeComponent::Event,
        PrizeAdded: PrizeAdded,
        RewardClaimed: RewardClaimed,
    }

    // Reconstruct a Schedule from the packed config — the canonical
    // `assert_tournament_is_finalized` lives on Schedule and gates on Phase.
    fn schedule_from_config(config: @TournamentConfig) -> Schedule {
        Schedule {
            registration_start_delay: *config.registration_start_delay,
            registration_end_delay: *config.registration_end_delay,
            game_start_delay: *config.game_start_delay,
            game_end_delay: *config.game_end_delay,
            submission_duration: *config.submission_duration,
        }
    }

    fn assert_tournament_not_ended(packed: felt252) {
        let (created_at, game_start_delay, game_end_delay) = unpack_game_schedule(packed);
        let game_end: u64 = created_at + game_start_delay.into() + game_end_delay.into();
        assert!(game_end > get_block_timestamp(), "Budokan: Tournament has ended");
    }

    #[abi(embed_v0)]
    impl BudokanRewardsImpl of IBudokanRewards<ContractState> {
        fn claim_reward(
            ref self: ContractState, tournament_id: u64, reward_type: RewardType,
        ) {
            self._assert_tournament_exists(tournament_id);

            let config = TournamentConfigStorePacking::unpack(
                self.tournament_config.entry(tournament_id).read(),
            );
            let schedule = schedule_from_config(@config);
            schedule.assert_tournament_is_finalized(config.created_at, get_block_timestamp());

            let game_address = self.tournament_game_address.entry(tournament_id).read();

            match reward_type {
                RewardType::Prize(prize_type) => {
                    self.prize.assert_prize_not_claimed(tournament_id, prize_type);
                },
                RewardType::EntryFee(entry_fee_type) => {
                    self._assert_entry_fee_reward_not_claimed(tournament_id, entry_fee_type);
                },
            }

            // CEI: mark claimed BEFORE external calls
            self._set_reward_claim(tournament_id, reward_type);

            match reward_type {
                RewardType::Prize(prize_type) => {
                    self._claim_prize(tournament_id, game_address, prize_type);
                },
                RewardType::EntryFee(entry_fee_type) => {
                    self._claim_entry_fee_reward(tournament_id, game_address, entry_fee_type);
                },
            }
        }

        fn add_prize(
            ref self: ContractState,
            tournament_id: u64,
            token_address: ContractAddress,
            token_type: TokenTypeData,
            position: Option<u32>,
        ) -> PrizeData {
            self._assert_tournament_exists(tournament_id);

            let packed = self.tournament_config.entry(tournament_id).read();
            assert_tournament_not_ended(packed);

            // Validate that position and distribution are mutually exclusive
            if position.is_some() {
                match @token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        assert!(
                            erc20_data.distribution.is_none(),
                            "Budokan: Cannot set position for distributed prize (position and distribution are mutually exclusive)",
                        );
                    },
                    TokenTypeData::erc721(_) => {},
                }
            }

            let prize_id = self
                .prize
                .add_prize(
                    tournament_id, PrizeInput::Config(PrizeConfig { token_address, token_type }),
                );

            if let Option::Some(pos) = position {
                self.prize_position.entry(prize_id).write(pos);
            }

            let prize_data = self.prize._get_prize(prize_id);
            self._emit_prize_added(prize_data);

            self.prize._get_prize(prize_id)
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _assert_tournament_exists(self: @ContractState, tournament_id: u64) {
            assert!(
                tournament_id <= self.total_tournaments.read(),
                "Budokan: Tournament {} does not exist",
                tournament_id,
            );
        }

        fn _emit_prize_added(ref self: ContractState, prize: PrizeData) {
            let payout_position = self.prize_position.entry(prize.id).read();
            self
                .emit(
                    PrizeAdded {
                        tournament_id: prize.context_id,
                        prize_id: prize.id,
                        payout_position,
                        token_address: prize.token_address,
                        token_type: prize.token_type,
                        sponsor_address: prize.sponsor_address,
                    },
                );
        }

        fn _set_reward_claim(
            ref self: ContractState, tournament_id: u64, reward_type: RewardType,
        ) {
            match reward_type {
                RewardType::Prize(prize_type) => {
                    self.prize.set_prize_claimed(tournament_id, prize_type);
                },
                RewardType::EntryFee(entry_fee_type) => {
                    match entry_fee_type {
                        EntryFeeRewardType::Position(position) => {
                            self
                                .entry_fee_position_claimed
                                .entry((tournament_id, position))
                                .write(true);
                        },
                        EntryFeeRewardType::TournamentCreator => {
                            self
                                .entry_fee
                                .set_claimed(tournament_id, EntryFeeClaimType::AdditionalShare(0));
                        },
                        EntryFeeRewardType::GameCreator => {
                            self
                                .entry_fee
                                .set_claimed(tournament_id, EntryFeeClaimType::GameCreator);
                        },
                        EntryFeeRewardType::Refund(token_id) => {
                            self
                                .entry_fee
                                .set_claimed(tournament_id, EntryFeeClaimType::Refund(token_id));
                        },
                    }
                },
            }

            self.emit(RewardClaimed { tournament_id, reward_type, claimed: true });
        }

        fn _assert_entry_fee_reward_not_claimed(
            self: @ContractState, tournament_id: u64, entry_fee_type: EntryFeeRewardType,
        ) {
            match entry_fee_type {
                EntryFeeRewardType::Position(position) => {
                    assert!(
                        !self.entry_fee_position_claimed.entry((tournament_id, position)).read(),
                        "Budokan: Position {} entry fee already claimed",
                        position,
                    );
                },
                EntryFeeRewardType::TournamentCreator => {
                    assert!(
                        !self
                            .entry_fee
                            .is_claimed(tournament_id, EntryFeeClaimType::AdditionalShare(0)),
                        "Budokan: Tournament creator share already claimed",
                    );
                },
                EntryFeeRewardType::GameCreator => {
                    assert!(
                        !self.entry_fee.is_claimed(tournament_id, EntryFeeClaimType::GameCreator),
                        "Budokan: Game creator share already claimed",
                    );
                },
                EntryFeeRewardType::Refund(token_id) => {
                    assert!(
                        !self
                            .entry_fee
                            .is_claimed(tournament_id, EntryFeeClaimType::Refund(token_id)),
                        "Budokan: Refund share already claimed for token {}",
                        token_id,
                    );
                },
            }
        }

        fn _get_leaderboard(self: @ContractState, tournament_id: u64) -> Array<felt252> {
            let span = LeaderboardStore::get_leaderboard(self.leaderboard, tournament_id);
            let mut result = ArrayTrait::new();
            let mut i: u32 = 0;
            loop {
                if i >= span.len() {
                    break;
                }
                result.append(*span.at(i));
                i += 1;
            }
            result
        }

        fn _get_owner(
            self: @ContractState, contract_address: ContractAddress, token_id: u256,
        ) -> ContractAddress {
            IERC721Dispatcher { contract_address }.owner_of(token_id)
        }

        fn _calculate_payout(self: @ContractState, bp: u128, total_value: u128) -> u128 {
            (bp * total_value) / BASIS_POINTS.into()
        }

        /// Project the component's `EntryFeeConfig` into Budokan's `EntryFee`
        /// view shape. Mirror of `budokan::libs::reconstruct::entry_fee_view_from_stored`.
        fn _entry_fee_view(
            self: @ContractState, stored: Option<EntryFeeConfig>,
        ) -> Option<EntryFee> {
            match stored {
                Option::Some(config) => {
                    let tournament_creator_share: u16 = if config.additional_shares.len() > 0 {
                        let first: AdditionalShare = *config.additional_shares.at(0);
                        first.share_bps
                    } else {
                        0
                    };
                    let game_creator_share: u16 = match config.game_creator_share {
                        Option::Some(share) => share,
                        Option::None => 0,
                    };
                    let refund_share: u16 = match config.refund_share {
                        Option::Some(share) => share,
                        Option::None => 0,
                    };
                    let distribution = match config.distribution {
                        Option::Some(d) => d,
                        Option::None => Distribution::Linear(0),
                    };
                    Option::Some(
                        EntryFee {
                            token_address: config.token_address,
                            amount: config.amount,
                            tournament_creator_share,
                            game_creator_share,
                            refund_share,
                            distribution,
                            distribution_count: config.distribution_count,
                        },
                    )
                },
                Option::None => Option::None,
            }
        }

        fn _claim_entry_fee_reward(
            ref self: ContractState,
            tournament_id: u64,
            game_config_address: ContractAddress,
            entry_fee_type: EntryFeeRewardType,
        ) {
            let entry_fee_view = self._entry_fee_view(self.entry_fee._get_entry_fee(tournament_id));

            if let Option::Some(entry_fee) = entry_fee_view {
                let creator_token_id = self
                    .tournament_creator_token_id
                    .entry(tournament_id)
                    .read();
                let total_entries = self.registration._get_entry_count(tournament_id);
                let total_pool = total_entries.into() * entry_fee.amount;

                let game_dispatcher = IMinigameDispatcher { contract_address: game_config_address };
                let game_token_address = game_dispatcher.token_address();

                let (share, recipient_address): (u16, ContractAddress) = match entry_fee_type {
                    EntryFeeRewardType::Position(position) => {
                        self
                            ._claim_entry_fee_position(
                                tournament_id,
                                entry_fee,
                                position,
                                game_token_address,
                                creator_token_id,
                            );
                        return;
                    },
                    EntryFeeRewardType::TournamentCreator => {
                        let stored = match self.entry_fee._get_entry_fee(tournament_id) {
                            Option::Some(config) => config,
                            Option::None => panic!("Budokan: no entry fee"),
                        };
                        assert!(
                            stored.additional_shares.len() > 0,
                            "Budokan: tournament {} does not have a tournament creator share",
                            tournament_id,
                        );
                        let additional_share = *stored.additional_shares.at(0);
                        (additional_share.share_bps, additional_share.recipient)
                    },
                    EntryFeeRewardType::GameCreator => {
                        let share = entry_fee.game_creator_share;
                        assert!(
                            share > 0,
                            "Budokan: tournament {} does not have a game creator share",
                            tournament_id,
                        );

                        let game_token_dispatcher = IMinigameTokenDispatcher {
                            contract_address: game_token_address,
                        };
                        let minigame_registry_address = game_token_dispatcher
                            .game_registry_address();
                        let recipient = if !minigame_registry_address.is_zero() {
                            let minigame_registry = IMinigameRegistryDispatcher {
                                contract_address: minigame_registry_address,
                            };
                            let game_id = minigame_registry
                                .game_id_from_address(game_config_address);
                            self._get_owner(minigame_registry_address, game_id.into())
                        } else {
                            self._get_owner(game_token_address, GAME_CREATOR_TOKEN_ID.into())
                        };

                        (share, recipient)
                    },
                    EntryFeeRewardType::Refund(token_id) => {
                        // After the token-keyed registration refactor, the
                        // token_id -> tournament_id reverse index lives on
                        // the registration component itself.
                        let context_id = self.registration._get_token_context(token_id);
                        assert!(
                            context_id == tournament_id,
                            "Budokan: token_id is not registered for tournament {}",
                            tournament_id,
                        );

                        let refund_share = entry_fee.refund_share;
                        assert!(
                            refund_share > 0,
                            "Budokan: tournament {} does not have a refund share",
                            tournament_id,
                        );
                        let share_u32: u32 = refund_share.into() / total_entries;
                        let share: u16 = share_u32
                            .try_into()
                            .expect('refund share calculation error');

                        let recipient = self._get_owner(game_token_address, token_id.into());

                        (share, recipient)
                    },
                };

                let prize_amount = self._calculate_payout(share.into(), total_pool);

                assert!(
                    prize_amount > 0,
                    "Budokan: Entry fee reward has 0 tokens to claim for tournament {}",
                    tournament_id,
                );

                self.entry_fee.payout(entry_fee.token_address, recipient_address, prize_amount);
            } else {
                panic!("Budokan: tournament {} has no entry fees", tournament_id);
            }
        }

        fn _claim_entry_fee_position(
            ref self: ContractState,
            tournament_id: u64,
            entry_fee: EntryFee,
            position: u32,
            game_token_address: ContractAddress,
            creator_token_id: felt252,
        ) {
            let total_entries = self.registration._get_entry_count(tournament_id);
            let total_pool = total_entries.into() * entry_fee.amount;

            let leaderboard = self._get_leaderboard(tournament_id);
            let leaderboard_size: u32 = leaderboard.len();

            assert!(position > 0, "Budokan: Position must be greater than zero");

            let total_positions: u32 = if entry_fee.distribution_count > 0 {
                entry_fee.distribution_count
            } else {
                leaderboard_size
            };

            let mut available_share: u16 = BASIS_POINTS;
            if entry_fee.tournament_creator_share > 0 {
                available_share -= entry_fee.tournament_creator_share;
            }
            if entry_fee.game_creator_share > 0 {
                available_share -= entry_fee.game_creator_share;
            }
            if entry_fee.refund_share > 0 {
                available_share -= entry_fee.refund_share;
            }

            let recipient_address = if position <= leaderboard_size {
                let winner_token_id: felt252 = *leaderboard.at(position - 1);
                self._get_owner(game_token_address, winner_token_id.into())
            } else {
                self._get_owner(game_token_address, creator_token_id.into())
            };

            // Custom uses u256 fold to bound rounding to ≤1 wei per position;
            // others use the calculator's built-in dust roll-up. See main
            // contract docstrings for the full rationale.
            let prize_amount: u128 = match entry_fee.distribution {
                Distribution::Custom(_) => {
                    let raw = self.entry_fee._get_custom_share_at(tournament_id, position);
                    let numerator: u256 = raw.into() * available_share.into() * total_pool.into();
                    let denominator: u256 = BASIS_POINTS.into() * BASIS_POINTS.into();
                    (numerator / denominator).try_into().unwrap()
                },
                _ => {
                    let share = calculator::calculate_share_with_dust(
                        entry_fee.distribution, position, total_positions, available_share,
                    );
                    self._calculate_payout(share.into(), total_pool)
                },
            };

            assert!(
                prize_amount > 0,
                "Budokan: Position {} has 0 tokens to claim from entry fees for tournament {}",
                position,
                tournament_id,
            );

            self.entry_fee.payout(entry_fee.token_address, recipient_address, prize_amount);
        }

        fn _claim_prize(
            ref self: ContractState,
            tournament_id: u64,
            game_address: ContractAddress,
            prize_type: PrizeType,
        ) {
            match prize_type {
                PrizeType::Single(prize_id) => {
                    let position = self.prize_position.entry(prize_id).read();
                    assert!(position > 0, "Budokan: Prize position not set");
                    self._claim_single_prize(tournament_id, game_address, prize_id, position);
                },
                PrizeType::Distributed((
                    prize_id, payout_index,
                )) => {
                    self
                        ._claim_distributed_prize(
                            tournament_id, game_address, prize_id, payout_index,
                        );
                },
            }
        }

        fn _claim_single_prize(
            ref self: ContractState,
            tournament_id: u64,
            game_address: ContractAddress,
            prize_id: u64,
            position: u32,
        ) {
            let prize = self.prize._get_prize(prize_id);

            assert!(
                prize.context_id == tournament_id,
                "Budokan: Prize {} is for tournament {}",
                prize_id,
                prize.context_id,
            );

            let leaderboard = self._get_leaderboard(tournament_id);
            let leaderboard_size: u32 = leaderboard.len();
            assert!(position > 0, "Budokan: Position must be greater than zero");

            if position <= leaderboard_size {
                let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
                let game_token_address = game_dispatcher.token_address();
                let winner_token_id: felt252 = *leaderboard.at(position - 1);
                let recipient_address = self._get_owner(game_token_address, winner_token_id.into());

                match prize.token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        assert!(
                            erc20_data.distribution.is_none(),
                            "Budokan: Use SponsoredDistributed for distributed prizes",
                        );
                        self
                            .prize
                            .payout_erc20(
                                prize.token_address, erc20_data.amount, recipient_address,
                            );
                    },
                    TokenTypeData::erc721(erc721_data) => {
                        self
                            .prize
                            .payout_erc721(prize.token_address, erc721_data.id, recipient_address);
                    },
                };
            } else {
                match prize.token_type {
                    TokenTypeData::erc20(erc20_data) => {
                        assert!(
                            erc20_data.distribution.is_none(),
                            "Budokan: Use SponsoredDistributed for distributed prizes",
                        );
                        self.prize.refund_prize_erc20(prize_id, erc20_data.amount);
                    },
                    TokenTypeData::erc721(erc721_data) => {
                        self.prize.refund_prize_erc721(prize_id, erc721_data.id);
                    },
                };
            }
        }

        fn _claim_distributed_prize(
            ref self: ContractState,
            tournament_id: u64,
            game_address: ContractAddress,
            prize_id: u64,
            payout_index: u32,
        ) {
            let prize = self.prize._get_prize(prize_id);

            assert!(
                prize.context_id == tournament_id,
                "Budokan: Prize {} is for tournament {}",
                prize_id,
                prize.context_id,
            );

            let erc20_data = match prize.token_type {
                TokenTypeData::erc20(data) => data,
                TokenTypeData::erc721(_) => {
                    panic!("Budokan: ERC721 not supported for distributed prizes")
                },
            };

            assert!(
                erc20_data.distribution.is_some(),
                "Budokan: Use Sponsored for non-distributed prizes",
            );

            let leaderboard = self._get_leaderboard(tournament_id);
            let leaderboard_size: u32 = leaderboard.len();

            assert!(payout_index > 0, "Budokan: Payout index must be greater than zero");

            let total_positions: u32 = match erc20_data.distribution_count {
                Option::Some(count) => count,
                Option::None => leaderboard_size,
            };

            let distribution = erc20_data.distribution.unwrap();

            let share_bps = calculator::calculate_share_with_dust(
                distribution, payout_index, total_positions, BASIS_POINTS,
            );

            let payout_amount = (share_bps.into() * erc20_data.amount) / BASIS_POINTS.into();

            assert!(
                payout_amount > 0,
                "Budokan: Position {} has 0 tokens to claim for prize {}",
                payout_index,
                prize_id,
            );

            if payout_index <= leaderboard_size {
                let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
                let game_token_address = game_dispatcher.token_address();
                let winner_token_id: felt252 = *leaderboard.at(payout_index - 1);
                let recipient_address = self._get_owner(game_token_address, winner_token_id.into());

                self.prize.payout_erc20(prize.token_address, payout_amount, recipient_address);
            } else {
                self.prize.refund_prize_erc20(prize_id, payout_amount);
            }
        }
    }
}
