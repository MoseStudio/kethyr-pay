/**
 * AnimatedAmount — 用 NumberFlow（@number-flow/react）做数字滚动展示。
 *
 * 金额以 **raw 最小单位（bigint）** 传入，内部换算成十进制数字后交给 NumberFlow；
 * 它会对每一位数字做「滚动 + 错峰」动画（而不是整串文本替换），因此更优雅。
 *
 * 约束：
 *  - 仅用于**展示**。可提取额度 / 能否 Claim 仍以整秒口径为准（见 lib/solana/vesting.ts）。
 *  - NumberFlow 的宿主样式需要消费方注入（库自身不注入），下面 `ensureStyles()` 负责，
 *    幂等且仅在浏览器执行（本组件只出现在懒加载的客户端 chunk 里）。
 */

import NumberFlow, { styles } from '@number-flow/react'
import { useEffect, useRef, useState } from 'react'

import { formatTokenAmount } from '@/lib/solana/vesting.ts'

let stylesInjected = false

/** 幂等注入 NumberFlow 的基础样式（含 :host 与宿主元素规则）。 */
function ensureStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  if (document.querySelector('style[data-number-flow]')) return
  const el = document.createElement('style')
  el.setAttribute('data-number-flow', '')
  el.textContent = styles.join('\n')
  document.head.appendChild(el)
}

ensureStyles()

export interface AnimatedAmountProps {
  /** 原始最小单位金额。 */
  raw: bigint
  /** 代币小数位（决定展示精度上限）。 */
  decimals: number
  /** 覆盖展示精度（默认 = decimals）。 */
  maxFractionDigits?: number
  /**
   * 数值刷新间隔（毫秒）。
   *
   * 关键：NumberFlow 的优雅来自「每次变化都完整地滚一次」。如果把水表的每帧
   * 插值都喂进来（60fps），数字会**永远停在滚动中间**，看起来是糊的、乱跳的。
   * 因此这里节流到 ~1Hz，每拍让数字滚一次并落定。
   */
  intervalMs?: number
  className?: string
}

export function AnimatedAmount({
  raw,
  decimals,
  maxFractionDigits,
  intervalMs = 600,
  className,
}: AnimatedAmountProps) {
  // 目前展示金额都在 Number.MAX_SAFE_INTEGER 以内；转 number 便于 NumberFlow 做插值。
  const target = Number(formatTokenAmount(raw, decimals))
  const [value, setValue] = useState(target)
  const latest = useRef(target)

  useEffect(() => {
    latest.current = target
  }, [target])

  useEffect(() => {
    const id = window.setInterval(() => {
      setValue((prev) => (prev === latest.current ? prev : latest.current))
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return (
    <NumberFlow
      className={className}
      value={value}
      format={{
        // 固定精度：避免末尾 0 被裁掉导致数字宽度抖动（动画中的计数器尤其明显）
        maximumFractionDigits: maxFractionDigits ?? decimals,
        minimumFractionDigits: maxFractionDigits ?? decimals,
        useGrouping: true,
      }}
      // 缩短滚动时长：让每一拍的滚动能「滚完并落定」，形成有节奏的跳动，
      // 而不是永远停在滚动中间（默认时长与刷新间隔接近，会一直处于动画中）。
      transformTiming={{ duration: 250, easing: 'ease-out' }}
      spinTiming={{ duration: 250, easing: 'ease-out' }}
      opacityTiming={{ duration: 150, easing: 'ease-out' }}
      // 跟随系统「减少动态效果」偏好
      respectMotionPreference
    />
  )
}
