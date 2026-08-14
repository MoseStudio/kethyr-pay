import { describe, expect, it } from 'vitest'

import {
  AleoPay,
  DEFAULT_PAYMENT_BASE_URL,
  generateInvoiceId,
  normalizeAmount,
  validateMerchant,
} from '../src/aleopay.js'
import {
  createMemoryWalletAdapter,
  createShieldAdapter,
  type WalletAdapter,
} from '../src/wallet.js'
import { paymentIdToField } from '../src/verify.js'
import type { PaymentIntent, PaymentStatus } from '../src/types.js'
import type { TransactionJSON } from '@provablehq/sdk/testnet.js'

const MERCHANT = 'aleo1' + 'a'.repeat(58)

function makeMemoryWallet(): WalletAdapter {
  return createMemoryWalletAdapter({ address: 'aleo1' + 'b'.repeat(58) })
}

const PAYMENT_ID = 'inv_12345678'

/** 已确认的 pay_invoice 交易 fixture（与 tests/verify.test.ts 对齐） */
function makeConfirmedTx(): TransactionJSON {
  return {
    type: 'execute',
    id: 'at1' + 'a'.repeat(61),
    execution: {
      transitions: [
        {
          id: 'tr1',
          program: 'pay_private_v2.aleo',
          function: 'pay_invoice',
          inputs: [
            {
              type: 'record',
              id: 'in1',
              value:
                `{ owner: aleo1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.private, merchant: aleo1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.private, amount: 1500000u64.private, invoice_id: ${paymentIdToField(PAYMENT_ID)}field.private, serial_number: 123field.private, _nonce: 1group }`,
            },
            { type: 'plaintext', id: 'in2', value: '1500000u64' },
            { type: 'plaintext', id: 'in3', value: '1group' },
          ],
        },
      ],
    },
    fee: { transition: { id: 'fee1' } },
  } as unknown as TransactionJSON
}

