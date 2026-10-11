#!/usr/bin/env sh
# Kethyr Flow — devnet 一键准备（路演/远程评测用）。
#
# 幂等：可重复执行。做四件事：
#   1. 检查 CLI 钱包在 devnet 的 SOL（部署 + 充值都要用它付）
#   2. 部署 kethyr-payroll 程序（已部署则升级）
#   3. 用 `.devnet/mint.json` 创建/复用测试代币 mint
#   4. 给演示钱包（Employer / Employee）充 SOL，并给 Employer 铸测试代币
#
# 用法：
#   sh scripts/devnet-setup.sh            # 默认铸 100000 代币给 Employer
#   sh scripts/devnet-setup.sh 500000     # 自定义数量
#
# 依赖：solana / spl-token / anchor CLI，且 `.devnet/` 下已有 mint.json / employer.json / employee.json
#       （由 solana-keygen 生成；已被 .gitignore，绝不入库）

set -eu

RPC="${SOLANA_RPC:-https://api.devnet.solana.com}"
CLUSTER="${SOLANA_CLUSTER:-devnet}"
KEYPAIR="${SOLANA_KEYPAIR:-$HOME/.config/solana/id.json}"
TOKEN_AMOUNT="${1:-100000}"
TOKEN_DECIMALS=6
SOL_PER_DEMO_WALLET="${SOL_PER_DEMO_WALLET:-0.5}"

MINT_KEYPAIR=".devnet/mint.json"
EMPLOYER_KEYPAIR=".devnet/employer.json"
EMPLOYEE_KEYPAIR=".devnet/employee.json"

[ -f "$MINT_KEYPAIR" ] || { echo "缺少 $MINT_KEYPAIR（先运行 solana-keygen new -o $MINT_KEYPAIR）" >&2; exit 1; }
[ -f "$EMPLOYER_KEYPAIR" ] || { echo "缺少 $EMPLOYER_KEYPAIR" >&2; exit 1; }
[ -f "$EMPLOYEE_KEYPAIR" ] || { echo "缺少 $EMPLOYEE_KEYPAIR" >&2; exit 1; }

MINT=$(solana address -k "$MINT_KEYPAIR")
EMPLOYER=$(solana address -k "$EMPLOYER_KEYPAIR")
EMPLOYEE=$(solana address -k "$EMPLOYEE_KEYPAIR")
PAYER=$(solana address -k "$KEYPAIR")

echo "cluster      : $CLUSTER ($RPC)"
echo "payer        : $PAYER"
echo "mint         : $MINT"
echo "demo employer: $EMPLOYER"
echo "demo employee: $EMPLOYEE"
echo

echo "→ 1/4 检查 payer 余额"
BAL=$(solana balance "$PAYER" --url "$RPC" | awk '{print $1}')
echo "   余额: $BAL SOL"
if [ "${BAL%.*}" = "0" ]; then
  echo "   !! payer 没有 SOL。先领水：https://faucet.solana.com （地址 $PAYER）" >&2
  echo "      或用已充值的钱包：solana transfer $PAYER 2 --url $RPC --keypair <富钱包>" >&2
  exit 1
fi

echo "→ 2/4 部署/升级程序"
DEPLOY_LOG="${TMPDIR:-/tmp}/kethyr-devnet-deploy.log"
# 注意：不能直接 `anchor deploy | tail`——管道会吃掉退出码，部署失败也看不出来。
if ! anchor deploy --provider.cluster "$CLUSTER" >"$DEPLOY_LOG" 2>&1; then
  echo "   !! 部署失败，日志尾部：" >&2
  tail -20 "$DEPLOY_LOG" >&2
  exit 1
fi
tail -4 "$DEPLOY_LOG"

echo "→ 3/4 创建/复用测试代币 mint（幂等）"
if spl-token supply "$MINT" --url "$RPC" >/dev/null 2>&1; then
  echo "   mint 已存在，跳过创建"
else
  spl-token create-token "$MINT_KEYPAIR" --decimals "$TOKEN_DECIMALS" --url "$RPC" 2>&1 | head -3
fi

echo "→ 4/4 给演示钱包充 SOL + 铸代币"
for W in "$EMPLOYER" "$EMPLOYEE"; do
  CUR=$(solana balance "$W" --url "$RPC" | awk '{print $1}')
  if [ "${CUR%.*}" = "0" ]; then
    solana transfer "$W" "$SOL_PER_DEMO_WALLET" --url "$RPC" --keypair "$KEYPAIR" --allow-unfunded-recipient 2>&1 | tail -2
  else
    echo "   $W 已有 $CUR SOL，跳过"
  fi
done

# Employer 的 ATA + 代币（开流需要本金）
CREATE_OUT=$(spl-token create-account "$MINT" --owner "$EMPLOYER" --fee-payer "$KEYPAIR" --url "$RPC" 2>&1) || true
echo "$CREATE_OUT" | head -2
ATA=$(printf '%s' "$CREATE_OUT" | sed -n 's/.*Creating account \([1-9A-HJ-NP-Za-km-z]\{32,44\}\).*/\1/p' | head -1)
if [ -n "$ATA" ]; then
  spl-token mint "$MINT" "$TOKEN_AMOUNT" "$ATA" --mint-authority "$KEYPAIR" --fee-payer "$KEYPAIR" --url "$RPC" 2>&1 | tail -3
else
  spl-token mint "$MINT" "$TOKEN_AMOUNT" --recipient-owner "$EMPLOYER" --mint-authority "$KEYPAIR" --fee-payer "$KEYPAIR" --url "$RPC" 2>&1 | tail -3
fi

# Employee 的 ATA（Claim 时会用到；这里先建好，省得评委第一次点 Claim 等租金）
spl-token create-account "$MINT" --owner "$EMPLOYEE" --fee-payer "$KEYPAIR" --url "$RPC" 2>&1 | head -2 || true

echo
echo "✓ devnet 准备完成"
echo "  Employer 代币: $(spl-token balance "$MINT" --owner "$EMPLOYER" --fee-payer "$KEYPAIR" --url "$RPC" 2>/dev/null | tail -1)"
