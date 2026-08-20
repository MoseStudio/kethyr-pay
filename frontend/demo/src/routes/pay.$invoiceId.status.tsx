/**
 * ALEO-MVP-011：支付状态与结果页 /pay/:invoiceId/status。
 *
 * 视觉：沿用 Checkout 的双列 modal 卡片（CheckoutModalShell + KethyrLogo），
 * 左列展示品牌 / 支付摘要 / 状态主视觉，右列展示明细与操作，避免与收银台
 * 割裂。
 *
 * 行为：从 URL 读取 tx（?tx=...）与 return_url，用 SDK verifyPayment
 * 轮询 pending → confirmed | failed。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  XCircle,
} from 'lucide-react'
import { KethyrPay, type PaymentStatus } from '@kethyrpay/sdk'

import { CheckoutBrandHeader, CheckoutModalShell } from '@/components/CheckoutModal.tsx'
import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { parseStatusSearch, pollProgress, sanitizeHttpUrl } from '@/lib/checkout.ts'

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_INTERVAL_MS = 3_000

function resolveRpcEndpoint(queryRpc?: string): string | undefined {
  if (queryRpc) return queryRpc
  const fromEnv = import.meta.env?.VITE_RPC_ENDPOINT
  return typeof fromEnv === 'string' && fromEnv ? fromEnv : undefined
}

interface StatusSearch {
  tx?: string
  amount?: string
  return_url?: string
  rpc?: string
}

export const Route = createFileRoute('/pay/$invoiceId/status')({
  component: PaymentStatusPage,
  validateSearch: (search: Record<string, unknown>): StatusSearch => {
    const parsed = parseStatusSearch(search)
    return {
      tx: parsed.txId,
      amount:
        typeof search.amount === 'string' || typeof search.amount === 'number'
          ? String(search.amount)
          : undefined,
      return_url: parsed.returnUrl,
      rpc: parsed.rpcEndpoint,
    }
  },
})

type PollState =
  | { kind: 'polling' }
  | { kind: 'confirmed'; status: Extract<PaymentStatus, { status: 'confirmed' }> }
  | { kind: 'failed'; status: Extract<PaymentStatus, { status: 'failed' }> }

function PaymentStatusPage() {
  const { invoiceId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { transactionStatus } = useAleoWallet()

  const [pollState, setPollState] = useState<PollState>({ kind: 'polling' })
  const [elapsedMs, setElapsedMs] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [manualTx, setManualTx] = useState('')
  const abortRef = useRef<{ abort: () => void } | null>(null)

  useEffect(() => {
    if (pollState.kind !== 'polling') return
    const timer = setInterval(() => setElapsedMs((v) => v + 250), 250)
    return () => clearInterval(timer)
  }, [pollState.kind, attempt])

  const startPolling = useCallback(() => {
    const controller = new AbortController()
    abortRef.current = { abort: () => controller.abort() }
    setPollState({ kind: 'polling' })
    setElapsedMs(0)

    const rpcEndpoint = resolveRpcEndpoint(search.rpc)
    const resolveChainTxId = async (): Promise<string | null> => {
      const manual = manualTx.trim()
      if (manual) {
        if (/^at1/.test(manual)) return manual
        return null
      }
      const rawTx = search.tx?.trim()
      if (!rawTx) return null
      if (/^at1/.test(rawTx)) return rawTx
      for (let i = 0; i < 10; i++) {
        try {
          const res = await transactionStatus(rawTx)
          if (res.transactionId && /^at1/.test(res.transactionId)) return res.transactionId
          if (res.status === 'failed' || res.status === 'rejected') return null
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
      return null
    }

    void (async () => {
      try {
        const chainTxId = await resolveChainTxId()
        if (!chainTxId) {
          if (controller.signal.aborted) return
          setPollState({
            kind: 'failed',
            status: {
              status: 'failed',
              error:
                '无法解析链上交易 ID（钱包连接不可用）。交易可能已成功，请在 Shield 钱包历史或 Explorer 中确认，然后使用右侧「用交易 ID 查询」重试。',
            },
          })
          return
        }
        const kethyrPay = await KethyrPay.create({ skipWasmInit: true })
        const status = await kethyrPay.verifyPayment(invoiceId, {
          timeoutMs: DEFAULT_TIMEOUT_MS,
          intervalMs: DEFAULT_INTERVAL_MS,
          ...(rpcEndpoint ? { rpcEndpoint } : {}),
          transactionId: chainTxId,
          ...(search.amount ? { expectedAmount: search.amount } : {}),
        })
        if (controller.signal.aborted) return
        if (status.status === 'confirmed') setPollState({ kind: 'confirmed', status })
        else if (status.status === 'failed') setPollState({ kind: 'failed', status })
        else
          setPollState({
            kind: 'failed',
            status: { status: 'failed', error: '支付状态未知。', transaction_id: status.transaction_id },
          })
      } catch (err: unknown) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : '支付状态查询失败。'
        setPollState({ kind: 'failed', status: { status: 'failed', error: message } })
      }
    })()
  }, [invoiceId, search.rpc, search.tx, transactionStatus, manualTx, search.amount])

  useEffect(() => {
    startPolling()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  const cancelPolling = () => {
    abortRef.current?.abort()
    setPollState({ kind: 'failed', status: { status: 'failed', error: '轮询已取消。' } })
  }

  const retry = () => setAttempt((a) => a + 1)
  const backToCheckout = () => {
    void navigate({ to: '/pay/$invoiceId', params: { invoiceId } })
  }

  const txId =
    pollState.kind === 'polling' ? undefined : pollState.status.transaction_id ?? undefined

  const displayAmount =
    pollState.kind === 'confirmed' && Number(pollState.status.amount) > 0
      ? pollState.status.amount
      : search.amount

  const progress = pollProgress(elapsedMs, DEFAULT_TIMEOUT_MS)
  const remainingSeconds = Math.max(0, Math.ceil((DEFAULT_TIMEOUT_MS - elapsedMs) / 1000))
  const returnUrl = search.return_url ? sanitizeHttpUrl(search.return_url) : undefined

  const statusBadge =
    pollState.kind === 'polling'
      ? { label: '等待确认', tone: 'amber' as const }
      : pollState.kind === 'confirmed'
        ? { label: '支付成功', tone: 'emerald' as const }
        : { label: '未确认', tone: 'red' as const }

  return (
    <CheckoutModalShell
      left={
        <>
          <div className="flex items-center justify-between gap-3">
            <CheckoutBrandHeader />
            <ThemeToggle />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusBadge tone={statusBadge.tone}>{statusBadge.label}</StatusBadge>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">Invoice {invoiceId.slice(0, 10)}…</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {pollState.kind === 'polling' ? '等待链上确认' : pollState.kind === 'confirmed' ? '支付已确认' : '支付未确认'}
            </h2>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {pollState.kind === 'polling'
                ? `正在轮询 Testnet RPC（${invoiceId}），剩余 ${remainingSeconds}s，可取消或重试。`
                : pollState.kind === 'confirmed'
                  ? `发票 ${invoiceId} 已在链上确认，金额与回执已就绪。`
                  : pollState.status.error}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50 p-5 dark:border-zinc-800/60 dark:bg-zinc-900/60">
            {pollState.kind === 'polling' && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                </div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">链上确认中…</p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-blue-600 transition-all dark:bg-sky-500" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {remainingSeconds > 0 ? `剩余 ${remainingSeconds}s` : '即将超时'}
                </span>
                <button
                  type="button"
                  onClick={cancelPolling}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  取消
                </button>
              </div>
            )}

            {pollState.kind === 'confirmed' && (
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" aria-hidden />
                </div>
                <p className="mt-3 text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {displayAmount ?? '0'}
                  <span className="ml-2 text-base font-semibold text-zinc-500 dark:text-zinc-400">ALEO</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">支付成功 · 可在 Explorer 查看交易</p>
              </div>
            )}

            {pollState.kind === 'failed' && (
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
                  <XCircle className="h-6 w-6" aria-hidden />
                </div>
                <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">查询未成功</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  若交易已在钱包或 Explorer 确认，可在右侧输入链上交易 ID（at1…）重试。
                </p>
              </div>
            )}
          </div>

          <p className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            <AlertCircle className="h-3 w-3" aria-hidden />
            发票 {invoiceId}
            {txId ? ` · ${txId.slice(0, 12)}…` : ''}
            {resolveRpcEndpoint(search.rpc) ? ' · 自定义 RPC' : ''}
          </p>
        </>
      }
      right={
        <>
          {pollState.kind === 'polling' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">正在验证</h3>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                钱包会通过 <span className="font-mono">pay_private_v3.aleo::pay_invoice</span> 原子完成验证，进度在左侧实时更新。
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  重试查询
                </button>
                <button
                  type="button"
                  onClick={backToCheckout}
                  className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  返回支付页
                </button>
              </div>
            </div>
          )}

          {pollState.kind === 'confirmed' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">收据明细</h3>
              <dl className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-xs text-zinc-500 dark:text-zinc-400">发票号</dt>
                  <dd className="break-all text-right font-mono text-xs text-zinc-800 dark:text-zinc-200">{pollState.status.invoice_id}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-xs text-zinc-500 dark:text-zinc-400">金额</dt>
                  <dd className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{pollState.status.amount} ALEO</dd>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <dt className="shrink-0 whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">交易 ID</dt>
                  <dd className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-zinc-700 dark:text-zinc-300" title={pollState.status.transaction_id}>{pollState.status.transaction_id}</dd>
                </div>
                <a
                  href={`https://explorer.provable.com/transaction/${pollState.status.transaction_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-sky-400"
                >
                  在 Explorer 查看交易 <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </dl>

              <div className="space-y-2">
                {returnUrl && (
                  <a href={returnUrl} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
                    返回商家
                  </a>
                )}
                <Link to="/merchant" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
                  商家后台
                </Link>
                <Link to="/" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
                  返回首页
                </Link>
              </div>
            </div>
          )}

          {pollState.kind === 'failed' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">重试 / 兜底</h3>

              <div className="rounded-xl border border-amber-500/20 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">交易已在 Explorer 确认？用链上交易 ID 查询</p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={manualTx}
                    onChange={(e) => setManualTx(e.target.value)}
                    placeholder="at1..."
                    className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 font-mono text-xs focus:border-amber-500 focus:outline-none dark:border-amber-500/30 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={retry}
                    disabled={!manualTx.trim()}
                    className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    查询
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  重试查询
                </button>
                <button
                  type="button"
                  onClick={backToCheckout}
                  className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  返回支付页
                </button>
                <Link to="/" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
                  返回首页
                </Link>
              </div>
            </div>
          )}
        </>
      }
    />
  )
}

function StatusBadge({ tone, children }: { tone: 'amber' | 'emerald' | 'red'; children: React.ReactNode }) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200'
        : 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} aria-hidden />
      {children}
    </span>
  )
}
