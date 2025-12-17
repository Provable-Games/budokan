#!/bin/bash

# Tournament Validator Deployment Script
# Deploys the TournamentValidator contract to Starknet

set -euo pipefail

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
REGISTRATION_ONLY="${REGISTRATION_ONLY:-false}"
STARKNET_NETWORK="${STARKNET_NETWORK:-default}"

# Map network to sncast profile
case "$STARKNET_NETWORK" in
    "mainnet")
        SNCAST_PROFILE="mainnet"
        ;;
    "sepolia")
        SNCAST_PROFILE="sepolia"
        ;;
    *)
        SNCAST_PROFILE="default"
        ;;
esac

# Check if required environment variables are set
print_info "Checking environment variables..."

required_vars=("BUDOKAN_ADDRESS")

missing_vars=()

# Debug output for environment variables
print_info "Environment variables loaded:"
echo "  REGISTRATION_ONLY: $REGISTRATION_ONLY"
echo "  STARKNET_NETWORK: $STARKNET_NETWORK"
echo "  SNCAST_PROFILE: $SNCAST_PROFILE"
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

# ============================
# DISPLAY CONFIGURATION
# ============================

print_info "Deployment Configuration:"
echo "  Network: $STARKNET_NETWORK"
echo "  Profile: $SNCAST_PROFILE"
echo "  Registration Only: $REGISTRATION_ONLY"
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

