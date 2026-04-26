// SPDX-License-Identifier: BUSL-1.1

// Budokan main contract interface
pub mod budokan;

// Budokan viewer contract interface
pub mod viewer;

// Budokan rewards (library_call class) interface — claim/prize logic
// is split into a separate class to keep the main contract under the
// 81,920-felt bytecode limit while allowing release-profile inlining.
pub mod rewards;
