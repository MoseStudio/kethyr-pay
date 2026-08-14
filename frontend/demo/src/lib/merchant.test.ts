import { describe, expect, it } from 'vitest'

import {
  extractMerchantPayments,
  formatAmount,
  formatCreatedAt,
  formatStatementDate,
  mergePaymentEntries,
  parsePaymentRecord,
  statusBadgeClass,
  statusLabel,
  summarizePayments,
  toStatementCsv,
  toStatementJson,
  toStatementRows,
  type MerchantPaymentEntry,
} from './merchant.ts'
import type { PaymentIntentRecord } from './payment-intents.ts'

const MERCHANT = 'aleo1' + 'a'.repeat(58)

function makeRecord(partial: Partial<PaymentIntentRecord>): PaymentIntentRecord {
  return {
    invoice_id: 'inv_00000001',
    amount: '1.500000',
    merchant: MERCHANT,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    payment_url: `https://pay.aleopay.example/pay/inv_00000001`,
    transaction: { program: 'pay_private.aleo', function: 'pay_invoice', inputs: [] },
    idempotencyKey: `${MERCHANT}:1.500000`,
    createdAt: '2026-08-14T10:00:00.000Z',
    status: 'pending',
    ...partial,
  }
}

describe('parsePaymentRecord（pay_private.aleo PaymentRecord 解析）', () => {
  it('解析 Leo 记录字面量', () => {
    const leo = `{
      owner: ${MERCHANT}.private,
      merchant: ${MERCHANT}.public,
      sender: aleo1abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123.private,
      sender_ciphertext: 123456789group.private,
      amount: 1500000u64.private,
      invoice_id: 987654321field.private,
    }`
    const parsed = parsePaymentRecord(leo)
    expect(parsed).toEqual({
      owner: MERCHANT,
      merchant: MERCHANT,
      sender: 'aleo1abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123',
      sender_ciphertext: '123456789group',
      amount: '1500000',
      invoice_id: '987654321',
    })
  })

  it('解析 JSON 形态', () => {
    const json = JSON.stringify({
      owner: MERCHANT,
      merchant: MERCHANT,
      sender: 'aleo1abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123',
      sender_ciphertext: '1group',
      amount: '500000u64',
      invoice_id: '123field',
    })
    const parsed = parsePaymentRecord(json)
    expect(parsed?.amount).toBe('500000')
    expect(parsed?.invoice_id).toBe('123')
  })

  it('非法输入返回 null', () => {
    expect(parsePaymentRecord('')).toBeNull()
    expect(parsePaymentRecord('garbage')).toBeNull()
    expect(parsePaymentRecord(null)).toBeNull()
    expect(parsePaymentRecord({ foo: 'bar' })).toBeNull()
  })
})

describe('summarizePayments（收款汇总）', () => {
  it('累计金额与最近交易（按时间倒序）', () => {
    const older = makeRecord({
      invoice_id: 'inv_old',
      amount: '1.000000',
      createdAt: '2026-08-13T10:00:00.000Z',
      status: 'paid',
    })
    const newer = makeRecord({
      invoice_id: 'inv_new',
      amount: '2.500000',
      createdAt: '2026-08-14T10:00:00.000Z',
      status: 'paid',
    })
    const summary = summarizePayments([older, newer])
    expect(summary.totalAmount).toBe('3.500000')
    expect(summary.recent.map((r) => r.invoice_id)).toEqual(['inv_new', 'inv_old'])
  })

  it('limit 截断最近交易', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        invoice_id: `inv_${i}`,
        amount: '1.000000',
        createdAt: `2026-08-14T0${i}:00:00.000Z`,
        status: 'paid',
      }),
    )
    const summary = summarizePayments(records, 2)
    expect(summary.recent).toHaveLength(2)
  })

  it('entry 形态输入直接透传', () => {
    const entry: MerchantPaymentEntry = {
      invoice_id: 'inv_onchain',
      amount: '0.500000',
      createdAt: '2026-08-14T10:00:00.000Z',
      status: 'paid',
      source: 'onchain',
    }
    const summary = summarizePayments([entry])
    expect(summary.totalAmount).toBe('0.500000')
    expect(summary.recent[0].source).toBe('onchain')
  })
})

describe('extractMerchantPayments（链上记录筛选）', () => {
  it('仅保留属于指定商家的记录', () => {
    const records = [
      `{ owner: ${MERCHANT}, merchant: ${MERCHANT}, sender: aleo1${'b'.repeat(58)}, sender_ciphertext: 1group, amount: 1000000u64, invoice_id: 1field }`,
      `{ owner: aleo1${'c'.repeat(58)}, merchant: aleo1${'c'.repeat(58)}, sender: aleo1${'c'.repeat(58)}, sender_ciphertext: 2group, amount: 2000000u64, invoice_id: 2field }`,
    ]
    const entries = extractMerchantPayments(records, MERCHANT)
    expect(entries).toHaveLength(1)
    expect(entries[0].amount).toBe('1.000000')
    expect(entries[0].source).toBe('onchain')
  })
})

