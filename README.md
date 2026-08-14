# AleoPay — Privacy-First Payment Gateway on Aleo

> **Aleo x OpenBuild 亚太黑客松 · PAY 隐私支付赛道**

AleoPay 是一个**开发者优先、默认隐私**的 Stripe-like 支付网关。商家用一行 SDK
创建发票，付款人在浏览器本地生成 ZK Proof（Client-side Proving，私钥不出钱包）
完成隐私支付，链上 `PaymentRecord` 携带 **Sender Ciphertext** 承诺——
金额与付款人身份仅持有 View Key 的商家可解密，隐私与合规审计双满足。

## Demo 北极星（全链路真实，非 mock）

```
连接钱包 → 商家铸造发票 (create_invoice) → 转移给付款人 (transfer_invoice)
→ 付款人支付 (pay_invoice, 真实 ZK Proof) → 链上确认 (verifyPayment)
→ 商家后台收款明细 → View Key 账期导出
```

## 核心亮点

| 特性 | 说明 |
|------|------|
| 🔒 隐私收单 | 链上 PaymentRecord 为密文，金额/付款人仅 View Key 可解密 |
| ⚖️ 合规底线 | Sender Ciphertext 承诺（group 元素）链上可审计，不碰 Mixer |
| 🧾 防重放 | InvoiceRecord.serial_number = BHP256 哈希，同一发票仅支付一次 |
| 📊 商家后台 | 累计收款 + 交易明细 + RFC-4180 CSV / JSON 账期导出 |
| ⚡ 性能埋点 | prove / broadcast / confirm 全程耗时导出 |

## 架构

```
contracts/pay_private/   Leo 收单合约 pay_private_v2.aleo（Testnet 已部署）
packages/sdk/            @aleopay/sdk：createPayment / verifyPayment / 发票铸造与转移
frontend/aleopay-demo/   TanStack Start + React 19：Checkout / Status / 商家后台
```

- 智能合约：**Leo v4.4.1**（snarkVM 4.9.0）
- 证明系统：`@provablehq/sdk` 浏览器 WASM Prover（Client-side Proving）
- 钱包适配：`@provablehq/aleo-wallet-adaptor-*`（默认 Shield Wallet）

## 快速开始

```bash
# 合约（Leo 4.4.1）
cd contracts/pay_private && leo build && leo test   # 8/8

# SDK
cd packages/sdk && pnpm install && pnpm build && pnpm test && pnpm typecheck

# 前端 Demo
cd frontend/aleopay-demo && pnpm install && pnpm dev   # http://localhost:3002
```

前端 `.env` 需配置：

```env
VITE_USE_REAL_TRANSACTIONS=true
VITE_RPC_ENDPOINT=https://api.explorer.provable.com/v1   # 默认端点不可达时的覆盖
```

浏览器需安装 **Shield Wallet** 扩展并切换到 Testnet。

## 演示动线（现场 Demo）

完整演示脚本见 [`docs/HACKATHON_DEMO.md`](docs/HACKATHON_DEMO.md)（≤ 5 分钟），
端到端手动联调步骤见 [`docs/H5_MANUAL_E2E.md`](docs/H5_MANUAL_E2E.md)。

```
商家钱包 → /merchant/invoice 铸造并转移发票
付款人钱包 → Checkout 链接支付（真实 ZK Proof）
商家钱包 → /merchant 见收款明细 + /merchant/export 导出账期
```

## Testnet 部署

| 字段 | 值 |
|------|-----|
| Program ID | `pay_private_v2.aleo` |
| 部署交易 | `at1f6vzg6az4r2ztgxh5ctudhfcstdz42d2rgjzfuud60aut8lxeu8qldke5l` |
| Explorer | https://explorer.provable.com/program/pay_private_v2.aleo |
| v1（历史） | `pay_private.aleo`（无 transfer_invoice，@noupgrade 不可升级） |

## 文档

- 合约设计：[`contracts/pay_private/DESIGN.md`](contracts/pay_private/DESIGN.md)
- 部署记录：[`contracts/pay_private/DEPLOYMENT.md`](contracts/pay_private/DEPLOYMENT.md)
- 黑客松 issue 跟踪：[`AleoPay-Hackathon-Issues-Linear.md`](AleoPay-Hackathon-Issues-Linear.md)
- Session 交接：[`HANDOFF.md`](HANDOFF.md)

## License

MIT
