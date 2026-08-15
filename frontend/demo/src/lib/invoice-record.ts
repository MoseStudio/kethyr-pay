/**
 * InvoiceRecord 解析（pay_private_v2.aleo）。
 *
 * 从钱包 `requestRecords('pay_private_v2.aleo', true)` 的原始返回中提取
 * InvoiceRecord 明文，兼容多层包装。merchant.invoice.tsx（铸造/转移）与
 * pay.$invoiceId.tsx（付款）共用。
 *
 * Shield Wallet（OwnedRecord，实际返回形态）：
 * - `recordPlaintext`：完整 Leo 记录字面量字符串（含 _nonce），交易签名
 *   所必需的输入——**优先来源**
 * - `recordView.fields`：wallet-standard 结构化字段（owner 为真实地址）
 * - 顶层 `owner`：**record commitment（field），不是地址**，绝不能用作记录 owner
 */

export interface ParsedInvoiceRecord {
  owner: string
  amount: string
  invoiceId: string
  plaintext: string
  spent?: boolean
}

/**
 * 剥离记录字段值的可见性后缀（.private / .public）。
 */
export function stripRecordFieldValue(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/\.(private|public)$/, '')
}

/**
 * 通用：从钱包 requestRecords 返回的原始记录中提取结构化字段 + 完整明文。
 * 兼容 Shield OwnedRecord（recordPlaintext / recordView.fields）与其他
 * wallet-standard RecordEnvelope 形态。顶层 `owner` 是 record commitment
 * （field）而非地址，绝不用于结构化字段。
 */
export function unwrapRecord(r: unknown): { fields: Record<string, string>; plaintext: string } {
  const empty = { fields: {} as Record<string, string>, plaintext: '' }
  if (r === null || typeof r !== 'object') {
    // 直接字符串形态
    return typeof r === 'string' && r.length > 0
      ? { fields: {}, plaintext: r }
      : empty
  }
  const obj = r as Record<string, unknown>
  const fields: Record<string, string> = {}

  // 形态 1（Shield）：recordPlaintext 是完整 Leo 记录字面量（含 _nonce）。
  // 这是交易签名必需的输入，优先保留。
  let plaintext = ''
  if (typeof obj.recordPlaintext === 'string' && obj.recordPlaintext.trim().length > 0) {
    plaintext = obj.recordPlaintext
  }

  // 形态 2：recordView.fields（wallet-standard 结构化字段，owner 是真实地址）
  if (obj.recordView && typeof obj.recordView === 'object') {
    const rv = obj.recordView as Record<string, unknown>
    if (rv.fields && typeof rv.fields === 'object' && !Array.isArray(rv.fields)) {
      for (const [k, v] of Object.entries(rv.fields as Record<string, unknown>)) {
        if (typeof v === 'string') fields[k] = stripRecordFieldValue(v)
      }
    }
  }

  // plaintext：字符串（Leo 字面量）或对象（结构化字段）
  if (typeof obj.plaintext === 'string') {
    if (plaintext === '') plaintext = obj.plaintext
  } else if (obj.plaintext && typeof obj.plaintext === 'object') {
    for (const [k, v] of Object.entries(obj.plaintext as Record<string, unknown>)) {
      if (typeof v === 'string') fields[k] = stripRecordFieldValue(v)
    }
  }

  // 形态 3：记录本身平铺为对象。Shield 顶层 `owner` 是 record commitment
  // （field），不是地址，必须排除；已有 recordPlaintext / recordView 时跳过。
  if (plaintext === '' && Object.keys(fields).length === 0) {
    if (
      typeof obj.invoice_id === 'string' ||
      typeof obj.amount === 'string' ||
      typeof obj.sender === 'string'
    ) {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && k !== 'owner') fields[k] = stripRecordFieldValue(v)
      }
    }
  }

  return { fields, plaintext }
}

/** 从 requestRecords 原始返回中提取 InvoiceRecord 明文（兼容多层包装） */
export function parseInvoiceRecord(raw: unknown): ParsedInvoiceRecord | null {
  const { fields, plaintext } = unwrapRecord(raw)

  // 从 Leo 记录字面量提取（recordPlaintext / plaintext 字符串，最可靠）
  const p = plaintext
  const ownerFromLiteral = p ? /owner:\s*(aleo1[a-z0-9]{58})/.exec(p)?.[1] : undefined
  const amountFromLiteral = p ? /amount:\s*([0-9]+)u64/.exec(p)?.[1] : undefined
  const invoiceIdFromLiteral = p ? /invoice_id:\s*([0-9]+)field/.exec(p)?.[1] : undefined

  // 从结构化 fields 提取（recordView.fields / plaintext 对象）
  const owner = ownerFromLiteral ?? fields.owner ?? fields.$owner ?? ''
  const amount = amountFromLiteral ?? fields.amount ?? ''
  const invoiceId = invoiceIdFromLiteral ?? fields.invoice_id ?? fields.$invoice_id ?? ''

  if (!owner || !amount) return null

  return {
    owner,
    amount: stripRecordFieldValue(amount).replace(/u64$/, ''),
    invoiceId: stripRecordFieldValue(invoiceId).replace(/field$/, ''),
    plaintext: p,
    spent: typeof (raw as Record<string, unknown>)?.spent === 'boolean'
      ? ((raw as Record<string, unknown>).spent as boolean)
      : undefined,
  }
}
