/**
 * KethyrPay 主类：一次性完成 SDK / WASM / 钱包初始化。
 *
 * - `KethyrPay.create()`：静态工厂，幂等初始化 Aleo WASM SDK + 创建钱包适配器
 * - `connectWallet()` / `disconnectWallet()` / `getPublicKey()`：钱包生命周期
 * - `createPayment()` / `verifyPayment()`：ALEO-MVP-007 / 008 的**类型签名占位**，
 *   当前抛 NotImplementedError，后续 wave 直接填充实现（依赖 contract.ts 的编码 helpers）
 */

import { initAleoSDK } from './aleo.js'
import {
  createShieldAdapter,
  type WalletAdapter,
} from './wallet.js'
import {
  creditsToMicrocredits,
  microcreditsToCredits,
  encodeAddress,
  createPayInvoiceTransaction,
} from './contract.js'
import {
  createNetworkFetchTransaction,
  pollPaymentStatus,
  DEFAULT_RPC_ENDPOINT,
  type VerifyPaymentOptions,
  type FetchTransaction,
} from './verify.js'
import type {
  CreatePaymentParams,
  PaymentIntent,
  PaymentStatus,
} from './types.js'

/** 未实现错误：用于后续 wave 的占位方法 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`[KethyrPay] ${feature} 尚未实现`)
    this.name = 'NotImplementedError'
  }
}

/** 默认支付链接域名（Checkout 落地页前缀，商家可覆盖） */
export const DEFAULT_PAYMENT_BASE_URL = 'https://pay.kethyrpay.example'

/** 发票默认过期时长（30 分钟） */
export const DEFAULT_EXPIRES_IN_MS = 30 * 60 * 1000

/**
 * 生成发票 ID：merchant + 当前时间 + 随机数 → 十六进制哈希。
 * 确定性（同一输入同一输出）且足够随机（防碰撞/重放）。
 */
