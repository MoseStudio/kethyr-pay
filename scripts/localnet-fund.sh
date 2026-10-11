#!/usr/bin/env sh
# Kethyr Flow — 本地 E2E 资金准备助手。
#
# 用法（fish / bash 均可）：
#   sh scripts/localnet-fund.sh <OWNER_ADDRESS> [TOKEN_AMOUNT]
#
# 作用：给该地址空投 SOL（付 gas），并为其创建测试代币 ATA、铸造代币（供雇主开流）。
#
# 依赖：solana / spl-token CLI，且本地 validator (http://127.0.0.1:8899) 已运行、
#       kethyr-payroll 已部署。可用环境变量覆盖：
#         SOLANA_RPC / SOLANA_KEYPAIR（付费+铸币权限钱包）/ PAYROLL_MINT

set -eu

OWNER="${1:-}"
AMOUNT="${2:-100000}"
RPC="${SOLANA_RPC:-http://127.0.0.1:8899}"
KEYPAIR="${SOLANA_KEYPAIR:-$HOME/.config/solana/id.json}"
MINT="${PAYROLL_MINT:-6xPgjRpt3LS3vtxQjJPitNMELtd3sDrCiLHqUqhsbsrm}"

if [ -z "$OWNER" ]; then
  echo "usage: $0 <OWNER_ADDRESS> [TOKEN_AMOUNT]" >&2
  exit 1
fi

echo "→ 空投 100 SOL 给 $OWNER"
solana airdrop 100 "$OWNER" --url "$RPC"

echo "→ 为 $OWNER 创建代币 ATA (mint=$MINT)"
CREATE_OUT=$(spl-token create-account "$MINT" \
  --owner "$OWNER" --fee-payer "$KEYPAIR" --url "$RPC" 2>&1) || true
echo "$CREATE_OUT"

ATA=$(printf '%s' "$CREATE_OUT" \
  | sed -n 's/.*Creating account \([1-9A-HJ-NP-Za-km-z]\{32,44\}\).*/\1/p' | head -1)

echo "→ 铸造 $AMOUNT 代币"
if [ -n "$ATA" ]; then
  spl-token mint "$MINT" "$AMOUNT" "$ATA" \
    --mint-authority "$KEYPAIR" --fee-payer "$KEYPAIR" --url "$RPC"
else
  # ATA 已存在：直接用 recipient-owner 定位
  spl-token mint "$MINT" "$AMOUNT" \
    --recipient-owner "$OWNER" --mint-authority "$KEYPAIR" --fee-payer "$KEYPAIR" --url "$RPC"
fi

echo ""
echo "✓ 完成，$OWNER 的代币余额："
spl-token balance "$MINT" --owner "$OWNER" --fee-payer "$KEYPAIR" --url "$RPC"
