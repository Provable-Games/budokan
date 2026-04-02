#!/bin/bash

# Budokan Deployment Script
# Deploys the Budokan tournament contract and BudokanViewer using sncast
#
# Usage:
#   ./scripts/deploy_budokan.sh                    # Deploy to sepolia (default)
#   PROFILE=mainnet ./scripts/deploy_budokan.sh    # Deploy to mainnet

set -euo pipefail

# ============================
# ENVIRONMENT SETUP
# ============================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
WORKSPACE_DIR="$CONTRACTS_DIR/.."

# Load .env if it exists
if [ -f "$CONTRACTS_DIR/.env" ]; then
    set -a
    source "$CONTRACTS_DIR/.env"
    set +a
    echo "Loaded environment variables from $CONTRACTS_DIR/.env"
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# ============================
# CONFIGURATION
# ============================

# Profile from snfoundry.toml (default, sepolia, mainnet)
PROFILE="${PROFILE:-sepolia}"

# Owner address (if not set, will use deployer account)
OWNER_ADDRESS="${OWNER_ADDRESS:-}"

# Default ERC20 token for entry fees
DEFAULT_TOKEN_ADDRESS="${DEFAULT_TOKEN_ADDRESS:-}"

# ============================
# VALIDATE CONFIGURATION
# ============================

if [ -z "$DEFAULT_TOKEN_ADDRESS" ]; then
    print_error "DEFAULT_TOKEN_ADDRESS not set. Set it in .env or as an environment variable."
    exit 1
fi

# Get owner address (use deployer account if not specified)
if [ -z "$OWNER_ADDRESS" ]; then
    print_info "Fetching deployer account address for owner..."
    OWNER_ADDRESS=$(sncast --profile "$PROFILE" account list 2>&1 | grep "address:" | head -1 | grep -oE '0x[0-9a-fA-F]+')
    if [ -z "$OWNER_ADDRESS" ]; then
        print_error "Failed to get deployer account address. Set OWNER_ADDRESS manually."
        exit 1
    fi
    print_info "Using deployer account as owner: $OWNER_ADDRESS"
fi

# ============================
# DISPLAY CONFIGURATION
# ============================

print_info "Deployment Configuration:"
echo "  Profile: $PROFILE"
echo "  Owner: $OWNER_ADDRESS"
echo "  Default Token: $DEFAULT_TOKEN_ADDRESS"
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

# Always use release profile for deployment (optimized, smaller artifacts, cheaper gas)
SCARB_PROFILE="release"

cd "$WORKSPACE_DIR"

print_info "Building contracts ($SCARB_PROFILE profile)..."
scarb --profile "$SCARB_PROFILE" build --workspace

# Verify contract artifacts exist (workspace target is at repo root)
ARTIFACTS_DIR="$WORKSPACE_DIR/target/release"
if [ ! -f "$ARTIFACTS_DIR/budokan_Budokan.contract_class.json" ]; then
    print_error "Budokan contract artifact not found at $ARTIFACTS_DIR"
    exit 1
fi

if [ ! -f "$ARTIFACTS_DIR/budokan_viewer_BudokanViewer.contract_class.json" ]; then
    print_error "BudokanViewer contract artifact not found at $ARTIFACTS_DIR"
    exit 1
fi

# Change to contracts dir for sncast (snfoundry.toml location)
cd "$CONTRACTS_DIR"

print_info "Contract artifacts found"

# ============================
# DEPLOY BUDOKAN
# ============================

print_info "Declaring Budokan contract..."

BUDOKAN_DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name Budokan \
    --package budokan 2>&1) || {
    if echo "$BUDOKAN_DECLARE_OUTPUT" | grep -qi "already declared"; then
        print_warning "Budokan already declared"
        BUDOKAN_CLASS_HASH=$(echo "$BUDOKAN_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    else
        print_error "Failed to declare Budokan"
        echo "$BUDOKAN_DECLARE_OUTPUT"
        exit 1
    fi
}

if [ -z "${BUDOKAN_CLASS_HASH:-}" ]; then
    BUDOKAN_CLASS_HASH=$(echo "$BUDOKAN_DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
        echo "$BUDOKAN_DECLARE_OUTPUT" | grep -i "class hash:" | awk '{print $3}')
fi

if [ -z "${BUDOKAN_CLASS_HASH:-}" ]; then
    print_info "Calculating class hash from artifact..."
    CLASS_HASH_OUTPUT=$(sncast --profile "$PROFILE" utils class-hash --contract-name Budokan --package budokan 2>&1)
    BUDOKAN_CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep -i "class hash:" | awk '{print $3}')
    if [ -z "$BUDOKAN_CLASS_HASH" ]; then
        BUDOKAN_CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    fi
fi

if [ -z "${BUDOKAN_CLASS_HASH:-}" ]; then
    print_error "Could not determine Budokan class hash"
    exit 1
fi

print_info "Budokan class hash: $BUDOKAN_CLASS_HASH"

print_info "Deploying Budokan contract..."

