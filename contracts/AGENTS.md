# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Budokan is a permissionless, fully on-chain tournament management system built with Dojo on StarkNet. It enables anyone to create, manage, and participate in gaming tournaments with flexible entry requirements and prize distribution.

**Tech Stack:** Cairo 2.10.1, Dojo 1.6.2, Scarb 2.10.1

## Build and Test Commands

```bash
# Build contracts
sozo build

# Run tests with resource usage output
sozo test --print-resource-usage

# Run a specific test
sozo test -f test_name

# Format code
scarb fmt

# Check formatting (CI)
scarb fmt --check

# Clean build artifacts
sozo clean
```

## Deployment

Each deployment script handles build, migrate, and initialization:

```bash
# Local development (requires running Katana)
./scripts/deploy_dev.sh

# Sepolia testnet
./scripts/deploy_sepolia.sh

# Slot testnet
./scripts/deploy_slot.sh

# Mainnet
./scripts/deploy_mainnet.sh
```

Each network has its own config file (`dojo_dev.toml`, `dojo_sepolia.toml`, etc.) specifying RPC URLs, chain IDs, and namespace.

## Code Architecture

### Directory Structure

```
src/
├── budokan.cairo          # Main tournament contract (IBudokan interface)
├── constants.cairo        # Project-wide constants
├── interfaces.cairo       # Contract interfaces
├── libs/                  # Pure Cairo functions (core business logic)
│   ├── store.cairo        # WorldStorage CRUD operations for all models
│   ├── schedule.cairo     # Phase calculation and timestamp validation
│   ├── lifecycle.cairo    # State machine logic, entry validation, prize calculation
│   └── utils.cairo        # Math and array helpers
├── models/                # Dojo data models
│   ├── budokan.cairo      # Tournament, Registration, Leaderboard, Prize, Token
│   ├── lifecycle.cairo    # Tournament state enum and transitions
│   └── schedule.cairo     # Phase scheduling types
└── tests/                 # Test suite
    ├── test_budokan.cairo # Main unit tests
    ├── helpers.cairo      # Test utilities
    └── mocks/             # ERC20, ERC721, validator mocks
```

### Key Design Patterns

1. **Thin Contract Pattern**: The main `budokan.cairo` contract is a thin orchestration layer. All complex logic lives in `libs/` as pure functions for comprehensive unit testing.

2. **Tournament State Machine**: 6-phase lifecycle: `Scheduled → Registration → Staging → Live → Submission → Finalized`. Each phase has time-based transitions defined in `Schedule`.

3. **WorldStorage Abstraction**: `libs/store.cairo` provides typed CRUD operations for all Dojo models, abstracting away raw world storage access.

4. **Entry Validators**: Modular validation via `IEntryValidator` interface. Built-in types: token-gated, tournament-gated, allowlist, custom validators.

### Core Data Models

- **Tournament**: Main config (id, metadata, schedule, game_config, entry_fee, entry_requirement)
- **Registration**: Links game tokens to tournaments
- **Leaderboard**: Ordered `(token_id, score)` array for rankings
- **Prize**: Sponsored prize metadata (token, amount, position)
- **PrizeClaim**: Tracks claimed prizes to prevent double-claiming

### Game Integration

Budokan integrates with external games via:

- **IMinigameToken**: `mint()`, `get_score()`, `get_settings()`
- **IMetagame**: `game_context()`, `tournament_context()`

## Key Files Reference

| Purpose                 | File                       |
| ----------------------- | -------------------------- |
| Main contract           | `src/budokan.cairo`        |
| All interfaces          | `src/interfaces.cairo`     |
| Tournament/Prize models | `src/models/budokan.cairo` |
| State machine logic     | `src/libs/lifecycle.cairo` |
| Phase scheduling        | `src/libs/schedule.cairo`  |
| Storage operations      | `src/libs/store.cairo`     |
| Test helpers            | `src/tests/helpers.cairo`  |

## Dependencies

External packages (see `Scarb.toml`):

- `dojo` v1.6.2 - Entity system framework
- `openzeppelin_token` - ERC20/ERC721 implementations
- `game_components_*` - Provable Games minigame/metagame interfaces
- `budokan_extensions` - Entry validator contracts

## Testing Patterns

Tests use `dojo_cairo_test` for world setup. Key test helpers in `tests/helpers.cairo`:

- `create_basic_tournament()` - Creates tournament with default config
- `create_tournament_with_schedule()` - Creates tournament with custom timing
- Mock contracts in `tests/mocks/` for ERC20, ERC721, and validators
