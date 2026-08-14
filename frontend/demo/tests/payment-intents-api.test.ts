/**
 * 发票 API handler 单测（ALEO-MVP-012）。
 *
 * 用注入 store 的方式测 server fn handler：
 * - `setPaymentIntentStore(new InMemoryPaymentIntentStore({ generateInvoiceId: ... }))`
 *   替换全局 store，避免用例间相互污染。
 * - handler 返回 raw `Response`（server fn 的 raw Response 原样透传），
 *   测试直接断言 status 与 JSON body。
 *
 * 覆盖：
 * - POST：201 新建、200 幂等、400 非法输入（金额/地址/metadata/expiresInMs）、
 *   空 body、非对象 body
 * - GET：200 命中（pending）、404 不存在、400 空 invoiceId、过期 → 404 + 清理
 * - expire：200 / 404
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  handleCreatePaymentIntent,
  handleExpirePaymentIntent,
  handleGetPaymentIntent,
  handleListPaymentIntents,
  setPaymentIntentStore,
  resetPaymentIntentStore,
} from '../src/server/payment-intents-handlers.js'
import {
  InMemoryPaymentIntentStore,
  type PaymentIntentRecord,
} from '../src/lib/payment-intents-store.js'

const MERCHANT = 'aleo1' + 'a'.repeat(58)

function makeSequentialIdGenerator() {
  let n = 1
  return () => `inv_fixed${String(n++).padStart(2, '0')}`
}

function freshStore() {
  return new InMemoryPaymentIntentStore({ generateInvoiceId: makeSequentialIdGenerator() })
}

/** 解析 Response JSON body */
async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('POST /api/payment-intents (createPaymentIntent)', () => {
  afterEach(() => {
    resetPaymentIntentStore()
  })

  it('201：合法输入创建完整 PaymentIntent', async () => {
    setPaymentIntentStore(freshStore())
    const res = await handleCreatePaymentIntent({
      data: { amount: '1.5', merchant: MERCHANT },
    })
    expect(res.status).toBe(201)
    const body = await bodyOf(res)
    expect(body.idempotent).toBe(false)
    const intent = body.intent as PaymentIntentRecord
    expect(intent.invoice_id).toBe('inv_fixed01')
    expect(intent.amount).toBe('1.500000')
    expect(intent.merchant).toBe(MERCHANT)
    expect(intent.status).toBe('pending')
    expect(intent.transaction.function).toBe('pay_invoice')
  })

  it('200：同一 merchant+amount 幂等命中（idempotent: true）', async () => {
    setPaymentIntentStore(freshStore())
    const first = await handleCreatePaymentIntent({
      data: { amount: '1.5', merchant: MERCHANT },
    })
    const second = await handleCreatePaymentIntent({
      data: { amount: '1.5', merchant: MERCHANT },
    })
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    const firstBody = await bodyOf(first)
    const secondBody = await bodyOf(second)
    expect(secondBody.idempotent).toBe(true)
    expect((secondBody.intent as PaymentIntentRecord).invoice_id).toBe(
      (firstBody.intent as PaymentIntentRecord).invoice_id,
    )
  })

  it('400：非法金额（零 / 负数 / 非数字）返回规范化错误', async () => {
    setPaymentIntentStore(freshStore())
    for (const bad of ['0', '-1', 'abc', '1e-7']) {
      const res = await handleCreatePaymentIntent({ data: { amount: bad, merchant: MERCHANT } })
      expect(res.status).toBe(400)
      const body = await bodyOf(res)
      expect(String(body.error)).toContain('Invalid payment amount')
    }
  })

  it('400：非法商家地址', async () => {
    setPaymentIntentStore(freshStore())
    const res = await handleCreatePaymentIntent({ data: { amount: '1', merchant: 'aleo1bad' } })
    expect(res.status).toBe(400)
    const body = await bodyOf(res)
    expect(String(body.error)).toContain('Invalid Aleo address')
  })

  it('400：缺 amount / 缺 merchant', async () => {
    setPaymentIntentStore(freshStore())
    const noAmount = await handleCreatePaymentIntent({ data: { merchant: MERCHANT } })
    expect(noAmount.status).toBe(400)
    const noMerchant = await handleCreatePaymentIntent({ data: { amount: '1' } })
    expect(noMerchant.status).toBe(400)
  })

  it('400：metadata 非对象 / expiresInMs 非法', async () => {
    setPaymentIntentStore(freshStore())
    const badMetadata = await handleCreatePaymentIntent({
      data: { amount: '1', merchant: MERCHANT, metadata: 'nope' },
    })
    expect(badMetadata.status).toBe(400)
    expect(String((await bodyOf(badMetadata)).error)).toContain('metadata')

    const badExpiry = await handleCreatePaymentIntent({
      data: { amount: '1', merchant: MERCHANT, expiresInMs: -100 },
    })
    expect(badExpiry.status).toBe(400)
    expect(String((await bodyOf(badExpiry)).error)).toContain('expiresInMs')
  })

  it('400：空 body / 非对象 body', async () => {
    setPaymentIntentStore(freshStore())
    const empty = await handleCreatePaymentIntent({ data: undefined })
    expect(empty.status).toBe(400)
    const notObject = await handleCreatePaymentIntent({ data: 'hello' })
    expect(notObject.status).toBe(400)
  })

  it('expiresInMs 生效：过期时间约为 created + expiresInMs', async () => {
    setPaymentIntentStore(freshStore())
    const res = await handleCreatePaymentIntent({
      data: { amount: '1', merchant: MERCHANT, expiresInMs: 60_000 },
    })
    expect(res.status).toBe(201)
    const intent = (await bodyOf(res)).intent as PaymentIntentRecord
    const diff = Date.parse(intent.expires_at) - Date.parse(intent.createdAt)
    expect(diff).toBe(60_000)
  })
})

