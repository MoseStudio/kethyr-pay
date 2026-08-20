import { describe, expect, it } from 'vitest'

import { parseInvoiceRecord } from '@/lib/invoice-record.ts'

const MERCHANT = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'

/** Shield Wallet OwnedRecord 的真实形态（H5 联调抓取） */
function shieldOwnedRecord(overrides: {
  invoiceId?: string
  recordPlaintext?: string
  spent?: boolean
} = {}): Record<string, unknown> {
  const invoiceId = overrides.invoiceId ?? '628705424'
  const recordPlaintext =
    overrides.recordPlaintext ??
    `{\n  owner: ${MERCHANT}.private,\n  merchant: ${MERCHANT}.private,\n  amount: 500000u64.private,\n  invoice_id: ${invoiceId}field.private,\n  serial_number: 6434027611726434959335915932513693011774724461505864319131221648265193543686field.private,\n  _nonce: 5091456375711199894493920851728318304729770057209863206210417947393524273024group.public,\n  _version: 1u8.public\n}`
  return {
    blockHeight: 18730581,
    commitment:
      '6041895917013134681277493771816326343398374366191208638244878482799659966984field',
    functionName: 'create_invoice',
    outputIndex: 0,
    // 顶层 owner 是 record commitment（field），不是地址——不能用作记录 owner
    owner: '5816678430409870700679217267518351456853540762943589178368590156379864613704field',
    programName: 'pay_private_v3.aleo',
    recordName: 'InvoiceRecord',
    sender: MERCHANT,
    spent: overrides.spent ?? false,
    transactionId: 'at1xnh2k6fdm6wn5es050vf78laa0z6uxwnme8zvlkv62safkqfavxqu6kz9k',
    recordPlaintext,
    recordView: {
      fields: {
        owner: `${MERCHANT}.private`,
        merchant: `${MERCHANT}.private`,
        amount: '500000u64.private',
        invoice_id: `${invoiceId}field.private`,
        serial_number: '6434027611726434959335915932513693011774724461505864319131221648265193543686field.private',
        _nonce: '5091456375711199894493920851728318304729770057209863206210417947393524273024group.public',
        _version: '1u8.public',
      },
    },
    uid: 'shield_DX53vMfzkJ9ONqul',
  }
}

describe('parseInvoiceRecord（Shield OwnedRecord 形态，H5 ALEO-MVP-018）', () => {
  it('从 recordPlaintext 解析 owner / amount / invoice_id，并保留完整字面量', () => {
    const parsed = parseInvoiceRecord(shieldOwnedRecord())

    expect(parsed).not.toBeNull()
    expect(parsed!.owner).toBe(MERCHANT)
    expect(parsed!.amount).toBe('500000')
    expect(parsed!.invoiceId).toBe('628705424')
    expect(parsed!.spent).toBe(false)
    // recordPlaintext 是 transfer_invoice 签名必需的完整 Leo 字面量（含 _nonce）
    expect(parsed!.plaintext).toContain('owner: ' + MERCHANT)
    expect(parsed!.plaintext).toContain('_nonce:')
    expect(parsed!.plaintext).toContain('invoice_id: 628705424field')
  })

  it('顶层 owner 是 commitment（field）而非地址，不得污染解析结果', () => {
    const parsed = parseInvoiceRecord(shieldOwnedRecord())
    // 若误把顶层 owner（field）当记录 owner，这里会失败
    expect(parsed!.owner).toMatch(/^aleo1/)
    expect(parsed!.owner).not.toContain('field')
  })

  it('invoice_id 不匹配时仍解析出字面量（匹配由调用方负责）', () => {
    const parsed = parseInvoiceRecord(shieldOwnedRecord({ invoiceId: '999999999' }))
    expect(parsed!.invoiceId).toBe('999999999')
    expect(parsed!.plaintext).toContain('invoice_id: 999999999field')
  })

  it('spent 记录仍可解析（过滤由调用方负责）', () => {
    const parsed = parseInvoiceRecord(shieldOwnedRecord({ spent: true }))
    expect(parsed!.spent).toBe(true)
    expect(parsed!.owner).toBe(MERCHANT)
  })

  it('无 recordPlaintext 时回退到 recordView.fields 结构化字段', () => {
    const rec = shieldOwnedRecord()
    delete rec.recordPlaintext
    const parsed = parseInvoiceRecord(rec)
    expect(parsed!.owner).toBe(MERCHANT)
    expect(parsed!.invoiceId).toBe('628705424')
    expect(parsed!.plaintext).toBe('')
  })

  it('纯字符串 Leo 记录字面量形态', () => {
    const literal = `{\n  owner: ${MERCHANT}.private,\n  amount: 250000u64.private,\n  invoice_id: 123456789field.private,\n  _nonce: 1group.public\n}`
    const parsed = parseInvoiceRecord(literal)
    expect(parsed!.owner).toBe(MERCHANT)
    expect(parsed!.amount).toBe('250000')
    expect(parsed!.invoiceId).toBe('123456789')
    expect(parsed!.plaintext).toBe(literal)
  })
})
