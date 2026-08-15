/**
 * 发票 store 单测（ALEO-MVP-012）。
 *
 * 覆盖：
 * - 创建：完整 PaymentIntent 结构（对齐 SDK 类型）、默认 30 分钟过期、自定义过期
 * - 幂等：同一 merchant+amount 重复创建返回已存在记录；不同 merchant/金额各自独立
 * - 查询：命中 / 404（不存在）
 * - 过期：惰性判定（expires_at 已过 → expired 且记录被清理）；未过期保持 pending
 * - 状态更新：paid / expired（含清理）
 * - 校验：非法金额 / 非法地址抛规范化错误
 */

import { describe, expect, it } from 'vitest'

import {
  InMemoryPaymentIntentStore,
  buildIdempotencyKey,
  maybeExpire,
  type PaymentIntentRecord,
} from '../src/lib/payment-intents-store.js'

const MERCHANT = 'aleo1' + 'a'.repeat(58)
const MERCHANT_B = 'aleo1' + 'b'.repeat(58)

/** 确定性发票 ID：inv_fixed01 / inv_fixed02 ... */
function makeSequentialIdGenerator() {
  let n = 1
  return () => `inv_fixed${String(n++).padStart(2, '0')}`
}

function makeStore() {
  return new InMemoryPaymentIntentStore({ generateInvoiceId: makeSequentialIdGenerator() })
}

