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
# HELPERS
# ============================
# Class hash is fully determined by the local artifact, so we compute it via
# `sncast utils class-hash` up-front. This avoids the fragile path of grepping
# a class hash out of `sncast declare`'s output, which interacts badly with
# `set -o pipefail` (a pipe like `... | head -1` causes upstream grep to exit
# 141 on SIGPIPE, which under `set -e` silently kills the script). With the
# hash known in advance the declare step becomes best-effort: success or the
# "already declared" no-op both fall through cleanly.

# Extract the first 0x-prefixed token following a "class hash" label in
# sncast output. Single awk pass — no pipe-with-head, no pipefail surprises.
extract_class_hash() {
    awk '
        /[Cc]lass[ _][Hh]ash/ {
            for (i = 1; i <= NF; i++) {
                tok = $i
                gsub(/[",]/, "", tok)
                if (tok ~ /^0x[0-9a-fA-F]+$/) { print tok; exit }
            }
        }
    '
}

# Compute the class hash for a contract from its built artifact.
compute_class_hash() {
    local contract_name="$1"
    local package="$2"
    sncast --profile "$PROFILE" utils class-hash \
        --contract-name "$contract_name" --package "$package" 2>&1 \
        | extract_class_hash
}

# Best-effort `declare`: succeeds on success, succeeds on "already declared",
# fails (returns 1) on anything else. Output is returned on stdout for the
# caller to log.
declare_contract() {
    local contract_name="$1"
    local package="$2"
    local out
    if out=$(sncast --profile "$PROFILE" --wait declare \
        --contract-name "$contract_name" --package "$package" 2>&1); then
        printf '%s\n' "$out"
        return 0
    fi
    printf '%s\n' "$out"
    if echo "$out" | grep -qi "already declared"; then
        return 0
    fi
    return 1
}

# Extract the deployed contract address from sncast deploy output.
# Uses `+` plus an explicit length check because mawk (the default `awk` on
# Debian/Ubuntu) does not support interval quantifiers like `{40,}`.
extract_contract_address() {
    awk '
        /[Cc]ontract[ _][Aa]ddress/ {
            for (i = 1; i <= NF; i++) {
                tok = $i
                gsub(/[",]/, "", tok)
                if (tok ~ /^0x[0-9a-fA-F]+$/ && length(tok) >= 42) { print tok; exit }
            }
        }
    '
}

# ============================
# DEPLOY BUDOKAN
# ============================

print_info "Computing Budokan class hash from artifact..."
BUDOKAN_CLASS_HASH=$(compute_class_hash Budokan budokan)
if [ -z "$BUDOKAN_CLASS_HASH" ]; then
    print_error "Could not compute Budokan class hash from artifact"
    exit 1
fi
print_info "Budokan class hash: $BUDOKAN_CLASS_HASH"

print_info "Declaring Budokan contract..."
if ! BUDOKAN_DECLARE_OUTPUT=$(declare_contract Budokan budokan); then
    print_error "Failed to declare Budokan"
    echo "$BUDOKAN_DECLARE_OUTPUT"
    exit 1
fi
if echo "$BUDOKAN_DECLARE_OUTPUT" | grep -qi "already declared"; then
    print_warning "Budokan class already declared, continuing with deployment..."
fi

print_info "Deploying Budokan contract..."

# Constructor: owner: ContractAddress, default_token_address: ContractAddress
BUDOKAN_DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    deploy \
    --class-hash "$BUDOKAN_CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" "$DEFAULT_TOKEN_ADDRESS" \
    2>&1)

BUDOKAN_ADDRESS=$(printf '%s\n' "$BUDOKAN_DEPLOY_OUTPUT" | extract_contract_address)

if [ -z "$BUDOKAN_ADDRESS" ]; then
    print_error "Failed to deploy Budokan"
    echo "$BUDOKAN_DEPLOY_OUTPUT"
    exit 1
fi

print_info "Budokan deployed at: $BUDOKAN_ADDRESS"

# ============================
# DECLARE BUDOKAN REWARDS
# ============================
# BudokanRewards is a library_call class — declared but never deployed as its
# own contract instance. The class hash is registered on Budokan via
# `set_rewards_class_hash`, after which `add_prize` and `claim_reward` library_call
# into it. Storage and events stay in Budokan; only the bytecode lives elsewhere.

print_info "Computing BudokanRewards class hash from artifact..."
REWARDS_CLASS_HASH=$(compute_class_hash BudokanRewards budokan_rewards)
if [ -z "$REWARDS_CLASS_HASH" ]; then
    print_error "Could not compute BudokanRewards class hash from artifact"
    exit 1
fi
print_info "BudokanRewards class hash: $REWARDS_CLASS_HASH"

print_info "Declaring BudokanRewards library class..."
if ! REWARDS_DECLARE_OUTPUT=$(declare_contract BudokanRewards budokan_rewards); then
    print_error "Failed to declare BudokanRewards"
    echo "$REWARDS_DECLARE_OUTPUT"
    exit 1
fi
if echo "$REWARDS_DECLARE_OUTPUT" | grep -qi "already declared"; then
    print_warning "BudokanRewards class already declared, continuing..."
fi

print_info "Registering BudokanRewards class hash on Budokan..."

sncast --profile "$PROFILE" --wait \
    invoke \
    --contract-address "$BUDOKAN_ADDRESS" \
    --function "set_rewards_class_hash" \
    --calldata "$REWARDS_CLASS_HASH" >/dev/null || {
    print_error "Failed to set rewards class hash on Budokan"
    exit 1
}

print_info "BudokanRewards registered on Budokan."

# ============================
# DEPLOY BUDOKAN VIEWER
# ============================

print_info "Computing BudokanViewer class hash from artifact..."
VIEWER_CLASS_HASH=$(compute_class_hash BudokanViewer budokan_viewer)
if [ -z "$VIEWER_CLASS_HASH" ]; then
    print_error "Could not compute BudokanViewer class hash from artifact"
    exit 1
fi
print_info "BudokanViewer class hash: $VIEWER_CLASS_HASH"

print_info "Declaring BudokanViewer contract..."
if ! VIEWER_DECLARE_OUTPUT=$(declare_contract BudokanViewer budokan_viewer); then
    print_error "Failed to declare BudokanViewer"
    echo "$VIEWER_DECLARE_OUTPUT"
    exit 1
fi
if echo "$VIEWER_DECLARE_OUTPUT" | grep -qi "already declared"; then
    print_warning "BudokanViewer class already declared, continuing with deployment..."
fi

print_info "Deploying BudokanViewer contract..."

# Constructor: owner: ContractAddress, budokan_address: ContractAddress
VIEWER_DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    deploy \
    --class-hash "$VIEWER_CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" "$BUDOKAN_ADDRESS" \
    2>&1)

VIEWER_ADDRESS=$(printf '%s\n' "$VIEWER_DEPLOY_OUTPUT" | extract_contract_address)

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
