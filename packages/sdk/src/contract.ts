/**
 * 合约相关编码 / 解析 helpers。
 *
 * 从 POC `frontend/demo/src/lib/contract.ts` 移植，
 * 剔除浏览器专属（import.meta.env / VITE_*）与 React 依赖，保留纯函数部分。
 * ALEO-MVP-007 / 008 的 createPayment / verifyPayment 依赖这些 helper。
 */

import type { TransactionOptions } from '@provablehq/aleo-types'

/** 默认支付合约：pay_private_v3.aleo（v3 原子结算：单笔交易完成 credits transfer_private + 发票消费 + 双 Receipt） */
export const PROGRAM_ID = 'pay_private_v3.aleo'

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

/** 支付记录明文（兼容保留历史命名：v2 时期代指 PaymentRecord；v3 仍可用作通用 receipt 明文） */
export interface PaymentRecordPlaintext {
  owner: string
  merchant: string
  amount: string | number
  period: string | number
  escrow_serial_reference: string | number
}

/**
 * 商家收款回执明文（pay_private_v3.aleo 的 MerchantReceipt 结构）。
 *
 * 与 PayerReceipt 同构（字段：owner / merchant / sender / sender_ciphertext /
 * amount / invoice_id），仅 owner 不同（merchant = invoice.merchant）。
 * 商家通过该回执 + View Key 解密确认付款人身份。
 */
export interface MerchantReceiptPlaintext {
  owner: string
  merchant: string
  sender: string
  sender_ciphertext: string
  amount: string | number
  invoice_id: string | number
}

/**
 * 付款人支付回执明文（pay_private_v3.aleo 的 PayerReceipt 结构）。
 *
 * 用于付款人侧合规备查 / 争议仲裁；owner = signer（付款人）。
 */
export interface PayerReceiptPlaintext {
  owner: string
  merchant: string
  sender: string
  sender_ciphertext: string
  amount: string | number
  invoice_id: string | number
}

/** 默认 sender_ciphertext group 字面量（无承诺占位） */
const DEFAULT_SENDER_CIPHERTEXT = '0group'

/** 默认 credits record plaintext（v3 pay_invoice 的 token 占位） */
const DEFAULT_CREDITS_TOKEN = '0field'

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

/**
 * 解析 pay_private_v3.aleo 的 MerchantReceipt / PayerReceipt 明文。
 *
 * 与 parsePaymentRecord 不同：v3 的 Receipt 字段集为
 * `{ owner, merchant, sender, sender_ciphertext, amount, invoice_id }`，
 * 区别于 v2 PaymentRecord 的 `{ owner, merchant, amount, period, escrow_serial_reference }`。
 * 兼容 JSON / Leo 记录字面量两种形态；解析失败返回 null。
 *
 * 用途：商家后台在链上扫描 Receipt 后，把密文记录解密为 MerchantReceiptPlaintext，
 * 用于账期导出 / 收款明细展示（ALEO-MVP-015 / 016）。
 */
