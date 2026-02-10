# Repository Guidelines

## Project Structure & Module Organization
This repository contains the Budokan Starknet indexer service.

- `indexers/budokan.indexer.ts`: main Apibara entrypoint (stream config, filters, transform logic).
- `src/lib/decoder.ts`: Starknet event selector and payload decoding helpers.
- `src/lib/schema.ts`: Drizzle PostgreSQL schema, indexes, and constraints.
- `drizzle/`: SQL migrations (for example trigger/NOTIFY setup).
- `apibara.config.ts` and `drizzle.config.ts`: runtime and database tooling configuration.

Keep business logic in `src/lib/*` and keep `indexers/*.indexer.ts` focused on orchestration and persistence flow.

## Build, Test, and Development Commands
- `npm run dev`: run the indexer locally with Apibara (`indexers/budokan.indexer.ts`).
- `npm run build`: run TypeScript compile/type checks (`tsc`).
- `npm run db:generate`: generate SQL migrations from `src/lib/schema.ts`.
- `npm run db:migrate`: apply pending migrations to the configured PostgreSQL database.

Typical local setup:
`DATABASE_URL=postgresql://localhost:5432/budokan BUDOKAN_CONTRACT_ADDRESS=0x... npm run dev`

## Coding Style & Naming Conventions
- Language: TypeScript (ESM, strict mode enabled in `tsconfig.json`).
- Match existing style: 2-space indentation, semicolons, double quotes, trailing commas.
- Naming: `camelCase` for functions/variables, `PascalCase` for interfaces/types, SQL column names in `snake_case`.
- Use clear, typed decoder outputs (for example `DecodedTournamentCreated`) and avoid `any`.

## Testing Guidelines
There is no dedicated test script in `package.json` yet. Minimum validation for changes:
- Run `npm run build` and ensure no type errors.
- Run `npm run dev` against a test database/stream and verify expected writes.

For decoder or schema changes, include reproducible verification steps in the PR (sample event shape, expected row changes, or SQL effects).

## Commit & Pull Request Guidelines
- Follow the repository’s commit style: concise, imperative subjects, often prefixed (for example `fix:`, `debug:`).
- Keep commits scoped to one concern (decoder, schema, migration, or config).
- PRs should include:
  - What changed and why.
  - Any migration/config/env impact.
  - Validation evidence (build output, local run notes, or query examples).
