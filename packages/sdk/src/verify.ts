/**
 * verifyPayment 轮询核心（ALEO-MVP-008）。
 *
 * 设计：
 * - 纯函数 + 依赖注入：`pollPaymentStatus` 接受 `fetchTransaction` 回调，
 *   便于单测注入 mock，避免真实网络 / WASM 依赖。
 * - 默认 `createNetworkFetchTransaction` 使用 `@provablehq/sdk` 的
 *   `AleoNetworkClient`（懒加载，仅在实际轮询时初始化），端点可配置。
 * - 状态机：pending → confirmed | failed；超时 → failed（规范化错误）。
 */

import type { TransactionJSON } from '@provablehq/sdk/testnet.js'
import type { PaymentStatus } from './types.js'

/** 默认 Testnet RPC 端点（官方 beacon 节点，AleoNetworkClient 会附加 /testnet） */
export const DEFAULT_RPC_ENDPOINT = 'https://api.testnet.aleo.org'

/** 默认轮询超时（60 秒） */
export const DEFAULT_POLL_TIMEOUT_MS = 60_000

/** 默认轮询间隔（3 秒） */
export const DEFAULT_POLL_INTERVAL_MS = 3_000

/** 轮询配置 */
export interface VerifyPaymentOptions {
  /** 超时（毫秒，默认 60 秒） */
  timeoutMs?: number
  /** 轮询间隔（毫秒，默认 3 秒） */
  intervalMs?: number
  /** RPC 端点（默认 https://api.testnet.aleo.org） */
  rpcEndpoint?: string
  /**
   * 链上交易 ID（at1...）。由支付方在签名广播后获得，用于轮询确认；
   * 缺省时回退到 paymentId（发票 ID）——仅适用于测试/内部路径，
   * 真实链路必须传交易 ID（getTransaction 需要交易 ID）。
   */
  transactionId?: string
  /**
   * 期望支付金额（credits，十进制字符串）。Aleo 隐私模型下链上金额是
   * 密文，付款人侧无法从 RPC 交易直接解析明文；确认成功时用该值作为
   * 回执金额（付款人支付时已知的金额即正确金额）。
   */
  expectedAmount?: string
}

/** 按交易 ID 查询链上交易的回调（测试注入点） */
export type FetchTransaction = (transactionId: string) => Promise<TransactionJSON | null>

/**
 * 将支付意图 ID（如 "inv_1a2b3c4d"）映射为合约 `invoice_id` field 的十进制数值。
 *
 * 合约 `InvoiceRecord.invoice_id` 是 `field`（数字），而 `PaymentIntent.invoice_id`
 * 是 `inv_...` 展示 ID。两者通过确定性哈希关联：同一种子 → 同一 field 值。
 * verifyPayment 用该值匹配链上记录，避免解析歧义。
 */
export function paymentIdToField(paymentId: string): string {
  let hash = 0
  for (let i = 0; i < paymentId.length; i++) {
    hash = (hash * 31 + paymentId.charCodeAt(i)) | 0
  }
  // 转成正数（field 无符号）
  return (hash >>> 0).toString()
}

/**
 * 默认 fetchTransaction：通过 AleoNetworkClient 查询 Testnet RPC。
 * 懒加载 @provablehq/sdk（WASM 较重，仅在实际轮询时初始化）。
 */
export function createNetworkFetchTransaction(
  rpcEndpoint = DEFAULT_RPC_ENDPOINT,
): FetchTransaction {
  let clientPromise: Promise<AleoNetworkClient> | null = null

  async function getClient(): Promise<AleoNetworkClient> {
    // 动态导入，避免在非 WASM 环境（如纯单测）强制加载
    const { AleoNetworkClient } = await import('@provablehq/sdk/testnet.js')
    return new AleoNetworkClient(rpcEndpoint)
  }

  return async (transactionId: string): Promise<TransactionJSON | null> => {
    clientPromise ??= getClient()
    const client = await clientPromise
    try {
      return await client.getTransaction(transactionId)
    } catch (error) {
      // 404 / 未找到 → null（交易尚未确认）；其余错误上抛由调用方规范化
      const message = error instanceof Error ? error.message : String(error)
      if (/not found|no transaction|404/i.test(message)) {
        return null
      }
      throw error
    }
  }
}

// AleoNetworkClient 类型（仅用于 createNetworkFetchTransaction 的返回类型标注）
type AleoNetworkClient = import('@provablehq/sdk/testnet.js').AleoNetworkClient

/** 从 TransactionJSON 提取 execution 中的 transition 列表 */
function extractTransitions(tx: TransactionJSON): Array<{
  function?: string
  inputs?: unknown[]
}> {
  const execution = tx.execution as
    | { transitions?: Array<{ function?: string; inputs?: unknown[] }> }
    | undefined
  if (execution?.transitions?.length) return execution.transitions
  return []
}

