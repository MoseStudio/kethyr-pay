/**
 * 发票系统 client 模块（ALEO-MVP-012 + ALEO-MVP-010 衔接层）。
 *
 * 类型 + API 客户端：
 * - `PaymentIntentRecord` / `PaymentIntentStatus` 等类型与 server store 完全一致
 *   （由本模块重新导出，避免 client 直接 import server-only 的 store 文件）。
 * - 与 REST 端点语义等价的函数：
 *   - `createPaymentIntentApi(input)` → POST /api/payment-intents
 *   - `getPaymentIntentApi(invoiceId)` → GET /api/payment-intents/:id
 *   - `expirePaymentIntentApi(invoiceId)` → POST /api/payment-intents/:id/expire
 *
 * Demo 模式（010 可独立演示的保证）：
 * - `buildDemoPaymentIntent` / `parseDemoParams` / `generateDemoInvoiceId`：
 *   后端未就绪 / 无发票 ID 时，用 SDK `createPayInvoiceTransaction` 现场构造
 *   PaymentIntent（不进后端），页面显示「发票信息加载中 / 无法加载」可回退 demo。
 *
 * 说明：调用方在 TanStack Start 应用中可改用 server fn（createServerFn）直连
 * server 侧实现（src/server/payment-intents-api.ts），本模块保留原生
 * fetch 版本，便于非 Start 环境 / 浏览器控制台 / 单元测试直接使用。
 */

import {
  createPayInvoiceTransaction,
  isValidAleoAddress,
  normalizeAmount,
  type PaymentIntent,
  type CreatePaymentParams,
} from '@kethyrpay/sdk'

/** 后端发票 API 的 base path（TanStack Start API 路由，012 并行实现） */
export const PAYMENT_INTENTS_API_BASE = '/api/payment-intents'

/** 支付意图状态（MVP：pending / paid / expired；paid 由外部 verifyPayment 驱动） */
export type PaymentIntentStatus = 'pending' | 'paid' | 'expired'

/** 存储记录：SDK `PaymentIntent` + 持久化元数据（与 server store 同构） */
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
  amount: string | number
  merchant: string
  metadata?: Record<string, unknown>
  expiresInMs?: number
}

export type CreatePaymentIntentParams = CreatePaymentParams

/** API 统一错误：status + 规范化错误文案 */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseResponse(res: Response): Promise<unknown> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // 非 JSON 错误体：保留默认文案
    }
    throw new ApiError(res.status, message)
  }
  return res.json()
}

