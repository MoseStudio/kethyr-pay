/**
 * EmployeePortal — 员工门户外壳（面向员工，独立页面）。
 *
 * 视觉刻意对齐「收银台 / 发票页」（CheckoutModalShell 那套语言：居中画布 +
 * rounded-3xl 卡片 + CheckoutBrandHeader），而不是雇主后台的侧栏 + 浮动卡片。
 *
 * 内容由路由通过 children 注入（`EmployeeView` 需保持懒加载，避免
 * `@coral-xyz/anchor` / `@solana/web3.js` 进入 SSR 模块图）。
 */

import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useWallet } from '@solana/wallet-adapter-react'

import { CheckoutBrandHeader } from '@/components/CheckoutModal.tsx'
import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import { useSolanaReady } from '@/contexts/SolanaProvider.tsx'

import { SolanaWalletButton } from './SolanaWalletButton.tsx'

export function EmployeePortal({ children }: { children: ReactNode }) {
  const ready = useSolanaReady()

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4 transition-colors duration-200 dark:bg-zinc-950 md:p-8">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <CheckoutBrandHeader subtitle="Employee Payroll Portal" />
          <ThemeToggle />
        </div>

        <section
          aria-label="Kethyr Flow Employee Portal"
          className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl transition-colors duration-200 md:p-8 dark:border-zinc-800 dark:bg-[#121214] dark:shadow-2xl"
        >
          {/* 标题与钱包按钮同排；说明单独一行，避免文案变长后把按钮挤到下一行 */}
          <div className="mb-6 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                My Payroll Streams
              </h2>
              <div className="w-[170px] shrink-0">
                {ready ? <SolanaWalletButton /> : null}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Your balance unlocks linearly over time — withdraw anytime, with tax withheld automatically.
            </p>
          </div>

          {ready ? (
            <ConnectedArea>{children}</ConnectedArea>
          ) : (
            <PortalHint
              title="Loading Solana wallet…"
              hint="Initializing the wallet adapter on first load"
            />
          )}
        </section>

        <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
          <span>Kethyr Flow · Streaming Payroll</span>
          <Link to="/payroll" className="transition hover:text-zinc-600 dark:hover:text-zinc-300">
            Employer console →
          </Link>
        </div>
      </div>
    </main>
  )
}

/** 仅在适配器就绪后渲染：安全调用 useWallet()。 */
function ConnectedArea({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet()
  if (!publicKey) {
    return (
      <PortalHint
        title="Connect a Solana wallet to view your pay"
        hint="Connect with Phantom to see your payroll streams"
      />
    )
  }
  return <>{children}</>
}

function PortalHint({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
    </div>
  )
}
