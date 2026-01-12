# Budokan Event Relayer

A standalone Dojo contract for emitting tournament events to the Dojo world. This contract acts as an event relay layer, allowing the main Budokan tournament contract to emit events that are indexed by Torii.

## Purpose

The event relayer separates event emission from the main tournament logic, providing:
- **Modularity**: Events are managed independently from core tournament logic
- **Flexibility**: Can be upgraded or replaced without affecting the main contract
- **Indexing**: All events are properly indexed by Dojo's Torii indexer

## Architecture

The event relayer is deployed as a separate Dojo contract with its own world configuration. It is called by the main Budokan tournament contract whenever events need to be emitted.

### Events

- `TournamentCreated` - When a new tournament is created
- `TournamentRegistration` - When a player registers for a tournament
- `ScoreSubmitted` - When a score is submitted
- `LeaderboardUpdate` - When the leaderboard is updated
- `PrizeAdded` - When a prize is added to a tournament
- `PrizeClaimed` - When a prize is claimed
- `TokenRegistered` - When a new token is registered

## Building

```bash
sozo build
```

## Deployment

### Local Development
```bash
./scripts/deploy_dev.sh
```

### Sepolia Testnet
```bash
./scripts/deploy_sepolia.sh
```

### Mainnet
```bash
./scripts/deploy_mainnet.sh
```

## Configuration

The contract uses profile-specific Dojo configuration files:
- `dojo_dev.toml` - Local Katana development
- `dojo_sepolia.toml` - Sepolia testnet
- `dojo_mainnet.toml` - Starknet mainnet

## Integration

The Budokan tournament contract calls the event relayer using the `IBudokanEventRelayer` interface defined in `contracts/packages/interfaces/src/event_relayer.cairo`.

### Setting up the relayer

After deployment, the relayer's Budokan address must be configured:

```cairo
// Called by owner
relayer.set_budokan_address(budokan_contract_address);
```

This ensures only the authorized Budokan contract can emit events through the relayer.
