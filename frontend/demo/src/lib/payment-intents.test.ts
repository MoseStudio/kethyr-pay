/**
 * payment-intents 纯逻辑单测（ALEO-MVP-010 demo 模式降级）。
 *
 * 覆盖：
 * - demo 参数解析（amount + merchant 校验 / return_url 过滤）
 * - demo 发票 ID 生成（确定性 + 前缀）
 * - buildDemoPaymentIntent 现场构造 transaction（pay_private.aleo pay_invoice）
 * - fetchPaymentIntent 后端未就绪（404）→ notReady 标记
 */

import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  buildDemoPaymentIntent,
  fetchPaymentIntent,
  generateDemoInvoiceId,
  parseDemoParams,
  sanitizeReturnUrl,
} from './payment-intents'

const MERCHANT = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseDemoParams', () => {
  it('解析合法的 amount + merchant', () => {
    const params = parseDemoParams({ amount: '1.5', merchant: MERCHANT })
    expect(params.amount).toBe('1.5')
    expect(params.merchant).toBe(MERCHANT)
  })

  it('amount 缺失 / 非正数时不启用 demo', () => {
    expect(parseDemoParams({ merchant: MERCHANT }).amount).toBeUndefined()
    expect(parseDemoParams({ amount: '0', merchant: MERCHANT }).amount).toBeUndefined()
    expect(parseDemoParams({ amount: '-3', merchant: MERCHANT }).amount).toBeUndefined()
    expect(parseDemoParams({ amount: 'abc', merchant: MERCHANT }).amount).toBeUndefined()
  })

  it('merchant 非法时禁用 demo（demo 需两者同时有效）', () => {
    const params = parseDemoParams({ amount: '1.5', merchant: 'not-an-address' })
    expect(params.amount).toBeUndefined()
    expect(params.merchant).toBeUndefined()
  })

  it('return_url 仅接受 http(s) / 相对路径，其余过滤', () => {
    expect(parseDemoParams({ amount: '1', merchant: MERCHANT, return_url: 'https://merchant.example/x' }).returnUrl).toBe('https://merchant.example/x')
    expect(parseDemoParams({ amount: '1', merchant: MERCHANT, return_url: 'javascript:alert(1)' }).returnUrl).toBeUndefined()
    expect(parseDemoParams({ amount: '1', merchant: MERCHANT, return_url: '' }).returnUrl).toBeUndefined()
    expect(parseDemoParams({ amount: '1', merchant: MERCHANT, return_url: 'not a url' }).returnUrl).toBeUndefined()
  })
})

describe('sanitizeReturnUrl', () => {
  it('相对地址基于当前 origin 解析', () => {
    expect(sanitizeReturnUrl('/order/1')).toBe('http://localhost/order/1')
  })

  it('空 / 非法输入返回 undefined', () => {
    expect(sanitizeReturnUrl(undefined)).toBeUndefined()
    expect(sanitizeReturnUrl('')).toBeUndefined()
    expect(sanitizeReturnUrl('not a url')).toBeUndefined()
  })
})

describe('generateDemoInvoiceId', () => {
  it('生成 inv_demo_ 前缀 ID，同一种子确定性', () => {
    const a = generateDemoInvoiceId('merchant+1.5', 1234567890)
    const b = generateDemoInvoiceId('merchant+1.5', 1234567890)
    expect(a.startsWith('inv_demo_')).toBe(true)
    expect(a).toBe(b)
  })

  it('不同种子 / 时间戳产生不同 ID', () => {
    const a = generateDemoInvoiceId('m1+1', 111)
    const b = generateDemoInvoiceId('m2+1', 111)
    const c = generateDemoInvoiceId('m1+1', 222)
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('buildDemoPaymentIntent', () => {
  it('现场构造 pay_private_v2.aleo pay_invoice 交易参数', () => {
    const intent = buildDemoPaymentIntent({
      invoiceId: 'inv_demo_abcd1234',
      amount: '1.5',
      merchant: MERCHANT,
      paymentBaseUrl: 'https://pay.kethyrpay.example',
    })

    expect(intent.invoice_id).toBe('inv_demo_abcd1234')
    expect(intent.amount).toBe('1.500000')
    expect(intent.merchant).toBe(MERCHANT)
    expect(intent.expires_at).toBeDefined()
    expect(intent.payment_url).toBe('https://pay.kethyrpay.example/pay/inv_demo_abcd1234')
    expect(intent.transaction).toMatchObject({
      program: 'pay_private_v2.aleo',
      function: 'pay_invoice',
      inputs: ['inv_demo_abcd1234', '1500000u64', '0group'],
      fee: 100000,
    })
  })

  it('金额规范化（6 位小数）', () => {
    const intent = buildDemoPaymentIntent({
      invoiceId: 'inv_demo_x',
      amount: '2',
      merchant: MERCHANT,
    })
    expect(intent.amount).toBe('2.000000')
  })

  it('非法商家地址抛错', () => {
    expect(() =>
      buildDemoPaymentIntent({ invoiceId: 'inv_demo_x', amount: '1', merchant: 'bad' }),
    ).toThrow(/merchant/i)
  })

  it('非法金额抛错', () => {
    expect(() =>
      buildDemoPaymentIntent({ invoiceId: 'inv_demo_x', amount: '0', merchant: MERCHANT }),
    ).toThrow(/amount/i)
  })
})

describe('fetchPaymentIntent（012 衔接）', () => {
  it('404 → notReady 标记（后端未就绪降级信号）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    )
    try {
      await fetchPaymentIntent('inv_missing')
      expect.unreachable('should throw')
    } catch (err) {
      expect((err as Error & { notReady?: boolean }).notReady).toBe(true)
      expect((err as Error).message).toContain('404')
    }
  })

  it('500 → 同样标记 notReady（后端未就绪 / 异常均降级）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    )
    try {
      await fetchPaymentIntent('inv_bad')
      expect.unreachable('should throw')
    } catch (err) {
      expect((err as Error & { notReady?: boolean }).notReady).toBe(true)
    }
  })

  it('网络不可达 → notReady 标记', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    try {
      await fetchPaymentIntent('inv_offline')
      expect.unreachable('should throw')
    } catch (err) {
      expect((err as Error & { notReady?: boolean }).notReady).toBe(true)
      expect((err as Error).message).toContain('无法加载发票')
    }
  })

  it('200 → 返回 PaymentIntent 载荷（解包 { intent } 契约）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            intent: {
              invoice_id: 'inv_ok',
              amount: '1.500000',
              merchant: MERCHANT,
              expires_at: new Date().toISOString(),
              payment_url: '/pay/inv_ok',
              transaction: { program: 'pay_private_v2.aleo' },
            },
          }),
          { status: 200 },
        ),
      ),
    )
    const intent = await fetchPaymentIntent('inv_ok')
    expect(intent.invoice_id).toBe('inv_ok')
    expect(intent.amount).toBe('1.500000')
  })
})
