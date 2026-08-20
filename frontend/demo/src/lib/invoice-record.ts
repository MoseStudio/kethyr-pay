/**
 * InvoiceRecord 解析（pay_private_v3.aleo）。
 *
 * 从钱包 `requestRecords('pay_private_v3.aleo', true)` 的原始返回中提取
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
  merchant: string
  amount: string
  invoiceId: string
  serialNumber: string
  plaintext: string
  spent?: boolean
}

export function sanitizeInvoiceRecordPlaintext(
  plaintext: string,
  opts: { expectedMerchant?: string } = {},
): string {
  const p = plaintext.trim()
  const owner = /owner:\s*(aleo1[a-z0-9]{58})/.exec(p)?.[1]
  const merchant = /merchant:\s*(aleo1[a-z0-9]{58})/.exec(p)?.[1] ?? opts.expectedMerchant
  const amount = /amount:\s*([0-9]+)u64/.exec(p)?.[1]
  const invoiceId = /invoice_id:\s*([0-9]+)field/.exec(p)?.[1]
  const serial = /serial_number:\s*([0-9]+)field/.exec(p)?.[1]

  if (!owner || !merchant || !amount || !invoiceId || !serial) {
    return plaintext
  }

  const nonceMatch = /_nonce:\s*([0-9]+)group/.exec(p)?.[1]
  const nonce = nonceMatch
    ? `${nonceMatch}group.public`
    : '0group.public'

  return (
    '{\n' +
    `  owner: ${owner}.private,\n` +
    `  merchant: ${merchant}.private,\n` +
    `  amount: ${amount}u64.private,\n` +
    `  invoice_id: ${invoiceId}field.private,\n` +
    `  serial_number: ${serial}field.private,\n` +
    `  _nonce: ${nonce},\n` +
    `  _version: 1u8.public\n` +
    '}'
  )
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
  const merchantFromLiteral = p ? /merchant:\s*(aleo1[a-z0-9]{58})/.exec(p)?.[1] : undefined
  const amountFromLiteral = p ? /amount:\s*([0-9]+)u64/.exec(p)?.[1] : undefined
  const invoiceIdFromLiteral = p ? /invoice_id:\s*([0-9]+)field/.exec(p)?.[1] : undefined
  const serialFromLiteral = p ? /serial_number:\s*([0-9]+)field/.exec(p)?.[1] : undefined

  // 从结构化 fields 提取（recordView.fields / plaintext 对象）
  const owner = ownerFromLiteral ?? fields.owner ?? fields.$owner ?? ''
  const merchant = merchantFromLiteral ?? fields.merchant ?? fields.$merchant ?? ''
  const amount = amountFromLiteral ?? fields.amount ?? ''
  const invoiceId = invoiceIdFromLiteral ?? fields.invoice_id ?? fields.$invoice_id ?? ''
  const serialNumberRaw = serialFromLiteral ?? fields.serial_number ?? fields.$serial_number ?? ''

  if (!owner || !amount) return null

  return {
    owner,
    merchant: merchant || owner,
    amount: stripRecordFieldValue(amount).replace(/u64$/, ''),
    invoiceId: stripRecordFieldValue(invoiceId).replace(/field$/, ''),
    serialNumber: serialNumberRaw ? stripRecordFieldValue(serialNumberRaw).replace(/field$/, '') : '',
    plaintext: p,
    spent: typeof (raw as Record<string, unknown>)?.spent === 'boolean'
      ? ((raw as Record<string, unknown>).spent as boolean)
      : undefined,
  }
}

/* ------------------------------------------------------------------ */
/* credits.aleo::credits private record 解析（v3 pay_invoice token）   */
/* ------------------------------------------------------------------ */

/** credits.aleo::credits private record 解析结果 */
export interface ParsedCreditsRecord {
  /** 记录 owner 地址（aleo1...） */
  owner: string
  /** balance（microcredits，bigint 安全的字符串形式） */
  microcredits: string
  /** 完整 Leo 记录字面量（含 _nonce），pay_invoice 签名必需 */
  plaintext: string
  spent?: boolean
}

/**
 * 从钱包 `requestRecords('credits.aleo', true)` 原始返回中提取 credits record。
 * 兼容 Shield OwnedRecord（recordPlaintext / recordView.fields）。
 *
 * credits.aleo::credits record 字段：`owner` + `microcredits`（新版）/ `balance`
 * （历史命名，测试与旧钱包仍用 balance）+ `_nonce`。余额为 u64，可能 ≥ 支付
 * 金额 + 找零（v3 `transfer_private` 会自动找零）。两种字段名都兼容。
 */
export function parseCreditsRecord(raw: unknown): ParsedCreditsRecord | null {
  const { fields, plaintext } = unwrapRecord(raw)
  const p = plaintext

  const ownerFromLiteral = p ? /owner:\s*(aleo1[a-z0-9]{58})/.exec(p)?.[1] : undefined
  const balanceFromLiteral = p
    ? (/balance:\s*([0-9]+)u64/.exec(p)?.[1] ??
      /microcredits:\s*([0-9]+)u64/.exec(p)?.[1])
    : undefined

  const owner = ownerFromLiteral ?? fields.owner ?? fields.$owner ?? ''
  const balance =
    balanceFromLiteral ??
    fields.balance ??
    fields.microcredits ??
    fields.$balance ??
    fields.$microcredits ??
    ''

  if (!owner || !balance) return null

  return {
    owner,
    microcredits: stripRecordFieldValue(balance).replace(/u64$/, ''),
    plaintext: p,
    spent: typeof (raw as Record<string, unknown>)?.spent === 'boolean'
      ? ((raw as Record<string, unknown>).spent as boolean)
      : undefined,
  }
}

/**
 * 从 wallet 返回的 credits records 列表中挑一张满足条件的（owner 匹配 + 未花费 +
 * balance ≥ minMicrocredits）。按 balance 升序——使用最小的可用 record 可保留大额
 * record 供后续更大笔支付。返回 plain Leo 字面量字符串（pay_invoice 必需）。
 */
export function pickCreditsRecord(
  records: unknown[],
  owner: string,
  minMicrocredits: bigint,
): string | null {
  const candidates: Array<{ plaintext: string; microcredits: bigint }> = []
  for (const raw of records) {
    const parsed = parseCreditsRecord(raw)
    if (
      parsed &&
      parsed.plaintext &&
      parsed.owner === owner &&
      !parsed.spent &&
      BigInt(parsed.microcredits) >= minMicrocredits
    ) {
      candidates.push({ plaintext: parsed.plaintext, microcredits: BigInt(parsed.microcredits) })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (a.microcredits < b.microcredits ? -1 : 1))
  return candidates[0].plaintext
}
