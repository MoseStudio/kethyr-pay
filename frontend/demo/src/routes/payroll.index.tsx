/**
 * /payroll — 雇主（Employer）流式薪酬控制台（管理后台外壳）。
 *
 * 关键：`EmployerDashboard` 依赖 `@coral-xyz/anchor` / `@solana/web3.js` /
 * `@solana/spl-token`。这些库在 Cloudflare Worker（SSR）里求值会挂起
 * （TanStack Start 报 `Promise will never complete` → React #419 退化到客户端渲染），
 * 因此用 `lazy()` 动态导入，使它们只进入浏览器 chunk，不进入 SSR 模块图。
 */

import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { PayrollShell } from '@/components/payroll/PayrollShell.tsx'
import { RequireSolanaWallet } from '@/components/payroll/RequireSolanaWallet.tsx'

const EmployerDashboard = lazy(() =>
  import('@/components/payroll/EmployerDashboard.tsx').then((m) => ({
    default: m.EmployerDashboard,
  })),
)

export const Route = createFileRoute('/payroll/')({
  component: EmployerPage,
})

function EmployerPage() {
  return (
    <PayrollShell>
      <RequireSolanaWallet>
        <Suspense fallback={<RouteFallback />}>
          <EmployerDashboard />
        </Suspense>
      </RequireSolanaWallet>
    </PayrollShell>
  )
}

function RouteFallback() {
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading payroll console…</p>
}
