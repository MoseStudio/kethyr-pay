/**
 * 商家后台纯逻辑模块（ALEO-MVP-015 / 016 共享）。
 *
 * 职责：
 * - 收款明细聚合：从 PaymentIntentRecord 列表计算累计金额 / 最近交易
 * - PaymentRecord（链上 `pay_private.aleo`）解析与解密辅助：
 *   - 解析钱包 `requestRecords('pay_private.aleo')` / `requestTransactionHistory`
 *     返回的记录（JSON 或 Leo 记录字面量两种形态）
 *   - 识别 `pay_private.aleo` 的 PaymentRecord 字段
 *     （owner / merchant / sender / sender_ciphertext / amount / invoice_id）
 *
 * 设计约束：本模块保持纯函数（不 import react / WASM），
 * vitest node 环境可直测；解密等 WASM 能力由调用方（页面/组件）注入。
 */

import type { PaymentIntentRecord } from './payment-intents.ts'

/** 链上 PaymentRecord 明文（pay_private.aleo 结构） */
export interface PaymentRecordPlaintext {
  owner: string
  merchant: string
  sender: string
  sender_ciphertext: string
  amount: string
  invoice_id: string
}

/** 商家后台的收款明细条目（聚合结果） */
export interface MerchantPaymentEntry {
  /** 发票 ID（inv_xxx） */
  invoice_id: string
  /** 金额（credits，十进制字符串） */
  amount: string
  /** 创建时间（ISO 8601） */
  createdAt: string
  /** 状态（pending / paid / expired） */
  status: string
  /** 付款人地址（解密后可得；未解密为空） */
  sender?: string
  /** 链上付款人公钥承诺（sender_ciphertext，合规披露字段） */
  sender_ciphertext?: string
  /** 来源：'payment-intent'（发票系统）或 'onchain'（链上记录扫描） */
  source: 'payment-intent' | 'onchain'
}

/** 收款汇总 */
export interface MerchantSummary {
  /** 累计收款金额（credits 十进制字符串，6 位小数） */
  totalAmount: string
  /** 最近交易列表（按时间倒序） */
  recent: MerchantPaymentEntry[]
}

/**
 * 汇总收款明细：
 * - 累计金额：sum(amount)（6 位小数字符串）
 * - 最近交易：按 createdAt 倒序取前 N 条
 */
export function summarizePayments(
  records: PaymentIntentRecord[] | MerchantPaymentEntry[],
  limit = 20,
): MerchantSummary {
  const entries: MerchantPaymentEntry[] = records.map((r) => {
    if ('idempotencyKey' in r) {
      const record = r as PaymentIntentRecord
      return {
        invoice_id: record.invoice_id,
        amount: record.amount,
        createdAt: record.createdAt,
        status: record.status,
        source: 'payment-intent',
      }
    }
    return r as MerchantPaymentEntry
  })

  const sorted = [...entries].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )

  // 累计金额：microcredits 累加避免浮点误差
  const totalMicro = sorted.reduce((acc, e) => {
    const micro = Math.round(Number(e.amount) * 1_000_000)
    return acc + (Number.isFinite(micro) ? micro : 0)
  }, 0)

  return {
    totalAmount: (totalMicro / 1_000_000).toFixed(6),
    recent: sorted.slice(0, limit),
  }
}

/** 去掉记录字段的可见性后缀（.private / .public），与 SDK stripVisibilitySuffix 语义一致 */
function stripVisibilitySuffix(value: string | number): string {
  return String(value).trim().replace(/\.(private|public)$/, '')
}

/** 从记录对象中提取字符串字段（兼容 JSON 记录的 value 包装） */
function extractField(obj: Record<string, unknown>, key: string): string {
  const raw = obj[key]
  if (typeof raw === 'string') return stripVisibilitySuffix(raw)
  if (raw !== null && typeof raw === 'object') {
    const value = (raw as Record<string, unknown>).value
    if (typeof value === 'string') return stripVisibilitySuffix(value)
  }
  return ''
}