export function parseMerchantReceipt(input: unknown): MerchantReceiptPlaintext | null {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  if (!trimmed && typeof input !== 'object') return null

  // JSON 形态
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed)
      if (
        typeof parsed.owner === 'string' &&
        typeof parsed.merchant === 'string' &&
        (typeof parsed.amount === 'string' || typeof parsed.amount === 'number') &&
        (typeof parsed.invoice_id === 'string' || typeof parsed.invoice_id === 'number')
      ) {
        return {
          owner: stripVisibilitySuffix(parsed.owner),
          merchant: stripVisibilitySuffix(parsed.merchant),
          sender:
            typeof parsed.sender === 'string'
              ? stripVisibilitySuffix(parsed.sender)
              : '',
          sender_ciphertext:
            typeof parsed.sender_ciphertext === 'string'
              ? stripVisibilitySuffix(parsed.sender_ciphertext)
              : '',
          amount: stripVisibilitySuffix(parsed.amount),
          invoice_id: stripVisibilitySuffix(parsed.invoice_id),
        }
      }
    } catch {
      // fall through to plaintext parse
    }

    // Leo 记录字面量形态
    const ownerMatch = /owner:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
    const merchantMatch = /merchant:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
    const invoiceIdMatch = /invoice_id:\s*([^,}\s]+)/.exec(trimmed)
    const amountMatch = /amount:\s*([^,}\s]+)/.exec(trimmed)
    if (ownerMatch && merchantMatch && invoiceIdMatch && amountMatch) {
      const senderMatch = /sender:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
      const senderCtMatch = /sender_ciphertext:\s*([^,}\s]+)/.exec(trimmed)
      return {
        owner: ownerMatch[1],
        merchant: merchantMatch[1],
        sender: senderMatch ? senderMatch[1] : '',
        sender_ciphertext: senderCtMatch ? stripVisibilitySuffix(senderCtMatch[1]) : '',
        amount: stripVisibilitySuffix(amountMatch[1]),
        invoice_id: stripVisibilitySuffix(invoiceIdMatch[1]),
      }
    }
  }

  // 对象形态（Shield OwnedRecord / RecordEnvelope）：与 parsePaymentRecord 一致，
  // 顶层 owner 是 commitment（field），必须排除。
  if (input !== null && typeof input === 'object') {
    const obj = input as Record<string, unknown>

    // 优先取 recordPlaintext
    const plaintext =
      typeof obj.recordPlaintext === 'string' && obj.recordPlaintext.trim().length > 0
        ? obj.recordPlaintext
        : typeof obj.plaintext === 'string'
          ? obj.plaintext
          : ''

    if (plaintext) {
      return parseMerchantReceipt(plaintext)
    }

    // 回退到 recordView.fields
    const rv = obj.recordView as Record<string, unknown> | undefined
    const fields =
      rv && typeof rv === 'object' && rv.fields && typeof rv.fields === 'object'
        ? (rv.fields as Record<string, unknown>)
        : null

    if (fields) {
      const owner =
        typeof fields.owner === 'string' ? stripVisibilitySuffix(fields.owner) : ''
      const merchant =
        typeof fields.merchant === 'string' ? stripVisibilitySuffix(fields.merchant) : ''
      const amount =
        typeof fields.amount === 'string' ? stripVisibilitySuffix(fields.amount) : ''
      const invoiceId =
        typeof fields.invoice_id === 'string'
          ? stripVisibilitySuffix(fields.invoice_id)
          : ''
      if (owner && merchant && amount && invoiceId) {
        return {
          owner,
          merchant,
          sender:
            typeof fields.sender === 'string'
              ? stripVisibilitySuffix(fields.sender)
              : '',
          sender_ciphertext:
            typeof fields.sender_ciphertext === 'string'
              ? stripVisibilitySuffix(fields.sender_ciphertext)
              : '',
          amount,
          invoice_id: invoiceId,
        }
      }
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
 * 构造 pay_private_v3.aleo `pay_invoice` 的交易参数（ALEO-MVP-007 / v3 原子结算）。
 *
 * v3 签名：`pay_invoice(invoice: InvoiceRecord, amount: u64, sender_ciphertext: group, token: credits.aleo::credits)`
 * 单笔交易原子完成 `credits.aleo::transfer_private(token, merchant, amount)` +
 * 消费 InvoiceRecord + 产出 MerchantReceipt + PayerReceipt + 双找零 credits record。
 *
 * 入参形式（按是否带 InvoiceRecord 切换输入形状）：
 * - **带 invoiceRecord**（真实原子支付路径）：
 *   `inputs = [invoiceRecord, amountU64, senderCiphertext, token]`
 * - **不带 invoiceRecord**（仅 demo / 占位，缺 token 时仍按 3 入参构造）：
 *   `inputs = [invoiceId, amountU64, senderCiphertext('0group')]`
 * - 带 invoiceRecord 但未传 token：默认占位 `'0field'`（与 v2 `'0group'` 占位同语义）；
 *   真实付款需调用方传 credits.aleo::credits plaintext 字符串。
 *
 * 注意：返回的参数载荷供商家侧生成 PaymentIntent / Checkout 页消费，
 * 交易广播由钱包层完成。真实链上 pay_invoice 失败时整笔回滚（v3 atomic 语义）。
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
    /** 付款人公钥承诺（group 字面量，如 "0group"），默认 '0group' */
    senderCiphertext?: string
    /**
     * credits.aleo::credits plaintext 字符串（v3 原子结算核心输入）。
     * 真实付款时由调用方从钱包扫描到的 credits private record 提供；未传时
     * 在「带 invoiceRecord + 无 token」场景下默认占位 '0field'（仅用于
     * demo / 测试载荷，实际链上调用必须由调用方提供有效 plaintext）。
     */
    token?: string
    /** 交易费（microcredits，默认 0.1 credits） */
    fee?: number
    /** 是否使用私有手续费（默认 false） */
    privateFee?: boolean
  },
): TransactionOptions {
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

  let inputs: string[]
  if (invoiceRecord) {
    // v3 4-input atomic form：invoice + amount + sender_ciphertext + credits token
    inputs = [invoiceRecord, amountU64, senderCt, token ?? DEFAULT_CREDITS_TOKEN]
  } else {
    // 兼容旧 3-input 占位（demo / 测试）；真实链上 atomic 必须带 invoiceRecord
    inputs = [invoiceId, amountU64, senderCt]
  }

  return createTransactionOptions(
    'pay_invoice',
    inputs,
    PROGRAM_ID,
    fee ?? DEFAULT_FEE,
    privateFee ?? false,
  )
}

