/**
 * CheckoutModal — KethyrPay 隐私支付收银台（light + dark 双主题）。
 *
 * 设计目标：
 * - Polar 风格的双列卡片外壳（max-w-5xl / 圆角 / 双主题 token）。
 * - 内容**完全由 PaymentIntent 派生**：商家地址、金额、过期时间、
 *   收款程序（pay_private.aleo）。不再使用参考稿的 Vanta 主题文案。
 * - 字段按 ALEO 隐私支付语义重写：右栏只有「钱包状态 / 备注 / Tax ID /
 *   参考号」，不收集卡号 / 邮箱 / 国家，避免误导用户以为可以填卡支付。
 *
 * 数据契约：纯展示组件，由父路由 pay.$invoiceId.tsx 传入 intent / wallet state /
 * pay state / handlers。/preview 路由传入合成 intent + 占位 wallet 用于视觉走查。
 */

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Key,
  Link2,
  Loader2,
  Lock,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from 'lucide-react'

import { KethyrLogo } from '@/components/merchant/KethyrLogo.tsx'
import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import type { PaymentIntent } from '@kethyrpay/sdk'
import { truncateAddress } from '@/lib/checkout.ts'

// 钱包状态：组件对外只需这三种语义
export type WalletState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | {
      status: 'connected'
      /** aleo1... 付款人地址 */
      publicKey: string
    }

export interface CheckoutModalProps {
  intent: PaymentIntent
  /** 钱包连接状态：驱动右上钱包卡片 & Pay 按钮启用 */
  wallet: WalletState
  /** 触发钱包适配器连接（Leo Wallet / Shield / Fox / Puzzle 等） */
  onConnectWallet: () => void
  /** 断开钱包（用于重新授权 programs） */
  onDisconnectWallet?: () => void
  /** Pay 按钮是否禁用（钱包未连 / 已过期 / 正在签名 / 正在广播） */
  payDisabled: boolean
  /** 当前支付阶段，用于按钮文案：idle | signing | broadcasting */
  payStatus: 'idle' | 'signing' | 'broadcasting'
  /** 过期剩余毫秒（用于显示倒计时）；未过期但无过期时间时传 null */
  remainingMs: number | null
  /** 暴露给 pay route 写入的额外回调：备注 / Tax ID / 参考号 */
  meta?: {
    memo: string
    taxId: string
    reference: string
  }
  onMetaChange?: (next: {
    memo: string
    taxId: string
    reference: string
  }) => void
  onPay: () => void
}

export function CheckoutModal(props: CheckoutModalProps) {
  const subtotal = useMemo(() => Number(props.intent.amount) || 0, [
    props.intent.amount,
  ])
  const total = subtotal

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4 transition-colors duration-200 dark:bg-zinc-950 md:p-8">
      <CheckoutCard
        subtotal={subtotal}
        total={total}
        intent={props.intent}
        wallet={props.wallet}
        onConnectWallet={props.onConnectWallet}
        onDisconnectWallet={props.onDisconnectWallet}
        payDisabled={props.payDisabled}
        payStatus={props.payStatus}
        remainingMs={props.remainingMs}
        meta={props.meta}
        onMetaChange={props.onMetaChange}
        onPay={props.onPay}
      />
    </main>
  )
}

