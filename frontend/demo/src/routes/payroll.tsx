/**
 * /payroll 布局路由（Kethyr Flow 薪酬）。
 *
 * 这里刻意做「透传」布局（不套任何外壳）：雇主后台与员工门户是两种完全不同的
 * 面向——前者是管理后台（侧栏 + 浮动卡片），后者是面向员工的独立页面
 * （与收银台/发票页同一视觉语言）。外壳由各自的路由决定：
 *
 *  - /payroll          → payroll.index.tsx：<PayrollShell> 管理后台
 *  - /payroll/employee → payroll.employee.tsx：独立员工门户（无侧栏）
 */

import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/payroll')({
  component: PayrollLayout,
})

function PayrollLayout() {
  return <Outlet />
}
