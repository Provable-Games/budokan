#!/bin/bash
set -e

# Find .env relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
    set -a
    source "$SCRIPT_DIR/../.env"
    set +a
    echo "Loaded environment variables from $SCRIPT_DIR/../.env"
fi

echo "============================================================"
echo "Deploying Budokan to Sepolia"
echo "============================================================"

# Validate required environment variables
if [ -z "$OWNER_ADDRESS" ]; then
    echo "Error: OWNER_ADDRESS not set in .env"
    exit 1
fi

if [ -z "$DEFAULT_TOKEN_ADDRESS" ]; then
    echo "Error: DEFAULT_TOKEN_ADDRESS not set in .env"
    exit 1
fi

if [ -z "$EVENT_RELAYER_ADDRESS" ]; then
    echo "Error: EVENT_RELAYER_ADDRESS not set in .env"
    exit 1
fi

#-----------------
# build
#
echo ">>> Building..."
cd packages/budokan
scarb build
cd ../..

#-----------------
# declare
#
echo ">>> Declaring Budokan contract..."
sncast --profile sepolia declare \
    --contract-name Budokan \
    --package budokan \
    2>&1 || echo "Declaration command completed (may already be declared)"

#-----------------
# get class hash from artifact (reliable method)
#
echo ">>> Getting class hash from compiled artifact..."
CLASS_HASH_OUTPUT=$(sncast --profile sepolia utils class-hash --contract-name Budokan --package budokan 2>&1)

# Extract class hash from class-hash command output
if echo "$CLASS_HASH_OUTPUT" | grep -qi "class hash:"; then
    # New sncast format: "Class Hash:       0x..."
    CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep -i "class hash:" | awk '{print $3}')
elif echo "$CLASS_HASH_OUTPUT" | grep -q "class_hash:"; then
    # Old sncast format: "class_hash: 0x..."
    CLASS_HASH=$(echo "$CLASS_HASH_OUTPUT" | grep "class_hash:" | awk '{print $2}')
else
    echo "Error: Could not calculate class hash from artifact"
    echo "Class hash output: $CLASS_HASH_OUTPUT"
    exit 1
fi

if [ -z "$CLASS_HASH" ]; then
    echo "Error: Class hash is empty"
    echo "Class hash output: $CLASS_HASH_OUTPUT"
    exit 1
fi

echo "Using class hash: $CLASS_HASH"

#-----------------
# deploy
#
echo ">>> Deploying Budokan contract..."
DEPLOY_OUTPUT=$(sncast --profile sepolia deploy \
    --class-hash "$CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" "$DEFAULT_TOKEN_ADDRESS" "$EVENT_RELAYER_ADDRESS" \
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
    echo "Error: Could not extract contract address"
    exit 1
fi

#-----------------
# configure event relayer
#
echo ">>> Configuring Event Relayer to accept Budokan..."
sncast --profile sepolia invoke \
    --contract-address "$EVENT_RELAYER_ADDRESS" \
    --function set_budokan_address \
    --calldata "$CONTRACT_ADDRESS"

#-----------------
# save deployment info
#
DEPLOYMENT_FILE="deployments/budokan_sepolia_$(date +%Y%m%d_%H%M%S).json"
mkdir -p deployments

cat > "$DEPLOYMENT_FILE" << EOF
{
  "network": "sepolia",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "budokan_contract": {
    "address": "$CONTRACT_ADDRESS",
    "class_hash": "$CLASS_HASH",
    "constructor_args": {
      "owner_address": "$OWNER_ADDRESS",
      "default_token_address": "$DEFAULT_TOKEN_ADDRESS",
      "event_relayer_address": "$EVENT_RELAYER_ADDRESS"
    }
  },
  "event_relayer": {
    "address": "$EVENT_RELAYER_ADDRESS",
    "configured": true
  }
}
EOF

echo "Deployment info saved to: $DEPLOYMENT_FILE"

#-----------------
# output
#
echo "============================================================"
echo "Deployment Complete"
echo "============================================================"
echo "CLASS_HASH: $CLASS_HASH"
echo "BUDOKAN_ADDRESS: $CONTRACT_ADDRESS"
echo "EVENT_RELAYER_ADDRESS: $EVENT_RELAYER_ADDRESS (configured)"
echo ""
echo "Deployment details saved to: $DEPLOYMENT_FILE"
