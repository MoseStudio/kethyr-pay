/**
 * 合约相关编码 / 解析 helpers。
 *
 * 从 POC `frontend/aleopay-demo/src/lib/contract.ts` 移植，
 * 剔除浏览器专属（import.meta.env / VITE_*）与 React 依赖，保留纯函数部分。
 * ALEO-MVP-007 / 008 的 createPayment / verifyPayment 依赖这些 helper。
 */

import type { TransactionOptions } from '@provablehq/aleo-types'

/** 默认支付合约：pay_private_v2.aleo（含 transfer_invoice 的 v2 程序，H5 联调目标） */
export const PROGRAM_ID = 'pay_private_v2.aleo'

/** 默认测试网 */
export const ALEO_CHAIN_ID = 'testnet'

/** 默认交易手续费（单位 microcredits，0.1 credits） */
export const DEFAULT_FEE = 100_000

/** Aleo 地址正则：aleo1 + 58 位小写字母数字 */
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

/** microcredits（bigint | number）→ credits（6 位小数字符串） */
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

/** 数值 → Leo u32 字面量（范围校验 0..2^32-1） */
export function encodeU32(value: string | number): string {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 4_294_967_295) {
    throw new Error(`Invalid u32 value: ${value}`)
  }
  return `${parsed}u32`
}

/** 去掉记录字段的可见性后缀（.private / .public） */
export function stripVisibilitySuffix(value: string | number): string {
  return String(value).trim().replace(/\.(private|public)$/, '')
}

/** 支付记录明文（pay_private.aleo 的 PaymentRecord 结构，供 007/008 使用） */
export interface PaymentRecordPlaintext {
  owner: string
  merchant: string
  amount: string | number
  period: string | number
  escrow_serial_reference: string | number
}

/**
 * 解析支付记录（JSON 或 Leo 记录字面量两种形态）。
 * 返回规范化后的 PaymentRecordPlaintext；解析失败返回 null。
 */
export function parsePaymentRecord(input: string): PaymentRecordPlaintext | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (
      typeof parsed.owner === 'string' &&
      typeof parsed.merchant === 'string' &&
      (typeof parsed.amount === 'string' || typeof parsed.amount === 'number') &&
      (typeof parsed.period === 'string' || typeof parsed.period === 'number') &&
      (typeof parsed.escrow_serial_reference === 'string' ||
        typeof parsed.escrow_serial_reference === 'number')
    ) {
      return {
        owner: stripVisibilitySuffix(parsed.owner),
        merchant: stripVisibilitySuffix(parsed.merchant),
        amount: stripVisibilitySuffix(parsed.amount),
        period: stripVisibilitySuffix(parsed.period),
        escrow_serial_reference: stripVisibilitySuffix(parsed.escrow_serial_reference),
      }
    }
  } catch {
    // fall through to plaintext parse
  }

  const ownerMatch = /owner:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
  const merchantMatch = /merchant:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
  if (ownerMatch && merchantMatch) {
    const extract = (key: string): string => {
      const re = new RegExp(`${key}:\\s*([^,}\\s]+)`)
      const m = re.exec(trimmed)
      return m ? stripVisibilitySuffix(m[1]) : ''
    }
    return {
      owner: ownerMatch[1],
      merchant: merchantMatch[1],
      amount: extract('amount'),
      period: extract('period'),
      escrow_serial_reference: extract('escrow_serial_reference'),
    }
  }

  return null
}

/** 保留记录原文（wallet 期望保留可见性后缀，原样返回输入） */
export function cleanRecordInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  return trimmed
}

/**
 * 构造 @provablehq/aleo-types 的 TransactionOptions，
 * 供 wallet adapter 的 executeTransaction / signTransaction 使用。
 */
export function createTransactionOptions(
  functionName: string,
  inputs: string[],
  program = PROGRAM_ID,
  fee = DEFAULT_FEE,
  privateFee = false,
): TransactionOptions {
  return {
    program,
    function: functionName,
    inputs,
    fee,
    privateFee,
  }
}