/**
 * 解析 pay_private.aleo 的 PaymentRecord。
 * 接受两种形态：
 * - JSON：`{ "owner": "...", "merchant": "...", "sender": "...", ... }`（钱包解密后/API 返回）
 * - Leo 记录字面量：`{ owner: aleo1...private, merchant: ..., amount: 1u64, ... }`
 * 解析失败返回 null。
 */
export function parsePaymentRecord(input: unknown): PaymentRecordPlaintext | null {
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null

    // JSON 形态
    try {
      const parsed = JSON.parse(trimmed)
      const owner = extractField(parsed, 'owner')
      const merchant = extractField(parsed, 'merchant')
      if (owner && merchant) {
        return {
          owner,
          merchant,
          sender: extractField(parsed, 'sender'),
          sender_ciphertext: extractField(parsed, 'sender_ciphertext'),
          amount: extractField(parsed, 'amount').replace(/u64$/, ''),
          invoice_id: extractField(parsed, 'invoice_id').replace(/field$/, ''),
        }
      }
    } catch {
      // fall through 到 Leo 字面量解析
    }

    // Leo 记录字面量形态：{ owner: aleo1...private, merchant: ..., amount: 1000000u64, ... }
    const ownerMatch = /owner:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
    const merchantMatch = /merchant:\s*(aleo1[a-z0-9]{58})/.exec(trimmed)
    if (!ownerMatch || !merchantMatch) return null
    const extract = (key: string): string => {
      const re = new RegExp(`${key}:\\s*([^,}\\s]+)`)
      const m = re.exec(trimmed)
      return m ? stripVisibilitySuffix(m[1]) : ''
    }
    return {
      owner: ownerMatch[1],
      merchant: merchantMatch[1],
      sender: extract('sender'),
      sender_ciphertext: extract('sender_ciphertext'),
      amount: extract('amount').replace(/u64$/, ''),
      invoice_id: extract('invoice_id').replace(/field$/, ''),
    }
  }

  if (input !== null && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const owner = extractField(obj, 'owner')
    const merchant = extractField(obj, 'merchant')
    if (!owner || !merchant) return null
    return {
      owner,
      merchant,
      sender: extractField(obj, 'sender'),
      sender_ciphertext: extractField(obj, 'sender_ciphertext'),
      amount: extractField(obj, 'amount').replace(/u64$/, ''),
      invoice_id: extractField(obj, 'invoice_id').replace(/field$/, ''),
    }
  }

  return null
}

/**
 * 从钱包返回的记录列表（requestRecords / requestTransactionHistory）中
 * 提取属于指定商家的 PaymentRecord，并转为 MerchantPaymentEntry。
 *
 * 记录可能有多层包装（RecordEnvelope.recordView.fields / OwnedRecord 等），
 * 本函数做扁平化尝试：先取 recordView.fields，再取 record / plaintext 字段。
 */
export function extractMerchantPayments(
  records: unknown[],
  merchant: string,
): MerchantPaymentEntry[] {
  const entries: MerchantPaymentEntry[] = []

  for (const raw of records) {
    const parsed = parsePaymentRecord(raw)
    if (parsed && parsed.merchant === merchant) {
      entries.push({
        invoice_id: parsed.invoice_id,
        amount: (Number(parsed.amount) / 1_000_000).toFixed(6),
        createdAt: new Date().toISOString(),
        status: 'paid',
        sender: parsed.sender || undefined,
        sender_ciphertext: parsed.sender_ciphertext || undefined,
        source: 'onchain',
      })
    }
  }

  return entries
}

/* ------------------------------------------------------------------ */
/* 展示辅助（ALEO-MVP-015 商家后台）                                    */
/* ------------------------------------------------------------------ */

