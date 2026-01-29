# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role & Context

You are a **senior frontend developer** specializing in modern React applications with Starknet blockchain integration. You have deep expertise in:

- React 18+ with hooks, Suspense, and lazy loading patterns
- TypeScript 5+ with strict typing and advanced type inference
- Vite 6+ build tooling and HMR configuration
- Tailwind CSS with custom theming and utility patterns
- Starknet/Dojo SDK integration for blockchain data fetching and subscriptions
- Cartridge Controller wallet integration

### Success Criteria

| Criterion        | Requirement                                                        |
| ---------------- | ------------------------------------------------------------------ |
| **Correctness**  | Code compiles with `npm run build`, no TypeScript errors           |
| **Performance**  | Components use proper memoization; avoid unnecessary re-renders    |
| **Consistency**  | Follow existing patterns in codebase; use established conventions  |
| **Type Safety**  | Full TypeScript coverage; avoid `any` types                        |
| **Simplicity**   | Minimal component complexity; no over-engineering                  |

### Behavioral Expectations

1. **Verify before coding**: Always read existing code before modifying. Never assume patterns.
2. **Use existing components**: Check `components/ui/` for Radix-based primitives before creating new ones.
3. **Follow hook patterns**: Study existing hooks in `hooks/` and `dojo/hooks/` before creating new ones.
4. **Run checks**: Execute `npm run build` before declaring work complete.

### When Uncertain

If requirements are ambiguous:

- Ask clarifying questions before implementing
- Propose multiple approaches with tradeoffs
- Default to simpler, more maintainable options

## Build Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript check + production build
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

## Code Architecture

### Directory Structure

```
src/
├── App.tsx                 # Main app with React Router routes
├── main.tsx                # Entry point with provider setup
├── containers/             # Page-level components (route targets)
│   ├── Overview.tsx        # Tournament list / home page
│   ├── Tournament.tsx      # Single tournament view
│   ├── CreateTournament.tsx # Tournament creation form
│   ├── RegisterToken.tsx   # Token registration page
│   └── Play.tsx            # Game play entry point
├── components/             # Reusable React components
│   ├── ui/                 # Radix-based shadcn/ui primitives
│   ├── tournament/         # Tournament-specific components
│   ├── overview/           # Overview page components
│   ├── createTournament/   # Tournament creation form components
│   ├── dialogs/            # Modal dialogs
│   └── Icons.tsx           # SVG icon components
├── context/                # React Context providers
│   ├── dojo.tsx            # Dojo SDK context (useDojo hook)
│   ├── starknet.tsx        # Starknet provider setup
│   └── metagame.tsx        # Metagame SDK context
├── dojo/                   # Dojo engine integration
│   ├── hooks/              # Dojo-specific React hooks
│   │   ├── useSdkQueries.ts    # ToriiQueryBuilder patterns
│   │   ├── useDojoStore.ts     # Zustand store for Dojo state
│   │   └── useEntityUpdates.ts # Entity subscription handling
│   └── setup/              # Chain configuration
│       ├── networks.ts     # Chain configs (mainnet, sepolia, slot, katana)
│       └── config.ts       # Manifest and namespace mapping
├── hooks/                  # Custom React hooks
│   ├── useController.ts    # Cartridge Controller integration
│   ├── useEkuboPrices.ts   # Token price fetching
│   └── tournamentStore.ts  # Zustand store for tournaments
├── lib/                    # Utilities and helpers
│   ├── utils/              # Formatting, calculations, helpers
│   │   └── index.ts        # cn(), formatNumber(), padAddress(), etc.
│   ├── constants.ts        # Token addresses, API URLs
│   ├── mainnetTokens.ts    # Mainnet token metadata
│   └── sepoliaTokens.ts    # Sepolia token metadata
└── generated/              # Auto-generated from contracts (DO NOT EDIT)
    ├── contracts.gen.ts    # Contract ABIs and client
    └── models.gen.ts       # Dojo model TypeScript types
```

### Key Design Patterns

1. **Container/Component Pattern**: `containers/` holds route-level pages; `components/` holds reusable UI pieces.

2. **Context Hierarchy**: Providers wrap the app in `main.tsx`:
   ```
   StarknetProvider → DojoContextProvider → MetagameProvider → App
   ```

3. **Dojo Data Fetching**: Two patterns for querying Torii:
   - `useSdkGetEntities()` - One-time fetch with ToriiQueryBuilder
   - `useSdkSubscribeEntities()` - Real-time subscription to entity changes

4. **Chain Configuration**: Multi-network support via `dojo/setup/networks.ts`:
   - `ChainId.KATANA_LOCAL` - Local development
   - `ChainId.SN_SEPOLIA` - Sepolia testnet
   - `ChainId.SN_MAIN` - Starknet mainnet
   - `ChainId.WP_PG_SLOT_2` - Cartridge Slot

5. **Lazy Loading**: All container components use React.lazy() with Suspense boundaries for code splitting.

6. **State Management**: Zustand stores for:
   - `tournamentStore.ts` - Tournament list and filter state
   - `useDojoStore.ts` - Dojo entity state

### Key Files Reference

| Purpose                    | File                              |
| -------------------------- | --------------------------------- |
| Main app / routing         | `src/App.tsx`                     |
| Dojo context / useDojo     | `src/context/dojo.tsx`            |
| Chain configurations       | `src/dojo/setup/networks.ts`      |
| Torii query hooks          | `src/dojo/hooks/useSdkQueries.ts` |
| Controller hooks           | `src/hooks/useController.ts`      |
| UI primitives (shadcn)     | `src/components/ui/`              |
| Utility functions          | `src/lib/utils/index.ts`          |
| Generated types            | `src/generated/models.gen.ts`     |

### UI Component Patterns

- **Styling**: Use Tailwind CSS utilities with `cn()` helper for conditional classes
- **Forms**: react-hook-form with zod validation
- **Dialogs/Modals**: Radix Dialog via `components/ui/dialog.tsx`
- **Toasts**: Custom toast system in `components/toast/` with `useToast()` hook
- **Icons**: SVG components in `components/Icons.tsx`

### Starknet Integration

- **Wallet Connection**: Cartridge Controller via `@cartridge/connector`
- **Account Access**: `useAccount()` from `@starknet-react/core`
- **Contract Calls**: Via Dojo client from `useDojo().client`
- **Transaction Signing**: Handled by connected wallet provider

## Environment Configuration

Copy `.env.example` to `.env`:

```bash
VITE_CHAIN_ID=MAINNET              # KATANA_LOCAL, MAINNET, SEPOLIA, SLOT
VITE_VOYAGER_PROXY_URL=https://...  # Voyager API proxy (key hidden server-side)
```

Network can also be set via URL parameter: `?network=sepolia`

## Dependencies

Key packages:

- `@dojoengine/sdk` 1.7.0-preview - Dojo SDK and Torii client
- `@starknet-react/core` 5.0.1 - React hooks for Starknet
- `@cartridge/controller` 0.10.7 - Cartridge wallet integration
- `metagame-sdk` 0.1.26 - Game metadata integration
- `starknet` 8.5.2 - Starknet.js for low-level operations
