/**
 * /merchant 布局路由（Polar 风格商家后台）。
 *
 * 文件式路由约定：当 pay.$invoiceId.tsx / merchant.invoice.tsx / merchant.export.tsx
 * 同名文件存在时，merchant.tsx 是 /merchant 的**布局路由**，必须渲染 <Outlet />
 * 才能让子路由显示。
 *
 * 渲染职责：
 *  - 在所有 merchant 子路由（/merchant, /merchant/invoice, /merchant/export）
 *    外层包裹 Polar 风格的 App Shell（左侧栏 + 主面板）。
 *  - 主面板内由 MerchantShell 自动渲染顶部 topbar + 页面内容。
 *
 * 子路由：
 *  - /merchant              → merchant.index.tsx（Orders 概览 + 详情表）
 *  - /merchant/invoice      → merchant.invoice.tsx（铸造 + 转移发票）
 *  - /merchant/export       → merchant.export.tsx（View Key 账期导出）
 */

import { Outlet, createFileRoute } from '@tanstack/react-router'

import { MerchantShell } from '@/components/merchant/MerchantShell.tsx'

export const Route = createFileRoute('/merchant')({
  component: MerchantLayout,
})

function MerchantLayout() {
  return (
    <MerchantShell>
      <Outlet />
    </MerchantShell>
  )
}