describe('mergePaymentEntries / paymentIntentToEntry（数据合并）', () => {
  const paid = makeRecord({ invoice_id: 'inv_paid', status: 'paid' })
  const pending = makeRecord({ invoice_id: 'inv_pending', status: 'pending' })
  const onchain: MerchantPaymentEntry = {
    invoice_id: 'inv_paid',
    amount: '1.500000',
    createdAt: '2026-08-14T10:00:00.000Z',
    status: 'paid',
    sender: 'aleo1' + 'b'.repeat(58),
    source: 'onchain',
  }

  it('合并两通道并按 invoice_id 去重（链上覆盖发票系统）', () => {
    const merged = mergePaymentEntries([paid, pending], [onchain])
    expect(merged).toHaveLength(2)
    const paidEntry = merged.find((e) => e.invoice_id === 'inv_paid')
    expect(paidEntry?.source).toBe('onchain')
    expect(paidEntry?.sender).toBe('aleo1' + 'b'.repeat(58))
  })

  it('链上条目 createdAt 缺失时以发票系统时间为准（不覆盖）', () => {
    const merged = mergePaymentEntries([paid], [])
    expect(merged).toHaveLength(1)
    expect(merged[0].invoice_id).toBe('inv_paid')
  })
})

describe('展示辅助（formatAmount / formatCreatedAt / status）', () => {
  it('formatAmount 去除末尾多余的 0', () => {
    expect(formatAmount('1.500000')).toBe('1.5')
    expect(formatAmount('2.000000')).toBe('2')
    expect(formatAmount('0.123456')).toBe('0.123456')
  })

  it('formatCreatedAt 输出本地 "YYYY-MM-DD HH:mm"', () => {
    const formatted = formatCreatedAt('2026-08-14T10:05:00.000Z')
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('statusBadgeClass / statusLabel 映射', () => {
    expect(statusBadgeClass('paid')).toContain('emerald')
    expect(statusBadgeClass('expired')).toContain('gray')
    expect(statusBadgeClass('pending')).toContain('amber')
    expect(statusLabel('paid')).toBe('已支付')
    expect(statusLabel('pending')).toBe('待支付')
    expect(statusLabel('expired')).toBe('已过期')
  })
})

describe('账期导出（ALEO-MVP-016）', () => {
  const entry: MerchantPaymentEntry = {
    invoice_id: 'inv_0001',
    amount: '1.500000',
    createdAt: '2026-08-14T10:00:00.000Z',
    status: 'paid',
    sender: 'aleo1' + 'b'.repeat(58),
    sender_ciphertext: '123456789group',
    source: 'onchain',
  }
  const entryWithComma: MerchantPaymentEntry = {
    ...entry,
    invoice_id: 'inv_"quoted",with,comma',
  }

  it('formatStatementDate：ISO → YYYY-MM-DD（UTC）', () => {
    expect(formatStatementDate('2026-08-14T10:00:00.000Z')).toBe('2026-08-14')
    expect(formatStatementDate('2026-12-31T23:59:59.000Z')).toBe('2026-12-31')
  })

  it('toStatementRows：字段映射', () => {
    const rows = toStatementRows([entry])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      date: '2026-08-14',
      invoice_id: 'inv_0001',
      amount_credits: '1.500000',
      status: 'paid',
      sender: 'aleo1' + 'b'.repeat(58),
      sender_ciphertext: '123456789group',
    })
  })

  it('toStatementCsv：表头 + 行 + RFC-4180 转义', () => {
    const csv = toStatementCsv([entryWithComma])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('date,invoice_id,amount_credits,status,sender,sender_ciphertext')
    // 含逗号/引号的字段被引号包裹且内部引号翻倍
    expect(lines[1]).toContain('"inv_""quoted"",with,comma"')
    expect(csv.endsWith('\n')).toBe(true)
  })

  it('toStatementJson：可解析且含元数据', () => {
    const json = toStatementJson([entry], MERCHANT)
    const parsed = JSON.parse(json) as {
      generatedAt: string
      merchant: string
      statement: Array<Record<string, unknown>>
    }
    expect(parsed.merchant).toBe(MERCHANT)
    expect(parsed.generatedAt).toBeDefined()
    expect(parsed.statement).toHaveLength(1)
    expect(parsed.statement[0].invoice_id).toBe('inv_0001')
  })
})
