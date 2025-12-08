# Event Relayer Deployment Guide

This guide covers deploying the Budokan Event Relayer contract to different environments.

## Prerequisites

- [Dojo](https://book.dojoengine.org/) v1.8.0+ installed (`sozo` CLI)
- `jq` installed for JSON parsing
- Environment variables configured (see below)

## Environment Configuration

1. Copy the example environment file:
   ```bash
   cp ../contracts/.env.example ../contracts/.env
   ```

2. Edit `.env` and set your deployment account:
   ```bash
   export DOJO_ACCOUNT_ADDRESS="0x..."
   export DOJO_PRIVATE_KEY="0x..."
   ```

## Deployment

### Local Development (Katana)

```bash
# Start local Katana node first
docker compose up -d

# Deploy event relayer
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

## Post-Deployment Setup

After deploying the event relayer, you need to configure it to work with Budokan:

### 1. Set Budokan Address on Event Relayer

The event relayer needs to know which Budokan contract is authorized to emit events:

```bash
# For Sepolia
sozo execute -P sepolia budokan_relayer_0_0_1-BudokanEventRelayer set_budokan_address -c <BUDOKAN_ADDRESS>

# For Mainnet
sozo execute -P mainnet budokan_relayer_0_0_1-BudokanEventRelayer set_budokan_address -c <BUDOKAN_ADDRESS>
```

### 2. Configure Budokan with Event Relayer

When deploying Budokan, pass the event relayer address as a constructor argument. See the Budokan deployment documentation for details.

## Contract Architecture

The Event Relayer is a Dojo contract that:
- Receives event emission calls from the main Budokan contract
- Emits Dojo events that can be indexed by Torii
- Uses Ownable pattern for access control

### Key Functions

| Function | Description |
|----------|-------------|
| `set_budokan_address` | Set the authorized Budokan contract (owner only) |
| `get_budokan_address` | Get the current Budokan contract address |
| `emit_tournament` | Emit tournament creation event |
| `emit_registration` | Emit registration event |
| `emit_leaderboard` | Emit leaderboard update event |
| `emit_prize` | Emit prize addition event |
| `emit_prize_claim` | Emit prize claim event |
| `emit_platform_metrics` | Emit platform metrics update |
| `emit_prize_metrics` | Emit prize metrics update |
| `emit_entry_count` | Emit entry count update |

## Dojo Profiles

| Profile | Network | World Address |
|---------|---------|---------------|
| `dev` | Local Katana | Auto-generated |
| `sepolia` | Sepolia Testnet | `0x785401...` |
| `mainnet` | StarkNet Mainnet | `0x02ef59...` |

## Troubleshooting

### "Only Budokan can call this function"
The caller is not the authorized Budokan contract. Ensure you've called `set_budokan_address` with the correct address.

### Migration fails
- Ensure your account has sufficient ETH/STRK for gas
- Verify RPC URL is accessible
- Check that the world address exists on the target network