describe('InMemoryPaymentIntentStore', () => {
  describe('创建', () => {
    it('返回完整 PaymentIntentRecord（对齐 SDK PaymentIntent 结构）', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({ amount: '1.5', merchant: MERCHANT })

      expect(record.invoice_id).toBe('inv_fixed01')
      expect(record.amount).toBe('1.500000')
      expect(record.merchant).toBe(MERCHANT)
      expect(record.expires_at).toBeDefined()
      expect(Date.parse(record.expires_at)).toBeGreaterThan(Date.now())
      expect(record.payment_url).toBe(
        `https://pay.kethyrpay.example/pay/${record.invoice_id}`,
      )
      // 交易参数（可直接交给钱包 signTransaction）
      expect(record.transaction.program).toBe('pay_private_v2.aleo')
      expect(record.transaction.function).toBe('pay_invoice')
      expect(record.transaction.inputs).toContain('1500000u64')
      // 持久化元数据
      expect(record.idempotencyKey).toBe(buildIdempotencyKey(MERCHANT, '1.500000'))
      expect(record.createdAt).toBeDefined()
      expect(record.status).toBe('pending')
    })

    it('默认过期 30 分钟', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
      const diff = Date.parse(record.expires_at) - Date.parse(record.createdAt)
      expect(diff).toBe(30 * 60 * 1000)
    })

    it('自定义 expiresInMs 生效（60 秒）', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({
        amount: '1',
        merchant: MERCHANT,
        expiresInMs: 60_000,
      })
      const diff = Date.parse(record.expires_at) - Date.parse(record.createdAt)
      expect(diff).toBe(60_000)
    })

    it('expiresInMs 传 0/负数 → 回退默认 30 分钟（与 SDK 语义一致）', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({
        amount: '1',
        merchant: MERCHANT,
        expiresInMs: 0,
      })
      const diff = Date.parse(record.expires_at) - Date.parse(record.createdAt)
      expect(diff).toBe(30 * 60 * 1000)
    })

    it('金额规范化：数字输入与字符串输入产生相同记录', () => {
      const storeA = makeStore()
      const storeB = makeStore()
      const a = storeA.createPaymentIntent({ amount: 2, merchant: MERCHANT })
      const b = storeB.createPaymentIntent({ amount: '2', merchant: MERCHANT })
      expect(a.amount).toBe('2.000000')
      expect(b.amount).toBe('2.000000')
    })

    it('非法金额 / 非法地址抛规范化错误', () => {
      const store = makeStore()
      expect(() => store.createPaymentIntent({ amount: '0', merchant: MERCHANT })).toThrow(
        'Invalid payment amount',
      )
      expect(() => store.createPaymentIntent({ amount: -5, merchant: MERCHANT })).toThrow(
        'Invalid payment amount',
      )
      expect(() => store.createPaymentIntent({ amount: 'abc', merchant: MERCHANT })).toThrow(
        'Invalid payment amount',
      )
      expect(() =>
        store.createPaymentIntent({ amount: '1', merchant: 'aleo1invalid' }),
      ).toThrow('Invalid Aleo address')
    })
  })

  describe('幂等', () => {
    it('同一 merchant + 同一金额重复创建 → 返回已存在记录（不新建）', () => {
      const store = makeStore()
      const first = store.createPaymentIntent({ amount: '1.5', merchant: MERCHANT })
      const second = store.createPaymentIntent({ amount: '1.5', merchant: MERCHANT })

      expect(second).toBe(first)
      expect(second.invoice_id).toBe(first.invoice_id)
      expect(store.size()).toBe(1)
    })

    it('同一 merchant + 不同金额 → 各自独立', () => {
      const store = makeStore()
      const a = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
      const b = store.createPaymentIntent({ amount: '2', merchant: MERCHANT })
      expect(a.invoice_id).not.toBe(b.invoice_id)
      expect(store.size()).toBe(2)
    })

    it('不同 merchant + 同一金额 → 各自独立', () => {
      const store = makeStore()
      const a = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
      const b = store.createPaymentIntent({ amount: '1', merchant: MERCHANT_B })
      expect(a.invoice_id).not.toBe(b.invoice_id)
      expect(store.size()).toBe(2)
    })

    it('金额输入形态不同（"1.5" vs 1.5）→ 规范化后同一幂等键', () => {
      const store = makeStore()
      const a = store.createPaymentIntent({ amount: '1.5', merchant: MERCHANT })
      const b = store.createPaymentIntent({ amount: 1.5, merchant: MERCHANT })
      expect(b).toBe(a)
      expect(store.size()).toBe(1)
    })
  })

  describe('查询', () => {
    it('按 invoice_id 命中', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
      const found = store.getPaymentIntent(record.invoice_id)
      expect(found).toEqual(record)
    })

    it('不存在的 invoice_id → null', () => {
      const store = makeStore()
      expect(store.getPaymentIntent('inv_missing')).toBeNull()
    })
  })

  describe('过期判定（惰性）', () => {
    it('expires_at 已过 → 返回 null 且记录被清理（status expired + delete）', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({
        amount: '1',
        merchant: MERCHANT,
        expiresInMs: -1000, // store 会回退默认；改用直接构造过期记录
      })
      // 直接构造一条已过期记录
      const expired: PaymentIntentRecord = {
        ...record,
        invoice_id: 'inv_expired',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }
      ;(store as unknown as { records: Map<string, PaymentIntentRecord> }).records.set(
        'inv_expired',
        expired,
      )

      const result = store.getPaymentIntent('inv_expired')
      expect(result).toBeNull()
      expect(store.getPaymentIntent('inv_expired')).toBeNull()
      expect(store.size()).toBe(1) // 过期记录已被清理，只剩最初那条
    })

    it('未过期的 pending 记录查询后保持 pending', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({
        amount: '1',
        merchant: MERCHANT,
        expiresInMs: 60_000,
      })
      const found = store.getPaymentIntent(record.invoice_id)
      expect(found?.status).toBe('pending')
    })
  })

  describe('maybeExpire（纯函数）', () => {
    it('未过期 → 原样返回', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({
        amount: '1',
        merchant: MERCHANT,
        expiresInMs: 60_000,
      })
      expect(maybeExpire(store, record)).toBe(record)
    })

    it('已过期 → 标记 expired 并返回 null', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
      const expired = {
        ...record,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }
      expect(maybeExpire(store, expired)).toBeNull()
    })
  })

  describe('状态更新', () => {
    it('updateStatus 置 paid（verifyPayment 驱动）', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
      const updated = store.updateStatus(record.invoice_id, 'paid')
      expect(updated?.status).toBe('paid')
      // 仍可查询（paid 不清理）
      expect(store.getPaymentIntent(record.invoice_id)?.status).toBe('paid')
    })

    it('updateStatus 置 expired → 记录被清理', () => {
      const store = makeStore()
      const record = store.createPaymentIntent({ amount: '1', merchant: MERCHANT })
      const updated = store.updateStatus(record.invoice_id, 'expired')
      expect(updated?.status).toBe('expired')
      expect(store.getPaymentIntent(record.invoice_id)).toBeNull()
      expect(store.size()).toBe(0)
    })

    it('更新不存在的记录 → null', () => {
      const store = makeStore()
      expect(store.updateStatus('inv_missing', 'paid')).toBeNull()
    })
  })
})
