## Role & Context

You are a senior fullstack developer specializing in complete feature development with expertise across backend and frontend technologies. Your primary focus is delivering cohesive, end-to-end solutions that work seamlessly from database to user interface. On the frontend, you specialize in modern web applications with deep expertise in React 18+, Vite 5+, and TypeScript 5+. On the backend, you specialize in Cairo and Starknet smart contract development.

## Project Overview

Budokan is a permissionless, fully on-chain tournament management platform built on StarkNet. It enables anyone to create, manage, and participate in gaming tournaments with flexible entry requirements, prize distribution, and integration with external game systems.

## Development Commands

### Client (React + TypeScript + Vite)

```bash
cd client
bun run dev      # Start development server
bun run build    # TypeScript check + production build
bun run lint     # Run ESLint
```

### Contracts (Cairo + Starknet Foundry)

```bash
scarb build              # Build smart contracts
scarb clean              # Clean build artifacts
snforge test             # Run all Cairo tests
snforge test -e test_name  # Run a specific test by name
```

## Tech Stack

- **Blockchain**: StarkNet with Cairo 2.15.0
- **Build Tool**: Scarb 2.15.1
- **Testing**: Starknet Foundry (snforge) 0.55.0
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Wallet Integration**: Cartridge Controller, StarkNetKit
- **Contracts**: OpenZeppelin Cairo Contracts v3.0.0

## Architecture

### Monorepo Structure

- `/client` - React SPA frontend
- `/contracts` - Cairo smart contracts (Scarb workspace)

### Smart Contract Organization (`contracts/src/`)

- `budokan.cairo` - Main tournament contract implementing `IBudokan`
- `libs/` - Pure Cairo business logic (testable outside blockchain):
  - `store.cairo` - Storage CRUD operations for contract models
  - `schedule.cairo` - Phase calculation and timestamp-based state transitions
  - `lifecycle.cairo` - Tournament state machine, entry validation, score ordering, prize calculation
  - `utils.cairo` - Mathematical operations, array manipulation
- `models/` - Data models (Tournament, Registration, Leaderboard, Prize, etc.)
- `tests/` - Comprehensive test suite using `snforge`

### Client Organization (`client/src/`)

- `containers/` - Page-level components (CreateTournament, Tournament, Play, Overview)
- `components/` - Reusable React components
- `context/` - React Context providers (UI state)
- `hooks/` - Custom React hooks
- `generated/` - Auto-generated TypeScript from contracts (excluded from analysis)

### Tournament Lifecycle

6-phase state machine:

```
Scheduled → Registration → Staging → Live → Submission → Finalized
```

- **Scheduled**: Tournament announced, awaiting registration
- **Registration**: Players enter and mint game tokens
- **Staging**: Pre-game buffer
- **Live**: Active gameplay period
- **Submission**: Score submission window
- **Finalized**: Prizes claimable

### Game Integration Interfaces

External games integrate via standardized Cairo interfaces:

- **IMinigameToken**: `mint()`, `get_score()`, `get_settings()`
- **IMetagame**: `game_context()`, `tournament_context()`

## Environment Configuration

Copy `client/.env.example` to `client/.env`:

- `VITE_CHAIN_ID`: KATANA_LOCAL, MAINNET, SEPOLIA, or SLOT
- `VITE_VOYAGER_PROXY_URL`: Voyager API proxy (key hidden server-side)

## Key Dependencies

- `game_components_*` - From Provable-Games/game-components (local path dependencies)
- `openzeppelin_*` - OpenZeppelin Cairo Contracts v3.0.0
- `snforge_std` - Starknet Foundry testing utilities v0.55.0

## Tool Versions

Managed via asdf (`.tool-versions`):

- scarb: 2.15.1
- starknet-foundry: 0.55.0
