#!/bin/bash
set -e

# Load environment variables
if [ -f "../contracts/.env" ]; then
    source ../contracts/.env
fi

echo "============================================================"
echo "Deploying Event Relayer to Local Dev (Katana)"
echo "============================================================"

#-----------------
# build
#
echo ">>> Cleaning..."
sozo clean -P dev

echo ">>> Building..."
sozo build -P dev

#-----------------
# migrate
#
echo ">>> Migrating..."
sozo migrate -P dev
echo ">>> Migration complete"

#-----------------
# get deployed addresses
#
export MANIFEST_FILE_PATH="./manifest_dev.json"

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
