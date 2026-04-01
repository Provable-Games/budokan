#!/bin/bash

# Post-Deployment Environment Update Script
# Reads the latest deployment JSON and updates all .env files and client config
#
# Usage:
#   ./scripts/update_env.sh                           # Use latest deployment for current profile
#   ./scripts/update_env.sh <deployment_file.json>    # Use specific deployment file

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
REPO_ROOT="$CONTRACTS_DIR/.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# ============================
# FIND DEPLOYMENT FILE
# ============================

if [ -n "${1:-}" ]; then
    DEPLOYMENT_FILE="$1"
    if [ ! -f "$DEPLOYMENT_FILE" ]; then
        # Try relative to deployments dir
        DEPLOYMENT_FILE="$CONTRACTS_DIR/deployments/$1"
    fi
else
    # Load profile from contracts .env
    PROFILE="sepolia"
    if [ -f "$CONTRACTS_DIR/.env" ]; then
        PROFILE=$(grep -E '^PROFILE=' "$CONTRACTS_DIR/.env" | cut -d= -f2 | tr -d ' "' || echo "sepolia")
    fi

    # Find latest deployment file for this profile
    DEPLOYMENT_FILE=$(ls -t "$CONTRACTS_DIR/deployments/budokan_${PROFILE}_"*.json 2>/dev/null | head -1)
fi

if [ -z "${DEPLOYMENT_FILE:-}" ] || [ ! -f "$DEPLOYMENT_FILE" ]; then
    print_error "No deployment file found. Run deploy_budokan.sh first or specify a file."
    echo "  Usage: $0 [deployment_file.json]"
    exit 1
fi

print_info "Using deployment: $DEPLOYMENT_FILE"

# ============================
# PARSE DEPLOYMENT JSON
# ============================

# Extract values using grep/sed (no jq dependency)
extract_json() {
    local key="$1"
    local file="$2"
    grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" | head -1 | sed 's/.*"[^"]*"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

PROFILE=$(extract_json "profile" "$DEPLOYMENT_FILE")
BUDOKAN_ADDRESS=$(extract_json "address" "$DEPLOYMENT_FILE")
VIEWER_ADDRESS=$(grep -A5 "budokan_viewer_contract" "$DEPLOYMENT_FILE" | grep -o '"address"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\(0x[^"]*\)".*/\1/')
DEFAULT_TOKEN=$(extract_json "default_token_address" "$DEPLOYMENT_FILE")

if [ -z "$BUDOKAN_ADDRESS" ] || [ -z "$VIEWER_ADDRESS" ]; then
    print_error "Could not parse deployment file"
    exit 1
fi

echo "  Profile: $PROFILE"
echo "  Budokan: $BUDOKAN_ADDRESS"
echo "  Viewer:  $VIEWER_ADDRESS"
echo "  Token:   $DEFAULT_TOKEN"
echo

# Map profile to network config key
case "$PROFILE" in
    sepolia) NETWORK_KEY="snSepoliaConfig" ;;
    mainnet) NETWORK_KEY="snMainnetConfig" ;;
    *) print_error "Unknown profile: $PROFILE"; exit 1 ;;
esac

# ============================
# UPDATE CLIENT NETWORKS.TS
# ============================

NETWORKS_FILE="$REPO_ROOT/client/src/dojo/setup/networks.ts"