export function CheckoutModalShell({
  left,
  right,
}: {
  left: React.ReactNode
  right: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4 transition-colors duration-200 dark:bg-zinc-950 md:p-8">
      <section
        aria-label="KethyrPay Checkout"
        className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl transition-colors duration-200 dark:border-zinc-800 dark:bg-[#121214] dark:shadow-2xl md:grid-cols-2 md:divide-x md:divide-zinc-200 dark:md:divide-zinc-800/80"
      >
        <div className="flex flex-col gap-6 p-8 md:p-10">{left}</div>
        <div className="flex flex-col justify-between gap-6 p-8 md:p-10">{right}</div>
      </section>
    </main>
  )
}

export function CheckoutBrandHeader() {
  return (
    <header className="flex items-center gap-3">
      <KethyrLogo size={28} />
      <div className="leading-tight">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          KethyrPay
        </h1>
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500">隐私支付收银台</p>
      </div>
    </header>
  )
}

interface CheckoutCardProps {
  subtotal: number
  total: number
  intent: PaymentIntent
  wallet: WalletState
  onConnectWallet: () => void
  onDisconnectWallet?: () => void
  payDisabled: boolean
  payStatus: 'idle' | 'signing' | 'broadcasting'
  remainingMs: number | null
  meta?: CheckoutModalProps['meta']
  onMetaChange?: CheckoutModalProps['onMetaChange']
  onPay: () => void
}

function CheckoutCard(props: CheckoutCardProps) {
  return (
    <section
      aria-label="KethyrPay Checkout"
      className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl transition-colors duration-200 dark:border-zinc-800 dark:bg-[#121214] dark:shadow-2xl md:grid-cols-2 md:divide-x md:divide-zinc-200 dark:md:divide-zinc-800/80"
    >
      <PaymentSummary
        intent={props.intent}
        total={props.total}
        remainingMs={props.remainingMs}
      />
      <PaymentForm {...props} />
      {/* 屏外发票号：辅助技术可读，视觉隐藏 */}
      <span className="sr-only">Invoice {props.intent.invoice_id}</span>
    </section>
  )
}

// --------------------------------------------------------------------------
// Left column — Payment summary
// --------------------------------------------------------------------------

function PaymentSummary({
  intent,
  total,
  remainingMs,
}: {
  intent: PaymentIntent
  total: number
  remainingMs: number | null
}) {
  const program = (intent.transaction as { program?: string }).program ?? '—'
  const fn = (intent.transaction as { function?: string }).function ?? '—'

  return (
    <div className="flex flex-col gap-6 p-8 md:p-10">
      {/* Brand header — 统一为后台 KethyrLogo（盾牌） */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KethyrLogo size={28} />
          <div className="leading-tight">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              KethyrPay
            </h1>
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500">
              隐私支付收银台
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Pay-to merchant */}
      <div className="space-y-2 rounded-2xl border border-zinc-200/80 bg-zinc-50 p-4 dark:border-zinc-800/60 dark:bg-zinc-900/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Pay to
          </span>
          <NetworkBadge label="Aleo testnet" />
        </div>
        <MerchantAddress address={intent.merchant} />
      </div>

      {/* Privacy / what's-happens summary */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          What happens on Pay
        </p>
        <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <PrivacyBullet icon={Lock}>
            你的浏览器对 <CodeInline>{fn}</CodeInline> 发起一次签名，钱包弹出确认。
          </PrivacyBullet>
          <PrivacyBullet icon={ShieldCheck}>
            链上记录只包含 commitments，看不出付款人 / 金额 / 商家关联。
          </PrivacyBullet>
          <PrivacyBullet icon={Link2}>
            商家通过 InvoiceRecord 与付款回执配对，整个流程无第三方托管。
          </PrivacyBullet>
        </ul>
      </div>

      {/* Inner pricing card */}
      <div className="space-y-4 rounded-2xl border border-zinc-200/80 bg-zinc-50 p-5 dark:border-zinc-800/60 dark:bg-zinc-900/60">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Amount due
            </p>
            <span className="rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              aleo
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {total.toFixed(2)}
            </span>
          </div>
          <span className="block text-xs text-zinc-500 dark:text-zinc-500">
            Atomic pay_invoice: invoice + amount + private aleo
          </span>
        </div>

        <div className="space-y-2 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800/60">
          <DetailRow
            icon={ReceiptText}
            label="Program"
            value={
              <span className="font-mono">
                {program} / {fn}
              </span>
            }
          />
          <DetailRow
            icon={Clock}
            label="Expires"
            value={
              remainingMs !== null ? (
                <CountdownText remainingMs={remainingMs} />
              ) : (
                <span className="text-zinc-500">—</span>
              )
            }
          />
          <DetailRow
            icon={Key}
            label="Invoice ID"
            value={
              <span className="font-mono" title={intent.invoice_id}>
                {truncateAddress(intent.invoice_id, 10, 8)}
              </span>
            }
          />
        </div>
      </div>
    </div>
  )
}

/** 商家地址：完整显示 + 复制按钮（首次点击短暂显示「Copied」） */
function MerchantAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // clipboard 不可用时静默降级
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code
        className="block min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300"
        title={address}
      >
        {address}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy merchant address"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
      >
        {copied ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
        ) : (
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </div>
  )
}

function NetworkBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
      {label}
    </span>
  )
}

