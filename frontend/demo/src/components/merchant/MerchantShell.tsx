/**
 * MerchantShell — 商家后台 App Shell（Polar 画布浮动卡片架构）。
 *
 * 架构（与之前实现的差异）：
 *  - 画布：viewport 整层 bg-[#f4f4f5] dark:bg-zinc-950，带 p-3 md:p-4 外边距
 *    与 gap-4 md:gap-6，把侧栏和主卡片在画布上"漂浮"分隔开。
 *  - 侧栏：bg-transparent + 无 border-r，直接坐在画布上（由 MerchantSidebar
 *    内部处理）。
 *  - 主卡片：flex-1 min-w-0 自适应撑满剩余宽度，rounded-3xl + 细边框 +
 *    shadow-sm 独立成"漂浮 Sheet"——不再 max-w-*，不再被 main p-* 二次包裹。
 *  - 移动端抽屉：保留 hamburger / backdrop / Esc / X 关闭能力；抽屉浮动在
 *    画布上（fixed 全屏），与桌面端保持同一视觉语言。
 *
 * 布局根因（与上一版的对比）：
 *  - 旧版用 <main p-4 md:p-6><div mx-auto max-w-6xl>：max-w-6xl 让主卡片
 *    在大屏幕上右侧留出大片空白，破坏了"画布浮动卡片"的视觉景深。
 *  - 新版直接 flex-1 min-w-0 —— 主卡片随视口弹性拉伸，画布外边距保持一致。
 *  - min-h-0 让嵌套的 overflow-y-auto 在 flex 子项里正确工作（Flexbox 规范）。
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { MerchantSidebar } from './MerchantSidebar.tsx'
import { MerchantMobileNavContext } from './MerchantMobileNavContext.ts'

export interface MerchantShellProps {
  children: ReactNode
}

export function MerchantShell({ children }: MerchantShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const openMobile = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  // Esc 关闭抽屉
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobile()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen, closeMobile])

  const ctxValue = useMemo(
    () => ({ mobileOpen, openMobile, closeMobile }),
    [mobileOpen, openMobile, closeMobile],
  )

  return (
    <MerchantMobileNavContext.Provider value={ctxValue}>
      {/* 1. 外层画布：viewport 整层带 padding + gap */}
      <div
        id="merchant-shell"
        className="flex min-h-screen w-full gap-4 bg-[#f4f4f5] p-3 text-zinc-900 antialiased transition-colors duration-200 md:gap-6 md:p-4 dark:bg-zinc-950 dark:text-zinc-100"
      >
        {/* 2. 侧栏（透明，无 border-r，详见 MerchantSidebar） */}
        <MerchantSidebar mobileOpen={mobileOpen} onRequestClose={closeMobile} />

        {/* 抽屉遮罩（仅 mobileOpen 时可见，覆盖画布） */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeMobile}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          />
        )}

        {/* 3. 主浮动卡片：flex-1 min-w-0 撑满剩余宽度 */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-sm md:p-8 dark:border-zinc-800 dark:bg-[#121214]">
          {children}
        </main>
      </div>
    </MerchantMobileNavContext.Provider>
  )
}