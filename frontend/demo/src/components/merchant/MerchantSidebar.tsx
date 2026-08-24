/**
 * MerchantSidebar — KethyrPay 商家后台侧栏（画布浮动卡片架构 + 自适应主题）。
 *
 * 内容来源：本组件所有文案 / 导航 / 数据均来自 KethyrPay 真实产品面
 * （README §核心功能 + 当前已挂载的路由表），不再沿用任何参考图占位内容。
 *
 * 视觉架构（保留上一轮的画布浮动 Sheet）：
 *  - bg-transparent，无 border-r，直接坐在画布上
 *  - py-2 px-1 紧内边距，呼吸感由画布 padding 提供
 *  - w-56 lg:w-60 固定列宽
 *  - 移动端抽屉态：fixed inset-y-0 left-0 + 阴影
 *
 * 内容布局（自上而下）：
 *  1. BrandHeader：KethyrLogo + 品牌名 + 「复制商家地址」快捷按钮
 *  2. PrimaryNav：4 项真实产品导航（Home / Orders / Mint Invoice /
 *     Export Statement），每项都映射到
 *     已挂载的真实路由；激活态由当前路径前缀决定
 *  3. WalletStatusCard：底部展示 Shield Wallet 连接状态、Aleo Testnet、
 *     商家地址、断开按钮——取代原「Polar Plans」虚构升级卡片
 *
 * Token：与 MerchantShell 一套（zinc / blue-600 / sky-400 / emerald-500）。
 */

import { Link, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Loader2,
  Power,
  Wallet,
  X,
} from 'lucide-react'

import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { truncateAddress } from '@/lib/checkout.ts'

import { KethyrLogo } from './KethyrLogo.tsx'
import { MERCHANT_NAV, isActiveNavItem, type NavItem } from './nav.ts'

export interface MerchantSidebarProps {
  /**
   * 移动端是否显示侧栏抽屉。受 MerchantShell 控制：
   *  - true：作为抽屉渲染（fixed + backdrop）
   *  - false：完全隐藏在屏幕左侧（桌面端 lg:translate-x-0 显示）
   */
  mobileOpen?: boolean
  /** 关闭移动端抽屉的回调 */
  onRequestClose?: () => void
}

export function MerchantSidebar({
  mobileOpen = false,
  onRequestClose,
}: MerchantSidebarProps) {
  // 透明背景，无 border-r；仅桌面端以列宽显示，移动端为抽屉
  const wrapperClass = [
    'flex h-full min-h-0 w-56 shrink-0 flex-col justify-between py-2 px-1',
    'bg-transparent text-zinc-900 transition-colors duration-200',
    'dark:text-zinc-100',
    mobileOpen
      ? 'fixed inset-y-0 left-0 z-40 shadow-2xl lg:static lg:shadow-none'
      : 'fixed inset-y-0 left-0 z-40 -translate-x-full shadow-2xl lg:static lg:translate-x-0 lg:shadow-none',
  ].join(' ')

  return (
    <aside className={wrapperClass} aria-label="Merchant navigation">
      <div className="space-y-6">
        <BrandHeader onClose={mobileOpen ? onRequestClose : undefined} />
        <PrimaryNav />
      </div>
      <WalletStatusCard />
    </aside>
  )
}

// ----------------------------------------------------------------
// BrandHeader：KethyrLogo + 品牌名 + 复制商家地址按钮
// ----------------------------------------------------------------

function BrandHeader({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex items-center justify-between px-2">
      <BrandMark />
      <div className="flex items-center gap-1 text-zinc-400 dark:text-zinc-500">
        <CopyAddressButton />
        {/* 抽屉关闭按钮：仅在 mobileOpen=true（抽屉态）时渲染 */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-200/60 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

function BrandMark() {
  const { connected } = useAleoWallet()
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <KethyrLogo size={22} />
        {/* 已连接钱包时，盾牌右下角显示小绿点（参照 ThemeToggle system-mode 提示） */}
        {connected && (
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-zinc-100 dark:ring-zinc-900"
          />
        )}
      </div>
      <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        KethyrPay
      </span>
    </div>
  )
}

/** 复制商家地址到剪贴板，提供 1.5s「Copied」反馈 */
function CopyAddressButton() {
  const { publicKey } = useAleoWallet()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(t)
  }, [copied])

  const onCopy = useCallback(async () => {
    const text = publicKey ?? 'kethyr-no-wallet'
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // 剪贴板不可用（如隐私模式）静默降级
    }
  }, [publicKey])

  const label = copied
    ? '已复制'
    : publicKey
      ? '复制商家地址'
      : '复制占位地址'
  const Icon = copied ? Check : Copy

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-zinc-200/60 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
    >
      <Icon
        className={`h-3.5 w-3.5 ${copied ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
        aria-hidden
      />
    </button>
  )
}

// ----------------------------------------------------------------
// PrimaryNav：6 项真实产品导航
// ----------------------------------------------------------------

function PrimaryNav() {
  return (
    <nav className="space-y-1 px-1 text-xs" aria-label="Primary navigation">
      {MERCHANT_NAV.map((item) => (
        <NavRow key={item.id} item={item} />
      ))}
    </nav>
  )
}

function NavRow({ item }: { item: NavItem }) {
  const { location } = useRouterState()
  const active = isActiveNavItem(item, location.pathname)

  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      title={item.description}
      className={[
        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
        active
          ? 'bg-zinc-200/50 font-semibold text-zinc-900 dark:bg-zinc-800/50 dark:text-zinc-100'
          : 'text-zinc-500 hover:bg-zinc-200/30 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100',
      ].join(' ')}
    >
      <item.icon className="h-4 w-4" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

// ----------------------------------------------------------------
// WalletStatusCard：底部状态卡片（取代虚构的 Upgrade 卡片）
// ----------------------------------------------------------------

function WalletStatusCard() {
  const { loaded, connected, connecting, publicKey, disconnect } = useAleoWallet()

  const status = !loaded
    ? 'loading'
    : connecting
      ? 'connecting'
      : connected
        ? 'connected'
        : 'idle'

  return (
    <div className="space-y-2 px-1">
      <div className="rounded-xl border border-zinc-200/60 bg-white/60 p-3 dark:border-zinc-800/60 dark:bg-zinc-900/40">
        {/* 顶部：钱包名 + 状态点 + 网络胶囊，避免换行 */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 shrink items-center gap-2">
            <Wallet
              className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400"
              aria-hidden
            />
            <span className="shrink-0 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Shield Wallet
            </span>
            <StatusDot status={status} />
          </div>
          <NetworkPill label="Aleo Testnet" />
        </div>

        {/* 地址 / 状态文案 */}
        <p
          className="mt-2 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-400"
          title={publicKey ?? '钱包未连接'}
        >
          {publicKey ? truncateAddress(publicKey, 8, 6) : '钱包未连接'}
        </p>

        {/* 断开按钮：仅连接时显示 */}
        {connected && (
          <button
            type="button"
            onClick={() => void disconnect()}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Power className="h-3 w-3" aria-hidden />
            断开连接
          </button>
        )}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: 'loading' | 'connecting' | 'connected' | 'idle' }) {
  if (status === 'connecting' || status === 'loading') {
    return <Loader2 className="h-3 w-3 animate-spin text-amber-500" aria-hidden />
  }
  if (status === 'connected') {
    return (
      <span
        aria-label="connected"
        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
        aria-hidden
      />
    )
  }
  return (
    <span
      aria-label="idle"
      className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600"
      aria-hidden
    />
  )
}

function NetworkPill({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-700 dark:text-emerald-400">
      {label}
    </span>
  )
}