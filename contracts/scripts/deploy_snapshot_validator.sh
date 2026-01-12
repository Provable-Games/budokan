#!/bin/bash

# Snapshot Validator Deployment Script
# Deploys the SnapshotValidator contract to Starknet

set -euo pipefail

# ============================
# STARKLI VERSION CHECK
# ============================

STARKLI_VERSION=$(starkli --version | cut -d' ' -f1)
echo "Detected starkli version: $STARKLI_VERSION"

# Find .env relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
    set -a
    source "$SCRIPT_DIR/../.env"
    set +a
    echo "Loaded environment variables from $SCRIPT_DIR/../.env"
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check deployment environment
DEPLOY_TO_SLOT="${DEPLOY_TO_SLOT:-false}"

# Check if required environment variables are set
print_info "Checking environment variables..."

# Determine required vars based on deployment type
if [ "$DEPLOY_TO_SLOT" = "true" ]; then
    print_info "Deploying to Slot - reduced requirements"
    required_vars=("STARKNET_ACCOUNT" "STARKNET_RPC" "BUDOKAN_ADDRESS")
else
    required_vars=("STARKNET_NETWORK" "STARKNET_ACCOUNT" "STARKNET_RPC" "STARKNET_PK" "BUDOKAN_ADDRESS")
fi

missing_vars=()

# Debug output for environment variables
print_info "Environment variables loaded:"
echo "  DEPLOY_TO_SLOT: $DEPLOY_TO_SLOT"
echo "  STARKNET_NETWORK: ${STARKNET_NETWORK:-<not set>}"
echo "  STARKNET_ACCOUNT: ${STARKNET_ACCOUNT:-<not set>}"
echo "  STARKNET_RPC: ${STARKNET_RPC:-<not set>}"
echo "  STARKNET_PK: ${STARKNET_PK:+<set>}"
echo "  BUDOKAN_ADDRESS: ${BUDOKAN_ADDRESS:-<not set>}"

for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    print_error "The following required environment variables are not set:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    echo "Please set these variables before running the script."
    exit 1
fi

# Check that private key is set (only for non-Slot deployments)
if [ "$DEPLOY_TO_SLOT" != "true" ]; then
    if [ -z "${STARKNET_PK:-}" ]; then
        print_error "STARKNET_PK environment variable is not set"
        exit 1
    fi
    print_warning "Using private key (insecure for production)"
fi

# ============================
# EXTRACT ACCOUNT ADDRESS
# ============================

