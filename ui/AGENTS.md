# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Budokan Tournament Platform UI** - a React frontend for a permissionless, fully on-chain tournament management system built on Starknet. The platform enables creating, managing, and participating in gaming tournaments with entry fees, prizes, and integration with external game systems via the Dojo engine.

## Development Commands

```bash
npm run dev       # Start dev server (uses HTTPS via mkcert except for KATANA_LOCAL)
npm run build     # TypeScript check + Vite production build
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Architecture

### Provider Stack (src/main.tsx)
The app wraps providers in this order (outermost first):
1. **StarknetProvider** - Wallet connections (Controller, Argent, Braavos, Katana predeployed)
2. **DojoContextProvider** - Dojo SDK, world contract client, chain config
3. **MetagameProvider** - Metagame SDK for game/token metadata

### Multi-Chain Support (src/dojo/setup/networks.ts)
Supports 4 networks via `VITE_CHAIN_ID` environment variable:
- `KATANA_LOCAL` - Local Katana devnet
- `WP_PG_SLOT_2` - Cartridge slot deployment
- `SN_SEPOLIA` - Starknet testnet
- `SN_MAIN` - Starknet mainnet

URL parameter `?network=sepolia` overrides to Sepolia.

### Key Directories

- **src/context/** - React context providers (dojo, starknet, metagame)
- **src/dojo/hooks/** - Dojo-specific hooks:
  - `useSystemCalls.tsx` - Contract interaction functions (enter tournament, submit scores, claim prizes)
  - `useSqlQueries.ts` - SQL queries against Torii indexer
  - `useSdkQueries.ts` - Subscription queries for real-time updates
- **src/dojo/setup/** - Chain configuration and manifest loading
- **src/generated/** - Auto-generated from Dojo contracts:
  - `models.gen.ts` - TypeScript types for contract models
  - `contracts.gen.ts` - Contract interface bindings
- **src/containers/** - Page-level components (Overview, Tournament, CreateTournament, etc.)
- **src/components/ui/** - Shadcn/Radix UI primitives
- **src/lib/utils/** - Utility functions including `feltToString`, `padU64`, formatting helpers

### Data Flow
1. **Torii Indexer** provides SQL queries and real-time subscriptions
2. **Dojo SDK** wraps Torii client for typed queries against world models
3. **Metagame SDK** fetches game metadata and mini-game information
4. **useSystemCalls** builds and executes contract transactions

### Contracts Integration
The UI imports manifest files from `../contracts/` directory:
- `manifest_dev.json`, `manifest_slot.json`, `manifest_sepolia.json`, `manifest_mainnet.json`

Each manifest defines the world address and contract ABIs. The namespace varies by chain (e.g., `budokan_1_0_8` for mainnet).

## Environment Variables

```bash
VITE_CHAIN_ID=SN_MAIN|SN_SEPOLIA|WP_PG_SLOT_2|KATANA_LOCAL
VITE_VOYAGER_API_KEY=...
VITE_VOYAGER_API_BASE_URL=https://api.voyager.online/beta
VITE_PG_API_BASE_URL=https://brave-stillness-production-7081.up.railway.app
```

## Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json and vite.config.ts)
