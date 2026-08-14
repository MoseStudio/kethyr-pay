# @aleopay/sdk

AleoPay 最小 SDK（Hackathon ALEO-MVP-006/007/008）：TypeScript + Vite 构建，产出 ESM + 类型声明。

- **WASM 初始化**：封装 `@provablehq/sdk` 的 `initializeWasm()` + `initThreadPool(4)`，幂等
- **钱包适配器**：框架无关抽象（connect / disconnect / signTransaction / requestRecords / publicKey / connected），Shield 优先（client-only 动态加载），内置内存钱包便于测试
- **AleoPay 主类**：`static create()` 一次性完成 SDK / WASM / 钱包初始化
- **createPayment（ALEO-MVP-007）**：生成 `PaymentIntent`（发票 ID / 支付链接 / 过期时间），并携带 `pay_invoice` 交易参数
- **verifyPayment（ALEO-MVP-008）**：轮询 Testnet RPC 确认交易，返回 pending / confirmed / failed 状态机（端点可配置）
- **合约 helpers**：移植自 POC `contract.ts`（地址校验、credits 转换、u64/u32 编码、交易选项构造等）

## 安装

```bash
pnpm add @aleopay/sdk
# peer 依赖（宿主应用需自行安装）：
pnpm add @provablehq/sdk@^0.11.6 @provablehq/aleo-types @provablehq/aleo-wallet-adaptor-core @provablehq/aleo-wallet-adaptor-shield
```

## 最小示例

```ts
import { AleoPay } from '@aleopay/sdk'

// 初始化 SDK + WASM + Shield 钱包适配器
const aleoPay = await AleoPay.create({ autoConnect: true })
const buyer = aleoPay.getPublicKey() // aleo1...

// 创建支付意图（ALEO-MVP-007）
const intent = await aleoPay.createPayment({
  amount: '1.5',
  merchant: 'aleo1...merchant',
})
// → { invoice_id, amount, merchant, expires_at, payment_url, transaction }
// intent.transaction 可直接交给钱包 signTransaction（pay_invoice）

// 校验支付状态（ALEO-MVP-008）
const status = await aleoPay.verifyPayment(intent.invoice_id, { timeoutMs: 60_000 })
// → { status: 'pending' | 'confirmed' | 'failed', ... }
```

> `verifyPayment` 默认轮询 `https://api.testnet.aleo.org`（`AleoPayOptions.rpcEndpoint` 可覆盖）。

## 开发

```bash
pnpm install
pnpm build      # vite 库模式 → dist/index.js (ESM) + tsc → dist/*.d.ts
pnpm test       # vitest 单测
pnpm typecheck  # tsc --noEmit
```

## 公共 API

`initAleoSDK` / `createAccount` / `AleoAccount` · `PROGRAM_ID` / `DEFAULT_FEE` / `isValidAleoAddress` / `creditsToMicrocredits` / `microcreditsToCredits` / `encodeAddress` / `encodeU64` / `encodeU32` / `stripVisibilitySuffix` / `parsePaymentRecord` / `cleanRecordInput` / `createTransactionOptions` / `createPayInvoiceTransaction` · `WalletAdapter` / `createShieldAdapter` / `createMemoryWalletAdapter` / `walletAdapters` · `AleoPay` / `AleoPayOptions` / `generateInvoiceId` / `normalizeAmount` / `validateMerchant` · `pollPaymentStatus` / `createNetworkFetchTransaction` / `isTransactionConfirmed` / `extractPaymentReceipt` / `paymentIdToField` / `normalizePaymentError` · `PaymentIntent` / `PaymentStatus` / `CreatePaymentParams` / `VerifyPaymentOptions`