/**
 * 构造 pay_private_v3.aleo `mint_to_payer` 的交易参数（H5 原子铸造+交付）。
 *
 * 商家（签名者）调用 `mint_to_payer(merchant, payee, amount, invoice_id)`，
 * 单笔交易产出 `InvoiceRecord`（owner = payee，付款人可直接消费）。
 * 相比 `createInvoiceTransaction` + `transferInvoiceTransaction` 的两笔交易
 * 路径，省去中间等待钱包扫描的环节，**单笔钱包弹窗**即可完成铸造并交付。
 *
 * 字段语义与 `create_invoice` 一致：amount / invoice_id 校验 + serial_number
 * 由 BHP256::hash_to_field 派生（同 (merchant, amount, invoice_id) 派生同一
 * serial），防重放语义不变。
 *
 * @param merchant 商家地址（收款方）
 * @param payee 付款人地址（aleo1...；InvoiceRecord owner 直接写为 payee）
 * @param amount 金额（credits 十进制字符串，如 "1.5"）
 * @param invoiceId 发票 ID（十进制 field 字符串，如 "123456789"；与
 *   paymentIdToField 映射一致，保证 mint 与 verify 可对上）
 */
export function mintInvoiceToPayerTransaction(params: {
  merchant: string
  payee: string
  amount: string
  invoiceId: string
  fee?: number
  privateFee?: boolean
}): TransactionOptions {
  const { merchant, payee, amount, invoiceId, fee, privateFee } = params

  encodeAddress(merchant)
  encodeAddress(payee)
  const amountU64 = encodeU64(amount)

  return createTransactionOptions(
    'mint_to_payer',
    [merchant, payee, amountU64, `${invoiceId}field`],
    PROGRAM_ID,
    fee ?? DEFAULT_FEE,
    privateFee ?? false,
  )
}

/**
 * 构造 pay_private_v3.aleo `create_invoice` 的交易参数（H5 ALEO-MVP-018 使用）。
 *
 * 商家（签名者）调用 `create_invoice(merchant, amount, invoice_id)` 铸造发票，
 * 产出 `InvoiceRecord`（owner = 签名者）。随后可用 `transferInvoiceTransaction`
 * 把记录转移给付款人，付款人再调用 v3 `pay_invoice` 原子完成支付。
 *
 * 新代码优先使用 `mintInvoiceToPayerTransaction`（单笔交易一步铸造+交付）；
 * `createInvoiceTransaction` + `transferInvoiceTransaction` 的两笔路径保留
 * 以兼容历史调用方。
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
 * 构造 pay_private_v3.aleo `transfer_invoice` 的交易参数（H5 ALEO-MVP-018 使用）。
 *
 * 商家（InvoiceRecord.owner）把发票记录转移给付款人 `to`，使付款人能调用
 * v3 `pay_invoice` 原子完成 credits transfer + 发票消费。仅 owner 可转移
 * （合约断言 + 记录花费语义）。
 *
 * @param invoiceRecord InvoiceRecord 明文（Leo 记录字面量），由 create_invoice
 *   交易产出后商家从钱包 `requestRecords('pay_private_v3.aleo')` 获得
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