/** POST /api/payment-intents */
export async function createPaymentIntentApi(
  input: CreatePaymentIntentInput,
): Promise<{ intent: PaymentIntentRecord; idempotent: boolean }> {
  const res = await fetch(`${PAYMENT_INTENTS_API_BASE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await parseResponse(res)) as { intent: PaymentIntentRecord; idempotent: boolean }
}

/** GET /api/payment-intents/:id */
export async function getPaymentIntentApi(
  invoiceId: string,
): Promise<{ intent: PaymentIntentRecord }> {
  const res = await fetch(`${PAYMENT_INTENTS_API_BASE}/${encodeURIComponent(invoiceId)}`)
  return (await parseResponse(res)) as { intent: PaymentIntentRecord }
}

/** POST /api/payment-intents/:id/expire — 显式过期 */
export async function expirePaymentIntentApi(
  invoiceId: string,
): Promise<{ intent: PaymentIntentRecord }> {
  const res = await fetch(`${PAYMENT_INTENTS_API_BASE}/${encodeURIComponent(invoiceId)}/expire`, {
    method: 'POST',
  })
  return (await parseResponse(res)) as { intent: PaymentIntentRecord }
}

/** GET /api/payment-intents?merchant=xxx — 按商家列出（ALEO-MVP-015 商家后台数据源） */
export async function listPaymentIntentsApi(
  merchant: string,
): Promise<{ intents: PaymentIntentRecord[] }> {
  const res = await fetch(
    `${PAYMENT_INTENTS_API_BASE}?merchant=${encodeURIComponent(merchant)}`,
  )
  return (await parseResponse(res)) as { intents: PaymentIntentRecord[] }
}

/* ------------------------------------------------------------------ */
/* Demo 模式辅助（ALEO-MVP-010：010 可独立演示的降级路径）              */
/* ------------------------------------------------------------------ */

/** 演示模式发票前缀（后端发票 ID 形如 inv_xxx，demo 也保持同构） */
const DEMO_INVOICE_PREFIX = 'inv_demo_'

/** demo 发票默认过期时长（30 分钟，与 SDK DEFAULT_EXPIRES_IN_MS 对齐） */
const DEMO_EXPIRES_IN_MS = 30 * 60 * 1000

/** 从 URL 读取 return_url（安全过滤：仅 http(s) / 相对路径，防 open redirect；SSR 安全） */
export function sanitizeReturnUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  // 仅接受绝对 http(s) 地址、协议相对地址或站内相对路径
  if (!/^(https?:)?\/\//.test(trimmed) && !trimmed.startsWith('/')) return undefined
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const url = new URL(trimmed, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.href
  } catch {
    return undefined
  }
}

/**
 * 解析 /pay/:invoiceId 的 demo 查询参数，返回可构造的 PaymentIntent 输入。
 * 仅当 amount + merchant 同时有效时才启用 demo 模式（all-or-nothing），
 * 避免页面出现「只有金额没有商家」的半成品状态。
 * `invoice_record`（可选）：商家转移后附带的 InvoiceRecord 明文，
 * 付款人带此参数打开 Checkout 时 pay_invoice 交易直接引用记录。
 */
function stripSurroundingQuotes(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim()
  }
  return t
}

export function parseDemoParams(search: Record<string, unknown>): {
  amount?: string
  merchant?: string
  returnUrl?: string
  invoiceRecord?: string
} {
  const rawAmount = typeof search.amount === 'string' ? search.amount.trim() : undefined
  const amount = rawAmount ? stripSurroundingQuotes(rawAmount) : undefined
  const merchant =
    typeof search.merchant === 'string' ? search.merchant.trim() : undefined
  const returnUrl =
    typeof search.return_url === 'string' ? search.return_url.trim() : undefined
  const invoiceRecord =
    typeof search.invoice_record === 'string'
      ? search.invoice_record.trim()
      : undefined

  const amountValid = amount !== undefined && amount !== '' && Number(amount) > 0
  const merchantValid = merchant !== undefined && isValidAleoAddress(merchant)

  if (!amountValid || !merchantValid) {
    return { returnUrl: sanitizeReturnUrl(returnUrl) }
  }

  return {
    amount,
    merchant,
    returnUrl: sanitizeReturnUrl(returnUrl),
    invoiceRecord: invoiceRecord && invoiceRecord.length > 0 ? invoiceRecord : undefined,
  }
}

/** 生成 demo 模式的发票 ID（确定性种子 + 时间戳，URL 友好） */
export function generateDemoInvoiceId(seed: string, now = Date.now()): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return `${DEMO_INVOICE_PREFIX}${(hash >>> 0).toString(16).padStart(8, '0')}${now
    .toString(36)
    .slice(-6)}`
}

/**
 * demo 模式构造 PaymentIntent：
 * - `transaction` 字段是个**模板占位**——v3 原子结算要求付款人在签名时
 *   现场注入 `invoiceRecord`（商家铸造给付款人后由付款人钱包扫描）和
 *   `token`（付款人的 private credits record）。这两个输入与具体钱包
 *   绑定，无法在 PaymentIntent 创建时预知。
 * - 实际签名路径在 `pay.$invoiceId.tsx` 的 handlePay：扫描 wallet →
 *   `createPayInvoiceTransaction({ invoiceRecord, token, ... })` 现场
 *   构造真正的 4-input 交易后再签名。
 * - 这里仍然填一个 3-input 占位（满足 PaymentIntent 类型约束 +
 *   调试可见），但**该 payload 永远不会被钱包签名**。
 */
export function buildDemoPaymentIntent(params: {
  invoiceId: string
  amount: string
  merchant: string
  expiresInMs?: number
  paymentBaseUrl?: string
  /** InvoiceRecord 明文（Leo 记录字面量）；付款人 wallet 扫描的备选 */
  invoiceRecord?: string
}): PaymentIntent {
  const amount = normalizeAmount(params.amount)
  if (!isValidAleoAddress(params.merchant)) {
    throw new Error(`Invalid merchant address: ${params.merchant}`)
  }
  const expiresInMs = params.expiresInMs ?? DEMO_EXPIRES_IN_MS
  const expires_at = new Date(Date.now() + expiresInMs).toISOString()
  const base = params.paymentBaseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')

  return {
    invoice_id: params.invoiceId,
    amount,
    merchant: params.merchant,
    expires_at,
    payment_url: `${base}/pay/${params.invoiceId}`,
    // 模板占位：v3 4-input 真正的 payload 由付款人侧 handlePay 扫描 wallet 后构造。
    transaction: createPayInvoiceTransaction({
      invoiceId: params.invoiceId,
      amount,
      merchant: params.merchant,
    }),
  }
}

/**
 * GET 发票（兼容别名）：按 invoice_id 查询后端发票 API，返回 PaymentIntent。
 * 后端未就绪（网络错误 / 非 404 的失败）时抛出带 `notReady: true` 标记的错误，
 * 页面据此降级到 demo 模式提示。404 视为「发票不存在」也带 notReady 标记
 * （发票可能由 demo 链接或未同步的商家生成）。
 */
export async function fetchPaymentIntent(invoiceId: string): Promise<PaymentIntent> {
  const error = (message: string): Error & { notReady?: boolean } => {
    const e = new Error(message) as Error & { notReady?: boolean }
    e.notReady = true
    return e
  }

  try {
    const { intent } = await getPaymentIntentApi(invoiceId)
    return intent
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw error(`发票 ${invoiceId} 不存在（HTTP 404）。`)
    }
    throw error(
      `无法加载发票（${err instanceof Error ? err.message : '未知错误'}）。后端未就绪时可使用 demo 参数。`,
    )
  }
}

/**
 * POST 创建发票（兼容别名）：创建 PaymentIntent 并返回 { invoice_id, payment_url }，
 * 供页面跳转到 /pay/:invoiceId 使用。
 */
export async function createPaymentIntent(params: {
  amount: string
  merchant: string
  returnUrl?: string
}): Promise<{ invoice_id: string; payment_url?: string }> {
  const { intent } = await createPaymentIntentApi({
    amount: normalizeAmount(params.amount),
    merchant: params.merchant,
  })
  return { invoice_id: intent.invoice_id, payment_url: intent.payment_url }
}
