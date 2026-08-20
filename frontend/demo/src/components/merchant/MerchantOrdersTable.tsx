/**
 * MerchantOrdersTable — Orders 页面订单列表（5 列网格 + 空态）。
 *
 * 设计要点：
 *  - 用 `<table>` 语义化元素，而非 div-as-table（a11y 友好）
 *  - 表头：grid 风格实现（spec 要求 `Date ↓` 的箭头与「5 列」视觉布局），
 *    但底层用 <table><thead><tbody>，保留屏幕阅读器列结构
 *  - 列：Date ↓ / Customer / Invoice ID / Status / Amount（Amount 右对齐）
 *  - 空态：h-48 居中显示「No Results」
 *  - 行内映射复用 @/lib/merchant 的格式化函数
 */

import { ArrowDown } from 'lucide-react'

import {
  formatAmount,
  formatCreatedAt,
  statusBadgeClass,
  statusLabel,
  type MerchantPaymentEntry,
} from '@/lib/merchant.ts'

export interface MerchantOrdersTableProps {
  entries: MerchantPaymentEntry[]
}

export function MerchantOrdersTable({ entries }: MerchantOrdersTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-transparent">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="grid grid-cols-[1.2fr_1.4fr_1.4fr_1fr_1fr] items-center border-b border-zinc-200 px-5 py-3.5 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                Date
                <ArrowDown className="h-3 w-3" aria-hidden />
              </span>
            </th>
            <th scope="col">Customer</th>
            <th scope="col">Invoice ID</th>
            <th scope="col">Status</th>
            <th scope="col" className="text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="flex h-48 items-center justify-center text-sm font-medium text-zinc-400 dark:text-zinc-500">
                  No Results
                </div>
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr
                key={entry.invoice_id}
                className="grid grid-cols-[1.2fr_1.4fr_1.4fr_1fr_1fr] items-center border-b border-zinc-100 px-5 py-3 text-sm text-zinc-700 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900/40"
              >
                <td className="text-zinc-600 dark:text-zinc-400">
                  {formatCreatedAt(entry.createdAt)}
                </td>
                <td className="truncate font-mono text-xs">
                  {entry.sender
                    ? `${entry.sender.slice(0, 6)}…${entry.sender.slice(-4)}`
                    : '—'}
                </td>
                <td className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {entry.invoice_id.length > 18
                    ? `${entry.invoice_id.slice(0, 14)}…`
                    : entry.invoice_id}
                </td>
                <td>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(entry.status)}`}
                  >
                    {statusLabel(entry.status)}
                  </span>
                </td>
                <td className="text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatAmount(entry.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}