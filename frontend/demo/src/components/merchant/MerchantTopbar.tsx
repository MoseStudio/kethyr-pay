/**
 * MerchantTopbar — 主面板顶栏（移动端汉堡按钮 + 页面标题 + ThemeToggle）。
 *
 * 设计动机：
 *  - 移动端侧栏抽屉需要触发入口 → 在 < lg 视口渲染汉堡按钮
 *  - 标题区可由调用方通过 `left` prop 自定义（不同子页面用不同标题）
 *  - 主题切换固定放在右上方，便于视觉确认 light/dark 切换
 *
 * 汉堡按钮：消费 MerchantMobileNavContext 拿到 openMobile 回调（不需要
 * props drilling，调用方只要放在 MerchantShell 子树内即可）。
 */

import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'

import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import { useMerchantMobileNav } from './MerchantMobileNavContext.ts'

export interface MerchantTopbarProps {
  /** 标题区节点（页面自定义；为空则不渲染） */
  left?: ReactNode
}

export function MerchantTopbar({ left }: MerchantTopbarProps) {
  const { openMobile } = useMerchantMobileNav()

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {/* 移动端汉堡按钮（桌面端 hidden） */}
        <button
          type="button"
          onClick={openMobile}
          aria-label="Open navigation"
          aria-controls="merchant-sidebar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200 dark:hover:bg-zinc-900 lg:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>
        {left && <div className="min-w-0 flex-1 truncate">{left}</div>}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </div>
  )
}