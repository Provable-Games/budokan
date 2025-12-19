// SPDX-License-Identifier: BUSL-1.1

pub mod entry_requirement;
pub mod entry_validator;
pub mod models;

pub mod examples {
    pub mod erc20_balance_validator;
    pub mod governance_validator;
    pub mod snapshot_validator;
    // The following validators require external dependencies not in this package:
// pub mod opus_troves_validator;     // requires opus, wadray
// pub mod snapshot_ETHEREUM_validator; // requires snapshot contracts
}

#[cfg(test)]
pub mod tests {
    pub mod constants;
    pub mod test_entry_validator;
    // Integration tests requiring budokan contract:
    // pub mod test_budokan;                // requires budokan contract setup
    // Tests that require mocks with additional fixes:
    // pub mod test_governance_validator;  // requires governance_validator_mock
    // Fork tests require external network access and specific deployed contracts:
    // pub mod test_snapshot_validator;
    // pub mod test_governance_validator_budokan_fork;
    // pub mod test_opus_troves_validator_budokan_fork;
    pub mod test_snapshot_validator_budokan_fork;
    // pub mod test_snapshot_validator_fork;

    pub mod mocks {
        pub mod entry_validator_mock;
        pub mod erc721_mock;
        pub mod open_entry_validator_mock;
        // Mocks with external dependencies or empty implementations:
    // pub mod adventurer_validator_mock;  // empty
    // pub mod beast_validator_mock;       // empty
    // pub mod governance_validator_mock;  // needs fixes
    // pub mod opus_troves_mock;           // requires opus, wadray
    }
}
