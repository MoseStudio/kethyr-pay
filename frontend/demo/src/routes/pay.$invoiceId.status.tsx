/**
 * ALEO-MVP-011：支付状态与结果页 /pay/:invoiceId/status。
 *
 * - 从 URL 读取 tx（?tx=...）与 return_url
 * - 用 SDK `verifyPayment(invoiceId, { timeoutMs, intervalMs, rpcEndpoint })`
 *   轮询 pending → confirmed | failed
 *   - pending：spinner + 文案 + 进度条（60s 倒计时），可取消
 *   - confirmed：金额 / invoice_id / transaction_id / Explorer 链接
 *   - failed：原因（余额不足 / 重复支付 / 过期 / 超时）+ 重试 + 返回支付页
 * - return_url：confirmed 后展示「返回商家」按钮
 * - RPC 覆盖：VITE_RPC_ENDPOINT 环境变量或 ?rpc= 查询参数
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { KethyrPay, type PaymentStatus } from '@kethyrpay/sdk'

import { WalletStatus } from '@/components/WalletStatus.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { parseStatusSearch, pollProgress, sanitizeHttpUrl } from '@/lib/checkout.ts'

/** 轮询超时：默认 60s（与 SDK DEFAULT_POLL_TIMEOUT_MS 一致） */
const DEFAULT_TIMEOUT_MS = 60_000
/** 轮询间隔：3s（与 SDK DEFAULT_POLL_INTERVAL_MS 一致） */
const DEFAULT_INTERVAL_MS = 3_000

/** RPC 覆盖：VITE_RPC_ENDPOINT 环境变量（.env / .env.local）优先，其次 ?rpc= */
function resolveRpcEndpoint(queryRpc?: string): string | undefined {
  if (queryRpc) return queryRpc
  const fromEnv = import.meta.env?.VITE_RPC_ENDPOINT
  return typeof fromEnv === 'string' && fromEnv ? fromEnv : undefined
}

interface StatusSearch {
  tx?: string
  transfer_tx?: string
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
      transfer_tx:
        typeof search.transfer_tx === 'string' && search.transfer_tx.trim()
          ? search.transfer_tx.trim()
          : undefined,
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

  // 60s 进度倒计时 tick（仅 polling 时）
  useEffect(() => {
    if (pollState.kind !== 'polling') return
    const timer = setInterval(() => setElapsedMs((v) => v + 250), 250)
    return () => clearInterval(timer)
  }, [pollState.kind, attempt])

