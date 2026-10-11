import { describe, it, expect } from 'vitest'

import {
  computeClaimable,
  computeUnlocked,
  formatRateBps,
  formatTokenAmount,
  interpolateUnlocked,
  parseTokenAmount,
  splitWithholding,
  streamingSnapshot,
  vestingProgress,
  type VestingParams,
} from './vesting.ts'

const base: VestingParams = {
  total: 1_000_000n,
  withdrawn: 0n,
  startTime: 1_000,
  endTime: 2_000,
}

describe('computeUnlocked', () => {
  it('在开始前为 0', () => {
    expect(computeUnlocked(base, 999)).toBe(0n)
    expect(computeUnlocked(base, 1_000)).toBe(0n)
  })

  it('线性解锁到中点', () => {
    expect(computeUnlocked(base, 1_500)).toBe(500_000n)
  })

  it('在结束后封顶为总额', () => {
    expect(computeUnlocked(base, 2_000)).toBe(1_000_000n)
    expect(computeUnlocked(base, 9_999)).toBe(1_000_000n)
  })

  it('大额不溢出（u128 中间量语义）', () => {
    const big: VestingParams = {
      total: 18_446_744_073_709_551_615n, // u64::MAX
      withdrawn: 0n,
      startTime: 0,
      endTime: 1_000_000,
    }
    expect(computeUnlocked(big, 500_000)).toBe(9_223_372_036_854_775_807n)
  })
})

describe('computeClaimable', () => {
  it('扣除已提取', () => {
    expect(computeClaimable({ ...base, withdrawn: 200_000n }, 1_500)).toBe(300_000n)
  })

  it('已提取超过解锁时下限为 0', () => {
    expect(computeClaimable({ ...base, withdrawn: 900_000n }, 1_100)).toBe(0n)
  })
})

describe('splitWithholding', () => {
  it('15% 代扣', () => {
    expect(splitWithholding(10_000n, 1_500)).toEqual({ net: 8_500n, tax: 1_500n })
  })

  it('0% 与 100% 边界', () => {
    expect(splitWithholding(1_234n, 0)).toEqual({ net: 1_234n, tax: 0n })
    expect(splitWithholding(1_234n, 10_000)).toEqual({ net: 0n, tax: 1_234n })
  })

  it('取整归入 net（net + tax == amount）', () => {
    const amount = 1_000_000_007n
    const { net, tax } = splitWithholding(amount, 1_500)
    expect(net + tax).toBe(amount)
  })
})

describe('vestingProgress', () => {
  it('边界与中点', () => {
    expect(vestingProgress(base, 900)).toBe(0)
    expect(vestingProgress(base, 1_500)).toBe(0.5)
    expect(vestingProgress(base, 3_000)).toBe(1)
  })
})

describe('金额格式化', () => {
  it('formatTokenAmount 去除末尾 0', () => {
    expect(formatTokenAmount(1_500_000n, 6)).toBe('1.5')
    expect(formatTokenAmount(1_000_000n, 6)).toBe('1')
    expect(formatTokenAmount(1_234_567n, 6)).toBe('1.234567')
  })

  it('parseTokenAmount 与 format 互逆', () => {
    expect(parseTokenAmount('1.5', 6)).toBe(1_500_000n)
    expect(formatTokenAmount(parseTokenAmount('0.000001', 6), 6)).toBe('0.000001')
  })
})

describe('formatRateBps', () => {
  it('bps → 百分比', () => {
    expect(formatRateBps(1_500)).toBe('15%')
    expect(formatRateBps(0)).toBe('0%')
    expect(formatRateBps(250)).toBe('2.5%')
  })
})

