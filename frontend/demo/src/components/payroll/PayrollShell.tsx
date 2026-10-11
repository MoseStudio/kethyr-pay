/**
 * PayrollShell — KethyrPay 薪酬看板外壳。
 *
 * 复用 MerchantShell 的「画布浮动卡片」视觉语言（zinc 中性色 + blue-600 强调色，
 * rounded-3xl 主卡片，深色面 #121214），但使用薪酬模块自己的导航，与 Aleo 的
 * MERCHANT_NAV 解耦。
 */

import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Briefcase, UserRound, Wallet } from 'lucide-react'
import { useWallet } from '@solana/wallet-adapter-react'

import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import { KethyrLogo } from '@/components/KethyrLogo.tsx'
import { useSolanaReady } from '@/contexts/SolanaProvider.tsx'
import { truncateAddress } from '@/lib/format.ts'

import { SolanaWalletButton } from './SolanaWalletButton.tsx'

const PAYROLL_NAV = [
  { id: 'employer', label: 'Employer', to: '/payroll', icon: Briefcase },
  { id: 'employee', label: 'Employee', to: '/payroll/employee', icon: UserRound },
]

export function PayrollShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-0 w-full gap-4 overflow-hidden bg-[#f4f4f5] p-3 text-zinc-900 antialiased transition-colors duration-200 md:gap-6 md:p-4 dark:bg-zinc-950 dark:text-zinc-100">
      <PayrollSidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-sm md:p-8 dark:border-zinc-800 dark:bg-[#121214]">
        {children}
      </main>
    </div>
  )
}

function PayrollSidebar() {
  const { location } = useRouterState()

  return (
    <aside className="hidden w-56 shrink-0 flex-col justify-between py-2 px-1 lg:flex">
      <div className="space-y-6">
        <div className="flex items-center gap-2 px-2">
          <KethyrLogo size={22} />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">KethyrPay</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Streaming Payroll</p>
          </div>
        </div>
        <nav className="space-y-1 px-1 text-xs" aria-label="Payroll navigation">
          {PAYROLL_NAV.map((item) => {
            const active =
              item.to === '/payroll'
                ? location.pathname === '/payroll'
                : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.id}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-2.5 rounded-md px-2 py-1.5 transition',
                  active
                    ? 'bg-zinc-200/50 font-semibold text-zinc-900 dark:bg-zinc-800/50 dark:text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-200/30 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100',
                ].join(' ')}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="space-y-2 px-1">
        <PayrollWalletCard />
      </div>
    </aside>
  )
}

function PayrollWalletCard() {
  const ready = useSolanaReady()
  return (
    <div className="rounded-xl border border-zinc-200/60 bg-white/60 p-3 dark:border-zinc-800/60 dark:bg-zinc-900/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden />
          <span className="text-xs font-semibold">Phantom</span>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-700 dark:text-sky-400">
          Devnet
        </span>
      </div>
      {ready ? <WalletAddressLine /> : <WalletAddressPlaceholder />}
      {ready ? <SolanaWalletButton /> : null}
      <div className="mt-2 flex justify-end">
        <ThemeToggle />
      </div>
    </div>
  )
}

/** 仅在适配器就绪后渲染：安全调用 useWallet()。 */
function WalletAddressLine() {
  const { publicKey } = useWallet()
  return (
    <p className="mb-2 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
      {publicKey ? truncateAddress(publicKey.toBase58(), 8, 6) : 'Wallet not connected'}
    </p>
  )
}

function WalletAddressPlaceholder() {
  return (
    <p className="mb-2 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
      Wallet not connected
    </p>
  )
}
