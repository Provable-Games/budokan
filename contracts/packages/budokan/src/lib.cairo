// SPDX-License-Identifier: BUSL-1.1

pub mod budokan;

// Models (types)
pub mod models {
    pub mod budokan;
    pub mod constants;
    pub mod lifecycle;
    pub mod packed_storage;
    pub mod schedule;
}

// Libs (logic)
pub mod libs {
    pub mod lifecycle;
    pub mod schedule;
}

#[cfg(test)]
mod tests {
    pub mod mocks {
        pub mod entry_validator_mock;
        pub mod erc20_mock;
        pub mod erc721_mock;
        pub mod erc721_old_mock;
    }
    pub mod constants;
    #[cfg(test)]
    mod helpers;
    // #[cfg(test)]
    // mod test_budokan_stress_tests;
    pub mod interfaces;
    #[cfg(test)]
    pub mod setup_denshokan;
    #[cfg(test)]
    mod test_budokan;
    pub mod utils;
}
