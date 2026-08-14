/**
 * /pay 布局路由（Wave H3 ALEO-MVP-010）。
 *
 * 文件式路由约定：存在 pay.$invoiceId.tsx 时，pay.tsx 是 /pay 的**布局路由**，
 * 必须渲染 <Outlet /> 才能让子路由（Checkout / 状态页）显示。
 *
 * - /pay（精确路径）→ pay.index.tsx（收款演示生成器）
 * - /pay/$invoiceId → pay.$invoiceId.tsx（Checkout 收银台）
 * - /pay/$invoiceId/status → pay.$invoiceId.status.tsx（支付状态页）
 */

import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/pay')({
  component: PayLayout,
})

function PayLayout() {
  return <Outlet />
}