  const startPolling = useCallback(() => {
    const controller = new AbortController()
    abortRef.current = {
      abort: () => controller.abort(),
    }
    setPollState({ kind: 'polling' })
    setElapsedMs(0)

    const rpcEndpoint = resolveRpcEndpoint(search.rpc)
    console.log('[kethyrpay:status] startPolling', { search, invoiceId })
    // verifyPayment 是 KethyrPay 实例方法：skipWasmInit + memory 钱包避免浏览器依赖，
    // verifyPayment 本身不触达 WASM / 钱包，仅做 RPC 轮询。
    // 轮询需要链上交易 ID（at1...）。Shield 的 signTransaction 返回 job ID（shield_...），
    // 用 transactionStatus(jobId) 解析出链上交易 ID；若已是 at1... 直接使用。
    const resolveChainTxId = async (): Promise<string | null> => {
      // 手动输入的链上交易 ID 优先（兜底路径）
      const manual = manualTx.trim()
      if (manual) {
        if (/^at1/.test(manual)) return manual
        return null
      }
      const rawTx = search.tx?.trim()
      console.log('[kethyrpay:status] resolveChainTxId rawTx =', JSON.stringify(rawTx))
      if (!rawTx) return null
      if (/^at1/.test(rawTx)) return rawTx

      // job ID（shield_...）→ transactionStatus 轮询直到拿到链上交易 ID
      for (let i = 0; i < 10; i++) {
        try {
          const res = await transactionStatus(rawTx)
          console.log(`[kethyrpay:status] transactionStatus attempt ${i}`, res)
          if (res.transactionId && /^at1/.test(res.transactionId)) {
            return res.transactionId
          }
          if (res.error) {
            console.warn('[kethyrpay:status] transactionStatus error', res.error)
          }
          if (res.status === 'failed' || res.status === 'rejected') {
            return null
          }
        } catch (err) {
          console.warn('[kethyrpay:status] transactionStatus threw', err)
        }
        // 交易上链需要时间，等待后重试
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
                '无法解析链上交易 ID（钱包连接不可用）。交易可能已成功，请在 Shield 钱包历史或 Explorer 中确认，然后使用页面底部的「用交易 ID 查询」重试。',
            },
          })
          return
        }
        const kethyrPay = await KethyrPay.create({ skipWasmInit: true })
        console.log('[kethyrpay:status] verifyPayment params', {
          invoiceId,
          chainTxId,
          searchAmount: search.amount,
        })
        const status = await kethyrPay.verifyPayment(invoiceId, {
          timeoutMs: DEFAULT_TIMEOUT_MS,
          intervalMs: DEFAULT_INTERVAL_MS,
          ...(rpcEndpoint ? { rpcEndpoint } : {}),
          transactionId: chainTxId,
          ...(search.amount ? { expectedAmount: search.amount } : {}),
        })
        if (controller.signal.aborted) return
        if (status.status === 'confirmed') {
          setPollState({ kind: 'confirmed', status })
        } else if (status.status === 'failed') {
          setPollState({ kind: 'failed', status })
        } else {
          // 理论不可达（verifyPayment 只返回 confirmed / failed）；防御处理
          setPollState({
            kind: 'failed',
            status: { status: 'failed', error: '支付状态未知。', transaction_id: status.transaction_id },
          })
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : '支付状态查询失败。'
        setPollState({ kind: 'failed', status: { status: 'failed', error: message } })
      }
    })()
  }, [invoiceId, search.rpc, search.tx, transactionStatus, manualTx])

  useEffect(() => {
    startPolling()
    return () => abortRef.current?.abort()
    // 仅在首次进入或显式重试时重启轮询
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  const cancelPolling = () => {
    abortRef.current?.abort()
    setPollState({ kind: 'failed', status: { status: 'failed', error: '轮询已取消。' } })
  }

  const retry = () => {
    setAttempt((a) => a + 1)
  }

  const backToCheckout = () => {
    void navigate({ to: '/pay/$invoiceId', params: { invoiceId } })
  }

  const txId =
    pollState.kind === 'polling'
      ? undefined
      : pollState.status.transaction_id ?? undefined

  // 展示金额：SDK 返回非 0 用它；否则回退 URL 传入的已知金额
  // （隐私模型下链上金额是密文，SDK 可能解析不到，用付款人已知金额兜底）
  const displayAmount =
    pollState.kind === 'confirmed' && Number(pollState.status.amount) > 0
      ? pollState.status.amount
      : search.amount

  const progress = pollProgress(elapsedMs, DEFAULT_TIMEOUT_MS)
  const remainingSeconds = Math.max(0, Math.ceil((DEFAULT_TIMEOUT_MS - elapsedMs) / 1000))
  const returnUrl = search.return_url ? sanitizeHttpUrl(search.return_url) : undefined

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-4xl font-bold text-gray-900">Payment Status</h1>
        <WalletStatus />
      </div>

      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
        {pollState.kind === 'polling' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <h2 className="text-xl font-semibold text-gray-900">等待链上确认…</h2>
            <p className="max-w-md text-sm text-gray-600">
              正在轮询 Testnet RPC 确认交易（发票 {invoiceId}）。
              {remainingSeconds > 0 ? `剩余 ${remainingSeconds}s` : '即将超时'}
            </p>

            {/* 进度条 */}
            <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>

            <button
              type="button"
              onClick={cancelPolling}
              className="mt-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
          </div>
        )}

        {pollState.kind === 'confirmed' && (
          <div className="py-4">
            <div className="mb-6 rounded-xl bg-green-50 p-6 text-center">
              <p className="text-2xl font-extrabold text-green-800">支付成功 ✓</p>
              <p className="mt-2 text-5xl font-extrabold text-gray-900">
                {displayAmount ?? '0'}
                <span className="ml-2 text-2xl font-semibold text-gray-500">credits</span>
              </p>
            </div>

            <div className="mb-6 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-gray-500">发票号</span>
                <span className="font-mono text-gray-800 break-all">
                  {pollState.status.invoice_id}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-gray-500">交易 ID</span>
                <span className="font-mono text-gray-800 break-all text-right">
                  {pollState.status.transaction_id}
                </span>
              </div>
              {search.transfer_tx && (
                <div className="flex items-start justify-between gap-4">
                  <span className="font-medium text-gray-500">转账交易</span>
                  <span className="font-mono text-gray-800 break-all text-right">
                    {search.transfer_tx}
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-gray-500">Explorer</span>
                <a
                  href={`https://explorer.provable.com/transaction/${pollState.status.transaction_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-600 hover:underline"
                >
                  在 Explorer 查看交易 →
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {returnUrl && (
                <a
                  href={returnUrl}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-center font-semibold text-white hover:bg-emerald-700"
                >
                  返回商家
                </a>
              )}
              <Link
                to="/merchant"
                className="flex-1 rounded-lg border border-emerald-300 px-4 py-3 text-center font-medium text-emerald-700 hover:bg-emerald-50"
              >
                商家后台
              </Link>
              <Link
                to="/"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50"
              >
                返回首页
              </Link>
            </div>
          </div>
        )}

        {pollState.kind === 'failed' && (
          <div className="py-4">
            <div className="mb-6 rounded-xl bg-red-50 p-6 text-center">
              <p className="text-2xl font-extrabold text-red-800">支付未确认</p>
              <p className="mt-2 text-sm text-red-700 break-all">{pollState.status.error}</p>
            </div>

            {/* 兜底：手动输入链上交易 ID 查询（钱包连接不可用时） */}
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-medium text-amber-800">
                交易已在钱包/Explorer 确认？手动输入链上交易 ID（at1...）查询
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualTx}
                  onChange={(e) => setManualTx(e.target.value)}
                  placeholder="at1..."
                  className="flex-1 rounded-lg border border-amber-300 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={retry}
                  disabled={!manualTx.trim()}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  查询
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={retry}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700"
              >
                重试查询
              </button>
              <button
                type="button"
                onClick={backToCheckout}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50"
              >
                返回支付页
              </button>
              <Link
                to="/"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50"
              >
                返回首页
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* RPC 信息（H5 联调用） */}
      <p className="max-w-2xl text-center text-xs text-gray-400">
        发票 {invoiceId}
        {txId ? ` · 交易 ${txId.slice(0, 12)}…` : ''}
        {resolveRpcEndpoint(search.rpc) ? ' · 自定义 RPC' : ''}
      </p>
    </main>
  )
}
