import { describe, expect, it } from 'vitest'

import {
  pollPaymentStatus,
  isTransactionConfirmed,
  extractPaymentReceipt,
  normalizePaymentError,
  isPermanentFailure,
  paymentIdToField,
  DEFAULT_POLL_INTERVAL_MS,
  type FetchTransaction,
} from '../src/verify.js'
import type { PaymentStatus } from '../src/types.js'
import type { TransactionJSON } from '@provablehq/sdk/testnet.js'

const PAYMENT_ID = 'inv_12345678'
// paymentIdToField('inv_12345678') 的确定性 field 值
const PAYMENT_FIELD = paymentIdToField(PAYMENT_ID)
const TX_ID = 'at1' + 'a'.repeat(61)

/** 构造已确认的 pay_invoice 交易（含 InvoiceRecord 输入，v3 4-input 原子结算） */
function makeConfirmedTx(overrides: Partial<TransactionJSON> = {}): TransactionJSON {
  return {
    type: 'execute',
    id: TX_ID,
    execution: {
      transitions: [
        {
          id: 'tr1',
          program: 'pay_private_v3.aleo',
          function: 'pay_invoice',
          inputs: [
            {
              type: 'record',
              id: 'in1',
              value:
                `{ owner: aleo1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.private, merchant: aleo1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.private, amount: 1500000u64.private, invoice_id: ${PAYMENT_FIELD}field.private, serial_number: 123field.private, _nonce: 1group }`,
            },
            { type: 'plaintext', id: 'in2', value: '1500000u64' },
            { type: 'plaintext', id: 'in3', value: '1group' },
            {
              type: 'record',
              id: 'in4',
              value:
                '{ owner: aleo1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.private, balance: 10000000u64.private, _nonce: 2group }',
            },
          ],
        },
      ],
    },
    fee: { transition: { id: 'fee1' } },
    ...overrides,
  } as unknown as TransactionJSON
}

/** 构造未确认（mempool）交易：无 pay_invoice 匹配 */
function makeUnrelatedTx(): TransactionJSON {
  return {
    type: 'execute',
    id: 'at1' + 'b'.repeat(61),
    execution: {
      transitions: [
        {
          id: 'tr2',
          program: 'credits.aleo',
          function: 'transfer_public',
          inputs: [],
        },
      ],
    },
    fee: { transition: { id: 'fee2' } },
  } as unknown as TransactionJSON
}

describe('isTransactionConfirmed', () => {
  it('已确认且发票匹配 → true', () => {
    expect(isTransactionConfirmed(makeConfirmedTx(), PAYMENT_ID)).toBe(true)
  })

  it('无 pay_invoice 匹配（非支付交易）→ false', () => {
    expect(isTransactionConfirmed(makeUnrelatedTx(), PAYMENT_ID)).toBe(false)
  })

  it('null → false', () => {
    expect(isTransactionConfirmed(null, PAYMENT_ID)).toBe(false)
  })

  it('发票 ID 不匹配 → false', () => {
    expect(isTransactionConfirmed(makeConfirmedTx(), 'inv_99999999')).toBe(false)
  })
})

describe('extractPaymentReceipt', () => {
  it('从已确认交易提取金额与发票 ID', () => {
    const receipt = extractPaymentReceipt(makeConfirmedTx(), PAYMENT_ID)
    expect(receipt).toEqual({
      amount: '1500000',
      invoice_id: PAYMENT_ID,
    })
  })

  it('null 输入 → null', () => {
    expect(extractPaymentReceipt(null, PAYMENT_ID)).toBeNull()
  })
})

describe('pollPaymentStatus（状态机）', () => {
  it('pending → confirmed（第二次轮询确认）', async () => {
    let calls = 0
    const fetchTx: FetchTransaction = async () => {
      calls += 1
      if (calls === 1) return null // 首次未确认
      return makeConfirmedTx() // 第二次已确认
    }

    const result = await pollPaymentStatus(PAYMENT_ID, fetchTx, {
      timeoutMs: 1000,
      intervalMs: 10,
    })

    expect(result.status).toBe('confirmed')
    if (result.status === 'confirmed') {
      expect(result.transaction_id).toBe(TX_ID)
      expect(result.amount).toBe('1500000')
      expect(result.invoice_id).toBe(PAYMENT_ID)
    }
    expect(calls).toBe(2)
  })

  it('一直未确认 → 超时 failed', async () => {
    const fetchTx: FetchTransaction = async () => null

    const result = await pollPaymentStatus(PAYMENT_ID, fetchTx, {
      timeoutMs: 100,
      intervalMs: 10,
    })

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error).toContain('超时')
    }
  })

  it('永久失败（重放 / 余额不足）→ 立即 failed', async () => {
    const fetchTx: FetchTransaction = async () => {
      throw new Error('duplicate transaction: replay detected')
    }

    const result = await pollPaymentStatus(PAYMENT_ID, fetchTx, {
      timeoutMs: 1000,
      intervalMs: 10,
    })

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error).toContain('replay')
    }
  })

  it('瞬时网络错误 → 继续轮询，最终 confirmed', async () => {
    let calls = 0
    const fetchTx: FetchTransaction = async () => {
      calls += 1
      if (calls === 1) throw new Error('fetch failed: ECONNREFUSED')
      return makeConfirmedTx()
    }

    const result = await pollPaymentStatus(PAYMENT_ID, fetchTx, {
      timeoutMs: 1000,
      intervalMs: 10,
    })

    expect(result.status).toBe('confirmed')
    expect(calls).toBe(2)
  })

  it('intervalMs 默认值为 3 秒常量', () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(3_000)
  })

  it('空 paymentId 由上层校验（verifyPayment 内联处理）', async () => {
    const fetchTx: FetchTransaction = async () => null
    // pollPaymentStatus 本身不做空校验（由 KethyrPay.verifyPayment 处理）
    const result = await pollPaymentStatus('', fetchTx, {
      timeoutMs: 100,
      intervalMs: 10,
    })
    expect(result.status).toBe('failed')
  })
})

describe('normalizePaymentError / isPermanentFailure', () => {
  it('网络错误规范化', () => {
    expect(normalizePaymentError(new Error('fetch failed: ECONNREFUSED'))).toContain(
      '网络错误',
    )
    expect(normalizePaymentError(new Error('timeout of 10000ms exceeded'))).toContain(
      '网络错误',
    )
  })

  it('交易未找到规范化', () => {
    expect(normalizePaymentError(new Error('Transaction not found'))).toContain(
      '交易未找到',
    )
  })

  it('永久失败识别', () => {
    expect(isPermanentFailure('duplicate transaction')).toBe(true)
    expect(isPermanentFailure('insufficient balance')).toBe(true)
    expect(isPermanentFailure('invoice expired')).toBe(true)
    expect(isPermanentFailure('fetch failed')).toBe(false)
  })
})

describe('verifyPayment 集成（依赖注入 fetchTransaction）', () => {
  it('确认路径返回完整 PaymentStatus', async () => {
    const status = await pollPaymentStatus(PAYMENT_ID, async () => makeConfirmedTx(), {
      timeoutMs: 100,
      intervalMs: 10,
    })

    const expected: PaymentStatus = {
      status: 'confirmed',
      transaction_id: TX_ID,
      amount: '1500000',
      invoice_id: PAYMENT_ID,
    }
    expect(status).toEqual(expected)
  })
})
