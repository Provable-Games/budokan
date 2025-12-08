#!/bin/bash
set -e

# Load environment variables
if [ -f ".env" ]; then
    source .env
fi

echo "============================================================"
echo "Deploying Event Relayer to Mainnet"
echo "============================================================"
echo "WARNING: You are about to deploy to MAINNET. Press Ctrl+C to cancel."
read -p "Press Enter to continue..."

#-----------------
# build
#
echo ">>> Cleaning..."
sozo clean -P mainnet

echo ">>> Building..."
sozo build -P mainnet

#-----------------
# migrate
#
echo ">>> Migrating..."
sozo migrate -P mainnet
echo ">>> Migration complete"

#-----------------
# get deployed addresses
#
export MANIFEST_FILE_PATH="./manifest_mainnet.json"

get_contract_address () {
    local TAG=$1
    local RESULT=$(cat $MANIFEST_FILE_PATH | jq -r ".contracts[] | select(.tag == \"$TAG\" ).address")
    if [[ -z "$RESULT" ]]; then
        >&2 echo "get_contract_address($TAG) not found!"
    fi
    echo $RESULT
}

export EVENT_RELAYER_ADDRESS=$(get_contract_address "budokan_relayer_0_0_1-BudokanEventRelayer")

#-----------------
# output
#
echo "============================================================"
echo "Deployment Complete"
echo "============================================================"
echo "EVENT_RELAYER_ADDRESS: $EVENT_RELAYER_ADDRESS"
echo ""
echo "Next steps:"
echo "1. Set the budokan address on the event relayer:"
echo "   sozo execute -P mainnet budokan_relayer_0_0_1-BudokanEventRelayer set_budokan_address -c <BUDOKAN_ADDRESS>"
echo ""
echo "2. Set the event relayer address on Budokan (if deploying fresh):"
echo "   The Budokan contract should be initialized with this event relayer address"