# Constructor: owner: ContractAddress, default_token_address: ContractAddress
BUDOKAN_DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    deploy \
    --class-hash "$BUDOKAN_CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" "$DEFAULT_TOKEN_ADDRESS" \
    2>&1)

BUDOKAN_ADDRESS=$(echo "$BUDOKAN_DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
    echo "$BUDOKAN_DEPLOY_OUTPUT" | grep -i "contract address:" | awk '{print $3}')

if [ -z "$BUDOKAN_ADDRESS" ]; then
    BUDOKAN_ADDRESS=$(echo "$BUDOKAN_DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
fi

if [ -z "$BUDOKAN_ADDRESS" ]; then
    print_error "Failed to deploy Budokan"
    echo "$BUDOKAN_DEPLOY_OUTPUT"
    exit 1
fi

print_info "Budokan deployed at: $BUDOKAN_ADDRESS"

# ============================
# DEPLOY BUDOKAN VIEWER
# ============================

print_info "Declaring BudokanViewer contract..."

VIEWER_DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name BudokanViewer \
    --package budokan_viewer 2>&1) || {
    if echo "$VIEWER_DECLARE_OUTPUT" | grep -qi "already declared"; then
        print_warning "BudokanViewer already declared"
        VIEWER_CLASS_HASH=$(echo "$VIEWER_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    else
        print_error "Failed to declare BudokanViewer"
        echo "$VIEWER_DECLARE_OUTPUT"
        exit 1
    fi
}

if [ -z "${VIEWER_CLASS_HASH:-}" ]; then
    VIEWER_CLASS_HASH=$(echo "$VIEWER_DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
        echo "$VIEWER_DECLARE_OUTPUT" | grep -i "class hash:" | awk '{print $3}')
fi

if [ -z "${VIEWER_CLASS_HASH:-}" ]; then
    print_info "Calculating class hash from artifact..."
    CLASS_HASH_OUTPUT=$(sncast --profile "$PROFILE" utils class-hash --contract-name BudokanViewer --package budokan_viewer 2>&1)
    VIEWER_CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep -i "class hash:" | awk '{print $3}')
    if [ -z "$VIEWER_CLASS_HASH" ]; then
        VIEWER_CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    fi
fi

if [ -z "${VIEWER_CLASS_HASH:-}" ]; then
    print_error "Could not determine BudokanViewer class hash"
    exit 1
fi

print_info "BudokanViewer class hash: $VIEWER_CLASS_HASH"

print_info "Deploying BudokanViewer contract..."

# Constructor: owner: ContractAddress, budokan_address: ContractAddress
VIEWER_DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    deploy \
    --class-hash "$VIEWER_CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" "$BUDOKAN_ADDRESS" \
    2>&1)

VIEWER_ADDRESS=$(echo "$VIEWER_DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
    echo "$VIEWER_DEPLOY_OUTPUT" | grep -i "contract address:" | awk '{print $3}')

if [ -z "$VIEWER_ADDRESS" ]; then
    VIEWER_ADDRESS=$(echo "$VIEWER_DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
fi

if [ -z "$VIEWER_ADDRESS" ]; then
    print_error "Failed to deploy BudokanViewer"
    echo "$VIEWER_DEPLOY_OUTPUT"
    exit 1
fi

print_info "BudokanViewer deployed at: $VIEWER_ADDRESS"

# ============================
# SAVE DEPLOYMENT INFO
# ============================

DEPLOYMENT_FILE="$CONTRACTS_DIR/deployments/budokan_${PROFILE}_$(date +%Y%m%d_%H%M%S).json"
mkdir -p "$CONTRACTS_DIR/deployments"

cat > "$DEPLOYMENT_FILE" << EOF
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "budokan_contract": {
    "address": "$BUDOKAN_ADDRESS",
    "class_hash": "$BUDOKAN_CLASS_HASH",
    "parameters": {
      "owner": "$OWNER_ADDRESS",
      "default_token_address": "$DEFAULT_TOKEN_ADDRESS"
    }
  },
  "budokan_viewer_contract": {
    "address": "$VIEWER_ADDRESS",
    "class_hash": "$VIEWER_CLASS_HASH",
    "parameters": {
      "owner": "$OWNER_ADDRESS",
      "budokan_address": "$BUDOKAN_ADDRESS"
    }
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
echo "Budokan Contract:"
echo "  Address: $BUDOKAN_ADDRESS"
echo "  Class Hash: $BUDOKAN_CLASS_HASH"
echo "  Owner: $OWNER_ADDRESS"
echo "  Default Token: $DEFAULT_TOKEN_ADDRESS"
echo
echo "BudokanViewer Contract:"
echo "  Address: $VIEWER_ADDRESS"
echo "  Class Hash: $VIEWER_CLASS_HASH"
echo "  Owner: $OWNER_ADDRESS"
echo "  Budokan Address: $BUDOKAN_ADDRESS"
echo
echo "To interact with the contracts:"
echo "  export BUDOKAN_ADDRESS=$BUDOKAN_ADDRESS"
echo "  export BUDOKAN_VIEWER=$VIEWER_ADDRESS"
echo