/** 将支付意图记录转为收款明细条目（与链上条目同构，便于合并汇总） */
export function paymentIntentToEntry(record: PaymentIntentRecord): MerchantPaymentEntry {
  return {
    invoice_id: record.invoice_id,
    amount: record.amount,
    createdAt: record.createdAt,
    status: record.status,
    source: 'payment-intent',
  }
}

/** 合并发票系统 + 链上记录为统一明细（按时间倒序去重 invoice_id） */
export function mergePaymentEntries(
  paymentIntents: PaymentIntentRecord[],
  onchain: MerchantPaymentEntry[],
): MerchantPaymentEntry[] {
  const byId = new Map<string, MerchantPaymentEntry>()

  for (const record of paymentIntents) {
    byId.set(record.invoice_id, paymentIntentToEntry(record))
  }
  for (const entry of onchain) {
    // 链上记录（已支付）优先级更高：覆盖 pending 状态并补充 sender 信息
    byId.set(entry.invoice_id, entry)
  }

  return [...byId.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
}

/** 金额展示：6 位小数 → 去除末尾多余的 0（"1.500000" → "1.5"） */
export function formatAmount(amount: string): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return amount
  return String(n)
}

/** 时间展示：ISO → "YYYY-MM-DD HH:mm"（本地时区） */
export function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 状态徽章样式（Tailwind 类） */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800'
    case 'expired':
      return 'bg-gray-100 text-gray-600'
    case 'pending':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

/** 状态展示文案 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return '已支付'
    case 'expired':
      return '已过期'
    case 'pending':
      return '待支付'
    default:
      return status
  }
}

/* ------------------------------------------------------------------ */
/* 账期导出（ALEO-MVP-016，Request Finance 兼容）                       */
/* ------------------------------------------------------------------ */

/** 账期导出行（CSV/JSON 的统一行结构） */
export interface StatementRow {
  /** 收款日期（YYYY-MM-DD） */
  date: string
  /** 发票 ID */
  invoice_id: string
  /** 金额（credits 十进制字符串，如 "1.5"） */
  amount_credits: string
  /** 状态（paid / pending / expired） */
  status: string
  /** 付款人地址（解密后可得；未解密为空字符串） */
  sender: string
  /** 链上付款人公钥承诺（sender_ciphertext，合规披露字段） */
  sender_ciphertext: string
}

/** ISO 时间 → 日期（YYYY-MM-DD，UTC） */
export function formatStatementDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 收款明细 → 账期导出行 */
export function toStatementRows(entries: MerchantPaymentEntry[]): StatementRow[] {
  return entries.map((e) => ({
    date: formatStatementDate(e.createdAt),
    invoice_id: e.invoice_id,
    amount_credits: e.amount,
    status: e.status,
    sender: e.sender ?? '',
    sender_ciphertext: e.sender_ciphertext ?? '',
  }))
}

/** RFC-4180 字段转义：含逗号 / 引号 / 换行的字段加引号，内部引号翻倍 */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * 生成 CSV 账单（RFC-4180）。
 * 列：date,invoice_id,amount_credits,status,sender,sender_ciphertext
 */
export function toStatementCsv(entries: MerchantPaymentEntry[]): string {
  const header = ['date', 'invoice_id', 'amount_credits', 'status', 'sender', 'sender_ciphertext']
  const rows = toStatementRows(entries).map((r) =>
    [r.date, r.invoice_id, r.amount_credits, r.status, r.sender, r.sender_ciphertext]
      .map(csvEscape)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n') + '\n'
}

/** 生成 JSON 账单（含元数据：生成时间 / 商家 / 行数） */
export function toStatementJson(
  entries: MerchantPaymentEntry[],
  merchant?: string,
): string {
  const rows = toStatementRows(entries)
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      merchant: merchant ?? '',
      statement: rows,
    },
    null,
    2,
  )
}

/** 浏览器端触发文件下载（SSR / node 环境安全降级） */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain',
): void {
  if (typeof document === 'undefined') {
    console.warn(`[AleoPay] downloadTextFile 仅支持浏览器环境（跳过：${filename}）`)
    return
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