export function generateInvoiceId(merchant: string, now = Date.now()): string {
  const seed = `${merchant}:${now}:${Math.random().toString(36).slice(2, 10)}`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return `inv_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/** 规范化金额：接受 string | number，返回 credits 十进制字符串 */
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

/** 校验并规范化商家地址 */
export function validateMerchant(merchant: string): string {
  return encodeAddress(merchant.trim())
}

/** KethyrPay 构造选项 */
export interface KethyrPayOptions {
  /** 钱包适配器工厂：默认使用 createShieldAdapter()（浏览器）；传入 memory 便于测试/本地开发 */
  wallet?: () => Promise<WalletAdapter> | WalletAdapter
  /** 是否跳过 WASM 初始化（默认 false；测试或纯内存场景可置 true） */
  skipWasmInit?: boolean
  /** 初始化后自动连接钱包（默认 false） */
  autoConnect?: boolean
  /** 支付链接域名前缀（默认 DEFAULT_PAYMENT_BASE_URL） */
  paymentBaseUrl?: string
  /** Testnet RPC 端点（verifyPayment 轮询用，默认 https://api.testnet.aleo.org） */
  rpcEndpoint?: string
  /** 测试/高级用法：自定义链上交易查询函数（默认 AleoNetworkClient） */
  fetchTransaction?: FetchTransaction
}

/**
 * KethyrPay 主类。
 *
 * 用法：
 * ```ts
 * const kethyrPay = await KethyrPay.create()
 * const publicKey = await kethyrPay.connectWallet()
 * ```
 */
export class KethyrPay {
  /** 钱包适配器（框架无关） */
  readonly wallet: WalletAdapter

  /** WASM 是否已完成初始化 */
  private _wasmReady = false

  /** 支付链接域名前缀 */
  private readonly _paymentBaseUrl: string

  /** Testnet RPC 端点 */
  private readonly _rpcEndpoint: string

  /** 测试注入点：自定义 fetchTransaction（默认走网络客户端） */
  private readonly _fetchTransactionOverride?: FetchTransaction

  private constructor(
    wallet: WalletAdapter,
    wasmReady: boolean,
    paymentBaseUrl: string,
    rpcEndpoint: string,
    fetchTransactionOverride?: FetchTransaction,
  ) {
    this.wallet = wallet
    this._wasmReady = wasmReady
    this._paymentBaseUrl = paymentBaseUrl
    this._rpcEndpoint = rpcEndpoint
    this._fetchTransactionOverride = fetchTransactionOverride
  }

  /**
   * 静态工厂：完成 SDK / WASM / 钱包初始化。
   *
   * - 默认走浏览器 Shield 钱包（createShieldAdapter，client-only）
   * - `skipWasmInit: true` 时跳过 initializeWasm / initThreadPool
   *   （测试或服务端场景；createAccount() 等 WASM 能力不可用）
   */
  static async create(options: KethyrPayOptions = {}): Promise<KethyrPay> {
    let wasmReady = false

    if (!options.skipWasmInit) {
      await initAleoSDK()
      wasmReady = true
    }

    const walletFactory = options.wallet ?? createShieldAdapter
    const wallet = await walletFactory()

    const instance = new KethyrPay(
      wallet,
      wasmReady,
      options.paymentBaseUrl ?? DEFAULT_PAYMENT_BASE_URL,
      options.rpcEndpoint ?? DEFAULT_RPC_ENDPOINT,
      options.fetchTransaction,
    )
    if (options.autoConnect) {
      await instance.connectWallet()
    }
    return instance
  }

  /** WASM 是否已就绪 */
  get wasmReady(): boolean {
    return this._wasmReady
  }

  /** 钱包是否已连接 */
  get connected(): boolean {
    return this.wallet.connected
  }

  /** 连接钱包，返回账户地址（aleo1...） */
  connectWallet(): Promise<string> {
    return this.wallet.connect()
  }

  /** 断开钱包 */
  disconnectWallet(): Promise<void> {
    return this.wallet.disconnect()
  }

  /** 当前账户地址（未连接为 null） */
  getPublicKey(): string | null {
    return this.wallet.publicKey
  }

  /** 请求指定程序的记录（委托给钱包适配器） */
  requestRecords(program: string, includePlaintext?: boolean): Promise<unknown[]> {
    return this.wallet.requestRecords(program, includePlaintext)
  }

  /**
   * 创建支付意图（ALEO-MVP-007）。
   *
   * 校验金额与商家地址，生成 invoice_id 与过期时间，并构造 v3
   * `pay_invoice` 交易参数（可通过 `intent.transaction` 直接交给钱包
   * signTransaction；v3 原子结算：credits.aleo::transfer_private +
   * 消费 InvoiceRecord + 双 Receipt 产出在单笔交易内完成，任一步失败整笔回滚）。
     */
  async createPayment(params: CreatePaymentParams): Promise<PaymentIntent> {
    const amount = normalizeAmount(params.amount)
    const merchant = validateMerchant(params.merchant)
    const invoice_id = generateInvoiceId(merchant)

    const expiresInMs =
      params.expiresInMs !== undefined && params.expiresInMs > 0
        ? params.expiresInMs
        : DEFAULT_EXPIRES_IN_MS
    const expires_at = new Date(Date.now() + expiresInMs).toISOString()

    const payment_url = `${this._paymentBaseUrl}/pay/${invoice_id}`

    return {
      invoice_id,
      amount,
      merchant,
      expires_at,
      payment_url,
      // 供 Checkout 页直接消费的交易参数
      transaction: createPayInvoiceTransaction({
        invoiceId: invoice_id,
        amount,
        merchant,
      }),
    }
  }

  /**
   * 校验支付状态（ALEO-MVP-008）。
   *
   * 轮询 Testnet RPC 确认交易，返回 pending / confirmed / failed 状态机。
   * - `paymentId`：发票 ID（invoice_id）
   * - `options.timeoutMs`：超时（默认 60 秒）；超时返回 failed
   * - `options.rpcEndpoint`：可覆盖构造时的端点
   */
  async verifyPayment(
    paymentId: string,
    options: VerifyPaymentOptions = {},
  ): Promise<PaymentStatus> {
    if (!paymentId || typeof paymentId !== 'string') {
      return { status: 'failed', error: 'paymentId 不能为空' }
    }

    const fetchTransaction =
      this._fetchTransactionOverride ??
      createNetworkFetchTransaction(options.rpcEndpoint ?? this._rpcEndpoint)

    return pollPaymentStatus(paymentId, fetchTransaction, options)
  }
}