if [ ! -f "target/dev/budokan_entry_requirement_TournamentValidator.contract_class.json" ]; then
    print_error "TournamentValidator contract build failed or contract file not found"
    print_error "Expected: target/dev/budokan_entry_requirement_TournamentValidator.contract_class.json"
    echo "Available contract files:"
    ls -la target/dev/*.contract_class.json 2>/dev/null || echo "No contract files found"
    exit 1
fi

# ============================
# DECLARE AND DEPLOY TOURNAMENT VALIDATOR
# ============================

print_info "Declaring TournamentValidator contract..."

DECLARE_OUTPUT=$(sncast --profile $SNCAST_PROFILE declare \
    --contract-name TournamentValidator \
    --package budokan_entry_requirement \
    2>&1) || true

# Extract class hash from output
if echo "$DECLARE_OUTPUT" | grep -qi "class hash:"; then
    # New sncast format: "Class Hash:       0x..."
    CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -i "class hash:" | awk '{print $3}')
    print_info "Declared with class hash: $CLASS_HASH"
elif echo "$DECLARE_OUTPUT" | grep -q "class_hash:"; then
    # Old sncast format: "class_hash: 0x..."
    CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep "class_hash:" | awk '{print $2}')
    print_info "Declared with class hash: $CLASS_HASH"
elif echo "$DECLARE_OUTPUT" | grep -qi "already declared"; then
    # New sncast doesn't show class hash for already declared contracts
    # Calculate it from the compiled artifact using sncast
    print_info "Contract already declared, calculating class hash from artifact..."
    CLASS_HASH_OUTPUT=$(sncast --profile $SNCAST_PROFILE utils class-hash --contract-name TournamentValidator --package budokan_entry_requirement 2>&1)
    CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep -i "class hash:" | awk '{print $3}')
    if [ -z "$CLASS_HASH" ]; then
        print_error "Could not calculate class hash from artifact"
        echo "Class hash output: $CLASS_HASH_OUTPUT"
        echo "Declaration output: $DECLARE_OUTPUT"
        exit 1
    fi
    print_warning "TournamentValidator contract already declared with class hash: $CLASS_HASH"
else
    echo "Declaration output: $DECLARE_OUTPUT"
    print_error "Could not extract class hash"
    exit 1
fi

# Deploy TournamentValidator contract
print_info "Deploying TournamentValidator contract..."

# Constructor parameters: budokan_address, registration_only
print_info "Using BUDOKAN_ADDRESS: $BUDOKAN_ADDRESS"
print_info "Using REGISTRATION_ONLY: $REGISTRATION_ONLY"

# Convert REGISTRATION_ONLY to felt252 (0 or 1)
if [ "$REGISTRATION_ONLY" = "true" ]; then
    REGISTRATION_ONLY_FELT="1"
else
    REGISTRATION_ONLY_FELT="0"
fi

DEPLOY_OUTPUT=$(sncast --profile $SNCAST_PROFILE deploy \
    --class-hash "$CLASS_HASH" \
    --constructor-calldata "$BUDOKAN_ADDRESS" "$REGISTRATION_ONLY_FELT" \
    2>&1)

# Extract contract address from output
if echo "$DEPLOY_OUTPUT" | grep -qi "contract address:"; then
    # New sncast format: "Contract Address:  0x..."
    CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -i "contract address:" | awk '{print $3}')
elif echo "$DEPLOY_OUTPUT" | grep -q "contract_address:"; then
    # Old sncast format: "contract_address: 0x..."
    CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "contract_address:" | awk '{print $2}')
else
    echo "Deploy output: $DEPLOY_OUTPUT"
    print_error "Could not extract contract address"
    exit 1
fi

print_info "TournamentValidator contract deployed at address: $CONTRACT_ADDRESS"

# ============================
# SAVE DEPLOYMENT INFO
# ============================

DEPLOYMENT_FILE="deployments/tournament_validator_$(date +%Y%m%d_%H%M%S).json"
mkdir -p deployments

cat > "$DEPLOYMENT_FILE" << EOF
{
  "network": "$STARKNET_NETWORK",
  "profile": "$SNCAST_PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tournament_validator": {
    "address": "$CONTRACT_ADDRESS",
    "class_hash": "$CLASS_HASH",
    "description": "Tournament-based entry validator - validates based on participation/winning in qualifying tournaments",
    "registration_only": $REGISTRATION_ONLY
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
echo "Tournament Validator Contract:"
echo "  Address: $CONTRACT_ADDRESS"
echo "  Class Hash: $CLASS_HASH"
echo "  Registration Only: $REGISTRATION_ONLY"
echo ""

echo "Next steps:"
echo "1. Verify the contract on Starkscan/Voyager"
echo "2. Configure tournament qualification rules using add_config():"
echo "   - Set qualifier_type (0 = participants, 1 = winners)"
echo "   - Add qualifying tournament IDs"
echo "3. Integrate with your tournament creation flow"
echo ""

echo "To interact with the contract:"
echo "  export TOURNAMENT_VALIDATOR=$CONTRACT_ADDRESS"
echo ""

echo "Example: Configure for participant-based qualification:"
echo "  sncast --profile $SNCAST_PROFILE invoke \\"
echo "    --contract-address \$TOURNAMENT_VALIDATOR \\"
echo "    --function add_config \\"
echo "    --calldata <tournament_id> <entry_limit> 0 <qualifying_tournament_id_1> <qualifying_tournament_id_2>"
echo ""

echo "Example: Configure for winner-based qualification:"
echo "  sncast --profile $SNCAST_PROFILE invoke \\"
echo "    --contract-address \$TOURNAMENT_VALIDATOR \\"
echo "    --function add_config \\"
echo "    --calldata <tournament_id> <entry_limit> 1 <qualifying_tournament_id_1> <qualifying_tournament_id_2>"
echo ""

echo "Example: Test entry validation (participant-based):"
echo "  sncast --profile $SNCAST_PROFILE call \\"
echo "    --contract-address \$TOURNAMENT_VALIDATOR \\"
echo "    --function valid_entry \\"
echo "    --calldata <tournament_id> <player_address> <qualifying_tournament_id> <token_id>"
echo ""

echo "Example: Test entry validation (winner-based):"
echo "  sncast --profile $SNCAST_PROFILE call \\"
echo "    --contract-address \$TOURNAMENT_VALIDATOR \\"
echo "    --function valid_entry \\"
echo "    --calldata <tournament_id> <player_address> <qualifying_tournament_id> <token_id> <leaderboard_position>"
echo ""
