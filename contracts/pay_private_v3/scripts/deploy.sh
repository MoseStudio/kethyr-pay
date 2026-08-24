#!/usr/bin/env bash
# Deploy pay_private_v3.aleo to Aleo testnet.
#
# Requires:
#   - PRIVATE_KEY env var (a funded testnet deployer account)
#   - testnet credits for the deployment fee
#
# Usage:
#   PRIVATE_KEY=APrivateKey1zkp... bash scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

export NETWORK="${NETWORK:-testnet}"
export ENDPOINT="${ENDPOINT:-https://api.provable.com/v2/testnet}"

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "ERROR: PRIVATE_KEY is required (a funded Aleo testnet account)." >&2
  exit 1
fi

echo "Building pay_private_v3.aleo …"
leo build --network "$NETWORK"

echo "Deploying to $NETWORK via $ENDPOINT …"
leo deploy \
  --network "$NETWORK" \
  --endpoint "$ENDPOINT" \
  --private-key "$PRIVATE_KEY" \
  --broadcast

echo "Deployment submitted. Verify at https://explorer.provable.com/"
