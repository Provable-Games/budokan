#!/bin/bash

# Budokan Upgrade Script
# Declares the new Budokan class and calls upgrade() on the existing contract
#
# Usage:
#   ./scripts/upgrade_budokan.sh
#   PROFILE=mainnet ./scripts/upgrade_budokan.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
WORKSPACE_DIR="$CONTRACTS_DIR/.."

if [ -f "$CONTRACTS_DIR/.env" ]; then
    set -a
    source "$CONTRACTS_DIR/.env"
    set +a
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROFILE="${PROFILE:-sepolia}"

if [ -z "${BUDOKAN_ADDRESS:-}" ]; then
    echo -e "${RED}[ERROR]${NC} BUDOKAN_ADDRESS not set. Set it in .env or as an environment variable."
    exit 1
fi

echo -e "${GREEN}[INFO]${NC} Upgrade Configuration:"
echo "  Profile: $PROFILE"
echo "  Budokan Address: $BUDOKAN_ADDRESS"
echo ""

if [ "${SKIP_CONFIRMATION:-false}" != "true" ]; then
    read -p "Continue with upgrade? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}[INFO]${NC} Upgrade cancelled"
        exit 0
    fi
fi

cd "$WORKSPACE_DIR"

echo -e "${GREEN}[INFO]${NC} Building contracts (release profile)..."
scarb --profile release build --workspace

cd "$CONTRACTS_DIR"

echo -e "${GREEN}[INFO]${NC} Declaring new Budokan class..."

DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name Budokan \
    --package budokan 2>&1) || {
    if echo "$DECLARE_OUTPUT" | grep -qi "already declared"; then
        echo -e "${YELLOW}[WARNING]${NC} Class already declared"
    else
        echo -e "${RED}[ERROR]${NC} Failed to declare Budokan"
        echo "$DECLARE_OUTPUT"
        exit 1
    fi
}

CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || true)

if [ -z "$CLASS_HASH" ]; then
    echo -e "${GREEN}[INFO]${NC} Calculating class hash from artifact..."
    CLASS_HASH_OUTPUT=$(sncast --profile "$PROFILE" utils class-hash --contract-name Budokan --package budokan 2>&1)
    CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
fi

if [ -z "$CLASS_HASH" ]; then
    echo -e "${RED}[ERROR]${NC} Could not determine class hash"
    exit 1
fi

echo -e "${GREEN}[INFO]${NC} New class hash: $CLASS_HASH"
echo -e "${GREEN}[INFO]${NC} Upgrading Budokan at $BUDOKAN_ADDRESS..."

UPGRADE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    invoke \
    --contract-address "$BUDOKAN_ADDRESS" \
    --function "upgrade" \
    --calldata "$CLASS_HASH" \
    2>&1)

TX_HASH=$(echo "$UPGRADE_OUTPUT" | grep -ioE 'transaction.hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' | head -1 || true)

if [ -z "$TX_HASH" ]; then
    echo -e "${RED}[ERROR]${NC} Upgrade transaction may have failed"
    echo "$UPGRADE_OUTPUT"
    exit 1
fi

echo ""
echo -e "${GREEN}[INFO]${NC} === UPGRADE SUCCESSFUL ==="
echo "  Contract: $BUDOKAN_ADDRESS"
echo "  New Class Hash: $CLASS_HASH"
echo "  Transaction: $TX_HASH"
