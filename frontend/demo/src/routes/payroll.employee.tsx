/**
 * /payroll/employee — 员工薪酬门户（面向员工，独立页面，非后台管理壳）。
 *
 * 外壳由 `EmployeePortal` 提供（对齐收银台/发票页视觉）。
 *
 * 关键：`EmployeeView` 依赖 `@coral-xyz/anchor` / `@solana/web3.js` /
 * `@solana/spl-token`，这些库在 Cloudflare Worker（SSR）里求值会挂起
 * （`Promise will never complete` → React #419 退化到客户端渲染），
 * 因此用 `lazy()` 动态导入，并作为 children 传给外壳。
 */

import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { EmployeePortal } from '@/components/payroll/EmployeePortal.tsx'

const EmployeeView = lazy(() =>
  import('@/components/payroll/EmployeeView.tsx').then((m) => ({
    default: m.EmployeeView,
  })),
)

export const Route = createFileRoute('/payroll/employee')({
  component: EmployeePage,
})

function EmployeePage() {
  return (
    <EmployeePortal>
      <Suspense fallback={<RouteFallback />}>
        <EmployeeView />
      </Suspense>
    </EmployeePortal>
  )
}

function RouteFallback() {
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading payroll meter…</p>
}
