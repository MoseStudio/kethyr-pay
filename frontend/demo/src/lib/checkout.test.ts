/**
 * checkout 纯逻辑单测（ALEO-MVP-010 / 011 状态与倒计时）。
 *
 * 覆盖：
 * - 支付错误分类（余额不足 / 重复支付 / 过期 / 网络 / 未知）
 * - 过期倒计时计算与格式化
 * - 地址截断
 * - 状态页查询参数解析（tx / return_url / rpc）
 * - 轮询进度
 */

import { describe, expect, it } from 'vitest'

import {
  classifyPaymentError,
  formatRemaining,
  getRemainingMs,
  parseStatusSearch,
  pollProgress,
  sanitizeHttpUrl,
  truncateAddress,
} from './checkout'

describe('classifyPaymentError', () => {
  it('余额不足', () => {
    expect(classifyPaymentError(new Error('Insufficient balance: need 5000000 microcredits')).kind).toBe(
      'insufficient-balance',
    )
  })

  it('重复支付', () => {
    expect(classifyPaymentError(new Error('Transaction replay detected')).kind).toBe('duplicate-payment')
    expect(classifyPaymentError(new Error('invoice already paid')).kind).toBe('duplicate-payment')
  })

  it('过期', () => {
    expect(classifyPaymentError(new Error('Invoice has expired')).kind).toBe('expired')
  })

  it('网络错误', () => {
    expect(classifyPaymentError(new Error('fetch failed: ECONNREFUSED')).kind).toBe('network')
    expect(classifyPaymentError(new Error('request timed out')).kind).toBe('network')
  })

  it('未知错误兜底', () => {
    expect(classifyPaymentError(new Error('Something weird')).kind).toBe('unknown')
    expect(classifyPaymentError('plain string')).toEqual({ kind: 'unknown', message: 'plain string' })
  })
})

describe('getRemainingMs / formatRemaining', () => {
  it('计算剩余毫秒', () => {
    const now = Date.now()
    const expires = new Date(now + 65_000).toISOString()
    const remaining = getRemainingMs(expires, now)
    expect(remaining).toBeGreaterThan(64_000)
    expect(remaining).toBeLessThanOrEqual(65_000)
  })

  it('已过期 / 无效日期 → 0', () => {
    expect(getRemainingMs(undefined, 1_000)).toBe(0)
    expect(getRemainingMs('not-a-date', 1_000)).toBe(0)
    expect(getRemainingMs(new Date(Date.now() - 1000).toISOString(), Date.now())).toBe(0)
  })

  it('格式化为 mm:ss / h:mm:ss', () => {
    expect(formatRemaining(65_000)).toBe('01:05')
    expect(formatRemaining(3_661_000)).toBe('1:01:01')
    expect(formatRemaining(0)).toBe('00:00')
  })
})

describe('truncateAddress', () => {
  it('长地址截断为 head…tail', () => {
    const addr = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'
    const out = truncateAddress(addr)
    expect(out).toContain('…')
    expect(out.startsWith(addr.slice(0, 10))).toBe(true)
    expect(out.endsWith(addr.slice(-8))).toBe(true)
  })

  it('短字符串原样返回', () => {
    expect(truncateAddress('short')).toBe('short')
  })
})

describe('parseStatusSearch', () => {
  it('解析 tx / return_url / rpc', () => {
    const parsed = parseStatusSearch({
      tx: 'at1abc',
      return_url: 'https://merchant.example/ok',
      rpc: 'https://custom.node',
    })
    expect(parsed).toEqual({
      txId: 'at1abc',
      returnUrl: 'https://merchant.example/ok',
      rpcEndpoint: 'https://custom.node',
    })
  })

  it('非法 return_url 被过滤', () => {
    expect(parseStatusSearch({ return_url: 'javascript:alert(1)' }).returnUrl).toBeUndefined()
  })

  it('缺失参数 → undefined', () => {
    expect(parseStatusSearch({})).toEqual({
      txId: undefined,
      returnUrl: undefined,
      rpcEndpoint: undefined,
    })
  })
})

describe('sanitizeHttpUrl', () => {
  it('仅接受 http(s) 绝对地址', () => {
    expect(sanitizeHttpUrl('https://a.b/c')).toBe('https://a.b/c')
    expect(sanitizeHttpUrl('http://a.b')).toBe('http://a.b/') // URL 规范化补尾斜杠
    expect(sanitizeHttpUrl('ftp://a.b')).toBeUndefined()
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeHttpUrl('')).toBeUndefined()
    expect(sanitizeHttpUrl(undefined)).toBeUndefined()
  })
})

describe('pollProgress', () => {
  it('按已用时间 / 总超时计算 0..1 进度并封顶', () => {
    expect(pollProgress(0, 60_000)).toBe(0)
    expect(pollProgress(30_000, 60_000)).toBe(0.5)
    expect(pollProgress(90_000, 60_000)).toBe(1)
    expect(pollProgress(100, 0)).toBe(0)
  })
})
