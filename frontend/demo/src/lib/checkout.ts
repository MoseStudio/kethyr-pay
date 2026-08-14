/**
 * Checkout / 状态页的纯逻辑 helpers（ALEO-MVP-010 / 011）。
 *
 * 与 React 解耦，便于 vitest 单测：
 * - 过期倒计时计算
 * - 支付错误分类（余额不足 / 重复支付 / 过期 / 网络 / 未知）
 * - 状态页查询参数解析
 */

/** 支付错误类别（页面据此渲染不同的提示与重试入口） */
export type PaymentErrorKind =
  | 'insufficient-balance'
  | 'duplicate-payment'
  | 'expired'
  | 'network'
  | 'unknown'

export const PAYMENT_ERROR_KINDS: Record<PaymentErrorKind, string> = {
  'insufficient-balance': '余额不足',
  'duplicate-payment': '重复支付',
  expired: '发票已过期',
  network: '网络错误',
  unknown: '未知错误',
}

/** 将 SDK / 钱包抛出的错误归类为可读的失败类别 */
export function classifyPaymentError(error: unknown): {
  kind: PaymentErrorKind
  message: string
} {
  const message = error instanceof Error ? error.message : String(error)
  if (/insufficient|balance|not enough|lack of funds/i.test(message)) {
    return { kind: 'insufficient-balance', message }
  }
  if (/replay|duplicate|already paid|already.*paid|repeat/i.test(message)) {
    return { kind: 'duplicate-payment', message }
  }
  if (/expired|过期/i.test(message)) {
    return { kind: 'expired', message }
  }
  if (/network|fetch|ECONN|socket|timeout|timed out/i.test(message)) {
    return { kind: 'network', message }
  }
  return { kind: 'unknown', message }
}

/** 计算发票剩余毫秒（expires_at ISO 字符串 → 剩余时间），已过期返回 0 */
export function getRemainingMs(expiresAt: string | undefined, now = Date.now()): number {
  if (!expiresAt) return 0
  const target = new Date(expiresAt).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, target - now)
}

/** 将剩余毫秒格式化为 mm:ss 或 h:mm:ss */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** 截断长地址用于展示（如 aleo1abcd...wxyz） */
export function truncateAddress(address: string, head = 10, tail = 8): string {
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}

/** 状态页查询参数解析（tx / return_url / rpc） */
export function parseStatusSearch(search: Record<string, unknown>): {
  txId?: string
  returnUrl?: string
  rpcEndpoint?: string
} {
  const txId = typeof search.tx === 'string' && search.tx.trim() ? search.tx.trim() : undefined
  const rpcEndpoint =
    typeof search.rpc === 'string' && search.rpc.trim() ? search.rpc.trim() : undefined
  const returnUrl = sanitizeHttpUrl(
    typeof search.return_url === 'string' ? search.return_url.trim() : undefined,
  )
  return { txId, returnUrl, rpcEndpoint }
}

/** 仅接受 http(s) 绝对地址（防 open redirect）；无效返回 undefined */
export function sanitizeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.href
  } catch {
    return undefined
  }
}

/** 轮询进度（0..1），基于已用时间 / 总超时 */
export function pollProgress(elapsedMs: number, timeoutMs: number): number {
  if (timeoutMs <= 0) return 0
  return Math.min(1, Math.max(0, elapsedMs / timeoutMs))
}
