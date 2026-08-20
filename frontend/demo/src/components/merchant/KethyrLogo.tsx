/**
 * KethyrLogo — KethyrPay 的隐私盾牌品牌图标（SVG 原子）。
 *
 * 设计动机：作为商家后台的「品牌身份」复用 atom，与项目 token 体系
 * 保持一致。当前用纯几何 SVG（盾形 + 内部 Y 形 keyhole）代替正式品牌资产，
 * 后续若 PR 收到品牌物料再替换。颜色走双主题：
 *  - light：盾面深 zinc-900，Y 形为浅色以便识别
 *  - dark ：盾面浅色，Y 形为深色
 *
 * 与旧 PolarLogo 的差别在于几何语义（隐私 + View Key 而非 Stripe 风的
 * 条纹圆盘）。位置、大小 prop 与 PolarLogo 一致，方便从一处替换到另一处。
 */

import type { CSSProperties } from 'react'

export interface KethyrLogoProps {
  /** 图标边长（像素），默认 22 */
  size?: number
  className?: string
  style?: CSSProperties
}

export function KethyrLogo({ size = 22, className, style }: KethyrLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* 盾面外轮廓（currentColor 让主题类生效） */}
      <path
        d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6L12 2.5Z"
        fill="currentColor"
        className="text-zinc-900 dark:text-zinc-100"
      />
      {/* 内部 Y 形 keyhole（隐私 + View Key） */}
      <path
        d="M12 7.5c-1.4 0-2.5 1.1-2.5 2.5 0 1 .4 1.7 1 2.2v3.3a1.5 1.5 0 0 0 3 0v-3.3c.6-.5 1-1.2 1-2.2 0-1.4-1.1-2.5-2.5-2.5Z"
        fill="currentColor"
        className="text-white dark:text-zinc-900"
      />
      {/* 顶部高光细节（轻微蓝调强调隐私属性） */}
      <path
        d="M12 4.2 5.5 6.6v.4L12 4.8l6.5 2.2v-.4L12 4.2Z"
        fill="currentColor"
        className="text-blue-600 dark:text-sky-400"
        opacity="0.8"
      />
    </svg>
  )
}