function PrivacyBullet({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-2">
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
        aria-hidden
      />
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-zinc-600 dark:text-zinc-400">
      <span className="inline-flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden />
        {label}
      </span>
      <span className="font-medium text-zinc-700 dark:text-zinc-200">{value}</span>
    </div>
  )
}

function CountdownText({ remainingMs }: { remainingMs: number }) {
  if (remainingMs <= 0) {
    return <span className="font-semibold text-red-600 dark:text-red-400">已过期</span>
  }
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span className="font-mono tabular-nums">
      {hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`}
    </span>
  )
}

// --------------------------------------------------------------------------
// Right column — Payment form
// --------------------------------------------------------------------------

function PaymentForm(props: CheckoutCardProps) {
  const {
    intent,
    total,
    wallet,
    onConnectWallet,
    onDisconnectWallet,
    payDisabled,
    payStatus,
    meta,
    onMetaChange,
    onPay,
  } = props

  const setMeta = (patch: Partial<NonNullable<CheckoutModalProps['meta']>>) => {
    onMetaChange?.({
      memo: patch.memo ?? meta?.memo ?? '',
      taxId: patch.taxId ?? meta?.taxId ?? '',
      reference: patch.reference ?? meta?.reference ?? '',
    })
  }

  const payLabel =
    payStatus === 'signing'
      ? '签名中…'
      : payStatus === 'broadcasting'
        ? '广播中…'
        : wallet.status !== 'connected'
          ? '连接钱包以支付'
          : `Pay ${total.toFixed(2)} ALEO`

  return (
    <form
      className="flex flex-col justify-between gap-6 p-8 md:p-10"
      onSubmit={(e) => {
        e.preventDefault()
        onPay()
      }}
    >
      <div className="space-y-5">
        {/* Wallet status card (replaces Stripe Link box) */}
        <WalletStatusCard
          wallet={wallet}
          onConnect={onConnectWallet}
          onDisconnect={onDisconnectWallet}
        />

        {/* Memo (optional reference note for merchant) */}
        <Field
          label="Memo"
          htmlFor="memo"
          trailing={<span className="text-xs text-zinc-500">Optional</span>}
        >
          <input
            id="memo"
            type="text"
            maxLength={140}
            placeholder="例如：订单号 / 备注（不写入链上明文）"
            value={meta?.memo ?? ''}
            onChange={(e) => setMeta({ memo: e.target.value })}
            className={fieldInputClass}
          />
        </Field>

        {/* Tax ID (optional) — replaces Stripe "billing country" select */}
        <Field
          label="Tax ID"
          htmlFor="tax-id"
          trailing={<span className="text-xs text-zinc-500">Optional</span>}
        >
          <input
            id="tax-id"
            type="text"
            maxLength={32}
            placeholder="VAT / GST / 税号"
            value={meta?.taxId ?? ''}
            onChange={(e) => setMeta({ taxId: e.target.value })}
            className={fieldInputClass}
          />
        </Field>

        {/* Reference number */}
        <Field label="Reference" htmlFor="reference">
          <input
            id="reference"
            type="text"
            placeholder={
              intent.invoice_id ? `Invoice ${intent.invoice_id}` : 'Invoice ID'
            }
            value={meta?.reference ?? intent.invoice_id}
            onChange={(e) => setMeta({ reference: e.target.value })}
            className={`${fieldInputClass} font-mono`}
          />
        </Field>

        {/* Order breakdown — Aleo 没有 VAT，但保留「总览」行以匹配视觉 */}
        <dl className="space-y-1.5 pt-2 text-xs text-zinc-600 dark:text-zinc-400 md:text-sm">
          <Row label="Subtotal (ALEO)" value={total.toFixed(2)} />
          <Row label="Network fee" value="0.10" subtle />
          <Row
            label="Total"
            value={`${(total + 0.1).toFixed(2)} ALEO`}
            emphasis
          />
        </dl>

        {/* Disclaimer when wallet not connected */}
        {wallet.status !== 'connected' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/5 dark:text-amber-200/90">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="leading-relaxed">
              需要先连接 Aleo 钱包（Leo Wallet / Shield / Fox / Puzzle）才能签名支付。
            </span>
          </div>
        )}
      </div>

      {/* Bottom: CTA + legal — 限宽居中避免全宽过大 */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="submit"
          disabled={payDisabled}
          className="inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-[#121214]"
        >
          {wallet.status === 'connecting' && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {payLabel}
        </button>

        <p className="text-center text-[11px] leading-tight text-zinc-500">
          单笔交易由{' '}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            pay_private_v3.aleo::pay_invoice
          </span>{' '}
          原子化完成 ALEO 转移 + InvoiceRecord 消费 + 双 Receipt 产出。
        </p>

        <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <span>Powered by</span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            KethyrPay
          </span>
        </div>
      </div>
    </form>
  )
}

// --------------------------------------------------------------------------
// Wallet status card (replaces the Stripe Link box)
// --------------------------------------------------------------------------

function WalletStatusCard({
  wallet,
  onConnect,
  onDisconnect,
}: {
  wallet: WalletState
  onConnect: () => void
  onDisconnect?: () => void
}) {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet
            className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
            aria-hidden
          />
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            Pay from
          </span>
          <WalletStatusBadge wallet={wallet} />
        </div>
        {wallet.status === 'connected' ? (
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {truncateAddress(wallet.publicKey)}
          </span>
        ) : null}
      </div>

      {wallet.status === 'connected' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <span className="block text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Network
              </span>
              <span className="font-mono">Aleo testnet</span>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <span className="block text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Records
              </span>
              <span>Auto-scanned</span>
            </div>
          </div>
          {onDisconnect && (
            <button
              type="button"
              onClick={onDisconnect}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white"
            >
              Disconnect
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={wallet.status === 'connecting'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
        >
          {wallet.status === 'connecting' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              等待钱包…
            </>
          ) : (
            '连接 Aleo 钱包'
          )}
        </button>
      )}
    </div>
  )
}

function WalletStatusBadge({ wallet }: { wallet: WalletState }) {
  if (wallet.status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Connected
      </span>
    )
  }
  if (wallet.status === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        Connecting
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      Not connected
    </span>
  )
}

// --------------------------------------------------------------------------
// Small atoms
// --------------------------------------------------------------------------

const fieldInputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600'

function Field({
  label,
  htmlFor,
  children,
  trailing,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
        >
          {label}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  emphasis,
  subtle,
}: {
  label: string
  value: string
  emphasis?: boolean
  subtle?: boolean
}) {
  return (
    <div
      className={`flex justify-between ${
        emphasis
          ? 'pt-1 text-sm font-bold text-zinc-900 dark:text-base dark:text-white'
          : subtle
            ? 'text-zinc-500 dark:text-zinc-500'
            : 'text-zinc-600 dark:text-zinc-400'
      }`}
    >
      <dt>{label}</dt>
      <dd className={emphasis ? '' : 'text-zinc-700 dark:text-zinc-200'}>
        {value}
      </dd>
    </div>
  )
}

function CodeInline({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[11px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  )
}