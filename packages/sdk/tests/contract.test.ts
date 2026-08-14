import { describe, expect, it } from 'vitest'

import {
  PROGRAM_ID,
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
} from '../src/contract.js'

describe('isValidAleoAddress', () => {
  it('接受合法 aleo 地址', () => {
    expect(isValidAleoAddress('aleo1' + 'a'.repeat(58))).toBe(true)
    expect(isValidAleoAddress('aleo1' + '0'.repeat(58))).toBe(true)
  })

  it('拒绝非法地址', () => {
    expect(isValidAleoAddress('')).toBe(false)
    expect(isValidAleoAddress('aleo1')).toBe(false)
    expect(isValidAleoAddress('aleo1' + 'a'.repeat(57))).toBe(false) // 长度不足
    expect(isValidAleoAddress('aleo1' + 'A'.repeat(58))).toBe(false) // 大写
    expect(isValidAleoAddress('alex1' + 'a'.repeat(58))).toBe(false) // 前缀错误
  })
})

describe('credits <-> microcredits 转换', () => {
  it('creditsToMicrocredits：字符串 → bigint', () => {
    expect(creditsToMicrocredits('1')).toBe(1_000_000n)
    expect(creditsToMicrocredits('1.5')).toBe(1_500_000n)
    expect(creditsToMicrocredits('0')).toBe(0n)
    expect(creditsToMicrocredits('0.000001')).toBe(1n)
  })

  it('creditsToMicrocredits：非法输入抛错', () => {
    expect(() => creditsToMicrocredits('abc')).toThrow('Invalid credit amount')
    expect(() => creditsToMicrocredits('-1')).toThrow('Invalid credit amount')
    expect(() => creditsToMicrocredits('NaN')).toThrow('Invalid credit amount')
  })

  it('microcreditsToCredits：bigint/number → 6 位小数字符串', () => {
    expect(microcreditsToCredits(1_500_000n)).toBe('1.500000')
    expect(microcreditsToCredits(1)).toBe('0.000001')
    expect(microcreditsToCredits(0)).toBe('0.000000')
  })

  it('round-trip：credits → microcredits → credits', () => {
    expect(microcreditsToCredits(creditsToMicrocredits('2.5'))).toBe('2.500000')
  })
})

describe('encodeU64 / encodeU32 / encodeAddress', () => {
  it('encodeU64：credits → u64 字面量', () => {
    expect(encodeU64('1.5')).toBe('1500000u64')
    expect(encodeU64('0.1')).toBe('100000u64')
  })

  it('encodeU32：数值 → u32 字面量 + 范围校验', () => {
    expect(encodeU32(42)).toBe('42u32')
    expect(encodeU32('7')).toBe('7u32')
    expect(encodeU32(4_294_967_295)).toBe('4294967295u32')
    expect(() => encodeU32(4_294_967_296)).toThrow('Invalid u32 value')
    expect(() => encodeU32(-1)).toThrow('Invalid u32 value')
    expect(() => encodeU32('abc')).toThrow('Invalid u32 value')
  })

  it('encodeAddress：合法地址原样返回，非法抛错', () => {
    const addr = 'aleo1' + 'a'.repeat(58)
    expect(encodeAddress(addr)).toBe(addr)
    expect(() => encodeAddress('bad')).toThrow('Invalid Aleo address')
  })
})

describe('stripVisibilitySuffix / cleanRecordInput', () => {
  it('stripVisibilitySuffix 去掉 .private / .public 后缀', () => {
    expect(stripVisibilitySuffix('100u64.private')).toBe('100u64')
    expect(stripVisibilitySuffix('aleo1xxx.public')).toBe('aleo1xxx')
    expect(stripVisibilitySuffix('  42u32.private  ')).toBe('42u32')
    expect(stripVisibilitySuffix('plain')).toBe('plain')
  })

  it('cleanRecordInput 原样返回非空输入（保留可见性后缀）', () => {
    expect(cleanRecordInput('  { owner: aleo1x, amount: 1u64.private }  ')).toBe(
      '{ owner: aleo1x, amount: 1u64.private }',
    )
    expect(cleanRecordInput('   ')).toBeNull()
  })
})