describe('小数秒输入（回归：BigInt 抛 RangeError）', () => {
  it('computeUnlocked 接受 Date.now()/1000 这类小数秒并向下取整', () => {
    // 1500.9s 应等价于 1500s
    expect(computeUnlocked(base, 1_500.9)).toBe(computeUnlocked(base, 1_500))
    expect(computeUnlocked(base, 1_500.9)).toBe(500_000n)
  })

  it('小数秒落在边界内不会抛错', () => {
    expect(() => computeUnlocked(base, 1_000.5)).not.toThrow()
    expect(computeUnlocked(base, 1_000.5)).toBe(0n) // floor → 1000 → 0
    expect(computeUnlocked(base, 2_000.9)).toBe(1_000_000n) // floor → 2000 → 封顶
  })

  it('computeClaimable 接受小数秒', () => {
    expect(computeClaimable({ ...base, withdrawn: 200_000n }, 1_500.42)).toBe(300_000n)
  })
})

describe('interpolateUnlocked（毫秒刻度，仅用于显示）', () => {
  it('整秒边界与 computeUnlocked 一致', () => {
    for (const sec of [1_200, 1_500, 1_800]) {
      expect(interpolateUnlocked(base, sec * 1000)).toBe(computeUnlocked(base, sec))
    }
  })

  it('毫秒级插值单调递增且不超总额', () => {
    const a = interpolateUnlocked(base, 1_500_000)
    const b = interpolateUnlocked(base, 1_500_500)
    expect(b > a).toBe(true)
    expect(interpolateUnlocked(base, 999_999_999)).toBe(1_000_000n)
    expect(interpolateUnlocked(base, 0)).toBe(0n)
  })
})

describe('streamingSnapshot（useStreamingBalance 的全部计算）', () => {
  const nowSec = () => Math.floor(Date.now() / 1000)

  it('进行中：用真实 Date.now() 不抛错，且可提取 / 可 Claim 正确', () => {
    const now = nowSec()
    const snap = streamingSnapshot(
      { total: 1_000_000n, withdrawn: 0n, startTime: now - 60, endTime: now + 60 },
      Date.now(), // ← 回归点：毫秒时间戳会导致 nowSec 为小数
      6,
    )
    expect(snap.unlocked).toBeGreaterThan(0n)
    expect(snap.claimable).toBeGreaterThan(0n)
    expect(snap.canClaim).toBe(true)
    // 展示值（毫秒插值）不早于整秒口径
    expect(snap.displayUnlocked).toBeGreaterThanOrEqual(snap.unlocked)
    expect(snap.displayClaimable).toBeGreaterThanOrEqual(snap.claimable)
    expect(snap.unlockedFormatted).toMatch(/^\d+(\.\d+)?$/)
    expect(snap.progress).toBeGreaterThan(0)
    expect(snap.progress).toBeLessThan(1)
    expect(snap.perSecond).toBe(1_000_000n / 120n)
  })

  it('未开始：unlocked=0、不可 Claim（对齐链上 NothingToClaim）', () => {
    const now = nowSec()
    const snap = streamingSnapshot(
      { total: 1_000_000n, withdrawn: 0n, startTime: now + 3600, endTime: now + 7200 },
      Date.now(),
      6,
    )
    expect(snap.unlocked).toBe(0n)
    expect(snap.claimable).toBe(0n)
    expect(snap.canClaim).toBe(false)
    expect(snap.progress).toBe(0)
  })

  it('已结束：封顶为总额、进度 1', () => {
    const now = nowSec()
    const snap = streamingSnapshot(
      { total: 1_000_000n, withdrawn: 0n, startTime: now - 7200, endTime: now - 3600 },
      Date.now(),
      6,
    )
    expect(snap.unlocked).toBe(1_000_000n)
    expect(snap.progress).toBe(1)
    expect(snap.canClaim).toBe(true)
  })

  it('已提取 >= 解锁额：不可 Claim', () => {
    const now = nowSec()
    const snap = streamingSnapshot(
      { total: 1_000_000n, withdrawn: 900_000n, startTime: now - 60, endTime: now + 60 },
      Date.now(),
      6,
    )
    expect(snap.canClaim).toBe(false)
    expect(snap.claimable).toBe(0n)
  })
})
