// SPDX-License-Identifier: BUSL-1.1

//! Pure reconstruction helpers for converting packed/component storage shapes
//! back into the public `TournamentModel` view shape. These live outside the
//! contract impl so the heavy reconstruction logic isn't candidate for being
//! inlined into every caller of `_get_tournament`.

use budokan::structs::budokan::{
    AdditionalShare, Distribution, EntryFee, GameConfig, LeaderboardConfig, StoredEntryFee,
};
use budokan::structs::packed_storage::TournamentConfig;
use budokan::structs::schedule::Schedule;
use core::num::traits::Zero;
use starknet::ContractAddress;

#[inline(always)]
pub fn schedule_from_config(config: @TournamentConfig) -> Schedule {
    Schedule {
        registration_start_delay: *config.registration_start_delay,
        registration_end_delay: *config.registration_end_delay,
        game_start_delay: *config.game_start_delay,
        game_end_delay: *config.game_end_delay,
        submission_duration: *config.submission_duration,
    }
}

#[inline(always)]
pub fn leaderboard_config_from_config(config: @TournamentConfig) -> LeaderboardConfig {
    LeaderboardConfig { ascending: *config.ascending, game_must_be_over: *config.game_must_be_over }
}

/// Reconstruct the GameConfig view. Consumes `client_url_raw` (a ByteArray
/// owns its slot) and projects empty -> None so the caller can pass the raw
/// storage read directly.
pub fn game_config_from_storage(
    config: @TournamentConfig,
    game_address: ContractAddress,
    client_url_raw: ByteArray,
    renderer_address: ContractAddress,
) -> GameConfig {
    let client_url = if client_url_raw.len() == 0 {
        Option::None
    } else {
        Option::Some(client_url_raw)
    };
    let renderer = if renderer_address.is_zero() {
        Option::None
    } else {
        Option::Some(renderer_address)
    };
    GameConfig {
        game_address,
        settings_id: *config.settings_id,
        soulbound: *config.soulbound,
        paymaster: *config.paymaster,
        client_url,
        renderer,
    }
}

/// Project the component's `StoredEntryFee` config into Budokan's `EntryFee`
/// view shape. `tournament_creator_share` lives in the first additional share;
/// missing component options collapse to 0/Linear(0). The Custom shares array
/// is intentionally returned empty here — full-array reconstruction is O(N/15)
/// storage reads and is only needed for the dedicated
/// `tournament_distribution_shares` view.
pub fn entry_fee_view_from_stored(stored: Option<StoredEntryFee>) -> Option<EntryFee> {
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