describe('parsePaymentRecord', () => {
  const jsonRecord = JSON.stringify({
    owner: 'aleo1' + 'a'.repeat(58),
    merchant: 'aleo1' + 'b'.repeat(58),
    amount: '1000000u64.private',
    period: '30u32.private',
    escrow_serial_reference: '123field',
  })

  it('解析 JSON 记录并去除可见性后缀', () => {
    const record = parsePaymentRecord(jsonRecord)
    expect(record).not.toBeNull()
    expect(record!.owner).toBe('aleo1' + 'a'.repeat(58))
    expect(record!.merchant).toBe('aleo1' + 'b'.repeat(58))
    expect(record!.amount).toBe('1000000u64')
    expect(record!.period).toBe('30u32')
  })

  it('解析 Leo 记录字面量', () => {
    const leo = `{
      owner: aleo1${'c'.repeat(58)}.private,
      merchant: aleo1${'d'.repeat(58)}.private,
      amount: 5000000u64.private,
      period: 7u32.private,
      escrow_serial_reference: 456field
    }`
    const record = parsePaymentRecord(leo)
    expect(record).not.toBeNull()
    expect(record!.amount).toBe('5000000u64')
    expect(record!.escrow_serial_reference).toBe('456field')
  })

  it('无法解析时返回 null', () => {
    expect(parsePaymentRecord('')).toBeNull()
    expect(parsePaymentRecord('   ')).toBeNull()
    expect(parsePaymentRecord('garbage')).toBeNull()
  })
})

describe('createTransactionOptions', () => {
  it('使用默认 PROGRAM_ID / DEFAULT_FEE 构造选项', () => {
    const opts = createTransactionOptions('pay_invoice', ['1u64', 'aleo1xxx'])
    expect(opts.program).toBe(PROGRAM_ID)
    expect(opts.program).toBe('pay_private_v2.aleo')
    expect(opts.function).toBe('pay_invoice')
    expect(opts.inputs).toEqual(['1u64', 'aleo1xxx'])
    expect(opts.fee).toBe(DEFAULT_FEE)
    expect(opts.privateFee).toBe(false)
  })

  it('支持自定义 program / fee / privateFee', () => {
    const opts = createTransactionOptions(
      'fn',
      ['x'],
      'custom.aleo',
      123,
      true,
    )
    expect(opts.program).toBe('custom.aleo')
    expect(opts.fee).toBe(123)
    expect(opts.privateFee).toBe(true)
  })

  it('createPayInvoiceTransaction：无 invoiceRecord 时传 invoiceId 数字', () => {
    const opts = createPayInvoiceTransaction({
      invoiceId: '123456789',
      amount: '1.5',
      merchant: 'aleo1' + 'a'.repeat(58),
    })
    expect(opts.function).toBe('pay_invoice')
    expect(opts.inputs).toEqual(['123456789', '1500000u64', '1group'])
  })

  it('createPayInvoiceTransaction：带 invoiceRecord 时记录优先', () => {
    const record =
      '{ owner: aleo1' + 'a'.repeat(58) + '.private, amount: 1500000u64.private }'
    const opts = createPayInvoiceTransaction({
      invoiceId: '123456789',
      amount: '1.5',
      merchant: 'aleo1' + 'a'.repeat(58),
      invoiceRecord: record,
    })
    expect(opts.inputs).toEqual([record, '1500000u64', '1group'])
  })
})

describe('createInvoiceTransaction', () => {
  const MERCHANT = 'aleo1' + 'a'.repeat(58)

  it('构造 create_invoice 交易（merchant, amount, invoice_id field）', () => {
    const opts = createInvoiceTransaction({
      merchant: MERCHANT,
      amount: '1.5',
      invoiceId: '123456789',
    })
    expect(opts.program).toBe(PROGRAM_ID)
    expect(opts.function).toBe('create_invoice')
    expect(opts.inputs).toEqual([MERCHANT, '1500000u64', '123456789field'])
  })

  it('支持自定义 fee', () => {
    const opts = createInvoiceTransaction({
      merchant: MERCHANT,
      amount: '0.1',
      invoiceId: '42',
      fee: 200_000,
    })
    expect(opts.fee).toBe(200_000)
  })

  it('拒绝非法商家地址', () => {
    expect(() =>
      createInvoiceTransaction({ merchant: 'bad', amount: '1', invoiceId: '1' }),
    ).toThrow('Invalid Aleo address')
  })
})

describe('transferInvoiceTransaction', () => {
  const RECORD = '{ owner: aleo1' + 'a'.repeat(58) + '.private, merchant: aleo1' + 'b'.repeat(58) + '.private, amount: 1000000u64.private, invoice_id: 42field, serial_number: 7field }'
  const PAYEE = 'aleo1' + 'c'.repeat(58)

  it('构造 transfer_invoice 交易（invoice, to）', () => {
    const opts = transferInvoiceTransaction({
      invoiceRecord: RECORD,
      to: PAYEE,
    })
    expect(opts.program).toBe(PROGRAM_ID)
    expect(opts.function).toBe('transfer_invoice')
    expect(opts.inputs).toEqual([RECORD, PAYEE])
  })

  it('拒绝非法收款地址', () => {
    expect(() =>
      transferInvoiceTransaction({ invoiceRecord: RECORD, to: 'bad' }),
    ).toThrow('Invalid Aleo address')
  })
})
