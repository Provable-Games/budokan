#!/bin/bash

#-----------------
# build
#
echo "------------------------------------------------------------------------------"
echo "Cleaning..."
sozo clean -P dev
echo "Building..."
sozo build -P dev

#-----------------
# migrate
#
echo ">>> Migrate"
sozo migrate -P dev
echo "👍"

#-----------------
# get deployed addresses
#

export MANIFEST_FILE_PATH="./manifest_dev.json"

get_contract_address () {
  local TAG=$1
  local RESULT=$(cat $MANIFEST_FILE_PATH | jq -r ".contracts[] | select(.tag == \"$TAG\" ).address")
  if [[ -z "$RESULT" ]]; then
    >&2 echo "get_contract_address($TAG) not found! 👎"
  fi
  echo $RESULT
}

export RELAYER_ADDRESS=$(get_contract_address "budokan_relayer_0_0_1-BudokanEventRelayer")

#-----------------
# addresses
#
echo ">>> Addresses"
echo "RELAYER_ADDRESS: $RELAYER_ADDRESS"
