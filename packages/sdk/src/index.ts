/**
 * @aleopay/sdk — AleoPay 最小 SDK 公共入口。
 *
 * 导出全部公共 API：WASM 初始化、合约编码 helpers、钱包适配器抽象、AleoPay 主类、类型。
 */

// WASM / 账户
export {
  initAleoSDK,
  resetAleoSDK,
  createAccount,
  type AleoAccount,
} from './aleo.js'

// 合约编码 / 解析 helpers
export {
  PROGRAM_ID,
  ALEO_CHAIN_ID,
  DEFAULT_FEE,
  isValidAleoAddress,
  creditsToMicrocredits,
  microcreditsToCredits,
  encodeAddress,
  encodeU64,
  encodeU32,
  stripVisibilitySuffix,
  parsePaymentRecord,
  cleanRecordInput,
  createTransactionOptions,
  createPayInvoiceTransaction,
  createInvoiceTransaction,
  transferInvoiceTransaction,
  type PaymentRecordPlaintext,
} from './contract.js'

// 钱包适配器抽象（框架无关）
export {
  createShieldAdapter,
  createMemoryWalletAdapter,
  walletAdapters,
  type WalletAdapter,
  type MemoryWalletOptions,
} from './wallet.js'

// AleoPay 主类
export {
  AleoPay,
  NotImplementedError,
  DEFAULT_PAYMENT_BASE_URL,
  DEFAULT_EXPIRES_IN_MS,
  generateInvoiceId,
  normalizeAmount,
  validateMerchant,
  type AleoPayOptions,
} from './aleopay.js'

// verifyPayment 轮询核心（ALEO-MVP-008）
export {
  DEFAULT_RPC_ENDPOINT,
  DEFAULT_POLL_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  createNetworkFetchTransaction,
  pollPaymentStatus,
  isTransactionConfirmed,
  extractPaymentReceipt,
  normalizePaymentError,
  isPermanentFailure,
  paymentIdToField,
  type VerifyPaymentOptions,
  type FetchTransaction,
} from './verify.js'

// 公共类型
export type {
  PaymentIntent,
  PaymentStatus,
  CreatePaymentParams,
} from './types.js'
