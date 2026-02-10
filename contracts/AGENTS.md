# Repository Guidelines

## Scope

This guide applies to `contracts/` only. Use it when making Cairo, Dojo, and Starknet Foundry changes in this directory.

## Project Structure & Module Organization

- `packages/budokan/`: primary tournament contract (`src/budokan.cairo`), core models/libs, and integration-style tests in `src/tests/`.
- `packages/entry_fee`, `packages/prize`, `packages/registration`, `packages/entry_requirement`: modular components used by Budokan.
- `packages/distribution`, `packages/math`, `packages/interfaces`: shared calculation and interface crates.
- `scripts/`: deployment utilities (`deploy_sepolia.sh`, `deploy_mainnet.sh`, validator deploy scripts).
- `dojo_*.toml`, `torii_*.toml`: network-specific Dojo/Torii config.
- `deployments/`: generated deployment metadata outputs.

## Build, Test, and Development Commands

Run from repo root unless specified:

- `cd contracts && scarb build`: compile all Cairo packages (CI uses this).
- `cd contracts && scarb test`: run all tests (CI uses this).
- `cd contracts && scarb fmt --check`: formatting gate in CI.
- `cd contracts && snforge test`: direct Starknet Foundry test runner.
- `cd contracts && sozo build`: build Dojo world artifacts.
- `cd contracts && sozo migrate --profile sepolia|mainnet|slot`: migrate/deploy Dojo world state.

Toolchain (from `.tool-versions`): `scarb 2.13.1`, `sozo 1.8.0`, `starknet-foundry 0.53.0`.

## Coding Style & Naming Conventions

- Always format with `scarb fmt`; do not hand-format.
- Cairo naming: files/modules/functions `snake_case`, types/traits `PascalCase`, constants `SCREAMING_SNAKE_CASE`.
- Keep heavy logic in package libs/modules; keep contract entrypoints focused on validation, orchestration, and state transitions.
- For external calls, follow checks-effects-interactions and validate call outcomes.

## Testing Guidelines

- Place tests near code (`src/tests/*.cairo` or `src/tests.cairo`).
- Use Foundry cheatcodes for deterministic state/time tests (`start_cheat_caller_address`, `start_cheat_block_timestamp`).
- Cover both happy paths and edge cases: unauthorized access, zero/empty inputs, duplicate submissions, and double-claim prevention.
- Use fork tests only when required by integration behavior; keep them explicit and documented.

## Commit & Pull Request Guidelines

- Follow repository commit style: Conventional Commit prefixes like `feat:`, `fix:`, `chore:`, `style:`, `debug:`.
- Keep PRs scoped to a coherent change set (prefer one package/concern per PR).
- Include: summary, affected packages/interfaces, and exact test commands executed.
- If deployment behavior changes, note impacts to `scripts/`, `snfoundry.toml`, `dojo_*.toml`, or manifests.

## Security & Configuration Tips

- Never commit private keys, seed phrases, or populated `.env` files.
- Validate environment variables before running deployment scripts.
- Keep `snfoundry.toml` profiles (`default`, `sepolia`, `mainnet`) consistent with script usage.
