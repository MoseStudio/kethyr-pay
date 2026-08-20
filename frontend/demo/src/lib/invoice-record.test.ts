/**
 * invoice-record.ts 解析工具测试：parseInvoiceRecord / parseCreditsRecord / pickCreditsRecord。
 *
 * 覆盖：
 * - InvoiceRecord 解析（Leo 记录字面量 / Shield OwnedRecord 形态）—— 与 v3 InvoiceRecord 一致
 * - credits.aleo::credits 解析（balance 字段；owner / plaintext 完整提取）
 * - pickCreditsRecord 按 owner + balance ≥ 阈值挑选（按 balance 升序取最小可用）
 */

import { describe, expect, it } from 'vitest'

import {
  parseCreditsRecord,
  parseInvoiceRecord,
  pickCreditsRecord,
} from './invoice-record.ts'

const MERCHANT = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'
const PAYER = 'aleo1' + 'b'.repeat(58)

/* ------------------------------------------------------------------ */
/* InvoiceRecord 解析（沿用 merchant.invoice.test.ts 的覆盖策略）    */
/* ------------------------------------------------------------------ */

describe('parseInvoiceRecord（v3 InvoiceRecord）', () => {
  it('解析 Leo 记录字面量：owner / amount / invoice_id + plaintext 完整保留', () => {
    const literal = `{
      owner: ${MERCHANT}.private,
      merchant: ${MERCHANT}.private,
      amount: 500000u64.private,
      invoice_id: 42field.private,
      serial_number: 7field.private,
      _nonce: 1group.public
    }`
    const parsed = parseInvoiceRecord(literal)
    expect(parsed).not.toBeNull()
    expect(parsed!.owner).toBe(MERCHANT)
    expect(parsed!.amount).toBe('500000')
    expect(parsed!.invoiceId).toBe('42')
    expect(parsed!.plaintext).toBe(literal)
  })
})

/* ------------------------------------------------------------------ */
/* credits.aleo::credits 解析（v3 pay_invoice token）                */
/* ------------------------------------------------------------------ */

describe('parseCreditsRecord（v3 pay_invoice token，credits.aleo::credits）', () => {
  it('解析 Leo 记录字面量：owner / balance + plaintext 完整保留', () => {
    const literal = `{
      owner: ${PAYER}.private,
      balance: 1500000u64.private,
      _nonce: 1group.public
    }`
    const parsed = parseCreditsRecord(literal)
    expect(parsed).not.toBeNull()
    expect(parsed!.owner).toBe(PAYER)
    expect(parsed!.microcredits).toBe('1500000')
    expect(parsed!.plaintext).toBe(literal)
  })

  it('解析 Shield OwnedRecord 形态（顶层 owner 是 commitment，recordPlaintext 优先）', () => {
    const recordPlaintext = `{
      owner: ${PAYER}.private,
      balance: 2500000u64.private,
      _nonce: 2group.public
    }`
    const raw = {
      blockHeight: 18800000,
      commitment: '111field',
      functionName: 'transfer_private',
      // 顶层 owner 是 record commitment（field），不是地址——绝不能用作记录 owner
      owner: '222field',
      programName: 'credits.aleo',
      recordName: 'credits',
      sender: PAYER,
      spent: false,
      transactionId: 'at1xxx',
      recordPlaintext,
      recordView: {
        fields: {
          owner: `${PAYER}.private`,
          balance: '2500000u64.private',
        },
      },
      uid: 'shield_xxx',
    }
    const parsed = parseCreditsRecord(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.owner).toBe(PAYER)
    expect(parsed!.microcredits).toBe('2500000')
    expect(parsed!.plaintext).toBe(recordPlaintext)
    expect(parsed!.spent).toBe(false)
  })

  it('无法解析时返回 null（缺 owner / balance）', () => {
    expect(parseCreditsRecord('')).toBeNull()
    expect(parseCreditsRecord('garbage')).toBeNull()
    expect(parseCreditsRecord(null)).toBeNull()
    expect(parseCreditsRecord({ owner: 'aleo1x' })).toBeNull()
  })

  it('记录为 spent 时仍解析（消费过滤由调用方负责）', () => {
    const literal = `{
      owner: ${PAYER}.private,
      balance: 500000u64.private,
      _nonce: 1group.public
    }`
    const parsed = parseCreditsRecord({
      recordPlaintext: literal,
      spent: true,
    })
    expect(parsed?.spent).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* pickCreditsRecord 挑选 ≥ 金额的最小 record                          */
/* ------------------------------------------------------------------ */

function creditsRecord(microcredits: string, owner = PAYER): string {
  return `{
    owner: ${owner}.private,
    balance: ${microcredits}u64.private,
    _nonce: 1group.public
  }`
}

describe('pickCreditsRecord', () => {
  it('无 record 返回 null', () => {
    expect(pickCreditsRecord([], PAYER, 1000n)).toBeNull()
  })

  it('owner 不匹配返回 null', () => {
    const records = [creditsRecord('1000000', MERCHANT)]
    expect(pickCreditsRecord(records, PAYER, 500_000n)).toBeNull()
  })

  it('所有 record balance < 阈值返回 null', () => {
    const records = [
      creditsRecord('100000'),
      creditsRecord('200000'),
    ]
    expect(pickCreditsRecord(records, PAYER, 500_000n)).toBeNull()
  })

  it('单张 record balance >= 阈值：返回该 record 的 plaintext', () => {
    const records = [creditsRecord('1000000')]
    const picked = pickCreditsRecord(records, PAYER, 500_000n)
    expect(picked).toBe(records[0])
  })

  it('多张 record 都满足：按 balance 升序挑选最小可用（保留大额 record 供后续）', () => {
    const small = creditsRecord('600000')
    const large = creditsRecord('5000000')
    // 顺序故意打乱：先 large 再 small
    const records = [large, small]
    const picked = pickCreditsRecord(records, PAYER, 500_000n)
    expect(picked).toBe(small)
  })

  it('exactly 满足阈值（balance == 阈值）也算可用', () => {
    const exact = creditsRecord('500000')
    const records = [exact]
    expect(pickCreditsRecord(records, PAYER, 500_000n)).toBe(exact)
  })

  it('spaced 字段（Shield 形态）也能挑选', () => {
    const raw = {
      recordPlaintext: creditsRecord('2000000'),
      spent: false,
    }
    const picked = pickCreditsRecord([raw], PAYER, 1_500_000n)
    expect(picked).toBe(raw.recordPlaintext)
  })
})
