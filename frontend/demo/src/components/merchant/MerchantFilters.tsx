/**
 * MerchantFilters — Orders 页面工具栏（过滤器 + Export 按钮）。
 *
 * 当前实现（与计划一致）：
 *  - Product / Status 下拉：Tailwind 化的原生 <select>，受控但**不真正过滤数据**
 *    —— KethyrPay 暂无多产品/多状态目录；spec 也明确写了 placeholder 值。
 *  - Today 按钮：占位，弹出当前日期文案，点击不触发行为。
 *  - Export 按钮：链接到 /merchant/export（保留现有账期导出页面）。
 *
 * 这样既贴合 Polar 风格，又避免制造「能点但没效果」的假交互。
 *
 * Token：与 MerchantShell 一致。
 */

import { Link } from '@tanstack/react-router'
import { Calendar, ChevronDown, Share2 } from 'lucide-react'
import { useState } from 'react'

import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { truncateAddress } from '@/lib/checkout.ts'

export function MerchantFilters() {
  const [product, setProduct] = useState('')
  const [status, setStatus] = useState('')
  const { connected, publicKey } = useAleoWallet()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* 左过滤器组 */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          ariaLabel="Filter by product"
          value={product}
          onChange={setProduct}
          placeholder="All products"
          options={[
            { value: 'invoice', label: 'Invoice' },
            { value: 'subscription', label: 'Subscription' },
          ]}
        />
        <FilterSelect
          ariaLabel="Filter by status"
          value={status}
          onChange={setStatus}
          placeholder="Any status"
          options={[
            { value: 'paid', label: 'Paid' },
            { value: 'pending', label: 'Pending' },
            { value: 'expired', label: 'Expired' },
          ]}
        />
        <DateButton />
      </div>

      {/* 右动作组 */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="hidden font-mono text-[11px] text-zinc-500 dark:text-zinc-400 sm:inline"
          title={connected && publicKey ? publicKey : '未连接钱包'}
        >
          {connected && publicKey
            ? truncateAddress(publicKey, 6, 4)
            : '未连接'}
        </span>
        <Link
          to="/merchant/export"
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          Export
        </Link>
      </div>
    </div>
  )
}

function FilterSelect({
  ariaLabel,
  value,
  onChange,
  placeholder,
  options,
}: {
  ariaLabel: string
  value: string
  onChange: (next: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <label className="sr-only" htmlFor={ariaLabel}>
        {ariaLabel}
      </label>
      <select
        id={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-xl border border-zinc-200 bg-white pl-3 pr-7 text-xs text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
        aria-hidden
      />
    </div>
  )
}

function DateButton() {
  const label = formatToday()
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-zinc-800 dark:bg-[#121214] dark:text-zinc-200 dark:hover:bg-zinc-900"
      title={label}
    >
      <Calendar className="h-3.5 w-3.5" aria-hidden />
      Today
    </button>
  )
}

/** 人类可读的「今天」日期（用于 aria-tooltip / title） */
function formatToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}