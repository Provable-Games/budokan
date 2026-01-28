## Role & Context

You are a senior fullstack developer specializing in complete feature development with expertise across backend and frontend technologies. Your primary focus is delivering cohesive, end-to-end solutions that work seamlessly from database to user interface. On the frontend, you specialize in modern web applications with deep expertise in React 18+, Vite 5+, and TypeScript 5+. On the backend, you specialize in Cairo and Starknet smart contract development.

## Project Overview

Budokan is a permissionless, fully on-chain tournament management platform built with Dojo on StarkNet. It enables anyone to create, manage, and participate in gaming tournaments with flexible entry requirements, prize distribution, and integration with external game systems.

## Development Commands

### UI (React + TypeScript + Vite)

```bash
cd ui
npm run dev      # Start development server
npm run build    # TypeScript check + production build
npm run lint     # Run ESLint
```

### Contracts (Cairo + Dojo)

```bash
cd contracts
sozo build       # Build smart contracts
sozo clean       # Clean build artifacts
sozo test        # Run all Cairo tests
sozo migrate     # Deploy/migrate contracts
```

Run a specific test file:

```bash
sozo test contracts/src/tests/test_budokan.cairo
```

### Deployment Scripts

All scripts are in `contracts/scripts/`:

- `deploy_dev.sh` - Deploy to Katana (local)
- `deploy_sepolia.sh` - Deploy to Sepolia testnet
- `deploy_mainnet.sh` - Deploy to mainnet
- `deploy_slot.sh` / `deploy_pgslot.sh` - Deploy to Dojo Slot

## Tech Stack

- **Blockchain**: StarkNet with Cairo 2.10.1
- **Game Engine**: Dojo 1.6.2
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Wallet Integration**: Cartridge Controller, StarkNetKit
- **Indexing**: Torii for real-time data subscriptions
- **Dojo SDK**: @dojoengine/\* 1.7.0-preview packages

## Architecture

### Monorepo Structure

- `/ui` - React SPA frontend
- `/contracts` - Cairo smart contracts and Dojo configuration

### Smart Contract Organization (`contracts/src/`)

- `budokan.cairo` - Main tournament contract implementing `IBudokan`
- `libs/` - Pure Cairo business logic (testable outside blockchain):
  - `store.cairo` - WorldStorage CRUD operations for Dojo models
  - `schedule.cairo` - Phase calculation and timestamp-based state transitions
  - `lifecycle.cairo` - Tournament state machine, entry validation, score ordering, prize calculation
  - `utils.cairo` - Mathematical operations, array manipulation
- `models/` - Dojo data models (Tournament, Registration, Leaderboard, Prize, etc.)
- `tests/` - Comprehensive test suite using `dojo_cairo_test`

### UI Organization (`ui/src/`)

- `containers/` - Page-level components (CreateTournament, Tournament, Play, Overview)
- `components/` - Reusable React components
- `dojo/` - Dojo engine integration and setup
- `context/` - React Context providers (Dojo, UI state)
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

Copy `ui/.env.example` to `ui/.env`:

- `VITE_CHAIN_ID`: KATANA_LOCAL, MAINNET, SEPOLIA, or SLOT
- `VITE_VOYAGER_PROXY_URL`: Voyager API proxy (key hidden server-side)

## Key Dependencies

- `game_components_*` - From Provable-Games/game-components (tag 0.0.9)
- `budokan_extensions` - From Provable-Games/budokan_extensions (tag v2.10.1)
- `metagame-sdk` - For game integration (0.1.26)

## Tool Versions

Managed via asdf (`.tool-versions`):

- dojo: 1.6.0-alpha.2
- scarb: 2.10.1