describe('AleoPay 主类', () => {
  it('create() 完成初始化并注入内存钱包（skipWasmInit）', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
    })

    expect(aleoPay).toBeInstanceOf(AleoPay)
    expect(aleoPay.wasmReady).toBe(false)
    expect(aleoPay.connected).toBe(false)
    expect(aleoPay.wallet.name).toBe('Memory Wallet')
  })

  it('autoConnect 在 create 时自动连接钱包', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
      autoConnect: true,
    })
    expect(aleoPay.connected).toBe(true)
    expect(aleoPay.getPublicKey()).toBe('aleo1' + 'b'.repeat(58))
  })

  it('connectWallet / disconnectWallet / getPublicKey 生命周期', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
    })

    expect(aleoPay.getPublicKey()).toBeNull()

    const address = await aleoPay.connectWallet()
    expect(address).toBe('aleo1' + 'b'.repeat(58))
    expect(aleoPay.connected).toBe(true)
    expect(aleoPay.getPublicKey()).toBe(address)

    await aleoPay.disconnectWallet()
    expect(aleoPay.connected).toBe(false)
    expect(aleoPay.getPublicKey()).toBeNull()
  })

  it('createPayment 返回完整 PaymentIntent（含交易参数）', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
    })

    const intent = await aleoPay.createPayment({ amount: '1.5', merchant: MERCHANT })

    expect(intent.invoice_id).toMatch(/^inv_[0-9a-f]{8}$/)
    expect(intent.amount).toBe('1.500000')
    expect(intent.merchant).toBe(MERCHANT)
    expect(intent.expires_at).toBeDefined()
    expect(Date.parse(intent.expires_at)).toBeGreaterThan(Date.now())
    expect(intent.payment_url).toBe(
      `${DEFAULT_PAYMENT_BASE_URL}/pay/${intent.invoice_id}`,
    )
    // 交易参数可直接交给钱包
    expect(intent.transaction.program).toBe('pay_private_v2.aleo')
    expect(intent.transaction.function).toBe('pay_invoice')
    expect(intent.transaction.inputs).toContain(`${1.5 * 1_000_000}u64`)
  })

  it('createPayment 使用自定义 paymentBaseUrl', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
      paymentBaseUrl: 'https://checkout.aleopay.dev',
    })

    const intent = await aleoPay.createPayment({ amount: '0.01', merchant: MERCHANT })
    expect(intent.payment_url).toBe(
      `https://checkout.aleopay.dev/pay/${intent.invoice_id}`,
    )
  })

  it('createPayment 校验金额（非法 / 零 / 负数 / 非数字）', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
    })

    await expect(
      aleoPay.createPayment({ amount: '0', merchant: MERCHANT }),
    ).rejects.toThrow('Invalid payment amount')
    await expect(
      aleoPay.createPayment({ amount: -5, merchant: MERCHANT }),
    ).rejects.toThrow('Invalid payment amount')
    await expect(
      aleoPay.createPayment({ amount: 'abc', merchant: MERCHANT }),
    ).rejects.toThrow('Invalid payment amount')
    await expect(
      aleoPay.createPayment({ amount: '1e-7', merchant: MERCHANT }),
    ).rejects.toThrow('Invalid payment amount')
  })

  it('createPayment 校验商家地址（非法地址抛错）', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
    })

    await expect(
      aleoPay.createPayment({ amount: '1', merchant: 'aleo1invalid' }),
    ).rejects.toThrow('Invalid Aleo address')
  })

  it('createPayment 尊重 expiresInMs（自定义过期时间）', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
    })

    const intent = await aleoPay.createPayment({
      amount: '1',
      merchant: MERCHANT,
      expiresInMs: 60_000,
    })
    const diff = Date.parse(intent.expires_at) - Date.now()
    expect(diff).toBeGreaterThan(50_000)
    expect(diff).toBeLessThanOrEqual(70_000)
  })

  it('verifyPayment 注入 fetchTransaction → confirmed（ALEO-MVP-008）', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
      fetchTransaction: async () => makeConfirmedTx(),
    })

    const status = await aleoPay.verifyPayment(PAYMENT_ID, { timeoutMs: 100 })

    expect(status.status).toBe('confirmed')
    if (status.status === 'confirmed') {
      expect(status.amount).toBe('1500000')
      expect(status.invoice_id).toBe(PAYMENT_ID)
      expect(status.transaction_id).toMatch(/^at1/)
    }
  })

  it('verifyPayment 空 paymentId → failed', async () => {
    const aleoPay = await AleoPay.create({
      skipWasmInit: true,
      wallet: makeMemoryWallet,
      fetchTransaction: async () => null,
    })

    const status = await aleoPay.verifyPayment('')
    expect(status.status).toBe('failed')
    if (status.status === 'failed') {
      expect(status.error).toContain('paymentId')
    }
  })

  it('类型占位可被消费（PaymentIntent / PaymentStatus 结构）', () => {
    const intent: PaymentIntent = {
      invoice_id: 'inv_001',
      amount: '1.5',
      merchant: MERCHANT,
      expires_at: new Date().toISOString(),
      payment_url: 'https://pay.aleopay.example/pay/inv_001',
      transaction: {
        program: 'pay_private_v2.aleo',
        function: 'pay_invoice',
        inputs: ['1', '1500000u64', '1group'],
      },
    }
    const pending: PaymentStatus = { status: 'pending', transaction_id: 'at1x' }
    const confirmed: PaymentStatus = {
      status: 'confirmed',
      transaction_id: 'at1x',
      amount: '1.500000',
      invoice_id: 'inv_001',
    }
    const failed: PaymentStatus = { status: 'failed', error: 'insufficient balance' }

    expect(intent.invoice_id).toBe('inv_001')
    expect(pending.status).toBe('pending')
    expect(confirmed.status).toBe('confirmed')
    expect(failed.status).toBe('failed')
  })
})

describe('createPayment 纯函数 helpers', () => {
  it('generateInvoiceId 产出唯一且符合格式的 ID', () => {
    const a = generateInvoiceId(MERCHANT)
    const b = generateInvoiceId(MERCHANT, 1234567890)
    const c = generateInvoiceId(MERCHANT, 1234567890)

    expect(a).toMatch(/^inv_[0-9a-f]{8}$/)
    expect(b).toMatch(/^inv_[0-9a-f]{8}$/)
    expect(b).not.toBe(a)
    // 同一 merchant + 同一时间戳但不同随机数 → 不同 ID（碰撞概率极低）
    expect(c).not.toBe(a)
  })

  it('normalizeAmount 规范化金额', () => {
    expect(normalizeAmount('1.5')).toBe('1.500000')
    expect(normalizeAmount(2)).toBe('2.000000')
    expect(normalizeAmount(' 0.01 ')).toBe('0.010000')
  })

  it('validateMerchant 校验地址', () => {
    expect(validateMerchant(MERCHANT)).toBe(MERCHANT)
    expect(() => validateMerchant('aleo1bad')).toThrow('Invalid Aleo address')
  })
})

describe('createShieldAdapter（client-only 守卫）', () => {
  it('在非浏览器环境调用时抛出明确错误', async () => {
    // vitest 默认 node 环境，window 未定义
    await expect(createShieldAdapter()).rejects.toThrow('仅支持浏览器环境')
  })
})
