/**
 * 发票 API 校验与响应封装（ALEO-MVP-012）。
 *
 * - `parseCreateIntentInput`：解析 POST /api/payment-intents 请求体，非法输入抛
 *   `InputValidationError`（message 为规范化错误文案，API handler 转 400）。
 *   校验语义复用 SDK createPayment 内置的 normalizeAmount / validateMerchant。
 * - `jsonError` / `jsonOk`：统一 JSON 错误/成功响应，供 server function 返回
 *   `Response`（server fn 的 raw Response 会原样透传给客户端，见 server-functions-handler）。
 */

import { normalizeAmount, validateMerchant } from '../server/payment-intents-core.js'
import type { CreatePaymentIntentInput } from './payment-intents-store.js'

/** 输入校验错误：message 即规范化错误文案 */
export class InputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputValidationError'
  }
}

/** JSON 错误响应（status 默认 400） */
export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): Response {
  return Response.json(
    {
      error,
      ...extra,
    },
    { status },
  )
}

/** JSON 成功响应 */
export function jsonOk(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/**
 * 解析并校验 POST 请求体。
 * - 复用 SDK 语义：normalizeAmount（金额 > 0 且 ≥ 0.000001，规范化 6 位小数）、
 *   validateMerchant（aleo1 地址）
 * - 非法输入抛 InputValidationError，由 handler 统一转 400 + 规范化错误文案
 */
export function parseCreateIntentInput(raw: unknown): CreatePaymentIntentInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new InputValidationError('请求体必须是 JSON 对象')
  }
  const body = raw as Record<string, unknown>

  if (body.amount === undefined || body.amount === null || body.amount === '') {
    throw new InputValidationError('amount 必填')
  }
  if (body.merchant === undefined || body.merchant === null || body.merchant === '') {
    throw new InputValidationError('merchant 必填')
  }

  // 复用 SDK createPayment 的金额校验：抛错即非法（message 即规范化文案）
  let amount: string
  try {
    amount = normalizeAmount(body.amount as string | number)
  } catch (err) {
    throw new InputValidationError(
      err instanceof Error ? err.message : `Invalid payment amount: ${String(body.amount)}`,
    )
  }

  // 复用 SDK createPayment 的商家地址校验
  let merchant: string
  try {
    merchant = validateMerchant(body.merchant as string)
  } catch (err) {
    throw new InputValidationError(
      err instanceof Error ? err.message : `Invalid Aleo address: ${String(body.merchant)}`,
    )
  }

  // metadata：可选对象
  if (
    body.metadata !== undefined &&
    (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata))
  ) {
    throw new InputValidationError('metadata 必须是对象')
  }

  // expiresInMs：可选正数
  let expiresInMs: number | undefined
  if (body.expiresInMs !== undefined) {
    if (typeof body.expiresInMs !== 'number' || !Number.isFinite(body.expiresInMs)) {
      throw new InputValidationError('expiresInMs 必须是数字（毫秒）')
    }
    if (body.expiresInMs <= 0) {
      throw new InputValidationError('expiresInMs 必须为正数')
    }
    expiresInMs = body.expiresInMs
  }

  return {
    amount,
    merchant,
    metadata: body.metadata as Record<string, unknown> | undefined,
    expiresInMs,
  }
}
