# Repository Guidelines

## Project Structure & Module Organization
This guide applies only to `ui/` (React + TypeScript + Vite).

Key paths:
- `src/containers/`: route-level screens (`Overview`, `Tournament`, `Play`, `CreateTournament`).
- `src/components/`: reusable UI and feature components.
- `src/context/`: global providers (Dojo, Starknet, Metagame).
- `src/dojo/`: Dojo setup and data/query hooks.
- `src/hooks/`: custom hooks and UI state helpers.
- `src/lib/`: shared utilities, token metadata, formatting, and integration helpers.
- `src/generated/`: generated types and model bindings (treat as generated; do not hand-edit).
- `public/`: static assets served directly by Vite.

## Build, Lint, and Development Commands
Run from `ui/`:
- `npm run dev`: start local development server with HMR.
- `npm run build`: run TypeScript project checks and create production bundle.
- `npm run lint`: run ESLint for `ts/tsx` files.
- `npm run preview`: serve the production build locally.

Use `.env.example` as a template for local `.env` (notably `VITE_CHAIN_ID` and `VITE_VOYAGER_PROXY_URL`).

## Coding Style & Naming Conventions
Follow existing code style: 2-space indentation, semicolons, double quotes, strict TypeScript.
- Components and containers: `PascalCase` filenames (example: `TournamentTimeline.tsx`).
- Hooks: `useXxx` naming (example: `useTournamentPrizeValue.ts`).
- Prefer `@/` path aliases over deep relative imports.
- Keep feature logic in hooks/lib; keep components focused on rendering and interaction.

Run `npm run lint` before opening a PR.

## Testing Guidelines
No dedicated UI unit-test runner is configured yet. Required verification for UI changes:
- `npm run lint`
- `npm run build`
- manual smoke tests on core routes: `/`, `/tournament/:id`, `/create-tournament`, `/play`.

When changing wallet, network, or query logic, test both loading and error states.

## Commit & Pull Request Guidelines
Use concise, scoped commits following existing history patterns: `feat: ...`, `fix: ...`, `chore: ...`, `debug: ...`, `style: ...`.

For UI PRs:
- describe the user-facing change and risk,
- link related issue(s) when available,
- include screenshots/GIFs for visual changes,
- include validation steps run (at minimum `npm run lint` and `npm run build`).