# Extract the actual account address from the JSON file if STARKNET_ACCOUNT is a file path
if [ -f "$STARKNET_ACCOUNT" ]; then
    ACCOUNT_ADDRESS=$(cat "$STARKNET_ACCOUNT" | grep -o '"address"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    if [ -z "$ACCOUNT_ADDRESS" ]; then
        print_error "Failed to extract address from account file: $STARKNET_ACCOUNT"
        exit 1
    fi
    print_info "Extracted account address: $ACCOUNT_ADDRESS"
else
    # If STARKNET_ACCOUNT is not a file, assume it's already an address
    ACCOUNT_ADDRESS="$STARKNET_ACCOUNT"
fi

# ============================
# DISPLAY CONFIGURATION
# ============================

print_info "Deployment Configuration:"
echo "  Deployment Type: $(if [ "$DEPLOY_TO_SLOT" = "true" ]; then echo "Slot"; else echo "Standard"; fi)"
echo "  Network: ${STARKNET_NETWORK:-<not required for Slot>}"
echo "  Account: $STARKNET_ACCOUNT"
echo ""

# Confirm deployment
if [ "${SKIP_CONFIRMATION:-false}" != "true" ]; then
    read -p "Continue with deployment? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deployment cancelled"
        exit 0
    fi
fi

# ============================
# BUILD CONTRACTS
# ============================

print_info "Building contracts..."
cd "$SCRIPT_DIR/.."
scarb build

if [ ! -f "target/dev/budokan_extensions_SnapshotValidator.contract_class.json" ]; then
    print_error "SnapshotValidator contract build failed or contract file not found"
    print_error "Expected: target/dev/budokan_extensions_SnapshotValidator.contract_class.json"
    echo "Available contract files:"
    ls -la target/dev/*.contract_class.json 2>/dev/null || echo "No contract files found"
    exit 1
fi

# ============================
# DECLARE AND DEPLOY SNAPSHOT VALIDATOR
# ============================

print_info "Declaring SnapshotValidator contract..."

# Build declare command based on deployment type
if [ "$DEPLOY_TO_SLOT" = "true" ]; then
    DECLARE_OUTPUT=$(starkli declare --account $STARKNET_ACCOUNT --rpc $STARKNET_RPC --watch target/dev/budokan_extensions_SnapshotValidator.contract_class.json 2>&1)
else
    DECLARE_OUTPUT=$(starkli declare --account $STARKNET_ACCOUNT --rpc $STARKNET_RPC --watch target/dev/budokan_extensions_SnapshotValidator.contract_class.json --private-key $STARKNET_PK 2>&1)
fi

# Extract class hash from output
CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | tail -1)

if [ -z "$CLASS_HASH" ]; then
    # Contract might already be declared, try to extract from error message
    if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
        CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+')
        print_warning "SnapshotValidator contract already declared with class hash: $CLASS_HASH"
    else
        print_error "Failed to declare SnapshotValidator contract"
        echo "$DECLARE_OUTPUT"
        exit 1
    fi
else
    print_info "SnapshotValidator contract declared with class hash: $CLASS_HASH"
fi

# Deploy SnapshotValidator contract
print_info "Deploying SnapshotValidator contract..."

# Constructor parameter: tournament_address (BUDOKAN_ADDRESS)
print_info "Using BUDOKAN_ADDRESS as tournament_address: $BUDOKAN_ADDRESS"

if [ "$DEPLOY_TO_SLOT" = "true" ]; then
    CONTRACT_ADDRESS=$(starkli deploy \
        --account $STARKNET_ACCOUNT \
        --rpc $STARKNET_RPC \
        --watch \
        $CLASS_HASH \
        $BUDOKAN_ADDRESS \
        2>&1 | tee >(cat >&2) | grep -oE '0x[0-9a-fA-F]{64}' | tail -1)
else
    CONTRACT_ADDRESS=$(starkli deploy \
        --account $STARKNET_ACCOUNT \
        --rpc $STARKNET_RPC \
        --private-key $STARKNET_PK \
        --watch \
        $CLASS_HASH \
        $BUDOKAN_ADDRESS \
        2>&1 | tee >(cat >&2) | grep -oE '0x[0-9a-fA-F]{64}' | tail -1)
fi

if [ -z "$CONTRACT_ADDRESS" ]; then
    print_error "Failed to deploy SnapshotValidator contract"
    exit 1
fi

print_info "SnapshotValidator contract deployed at address: $CONTRACT_ADDRESS"

# ============================
# SAVE DEPLOYMENT INFO
# ============================

DEPLOYMENT_FILE="deployments/snapshot_validator_$(date +%Y%m%d_%H%M%S).json"
mkdir -p deployments

cat > "$DEPLOYMENT_FILE" << EOF
{
  "network": "${STARKNET_NETWORK:-slot}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "snapshot_validator": {
    "address": "$CONTRACT_ADDRESS",
    "class_hash": "$CLASS_HASH",
    "description": "Snapshot-based entry validator with tournament-specific snapshot management"
  }
}
EOF

print_info "Deployment info saved to: $DEPLOYMENT_FILE"

# ============================
# DEPLOYMENT SUMMARY
# ============================

echo
print_info "=== DEPLOYMENT SUCCESSFUL ==="
echo
echo "Snapshot Validator Contract:"
echo "  Address: $CONTRACT_ADDRESS"
echo "  Class Hash: $CLASS_HASH"
echo ""

echo "Next steps:"
echo "1. Verify the contract on Starkscan/Voyager"
echo "2. Create a snapshot using create_snapshot()"
echo "3. Upload snapshot data using upload_snapshot_data()"
echo "4. Lock the snapshot using lock_snapshot()"
echo "5. Configure tournaments to use the snapshot via add_config()"
echo ""

echo "To interact with the contract:"
echo "  export SNAPSHOT_VALIDATOR=$CONTRACT_ADDRESS"
echo ""

echo "Example: Create a snapshot:"
if [ "$DEPLOY_TO_SLOT" = "true" ]; then
    echo "  starkli invoke \$SNAPSHOT_VALIDATOR create_snapshot"
else
    echo "  starkli invoke --rpc \$STARKNET_RPC \$SNAPSHOT_VALIDATOR create_snapshot \\"
    echo "    --private-key \$STARKNET_PK"
fi
echo ""

echo "Example: Check snapshot metadata:"
if [ "$DEPLOY_TO_SLOT" = "true" ]; then
    echo "  starkli call \$SNAPSHOT_VALIDATOR get_snapshot_metadata \\"
    echo "    <snapshot_id>"
else
    echo "  starkli call --rpc \$STARKNET_RPC \$SNAPSHOT_VALIDATOR get_snapshot_metadata \\"
    echo "    <snapshot_id>"
fi
echo ""
