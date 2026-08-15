/**
 * 发票系统最小持久化（ALEO-MVP-012）— server-only 内存 store。
 *
 * 设计：
 * - **内存 Map + 接口抽象**：MVP 阶段按 issue 要求（SQLite/内存即可）用内存实现，
 *   但通过 `PaymentIntentStore` 接口隔离，日后替换 SQLite/Redis 只需实现同一接口
 *   （`createPaymentIntent` 的签名已按 upsert 语义设计，适配 SQL 的 `ON CONFLICT`）。
 * - **幂等键**：`merchant + ':' + normalizedAmount`（createPayment 会规范化金额，
 *   与 SDK createPayment 的输入规范化对齐）；同一幂等键重复创建 → 返回已存在记录
 *   （HTTP 200），避免重复扣款/重复发票。
 * - **过期判定与惰性清理**：查询时发现 `expires_at` 已过 → 标记 `expired` 并删除；
 *   未过期的 pending 记录在查询时更新 `status`（沿用 v1 记录，保持幂等语义）。
 * - **server-only**：本模块只在 server 代码中使用（.server 目录或 server fn 内部）；
 *   client 侧请用 `payment-intents.ts`（仅类型与 API 客户端）。
 */

import type { PaymentIntent, CreatePaymentParams } from '@kethyrpay/sdk'
import {
  DEFAULT_EXPIRES_IN_MS,
  DEFAULT_PAYMENT_BASE_URL,
  generateInvoiceId,
  normalizeAmount,
  validateMerchant,
  createPayInvoiceTransaction,
} from '../server/payment-intents-core.js'

/** 支付意图状态（MVP：pending / paid / expired；paid 由外部 verifyPayment 驱动） */
export type PaymentIntentStatus = 'pending' | 'paid' | 'expired'

/**
 * 存储记录：SDK `PaymentIntent` + 持久化元数据。
 * 对齐 SDK PaymentIntent 类型，新增幂等键 / 创建时间 / 状态字段。
 */
export interface PaymentIntentRecord extends PaymentIntent {
  /** 幂等键（merchant + normalized amount），用于防重提交 */
  idempotencyKey: string
  /** 创建时间（ISO 8601） */
  createdAt: string
  /** 当前状态（默认 pending） */
  status: PaymentIntentStatus
}

/** POST /api/payment-intents 请求体 */
export interface CreatePaymentIntentInput {
  /** 金额（credits，字符串或数字） */
  amount: string | number
  /** 商家 aleo1 地址 */
  merchant: string
  /** 附加元数据（可选） */
  metadata?: Record<string, unknown>
  /** 过期时长（毫秒，默认 30 分钟） */
  expiresInMs?: number
}

/** 商家侧创建发票的最小参数（透传给 SDK createPayment） */
export type CreatePaymentIntentParams = CreatePaymentParams

/** 发票 store 接口：内存实现与未来 SQLite 实现共同遵守的契约 */
export interface PaymentIntentStore {
  /** 创建发票（幂等 upsert：同一幂等键返回已存在记录） */
  createPaymentIntent(params: CreatePaymentIntentParams): PaymentIntentRecord
  /** 按 invoice_id 查询；不存在返回 null */
  getPaymentIntent(invoiceId: string): PaymentIntentRecord | null
  /** 更新状态（verifyPayment 驱动 paid；惰性清理驱动 expired） */
  updateStatus(invoiceId: string, status: PaymentIntentStatus): PaymentIntentRecord | null
  /** 当前记录数（测试/诊断用） */
  size(): number
  /** 按商家列出全部记录（商家后台用，ALEO-MVP-015） */
  listByMerchant(merchant: string): PaymentIntentRecord[]
}

/** 构建幂等键：与 createPayment 的金额规范化一致（merchant + normalized amount） */
export function buildIdempotencyKey(merchant: string, amount: string): string {
  return `${merchant}:${amount}`
}

/**
 * 惰性过期判定：`expires_at` 已过 → 标记 expired 并移除（清理），返回 null；
 * 否则返回当前记录。
 */
export function maybeExpire(
  store: PaymentIntentStore,
  record: PaymentIntentRecord,
): PaymentIntentRecord | null {
  if (Date.parse(record.expires_at) <= Date.now()) {
    store.updateStatus(record.invoice_id, 'expired')
    return null
  }
  return record
}

/** 内存 Map 实现（MVP） */
export class InMemoryPaymentIntentStore implements PaymentIntentStore {
  private readonly records = new Map<string, PaymentIntentRecord>()

