/**
 * useStreamingBalance — 基于 requestAnimationFrame 的毫秒级插值跳动余额。
 *
 * 流式薪酬是纯时间确定性结算，因此前端无需轮询链上：用 `Date.now()` 逐帧重算，
 * 得到「跳动余额水表」。全部计算在纯函数 `streamingSnapshot` 里（可单测），
 * 本 hook 只负责 rAF 节拍。
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { streamingSnapshot, type StreamingSnapshot } from '@/lib/solana/vesting.ts'

export interface StreamingBalanceInput {
  total: bigint
  withdrawn: bigint
  startTime: number
  endTime: number
  decimals: number
  /** 关闭跳动（如流已结束 / 已取消）以省电。 */
  enabled?: boolean
}

export type StreamingBalance = StreamingSnapshot

export function useStreamingBalance(input: StreamingBalanceInput): StreamingBalance {
  const { total, withdrawn, startTime, endTime, decimals, enabled = true } = input

  const [tick, setTick] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || typeof requestAnimationFrame === 'undefined') return
    const loop = () => {
      setTick((t) => t + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [enabled])

  return useMemo(
    () => streamingSnapshot({ total, withdrawn, startTime, endTime }, Date.now(), decimals),
    // `tick` 每次动画帧自增，驱动逐帧重算（毫秒级插值）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, total, withdrawn, startTime, endTime, decimals],
  )
}
