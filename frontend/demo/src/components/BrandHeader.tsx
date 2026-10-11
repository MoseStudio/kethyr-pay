/**
 * BrandHeader — KethyrPay 品牌头（logo + 名称 + 副标题）。
 *
 * 用于员工门户等面向用户的独立页面，与收银台保持同一视觉语言。
 */

import { KethyrLogo } from '@/components/KethyrLogo.tsx'

export interface BrandHeaderProps {
  title?: string
  subtitle?: string
}

export function BrandHeader({ title = 'KethyrPay', subtitle }: BrandHeaderProps) {
  return (
    <header className="flex items-center gap-3">
      <KethyrLogo size={28} />
      <div className="leading-tight">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500">{subtitle}</p>
        )}
      </div>
    </header>
  )
}
