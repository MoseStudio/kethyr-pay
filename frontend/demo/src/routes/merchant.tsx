/**
 * /merchant 布局路由（Wave H4 ALEO-MVP-015/016）。
 *
 * 商家后台挂载点（issue 验收标准：与 POC 前端同仓库挂载 `/merchant/*`）。
 * - /merchant            → merchant.index.tsx（收款概览 + 明细）
 * - /merchant/export     → merchant.export.tsx（View Key 账期导出，016）
 *
 * 与 /pay 布局一致：渲染 <Outlet /> 让子路由显示。
 */

import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/merchant')({
  component: MerchantLayout,
})

function MerchantLayout() {
  return <Outlet />
}
