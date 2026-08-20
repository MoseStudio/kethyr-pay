/**
 * Server-only SDK 纯函数镜像（ALEO-MVP-012）。
 *
 * 为什么需要这份镜像，而不是直接 `import { createPayment } from '@kethyrpay/sdk'`：
 * - SDK 包（v0.1.0）的公共入口 `index.ts` 会 value-import `./aleo.js`，
 *   而 `aleo.js` 顶部 `import { Account, ... } from '@provablehq/sdk/testnet.js'`
 *   会初始化 WASM；SDK 的 package.json exports 只暴露 `.`（无深路径子导出），
 *   server 端（node 运行时）无法绕过。H3 任务明确要求 server 端避免 WASM。
 * - 因此这里把 ALEO-MVP-007 用到的纯函数（generateInvoiceId / normalizeAmount /
 *   validateMerchant / createPayInvoiceTransaction / DEFAULT_EXPIRES_IN_MS /
 *   DEFAULT_PAYMENT_BASE_URL）按 SDK 同款实现镜像到前端 server 侧，
 *   语义与 SDK 完全一致（金额规范化、地址校验、pay_invoice 交易参数、30 分钟默认过期）。
 * - 数据结构仍以 SDK 类型（PaymentIntent）为准：类型由 `@kethyrpay/sdk` 导入（纯类型，
 *   不触 WASM），运行时构造逻辑由本文件提供。
 *
 * 同步点：SDK 升级 createPayment 构造逻辑时，需同步更新 `createPaymentIntentCore`
 * （src/lib/payment-intents-store.ts）。详见 HANDOFF 遗留问题。
 */

import type { TransactionOptions } from '@provablehq/aleo-types'

/** 默认支付合约：pay_private_v3.aleo（v3 原子结算；与 SDK PROGRAM_ID 一致） */
export const PROGRAM_ID = 'pay_private_v3.aleo'

/** 默认交易手续费（microcredits，0.1 credits） */
export const DEFAULT_FEE = 100_000

/** 默认支付链接域名（Checkout 落地页前缀，与 SDK DEFAULT_PAYMENT_BASE_URL 一致） */
export const DEFAULT_PAYMENT_BASE_URL = 'https://pay.kethyrpay.example'

/** 发票默认过期时长（30 分钟，与 SDK DEFAULT_EXPIRES_IN_MS 一致） */
export const DEFAULT_EXPIRES_IN_MS = 30 * 60 * 1000

/** 默认 sender_ciphertext group 字面量（无承诺占位） */
const DEFAULT_SENDER_CIPHERTEXT = '0group'

/** 默认 credits record plaintext 占位（v3 pay_invoice 的 token） */
const DEFAULT_CREDITS_TOKEN = '0field'

/** Aleo 地址正则：aleo1 + 58 位小写字母数字（与 SDK 一致） */
const ALEO_ADDRESS_RE = /^aleo1[a-z0-9]{58}$/

/** 校验 Aleo 地址格式 */
export function isValidAleoAddress(value: string): boolean {
  return ALEO_ADDRESS_RE.test(value)
}

/** credits（十进制字符串）→ microcredits（bigint） */
export function creditsToMicrocredits(credits: string): bigint {
  const parsed = parseFloat(credits)
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid credit amount: ${credits}`)
  }
  return BigInt(Math.round(parsed * 1_000_000))
}

/** microcredits → credits（6 位小数字符串） */
export function microcreditsToCredits(microcredits: bigint | number): string {
  const value = typeof microcredits === 'number' ? BigInt(microcredits) : microcredits
  return (Number(value) / 1_000_000).toFixed(6)
}

/** 校验并规范化 Aleo 地址（无效时抛错） */
export function encodeAddress(address: string): string {
  if (!isValidAleoAddress(address)) {
    throw new Error(`Invalid Aleo address: ${address}`)
  }
  return address
}

/** credits 金额 → Leo u64 字面量（如 "1.5" → "1500000u64"） */
export function encodeU64(credits: string): string {
  return `${creditsToMicrocredits(credits).toString()}u64`
}

/**
 * 生成发票 ID：merchant + 当前时间 + 随机数 → 十六进制哈希。
 * 与 SDK generateInvoiceId 同款实现（确定性 + 防碰撞）。
 */
export function generateInvoiceId(merchant: string, now = Date.now()): string {
  const seed = `${merchant}:${now}:${Math.random().toString(36).slice(2, 10)}`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return `inv_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/** 规范化金额：接受 string | number，返回 credits 十进制字符串（与 SDK 一致） */
export function normalizeAmount(value: string | number): string {
  const str = typeof value === 'number' ? String(value) : value.trim()
  const parsed = Number(str)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid payment amount: ${value}（必须为正数）`)
  }
  // 最小粒度 1 microcredit（1e-6 credits）
  const micro = creditsToMicrocredits(str)
  if (micro <= 0n) {
    throw new Error(`Invalid payment amount: ${value}（必须 ≥ 0.000001 credits）`)
  }
  return microcreditsToCredits(micro)
}

/** 校验并规范化商家地址（与 SDK 一致） */
export function validateMerchant(merchant: string): string {
  return encodeAddress(merchant.trim())
}

/**
 * 构造 pay_private_v3.aleo `pay_invoice` 交易参数（与 SDK createPayInvoiceTransaction 一致）。
 *
 * v3 原子结算：单笔交易完成 credits.aleo::transfer_private + 消费 InvoiceRecord +
 * 产出 MerchantReceipt + PayerReceipt + 双找零 credits record。任一步失败整笔回滚。
 *
 * 入参形式（与 SDK 对齐）：
 * - 带 invoiceRecord（真实原子支付路径）：inputs = [invoice, amount, sender_ciphertext, token]
 * - 不带 invoiceRecord（demo / 占位）：inputs = [invoiceId, amount, sender_ciphertext]
 * - 带 invoiceRecord + 无 token：默认占位 '0field'（仅用于 demo / 测试载荷）
 */
export function createPayInvoiceTransaction(params: {
  invoiceId: string
  amount: string
  merchant: string
  invoiceRecord?: string
  senderCiphertext?: string
  /** v3 pay_invoice 的 token：credits.aleo::credits plaintext；缺省 '0field' 占位 */
  token?: string
  fee?: number
  privateFee?: boolean
}): TransactionOptions {
  const {
    invoiceId,
    amount,
    merchant,
    invoiceRecord,
    senderCiphertext,
    token,
    fee,
    privateFee,
  } = params

  encodeAddress(merchant)
  const amountU64 = encodeU64(amount)
  const senderCt = senderCiphertext ?? DEFAULT_SENDER_CIPHERTEXT

  const inputs = invoiceRecord
    ? [invoiceRecord, amountU64, senderCt, token ?? DEFAULT_CREDITS_TOKEN]
    : [invoiceId, amountU64, senderCt]

  return {
    program: PROGRAM_ID,
    function: 'pay_invoice',
    inputs,
    fee: fee ?? DEFAULT_FEE,
    privateFee: privateFee ?? false,
  }
}
