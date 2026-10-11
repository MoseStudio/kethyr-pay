/**
 * Kethyr Flow — 解锁数学与格式化（零依赖纯函数）。
 *
 * 与 Rust 端 `PayrollStream` 的实现逐位对齐，且不 import web3/anchor，
 * vitest node 环境可直接单测（无需生成 IDL）。
 */

/** 预扣税率基准点分母。 */
export const BPS_BASE = 10_000

export interface VestingParams {
  /** 流总额（最小单位 / raw）。 */
  total: bigint
  /** 已提取（含税）。 */
  withdrawn: bigint
  /** 开始时间（unix 秒）。 */
  startTime: number
  /** 结束时间（unix 秒）。 */
  endTime: number
}

/**
 * 线性解锁：`total * (now - start) / (end - start)`，边界封顶。
 * `now` 为 unix 秒；允许传入小数秒（如 `Date.now()/1000`），内部按整秒向下取整，
 * 与链上只按整秒结算的语义一致（也避免 `BigInt(小数)` 抛 RangeError）。
 */
export function computeUnlocked(params: VestingParams, now: number): bigint {
  const t = Math.floor(now)
  if (t <= params.startTime) return 0n
  if (t >= params.endTime) return params.total
  const elapsed = BigInt(t - params.startTime)
  const duration = BigInt(params.endTime - params.startTime)
  return (params.total * elapsed) / duration
}

/**
 * 平滑展示用：在**毫秒**刻度上线性插值 unlocked（水表动画）。
 *
 * 链上按整秒结算，这里只影响显示；在整秒边界上与 `computeUnlocked` 完全一致。
 * 不要用它作为「可提取额度」的依据 —— 可提取以整秒的 `computeClaimable` 为准。
 */
export function interpolateUnlocked(params: VestingParams, nowMs: number): bigint {
  const startMs = params.startTime * 1000
  const endMs = params.endTime * 1000
  if (nowMs <= startMs) return 0n
  if (nowMs >= endMs) return params.total
  const elapsed = BigInt(Math.floor(nowMs - startMs))
  const duration = BigInt(endMs - startMs)
  return (params.total * elapsed) / duration
}

/** `claimable = unlocked - withdrawn`（下限 0）。 */
export function computeClaimable(params: VestingParams, now: number): bigint {
  const unlocked = computeUnlocked(params, now)
  return unlocked > params.withdrawn ? unlocked - params.withdrawn : 0n
}

/** 代扣分流：`tax = amount * rate / 10000`，`net = amount - tax`。 */
export function splitWithholding(
  amount: bigint,
  rate: number,
): { net: bigint; tax: bigint } {
  const tax = (amount * BigInt(rate)) / BigInt(BPS_BASE)
  return { net: amount - tax, tax }
}

/** 每秒线性释放速率（raw / 秒）。 */
export function perSecondRate(params: VestingParams): bigint {
  const duration = BigInt(Math.max(1, params.endTime - params.startTime))
  return params.total / duration
}

/** 进度 0..1。 */
export function vestingProgress(params: VestingParams, now: number): number {
  if (now <= params.startTime) return 0
  if (now >= params.endTime) return 1
  return (now - params.startTime) / (params.endTime - params.startTime)
}

/** 水表快照（`useStreamingBalance` 的全部计算，纯函数便于单测）。 */
export interface StreamingSnapshot {
  /** 整秒口径（与链上一致）。 */
  unlocked: bigint
  /** 整秒口径的可提取额度。 */
  claimable: bigint
  /** 能否 Claim —— 与链上 `claim_stream` 对齐，避免 NothingToClaim。 */
  canClaim: boolean
  /** 毫秒插值的展示值（交给 NumberFlow 做数字滚动）。 */
  displayUnlocked: bigint
  /** 毫秒插值的展示值（可提取）。 */
  displayClaimable: bigint
  /** 每秒释放速率（raw/秒）。 */
  perSecond: bigint
  /** 进度 0..1。 */
  progress: number
  /** 毫秒插值的展示数字（字符串形式，保留给非动画场景）。 */
  unlockedFormatted: string
  claimableFormatted: string
}

/**
 * 由「当前毫秒时间戳」算出水表快照。
 *
 * 双口径设计：
 *  - 整秒口径（`computeUnlocked` / `computeClaimable`）决定**可提取额度与能否 Claim**，
 *    与链上结算严格一致；
 *  - 毫秒口径（`interpolateUnlocked`）只驱动**展示数字的顺滑跳动**。
 *
 * 注意 `nowMs` 必须是整数毫秒（`Date.now()`），小数会触发 `BigInt` 的 RangeError。
 */
export function streamingSnapshot(
  params: VestingParams,
  nowMs: number,
  decimals: number,
): StreamingSnapshot {
  const nowSec = nowMs / 1000
  const unlocked = computeUnlocked(params, nowSec)
  const claimable = computeClaimable(params, nowSec)
  const smoothUnlocked = interpolateUnlocked(params, nowMs)
  const smoothClaimable =
    smoothUnlocked > params.withdrawn ? smoothUnlocked - params.withdrawn : 0n
  return {
    unlocked,
    claimable,
    canClaim: claimable > 0n,
    displayUnlocked: smoothUnlocked,
    displayClaimable: smoothClaimable,
    perSecond: perSecondRate(params),
    progress: vestingProgress(params, nowSec),
    unlockedFormatted: formatTokenAmount(smoothUnlocked, decimals),
    claimableFormatted: formatTokenAmount(smoothClaimable, decimals),
  }
}

/** raw 最小单位 → 十进制字符串（按 decimals 缩位，去除末尾 0）。 */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = raw / base
  const frac = raw % base
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

/** 十进制字符串 → raw 最小单位。 */
export function parseTokenAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim()
  if (!trimmed) return 0n
  const [wholePart, fracPart = ''] = trimmed.split('.')
  const whole = BigInt(wholePart || '0')
  const frac = BigInt((fracPart + '0'.repeat(decimals)).slice(0, decimals) || '0')
  return whole * 10n ** BigInt(decimals) + frac
}

/** bps → 百分比展示（1500 → "15%"，250 → "2.5%"）。 */
export function formatRateBps(rate: number): string {
  const pct = rate / (BPS_BASE / 100)
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, '')
  return `${text}%`
}

/** unix 秒 → 本地 "YYYY-MM-DD HH:mm"。 */
export function formatTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  if (Number.isNaN(d.getTime())) return String(unixSeconds)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** unix 秒 → `datetime-local` input 值（本地时区）。 */
export function toDateTimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