  /** 测试注入点：控制发票 ID 生成（默认使用 SDK 语义的随机 ID） */
  private readonly generateInvoiceId: () => string

  constructor(options: { generateInvoiceId?: () => string } = {}) {
    this.generateInvoiceId = options.generateInvoiceId ?? (() => generateInvoiceId('merchant'))
  }

  createPaymentIntent(params: CreatePaymentIntentParams): PaymentIntentRecord {
    const now = Date.now()

    // 规范化金额（与 SDK createPayment 一致）：数字/字符串 → 6 位小数字符串。
    // 幂等键基于规范化后的金额，保证 '2' 与 2 / '2.0' 视为同一发票。
    const amount = normalizeAmount(
      typeof params.amount === 'number' ? String(params.amount) : params.amount,
    )
    const idempotencyKey = buildIdempotencyKey(params.merchant, amount)

    // 幂等命中：同一 merchant + 同一金额重复创建 → 返回已存在记录（不生成新发票）
    const existing = this.findByKey(idempotencyKey)
    if (existing) return existing

    const invoice_id = this.generateInvoiceId()

    // 过期时长：与 SDK 语义一致（显式传 0/负数 → 默认 30 分钟）
    const expiresInMs =
      params.expiresInMs !== undefined && params.expiresInMs > 0
        ? params.expiresInMs
        : DEFAULT_EXPIRES_IN_MS

    // 复用 SDK createPayment 的构造逻辑（纯函数，不触 WASM）
    const intent = createPaymentIntentCore({
      amount,
      merchant: params.merchant,
      expiresInMs,
      invoice_id,
      createdAt: new Date(now).toISOString(),
    })

    const record: PaymentIntentRecord = {
      ...intent,
      idempotencyKey,
      createdAt: new Date(now).toISOString(),
      status: 'pending',
    }
    this.records.set(record.invoice_id, record)
    return record
  }

  getPaymentIntent(invoiceId: string): PaymentIntentRecord | null {
    const record = this.records.get(invoiceId)
    if (!record) return null
    return maybeExpire(this, record)
  }

  updateStatus(invoiceId: string, status: PaymentIntentStatus): PaymentIntentRecord | null {
    const record = this.records.get(invoiceId)
    if (!record) return null
    record.status = status
    if (status === 'expired') {
      // 惰性清理：过期记录直接移除
      this.records.delete(invoiceId)
    }
    return record
  }

  size(): number {
    return this.records.size
  }

  listByMerchant(merchant: string): PaymentIntentRecord[] {
    // 惰性过期清理：查询时同步剔除已过期记录，避免后台展示过期数据
    const records: PaymentIntentRecord[] = []
    for (const record of this.records.values()) {
      const active = maybeExpire(this, record)
      if (active && active.merchant === merchant) records.push(active)
    }
    // 最近创建在前（商家后台默认展示顺序）；createdAt 相同时按 invoice_id 兜底，
    // 保证同毫秒创建的记录排序确定（Array.sort 稳定，Map 按插入序）。
    return records.sort((a, b) => {
      const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt)
      if (byTime !== 0) return byTime
      return a.invoice_id < b.invoice_id ? 1 : -1
    })
  }

  private findByKey(idempotencyKey: string): PaymentIntentRecord | null {
    for (const record of this.records.values()) {
      if (record.idempotencyKey === idempotencyKey) return record
    }
    return null
  }
}

/**
 * 复用 SDK createPayment 的构造逻辑构造 PaymentIntent（server 端避免 WASM）。
 * 字段/语义与 SDK `KethyrPay.createPayment` 完全一致：
 * 金额规范化、商家地址校验、invoice_id、expires_at、payment_url、pay_invoice 交易参数。
 */
export function createPaymentIntentCore(params: {
  amount: string
  merchant: string
  expiresInMs: number
  invoice_id: string
  createdAt: string
}): PaymentIntent {
  const { amount, merchant, expiresInMs, invoice_id, createdAt } = params

  const expires_at = new Date(Date.parse(createdAt) + expiresInMs).toISOString()
  const payment_url = `${DEFAULT_PAYMENT_BASE_URL}/pay/${invoice_id}`

  // 校验并规范化金额 / 商家地址（与 SDK createPayment 相同语义；非法输入抛错 → 400）
  const normalizedAmount = normalizeAmount(amount)
  validateMerchant(merchant)

  const transaction = createPayInvoiceTransaction({
    invoiceId: invoice_id,
    amount: normalizedAmount,
    merchant,
  })

  return {
    invoice_id,
    amount: normalizedAmount,
    merchant,
    expires_at,
    payment_url,
    transaction,
  }
}