describe('GET /api/payment-intents/:id (getPaymentIntent)', () => {
  afterEach(() => {
    setPaymentIntentStore(freshStore())
  })

  it('200：按 invoice_id 命中（pending）', async () => {
    setPaymentIntentStore(freshStore())
    await handleCreatePaymentIntent({ data: { amount: '1', merchant: MERCHANT } })
    const res = await handleGetPaymentIntent({ data: { invoiceId: 'inv_fixed01' } })
    expect(res.status).toBe(200)
    const intent = (await bodyOf(res)).intent as PaymentIntentRecord
    expect(intent.invoice_id).toBe('inv_fixed01')
    expect(intent.status).toBe('pending')
  })

  it('404：不存在的 invoice_id', async () => {
    setPaymentIntentStore(freshStore())
    const res = await handleGetPaymentIntent({ data: { invoiceId: 'inv_nope' } })
    expect(res.status).toBe(404)
    expect(String((await bodyOf(res)).error)).toContain('inv_nope')
  })

  it('400：空 invoiceId', async () => {
    setPaymentIntentStore(freshStore())
    const res = await handleGetPaymentIntent({ data: { invoiceId: '' } })
    expect(res.status).toBe(400)
  })

  it('过期记录查询 → 404 且被惰性清理', async () => {
    setPaymentIntentStore(freshStore())
    await handleCreatePaymentIntent({ data: { amount: '1', merchant: MERCHANT } })
    const store = new InMemoryPaymentIntentStore({
      generateInvoiceId: makeSequentialIdGenerator(),
    })
    // 直接向 store 注入一条已过期记录
    const rec = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
    ;(store as unknown as { records: Map<string, PaymentIntentRecord> }).records.set(
      'inv_expired',
      {
        ...rec,
        invoice_id: 'inv_expired',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    )
    setPaymentIntentStore(store)

    const res = await handleGetPaymentIntent({ data: { invoiceId: 'inv_expired' } })
    expect(res.status).toBe(404)
    // 已被清理
    expect(store.getPaymentIntent('inv_expired')).toBeNull()
  })
})

describe('POST /api/payment-intents/:id/expire (expirePaymentIntent)', () => {
  afterEach(() => {
    setPaymentIntentStore(freshStore())
  })

  it('200：显式过期已存在的发票', async () => {
    setPaymentIntentStore(freshStore())
    await handleCreatePaymentIntent({ data: { amount: '1', merchant: MERCHANT } })
    const res = await handleExpirePaymentIntent({ data: { invoiceId: 'inv_fixed01' } })
    expect(res.status).toBe(200)
    const intent = (await bodyOf(res)).intent as PaymentIntentRecord
    expect(intent.status).toBe('expired')
  })

  it('404：过期不存在的发票', async () => {
    setPaymentIntentStore(freshStore())
    const res = await handleExpirePaymentIntent({ data: { invoiceId: 'inv_nope' } })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/payment-intents?merchant=xxx (listPaymentIntents)', () => {
  afterEach(() => {
    setPaymentIntentStore(freshStore())
  })

  it('200：按商家列出全部记录（倒序）', async () => {
    setPaymentIntentStore(freshStore())
    await handleCreatePaymentIntent({ data: { amount: '1', merchant: MERCHANT } })
    await handleCreatePaymentIntent({ data: { amount: '2', merchant: MERCHANT } })
    // 另一商家的记录不应混入
    await handleCreatePaymentIntent({
      data: { amount: '3', merchant: 'aleo1' + 'b'.repeat(58) },
    })

    const res = await handleListPaymentIntents({ data: { merchant: MERCHANT } })
    expect(res.status).toBe(200)
    const intents = ((await bodyOf(res)).intents ?? []) as PaymentIntentRecord[]
    expect(intents).toHaveLength(2)
    // 倒序：先创建的在后面
    expect(intents[0].invoice_id).toBe('inv_fixed02')
    expect(intents[1].invoice_id).toBe('inv_fixed01')
  })

  it('200：无记录时返回空数组', async () => {
    setPaymentIntentStore(freshStore())
    const res = await handleListPaymentIntents({ data: { merchant: MERCHANT } })
    expect(res.status).toBe(200)
    const intents = ((await bodyOf(res)).intents ?? []) as PaymentIntentRecord[]
    expect(intents).toEqual([])
  })

  it('400：缺 merchant / 非法地址', async () => {
    setPaymentIntentStore(freshStore())
    const missing = await handleListPaymentIntents({ data: {} })
    expect(missing.status).toBe(400)
    const invalid = await handleListPaymentIntents({ data: { merchant: 'not-an-address' } })
    expect(invalid.status).toBe(400)
  })
})
