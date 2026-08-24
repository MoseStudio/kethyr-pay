# KethyrPay — Privacy-First Payment Gateway on Aleo

> **Aleo x OpenBuild 亚太黑客松 · PAY 隐私支付赛道**

<div align="center">

**[简体中文](README.CN.md) · [English](README.md)**

</div>

## 宣传视频

<video src="https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/Kethyrpay.mp4" controls width="100%" poster="https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg"></video>

[![KethyrPay 宣传视频](https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg)](https://github.com/user-attachments/assets/d3f8729c-cce1-4d7c-b256-6e8a462c2eff)

---

KethyrPay 是一个**开发者优先（Developer-first）、默认隐私、兼顾合规**的 Stripe-like 隐私收单与订阅支付网关。

商家用几行 SDK 代码即可集成隐私收款；付款人在浏览器本地生成 ZK Proof（Client-side Proving，私钥不出钱包）完成支付；链上 `PaymentRecord` 携带 **Sender Ciphertext** 承诺——金额与付款人身份仅持有 View Key 的商家可解密，隐私与合规审计双满足。

## 核心痛点与解决方案

| 用户角色 | 核心痛点 | KethyrPay 解决方案 |
|----------|----------|--------------------|
| SaaS 商家 | 传统公链收款导致 MRR 和大客户数据对同行公开；纯匿名隐私币无法合规做账 | Record 记录模型默认隐蔽收款金额与来源；View Key 导出无缝对接 Request Finance / Xero 合规审计 |
| SaaS 终端用户 | 消费记录、钱包地址、余额在链上裸奔；传统隐私钱包门槛极高 | 默认对外部屏蔽交易流向；Embedded Wallet 邮箱一键登录生成隐私地址 |
| 开发人员 | ZK 底层电路开发极度复杂（Leo 代码、Prover 性能优化） | Stripe-like JS SDK 与 Hosted Checkout，复杂 ZK 逻辑封装在几行 API 内 |

## 核心功能

1. **开发者工具包（SDK & API）**
   - **Hosted Checkout（托管收银台）**：商家免开发前端，重定向到 KethyrPay 托管隐私收款页。
   - **JS SDK**：`createPayment()` / `verifyPayment()` 核心 API，支持商家网站内嵌支付按钮。
   - **Webhooks 系统**：实时推送支付成功/失败、订阅到期等事件（`payment.secured`、`subscription.renewed`）。

2. **隐私自动订阅引擎（Escrow Subscription Contract）**
   - ZK 链上无法实现传统 Web2「无感扣款（Pull Payment）」，采用**私有托管智能合约**方案。
   - 用户一次性授权并存入稳定币（USAD / USDCx）至隐私托管合约，合约按订阅周期自动释放金额给商家，直至额度耗尽或用户退订。

3. **选择性合规与导出（Compliant Auditor Dashboard）**
   - **Sender Ciphertext 自动解密**：商家后台展示付款来源地址，满足 AML 资金来源追溯。
   - **View Key 单独授权**：为收款记录生成独立 View Key，提交给 Request Finance 或审计机构。

## 当前 Demo 北极星（全链路真实，非 mock）

```
连接钱包 → 商家铸造发票 (mint_to_payer, owner=付款人)
→ 付款人准备 private ALEO record (transfer_public_to_private) → 支付 (pay_invoice 原子：transfer_private + 消费 InvoiceRecord + 双 Receipt，单笔交易，任一步失败整笔回滚)
→ 链上确认 (verifyPayment) → 商家后台收款明细 → View Key 账期导出
```

[![Demo 视频](https://github.com/MoseStudio/kethyr-pay/raw/main/video/out/poster.jpg)](https://github.com/user-attachments/assets/5431aa34-fab3-4fbc-86f3-bbd17d61bfb6)

> **安全设计**：v3 采用**单笔交易原子结算**——`transfer_private` 转移 ALEO、消费 InvoiceRecord、产出双 Receipt 在同一笔交易内顺序执行；任一步失败整笔 revert，**杜绝任何中间态**。

## 核心亮点

| 特性 | 说明 |
|------|------|
| 🔒 隐私收单 | 链上 PaymentRecord 为密文，金额/付款人仅 View Key 可解密 |
| 💸 真实资金流 | 单笔 `pay_invoice` 内 `credits.aleo::transfer_private`，余额真实变动 |
| ⚖️ 合规底线 | Sender Ciphertext 承诺（group 元素）链上可审计，不碰 Mixer |
| 🧾 防重放 | InvoiceRecord.serial_number = BHP256 哈希，同一发票仅支付一次 |
| 📊 商家后台 | 累计收款 + 交易明细 + RFC-4180 CSV / JSON 账期导出（ALEO 计价） |
| ⚡ 性能埋点 | prove / broadcast / confirm 全程耗时导出（可开关） |

## 架构

```
contracts/pay_private/        Leo 收单合约 pay_private_v2.aleo（历史，已被 v3 替代）
contracts/pay_private_v3/     Leo 收单合约 pay_private_v3.aleo（当前 Testnet 部署，原子结算）
contracts/escrow_subscription/ Leo 隐私托管订阅合约（POC：授权 / 扣款 / 退订）
packages/sdk/                 @kethyrpay/sdk：createPayment / verifyPayment / mint_to_payer
frontend/demo/                TanStack Start + React 19：Checkout / Status / 商家后台
```

- 智能合约：**Leo v4.4.1**（snarkVM 4.9.0）
- 证明系统：`@provablehq/sdk` 浏览器 WASM Prover（Client-side Proving）
- 钱包适配：`@provablehq/aleo-wallet-adaptor-*`（默认 Shield Wallet，自动连接，声明 pay_private_v3.aleo + credits.aleo）

## 启动 Demo

### 1. 合约（Leo 4.4.1）

```bash
cd contracts/pay_private && leo build && leo test   # v2 历史合约 8/8
cd contracts/pay_private_v3 && leo build && leo test # v3 原子合约
```

### 2. SDK

```bash
cd packages/sdk && pnpm install && pnpm build && pnpm test && pnpm typecheck
```

### 3. 前端 Demo

```bash
cd frontend/demo && pnpm install && pnpm dev   # http://localhost:3002
```

前端 `.env` 需配置：

```env
VITE_USE_REAL_TRANSACTIONS=true
VITE_RPC_ENDPOINT=https://api.provable.com/v2/testnet   # 可选 RPC 覆盖
VITE_ENABLE_PERFORMANCE_PANEL=false   # 显示右下角性能面板（调试用）
```

前端同时启用 CSRF 中间件保护 server functions（same-origin RPC），详见 `src/start.ts`。

### 演示动线

```
商家钱包 → /merchant/invoice 铸造并交付发票（mint_to_payer 单笔） → 「打开支付页」直达 Checkout
付款人钱包 → Checkout 支付（单笔 pay_invoice 原子：private ALEO + InvoiceRecord + 双 Receipt）
付款人钱包 → status 页确认成功（金额 + 交易 ID）→ 「商家后台」直达
商家钱包 → /merchant 见收款明细 + /merchant/export 导出账期
```

浏览器需安装 **Shield Wallet** 扩展并切换到 Testnet；钱包需授权 `pay_private_v3.aleo` + `credits.aleo` 两个程序（代码已声明，重连钱包生效）。

## 产品路线图

```
【 阶段一：POC 】 ──> 【 阶段二：MVP 】 ──> 【 阶段三：PMF 】 ──> 【 阶段四：Scaling 】
 (技术可行性验证)      (核心收单功能上线)      (订阅引擎与生态建立)     (平台化与硬件加速)
```

### 阶段一：POC（概念验证）— ✅ 已完成

验证浏览器前端（WASM）生成转账 ZK Proof 的速度，以及私有托管订阅合约的数学可行性。

- **Leo 试验性智能合约**：`escrow_subscription.aleo`，支持预授权自动扣款（Escrow Pull Payment）。
- **浏览器性能压测**：PC Chrome 与主流智能手机上 Varuna 证明系统生成 1 笔隐私稳定币转账证明的耗时。
- **双花与防重放测试**：验证 Serial Number / Nullifier 链下生成并阻断双花攻击。

**成功指标**：PC 端证明生成 ≤ 3s、手机端 ≤ 5s；Testnet ≥ 1,000 次模拟高并发扣款无资金丢失/双花。

### 阶段二：MVP（最小可行产品）— 🚧 进行中（当前 Demo 对应阶段）

开发出可供真实商家测试、可实际收取一笔隐私稳定币的网关。暂不提供自动续费，只做单次隐私收单。

- **Hosted Checkout**：托管的极简隐私付款网页。
- **JS SDK v0.1**：`createPayment()` / `verifyPayment()` 双核心 API。
- **商家后台**：收款总额 + 一键导出对应账期 View Key。
- **钱包兼容**：主流 Leo 钱包插件一键连接（默认 Shield Wallet）。

**成功指标**：3~5 家 Web3 SaaS 种子商户 alpha 测试；与 Request Finance 的 View Key 账单导入打通；测试期处理 ≥ 100 笔真实 USAD/USDCx 隐私转账。

### 阶段三：PMF（产品市场契合）

推出「隐私自动订阅引擎」，全面对接 Embedded Wallet 降低普通用户门槛，实现真正的 Stripe-like 体验。

- **自动订阅 API**：Escrow 预授权按月自动扣款合约 + 配套 API。
- **嵌入式钱包集成**：与 Dynamic / Web3Auth 合作，邮箱一键登录隐式生成 Aleo 隐私钱包。
- **Webhooks 升级**：余额不足无法扣款时自动向商家推送断开订阅回调。
- **多稳定币支持**：完整支持 USDCx 与 USAD。

**成功指标**：50+ 家商户入驻；订阅续费失败率 < 10%；月均隐私交易额（GPV）突破 100 万美元。

### 阶段四：Scaling（平台化与性能爆发）

优化支付延迟、降低设备功耗，开展全球法币合规牌照化。

- **Delegate Proving**：Compute Key 将重度 ZK 计算托管至云端硬件加速，支付延迟缩短至 1s 内。
- **跨链支付路由**：ETH/USDT 发起付款，经 ZK 跨链桥自动兑换为 Aleo 隐私稳定币到达商家金库。
- **法币合规网关**：与受监管 VASP 合作，后台一键合规出金（Off-Ramp）至传统银行账户。

**成功指标**：主要司法辖区 MSB/支付牌照；95% 支付事件 1.5s 内完成全流程（含证明生成与验证）。

## 关键技术决策

- **Proving 策略**：MVP 阶段坚决采用 **Client-side Proving**（慢几秒但架构极简、安全性最高，私钥不出设备）；Scaling 阶段再引入 **Delegate Proving**（Compute Key 保护资产不丢失，优化移动端/弱网体验）。
- **支付流程（v3 原子化）**：**单笔 `pay_invoice` 原子完成** `credits.aleo::transfer_private` + 消费 InvoiceRecord + 产出双 Receipt；任一步失败整笔 revert。历史 v2 曾需两笔交易先转账再消费，v3 已消除中间态。
- **合规底线**：坚决不碰混币器（Mixer）。任何转账必须包含 **Sender Ciphertext**，确保收款人（及授权监管方）有权知道资金来源——这是 KethyrPay 不被司法部/SEC 封杀的底线。

## Testnet 部署

| 字段 | 值 |
|------|-----|
| Program ID | `pay_private_v3.aleo`（当前） |
| 部署交易 | `at1sq0xgyaqsx53k9eqkgexzu2njjpt66p4c0jzh566taqe6yj9nufqzre8wy` |
| Explorer | https://explorer.provable.com/program/pay_private_v3.aleo |
| 总费用 | 10.849479 ALEO |
| v1（历史） | `pay_private.aleo`（无 transfer_invoice，@noupgrade） |
| v2（历史） | `pay_private_v2.aleo`（单笔非原子，已被 v3 替代） |

## 文档

- 收单合约设计：[`contracts/pay_private_v3/DESIGN.md`](contracts/pay_private_v3/DESIGN.md)（当前） / [`contracts/pay_private/DESIGN.md`](contracts/pay_private/DESIGN.md)（历史）
- 收单合约部署：[`contracts/pay_private_v3/DEPLOYMENT.md`](contracts/pay_private_v3/DEPLOYMENT.md)
- 托管订阅合约设计：[`contracts/escrow_subscription/DESIGN.md`](contracts/escrow_subscription/DESIGN.md)
- Demo 自助操作流程：[`docs/DEMO_WALKTHROUGH.md`](docs/DEMO_WALKTHROUGH.md)
- SDK 使用：[`packages/sdk/README.md`](packages/sdk/README.md)
- Demo 说明：[`frontend/demo/README.md`](frontend/demo/README.md)

## License

MIT
