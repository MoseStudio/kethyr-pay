/**
 * Merchant sidebar 导航配置（KethyrPay 真实产品面）。
 *
 * 设计原则：
 *  - 仅声明**当前已挂载的路由**；不再有「disabled 占位」概念（避免出现
 *    「能点但无内容」的假页面，参考上一轮 taste 反馈）。
 *  - 与 KethyrPay 实际产品面对齐（见 README §核心功能）：
 *    - Orders：商家收款明细（/merchant）
 *    - Mint Invoice：链上铸造 + 转移 InvoiceRecord（/merchant/invoice）
 *    - Export Statement：View Key 账期导出（/merchant/export，兼容 Request Finance）
 *    - Home：返回落地页（/）
 *  - 不再有 Products / Customers / Analytics / Finance / Settings 等
 *    Stripe-SaaS-taxonomy 占位项——这些不是 KethyrPay 的产品。
 */

import {
  Download,
  FilePlus,
  Home,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  /** 唯一 key（用于 React key + 当前激活判定） */
  id: string
  /** 显示文案 */
  label: string
  /** lucide-react 图标组件 */
  icon: LucideIcon
  /** TanStack Router 目标路径；每个条目都已挂载真实路由 */
  to: string
  /** 副标题 / tooltip / aria-description（可选） */
  description?: string
}

export const MERCHANT_NAV: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    to: '/',
    description: '返回 KethyrPay 落地页',
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: ShoppingBag,
    to: '/merchant',
    description: '商家收款明细（PaymentIntent + 链上 PaymentRecord）',
  },
  {
    id: 'mint',
    label: 'Mint Invoice',
    icon: FilePlus,
    to: '/merchant/invoice',
    description: '链上铸造 InvoiceRecord 并转移给付款人',
  },
  {
    id: 'export',
    label: 'Export Statement',
    icon: Download,
    to: '/merchant/export',
    description: 'View Key 账期导出（CSV / JSON，Request Finance 兼容）',
  },
]

/**
 * 判断某 nav 项是否为「当前激活」。
 *
 * 关键修复：`/merchant`（Orders）是索引路由，只在精确匹配 `/merchant` 时
 * 高亮；`/merchant/*` 下的真实子路由是独立条目（Mint Invoice / Export），
 * 若 Orders 也用前缀匹配会导致 `/merchant/invoice` 同时高亮两项。
 */
export function isActiveNavItem(item: NavItem, currentPath: string): boolean {
  if (item.id === 'orders') return currentPath === '/merchant'
  if (currentPath === item.to) return true
  if (item.to === '/') return false
  return currentPath === item.to || currentPath.startsWith(item.to + '/')
}