if [ -f "$NETWORKS_FILE" ]; then
    print_info "Updating client/src/dojo/setup/networks.ts..."

    # Update budokanAddress for the correct network block
    # Find the config block and update the budokanAddress within it
    if [ "$PROFILE" = "sepolia" ]; then
        # Match the sepolia config's budokanAddress
        sed -i '/^const snSepoliaConfig/,/^};/{
            /budokanAddress:/{
                N
                s|budokanAddress:\n[[:space:]]*"0x[0-9a-fA-F]*"|budokanAddress:\n    "'"$BUDOKAN_ADDRESS"'"|
            }
        }' "$NETWORKS_FILE"

        # Update denshokanAddress if we have a default token
        if [ -n "$DEFAULT_TOKEN" ]; then
            sed -i '/^const snSepoliaConfig/,/^};/{
                /denshokanAddress:/{
                    N
                    s|denshokanAddress:\n[[:space:]]*"0x[0-9a-fA-F]*"|denshokanAddress:\n    "'"$DEFAULT_TOKEN"'"|
                }
            }' "$NETWORKS_FILE"
        fi
    elif [ "$PROFILE" = "mainnet" ]; then
        sed -i '/^const snMainnetConfig/,/^} as const;/{
            /budokanAddress:/{
                N
                s|budokanAddress:\n[[:space:]]*"0x[0-9a-fA-F]*"|budokanAddress:\n    "'"$BUDOKAN_ADDRESS"'"|
            }
        }' "$NETWORKS_FILE"

        if [ -n "$DEFAULT_TOKEN" ]; then
            sed -i '/^const snMainnetConfig/,/^} as const;/{
                /denshokanAddress:/{
                    N
                    s|denshokanAddress:\n[[:space:]]*"0x[0-9a-fA-F]*"|denshokanAddress:\n    "'"$DEFAULT_TOKEN"'"|
                }
            }' "$NETWORKS_FILE"
        fi
    fi

    print_info "Client config updated"
else
    print_warning "Client networks.ts not found at $NETWORKS_FILE"
fi

# ============================
# UPDATE INDEXER .ENV
# ============================

INDEXER_ENV="$REPO_ROOT/indexer/.env"

if [ "$PROFILE" = "sepolia" ]; then
    STREAM_URL="https://sepolia.starknet.a5a.ch"
elif [ "$PROFILE" = "mainnet" ]; then
    STREAM_URL="https://mainnet.starknet.a5a.ch"
fi

if [ -f "$INDEXER_ENV" ]; then
    print_info "Updating indexer/.env..."
    sed -i "s|^BUDOKAN_CONTRACT_ADDRESS=.*|BUDOKAN_CONTRACT_ADDRESS=$BUDOKAN_ADDRESS|" "$INDEXER_ENV"
    sed -i "s|^STREAM_URL=.*|STREAM_URL=$STREAM_URL|" "$INDEXER_ENV"
else
    print_info "Creating indexer/.env..."
    cat > "$INDEXER_ENV" << EOF
BUDOKAN_CONTRACT_ADDRESS=$BUDOKAN_ADDRESS
DATABASE_URL=postgres://postgres:postgres@localhost:5432/budokan
STREAM_URL=$STREAM_URL
STARTING_BLOCK=0
EOF
fi

print_info "Indexer .env updated"

# ============================
# UPDATE CONTRACTS .ENV
# ============================

CONTRACTS_ENV="$CONTRACTS_DIR/.env"

if [ -f "$CONTRACTS_ENV" ]; then
    print_info "Updating contracts/.env..."
    sed -i "s|^PROFILE=.*|PROFILE=$PROFILE|" "$CONTRACTS_ENV"
    if [ -n "$DEFAULT_TOKEN" ]; then
        sed -i "s|^DEFAULT_TOKEN_ADDRESS=.*|DEFAULT_TOKEN_ADDRESS=$DEFAULT_TOKEN|" "$CONTRACTS_ENV"
    fi
else
    print_warning "contracts/.env not found"
fi

# ============================
# SUMMARY
# ============================

echo
print_info "=== ENVIRONMENT UPDATE COMPLETE ==="
echo
echo "Updated files:"
[ -f "$NETWORKS_FILE" ] && echo "  - client/src/dojo/setup/networks.ts"
echo "  - indexer/.env"
[ -f "$CONTRACTS_ENV" ] && echo "  - contracts/.env"
echo
echo "Contract addresses for $PROFILE:"
echo "  BUDOKAN_ADDRESS=$BUDOKAN_ADDRESS"
echo "  BUDOKAN_VIEWER=$VIEWER_ADDRESS"
[ -n "$DEFAULT_TOKEN" ] && echo "  DEFAULT_TOKEN=$DEFAULT_TOKEN"
echo