/**
 * 构造 pay_private.aleo `pay_invoice` 的交易参数（ALEO-MVP-007 使用）。
 *
 * `pay_invoice` 签名为 `(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group)`。
 * 注意：真实交易需要付款人先拥有 InvoiceRecord（由 create_invoice 铸造后转账），
 * 这里返回的参数载荷供商家侧生成 PaymentIntent / Checkout 页消费，交易广播由钱包层完成。
 */
export function createPayInvoiceTransaction(
  params: {
    /** 发票 ID（十进制 field 字符串，如 "123456789"） */
    invoiceId: string
    /** 金额（credits 十进制字符串，如 "1.5"） */
    amount: string
    /** 商家地址（aleo1...） */
    merchant: string
    /** InvoiceRecord 明文（Leo 记录字面量），由商家在 create_invoice 后持有 */
    invoiceRecord?: string
    /** 付款人公钥承诺（group 字面量，如 "1group"） */
    senderCiphertext?: string
    /** 交易费（microcredits，默认 0.1 credits） */
    fee?: number
    /** 是否使用私有手续费（默认 false） */
    privateFee?: boolean
  },
): TransactionOptions {
  const { invoiceId, amount, merchant, invoiceRecord, senderCiphertext, fee, privateFee } =
    params

  encodeAddress(merchant)
  const amountU64 = encodeU64(amount)

  const inputs = invoiceRecord
    ? [invoiceRecord, amountU64, senderCiphertext ?? '1group']
    : [invoiceId, amountU64, senderCiphertext ?? '1group']

  return createTransactionOptions(
    'pay_invoice',
    inputs,
    PROGRAM_ID,
    fee ?? DEFAULT_FEE,
    privateFee ?? false,
  )
}

/**
 * 构造 pay_private_v2.aleo `create_invoice` 的交易参数（H5 ALEO-MVP-018 使用）。
 *
 * 商家（签名者）调用 `create_invoice(merchant, amount, invoice_id)` 铸造发票，
 * 产出 `InvoiceRecord`（owner = 签名者）。随后可用 `transferInvoiceTransaction`
 * 把记录转移给付款人，付款人再调用 `pay_invoice` 完成支付。
 *
 * @param merchant 商家地址（收款方）
 * @param amount 金额（credits 十进制字符串，如 "1.5"）
 * @param invoiceId 发票 ID（十进制 field 字符串，如 "123456789"；与
 *   paymentIdToField 映射一致，保证 create 与 verify 可对上）
 */
export function createInvoiceTransaction(params: {
  merchant: string
  amount: string
  invoiceId: string
  fee?: number
  privateFee?: boolean
}): TransactionOptions {
  const { merchant, amount, invoiceId, fee, privateFee } = params

  encodeAddress(merchant)
  const amountU64 = encodeU64(amount)

  return createTransactionOptions(
    'create_invoice',
    [merchant, amountU64, `${invoiceId}field`],
    PROGRAM_ID,
    fee ?? DEFAULT_FEE,
    privateFee ?? false,
  )
}

/**
 * 构造 pay_private_v2.aleo `transfer_invoice` 的交易参数（H5 ALEO-MVP-018 使用）。
 *
 * 商家（InvoiceRecord.owner）把发票记录转移给付款人 `to`，使付款人能调用
 * `pay_invoice`。仅 owner 可转移（合约断言 + 记录花费语义）。
 *
 * @param invoiceRecord InvoiceRecord 明文（Leo 记录字面量），由 create_invoice
 *   交易产出后商家从钱包 `requestRecords('pay_private_v2.aleo')` 获得
 * @param to 付款人地址（aleo1...）
 */
export function transferInvoiceTransaction(params: {
  invoiceRecord: string
  to: string
  fee?: number
  privateFee?: boolean
}): TransactionOptions {
  const { invoiceRecord, to, fee, privateFee } = params

  encodeAddress(to)

  return createTransactionOptions(
    'transfer_invoice',
    [invoiceRecord, to],
    PROGRAM_ID,
    fee ?? DEFAULT_FEE,
    privateFee ?? false,
  )
}