/** 从 transition inputs 提取 InvoiceRecord / PaymentRecord 相关字段 */
function extractRecordFields(inputs: unknown[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const input of inputs) {
    if (typeof input !== 'object' || input === null) continue
    const obj = input as Record<string, unknown>
    if (typeof obj.value === 'string' && obj.value.startsWith('{')) {
      const record = obj.value
      const merchant = /merchant:\s*(aleo1[a-z0-9]{58})/.exec(record)
      const amount = /amount:\s*([0-9]+u64)/.exec(record)
      const invoiceId = /invoice_id:\s*([0-9]+field)/.exec(record)
      if (merchant) fields.merchant = merchant[1]
      if (amount) fields.amount = amount[1]
      if (invoiceId) fields.invoice_id = invoiceId[1]
    }
  }
  return fields
}

/** 判断交易是否已上链（confirmed）且包含指定发票 */
export function isTransactionConfirmed(
  transaction: TransactionJSON | null,
  paymentId: string,
): boolean {
  if (!transaction) return false

  const expectedField = paymentIdToField(paymentId)

  // 节点返回的 transaction（getTransaction）已包含 execution 即视为已广播/上链；
  // 进一步校验 transition 是否命中 pay_private.aleo 的 pay_invoice 且发票 field 匹配。
  const transitions = extractTransitions(transaction)
  for (const transition of transitions) {
    const fn = transition.function ?? ''
    const isPayInvoice = /pay_invoice/.test(fn) || /pay_private(_v[23])?\.aleo/.test(fn)
    if (!isPayInvoice) continue

    const fields = extractRecordFields(transition.inputs ?? [])
    if (fields.invoice_id) {
      return fields.invoice_id.replace(/field$/, '') === expectedField
    }
    // 无 invoice_id 字段但函数匹配 → 认为已确认（容错）
    return true
  }

  return false
}

/** 从已确认交易提取回执数据（金额 / invoice_id），失败返回 null */
export function extractPaymentReceipt(
  transaction: TransactionJSON | null,
  paymentId: string,
): { amount: string; invoice_id: string } | null {
  if (!transaction) return null

  const transitions = extractTransitions(transaction)
  for (const transition of transitions) {
    const fields = extractRecordFields(transition.inputs ?? [])
    if (fields.amount) {
      return {
        amount: fields.amount.replace(/u64$/, ''),
        // 统一返回支付意图 ID（与 PaymentStatus.invoice_id 语义一致）
        invoice_id: paymentId,
      }
    }
  }
  return null
}

/**
 * 规范化错误信息：网络 / RPC / 解析错误 → 可读的 failed 文案。
 */
export function normalizePaymentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/network|fetch|timeout|ECONN|socket/i.test(message)) {
    return `网络错误：${message}`
  }
  if (/not found|no transaction/i.test(message)) {
    return '交易未找到（可能尚未广播或已被拒绝）'
  }
  if (/replay|duplicate|already|balance|insufficient/i.test(message)) {
    return `交易被链上拒绝：${message}`
  }
  return `支付校验失败：${message}`
}

/** 交易是否属于永久失败（重放 / 重复 / 余额不足等） */
export function isPermanentFailure(message: string): boolean {
  return /replay|duplicate|already paid|insufficient balance|expired/i.test(message)
}

/**
 * 轮询支付状态（核心状态机）。
 *
 * @param paymentId 发票 ID（invoice_id）
 * @param fetchTransaction 按交易 ID 查询链上交易的函数
 * @param options 轮询配置
 * @returns PaymentStatus（pending 在超时前持续返回；超时返回 failed）
 */
export async function pollPaymentStatus(
  paymentId: string,
  fetchTransaction: FetchTransaction,
  options: VerifyPaymentOptions = {},
): Promise<PaymentStatus> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  // 链上查询用交易 ID（真实链路由支付方提供）；缺省回退 paymentId（测试/内部路径）
  const transactionId = options.transactionId ?? paymentId

  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null

  // 立即查询一次，随后按间隔轮询
  for (;;) {
    try {
      const tx = await fetchTransaction(transactionId)
      if (tx && isTransactionConfirmed(tx, paymentId)) {
        const receipt = extractPaymentReceipt(tx, paymentId)
        return {
          status: 'confirmed',
          transaction_id: tx.id ?? paymentId,
          // 隐私模型下链上金额是密文，付款人侧无法解析明文；
          // 有 expectedAmount 时用它（付款人支付时已知的金额即正确金额）。
          amount:
            options.expectedAmount ??
            receipt?.amount ??
            '0',
          invoice_id: receipt?.invoice_id ?? paymentId,
        }
      }
      // 未确认 → 继续轮询
      lastError = null
    } catch (error) {
      lastError = error
      if (isPermanentFailure(normalizePaymentError(error))) {
        return {
          status: 'failed',
          error: normalizePaymentError(error),
        }
      }
    }

    if (Date.now() + intervalMs >= deadline) {
      // 最后一次尝试后仍未确认 → 超时
      break
    }
    await sleep(intervalMs)
  }

  return {
    status: 'failed',
    error:
      lastError === null
        ? `支付确认超时（${timeoutMs}ms 内未在链上找到发票 ${paymentId}）`
        : normalizePaymentError(lastError),
  }
}

/** 可注入的 sleep（默认 setTimeout Promise 封装，测试可替换） */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
