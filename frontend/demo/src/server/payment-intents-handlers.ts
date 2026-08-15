/**
 * 发票系统 API 端点逻辑（纯函数，ALEO-MVP-012）。
 *
 * 与 `payment-intents-api.ts`（TanStack Start server fn 薄包装）分离，
 * 保证本文件**不依赖 @tanstack/react-start / react 生态**，vitest node 环境
 * 可直接 import 单测（避免 react CJS 解析噪音与句柄泄漏）。
 *
 * 行为契约：
 * - 输入非法（金额 / 商家地址 / metadata / expiresInMs）→ 400 + 规范化错误文案
 *   （复用 SDK createPayment 的 normalizeAmount / validateMerchant 语义）
 * - 幂等：同一 merchant + 同一规范化金额重复创建 → 返回已存在记录（200，不新建）
 * - 404：查询不存在的 invoice_id
 * - 过期：查询时惰性判定（expires_at 已过 → status: 'expired' 并清理）
 */

import {
  InputValidationError,
  jsonError,
  jsonOk,
  parseCreateIntentInput,
} from '../lib/payment-intents-api.js'
import { isValidAleoAddress } from './payment-intents-core.js'
import {
  InMemoryPaymentIntentStore,
  type PaymentIntentRecord,
} from '../lib/payment-intents-store.js'

/**
 * 全局内存 store（server 单例）。
 * MVP：进程内 Map；后续替换 SQLite 时实现 PaymentIntentStore 接口并在此注入。
 */
const defaultStore: InMemoryPaymentIntentStore = new InMemoryPaymentIntentStore()

declare global {
  // eslint-disable-next-line no-var
  var __kethyrpay_pi_store__: InMemoryPaymentIntentStore | undefined
}

/** 注入点：测试/高级用法可替换 store（见 tests/payment-intents-api.test.ts） */
export function setPaymentIntentStore(next: InMemoryPaymentIntentStore): void {
  globalThis.__kethyrpay_pi_store__ = next
}

/** 恢复默认 store（测试用） */
export function resetPaymentIntentStore(): void {
  globalThis.__kethyrpay_pi_store__ = defaultStore
}

function getStore(): InMemoryPaymentIntentStore {
  return globalThis.__kethyrpay_pi_store__ ?? defaultStore
}

/** 序列化辅助：避免返回内部可变引用 */
function toResponseRecord(record: PaymentIntentRecord): PaymentIntentRecord {
  return { ...record, transaction: { ...record.transaction } }
}

/* ------------------------------------------------------------------ */
/* 端点逻辑（纯函数，可单测）                                          */
/* ------------------------------------------------------------------ */

/**
 * POST /api/payment-intents — 创建支付意图（幂等 upsert）。
 * 响应：201 新建 / 200 幂等命中 / 400 输入非法。
 *
 * 入参形状与 createServerFn 的 handler 一致：`{ data: <请求体> }`。
 */
export async function handleCreatePaymentIntent(payload: unknown): Promise<Response> {
  const body = (payload as { data?: unknown })?.data ?? payload
  let input
  try {
    input = parseCreateIntentInput(body)
  } catch (err) {
    if (err instanceof InputValidationError) return jsonError(400, err.message)
    return jsonError(400, '请求体解析失败')
  }

  const before = getStore().size()
  const record = getStore().createPaymentIntent(input)
  // 幂等命中：create 前后 size 不变 → 返回已存在记录（HTTP 200）
  const isReplay = getStore().size() === before

  return jsonOk(
    {
      intent: toResponseRecord(record),
      idempotent: isReplay,
    },
    isReplay ? 200 : 201,
  )
}

/**
 * GET /api/payment-intents/:id — 查询支付意图。
 * 响应：200 命中（已过期 → 惰性判定为 expired 并清理，返回 404） / 404 不存在 / 400 空 id。
 */
export async function handleGetPaymentIntent(payload: unknown): Promise<Response> {
  const data = (payload as { data?: unknown })?.data ?? payload
  const invoiceId = typeof (data as { invoiceId?: unknown })?.invoiceId === 'string'
    ? (data as { invoiceId: string }).invoiceId.trim()
    : ''

  if (!invoiceId) return jsonError(400, 'invoiceId 不能为空')

  const record = getStore().getPaymentIntent(invoiceId)
  if (!record) return jsonError(404, `Payment intent not found: ${invoiceId}`)

  return jsonOk({ intent: toResponseRecord(record) })
}

/**
 * POST /api/payment-intents/:id/expire — 显式过期（惰性清理 + 外部状态驱动的补充入口）。
 */
export async function handleExpirePaymentIntent(payload: unknown): Promise<Response> {
  const data = (payload as { data?: unknown })?.data ?? payload
  const invoiceId = typeof (data as { invoiceId?: unknown })?.invoiceId === 'string'
    ? (data as { invoiceId: string }).invoiceId.trim()
    : ''

  if (!invoiceId) return jsonError(400, 'invoiceId 不能为空')

  const record = getStore().updateStatus(invoiceId, 'expired')
  if (!record) return jsonError(404, `Payment intent not found: ${invoiceId}`)

  return jsonOk({ intent: toResponseRecord(record) })
}

/**
 * GET /api/payment-intents?merchant=xxx — 按商家列出全部支付意图（商家后台数据源，ALEO-MVP-015）。
 * 响应：200 记录数组（可能为空）/ 400 缺 merchant 或格式非法。
 */
export async function handleListPaymentIntents(payload: unknown): Promise<Response> {
  const data = (payload as { data?: unknown })?.data ?? payload
  const merchant = typeof (data as { merchant?: unknown })?.merchant === 'string'
    ? (data as { merchant: string }).merchant.trim()
    : ''

  if (!merchant) return jsonError(400, 'merchant 不能为空')
  if (!isValidAleoAddress(merchant)) {
    return jsonError(400, `无效的商家地址：${merchant}`)
  }

  const records = getStore().listByMerchant(merchant)
  return jsonOk({ intents: records.map(toResponseRecord) })
}
