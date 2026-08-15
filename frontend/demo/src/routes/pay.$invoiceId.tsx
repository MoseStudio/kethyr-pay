/**
 * /pay/:invoiceId — Checkout 收银台 + 子路由布局（Wave H3 ALEO-MVP-010/011）。
 *
 * 设计：pay.$invoiceId.tsx 同时是 /pay/$invoiceId 的布局路由与 Checkout 页面。
 * - `/pay/:invoiceId`          → 渲染 CheckoutPage（收银台）
 * - `/pay/:invoiceId/status`   → 渲染 <Outlet />（支付状态页子路由）
 * 用 useMatches 判断当前匹配是否包含子路由（id 以 '/status' 结尾），
 * 避免依赖 dev 插件对 `$param.index.tsx` 的增量识别。
 *
 * 页面能力：
 * - URL 解析 invoice 并展示金额 / 商家 / 发票号 / 过期倒计时
 * - 未连接钱包 → RequireWallet 引导（复用组件）
 * - 支付 = 签名 + 广播真实交易（钱包 adapter executeTransaction）
 *   - 后端返回的 PaymentIntent.transaction 直接签名
 *   - demo 模式用 SDK `createPayInvoiceTransaction` 现场构造
 * - 全程 startPhase/endPhase 埋点（checkout-prove / checkout-broadcast / checkout-confirm）
 * - 成功跳转 /pay/:invoiceId/status?tx=<txId>&return_url=...
 * - 失败态（余额不足 / 重复支付 / 过期 / 网络）明确展示 + 可重试
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Outlet,
  createFileRoute,
  useMatches,
  useNavigate,
} from '@tanstack/react-router'
import type { PaymentIntent } from '@kethyrpay/sdk'
import { createPayInvoiceTransaction, creditsToMicrocredits, paymentIdToField } from '@kethyrpay/sdk'

import { RequireWallet } from '@/components/RequireWallet.tsx'
import { WalletStatus } from '@/components/WalletStatus.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { usePerformance } from '@/hooks/usePerformance.ts'
import { parseInvoiceRecord } from '@/lib/invoice-record.ts'
import {
  buildDemoPaymentIntent,
  fetchPaymentIntent,
  parseDemoParams,
  sanitizeReturnUrl,
} from '@/lib/payment-intents.ts'
import {
  classifyPaymentError,
  formatRemaining,
  getRemainingMs,
  truncateAddress,
} from '@/lib/checkout.ts'

/** demo 商家地址：HANDOFF §3 的 pay_private.aleo 部署者地址 */
const DEMO_MERCHANT = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'

interface CheckoutSearch {
  amount?: string
  merchant?: string
  return_url?: string
  invoice_record?: string
}

export const Route = createFileRoute('/pay/$invoiceId')({
  component: PayInvoiceLayout,
  validateSearch: (search: Record<string, unknown>): CheckoutSearch => {
    // 注意：TanStack Router 默认 parseSearch 会把 URL 中可 JSON 解析的值
    // （如 "1.5" / "2"）转成 number，因此 amount 需兼容 string | number。
    const amount = search.amount
    return {
      amount:
        typeof amount === 'string' || typeof amount === 'number'
          ? String(amount)
          : undefined,
      merchant: typeof search.merchant === 'string' ? search.merchant : undefined,
      return_url: typeof search.return_url === 'string' ? search.return_url : undefined,
      invoice_record:
        typeof search.invoice_record === 'string' ? search.invoice_record : undefined,
    }
  },
})

/** 布局 + 收银台：命中子路由（/status）渲染 Outlet，否则渲染 CheckoutPage */
function PayInvoiceLayout() {
  const matches = useMatches()
  const hasChild = matches.some((m) => m.id.endsWith('/status'))

  if (hasChild) return <Outlet />
  return <CheckoutPage />
}

/** 页面数据状态机：loading（发票加载中）| ready（可支付）| not-found（无法加载） */
type IntentState =
  | { kind: 'loading'; invoiceId: string }
  | { kind: 'ready'; intent: PaymentIntent }
  | { kind: 'not-found'; invoiceId: string; reason: string }

type PayStatus = 'idle' | 'signing' | 'broadcasting' | 'error'

function CheckoutPage() {
  const { invoiceId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()

  const { connected, publicKey, signTransaction, requestRecords, transactionStatus } =
    useAleoWallet()
  const { startPhase, endPhase } = usePerformance()

  // ---- 数据来源：demo 参数优先，否则走后端发票 API（012） ----
  const demoParams = useMemo(() => parseDemoParams(search), [search])
  const isDemo = demoParams.amount !== undefined && demoParams.merchant !== undefined

  const [intentState, setIntentState] = useState<IntentState>({
    kind: 'loading',
    invoiceId,
  })
  const [payStatus, setPayStatus] = useState<PayStatus>('idle')
  const [error, setError] = useState<{ kind: string; message: string } | null>(null)
  const [expired, setExpired] = useState(false)

  // 过期倒计时（1s tick；无 expires_at 时剩余 0 不渲染倒计时）
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const remainingMs =
    intentState.kind === 'ready' ? getRemainingMs(intentState.intent.expires_at, now) : 0
  useEffect(() => {
    if (intentState.kind === 'ready' && remainingMs <= 0) {
      setExpired(true)
    }
  }, [intentState, remainingMs])

  // 加载发票：demo 参数 → 现场构造；否则 GET /api/payment-intents/:id（012）
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (demoParams.amount && demoParams.merchant) {
        // demo 模式：本地构造（不进后端），保证 010 可独立演示
        try {
          const intent = buildDemoPaymentIntent({
            invoiceId,
            amount: demoParams.amount,
            merchant: demoParams.merchant,
            invoiceRecord: demoParams.invoiceRecord,
          })
          if (!cancelled) {
            setIntentState({ kind: 'ready', intent })
            setExpired(false)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'demo 参数无效'
          if (!cancelled) {
            setIntentState({ kind: 'not-found', invoiceId, reason: message })
          }
        }
        return
      }

      // 后端路径：012 的发票 API（未就绪 / 404 时降级提示）
      setIntentState({ kind: 'loading', invoiceId })
      try {
        const intent = await fetchPaymentIntent(invoiceId)
        if (!cancelled) {
          setIntentState({ kind: 'ready', intent })
          setExpired(false)
        }
      } catch (err) {
        const isNotReady = (err as Error & { notReady?: boolean }).notReady === true
        if (!cancelled) {
          setIntentState({
            kind: 'not-found',
            invoiceId,
            reason: isNotReady
              ? `发票 ${invoiceId} 无法加载（后端发票服务未就绪或发票不存在）。可用 demo 参数体验 Checkout。`
              : err instanceof Error
                ? err.message
                : '发票信息加载失败。',
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [invoiceId, demoParams.amount, demoParams.merchant])

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      // clipboard 不可用时静默失败（不影响主流程）
    }
  }

  /** 支付主流程：先转账 credits → 确认成功 → 再消费发票（pay_invoice）。
   *  顺序与确认是安全关键：绝不允许「只消费发票不转账」。 */
  const handlePay = async () => {
    if (intentState.kind !== 'ready') return
    const intent = intentState.intent
    setError(null)
    setPayStatus('signing')

    /** 签名交易并轮询确认链上成功，返回链上交易 ID（at1...）。失败抛错。 */
    const signAndConfirm = async (
      label: string,
      transaction: unknown,
      timeoutMs = 60_000,
    ): Promise<string> => {
      const jobId = await signTransaction(transaction)
      if (!jobId) {
        throw new Error(`${label} 签名失败：未返回交易 ID。`)
      }
      console.log(`[kethyrpay:checkout] ${label} signed, jobId =`, jobId)

      // Shield 返回 job ID（shield_...），轮询 transactionStatus 拿链上交易 ID
      if (!/^shield_/.test(String(jobId))) return String(jobId)
      const deadline = Date.now() + timeoutMs
      let lastError: unknown = null
      while (Date.now() < deadline) {
        try {
          const res = await transactionStatus(String(jobId))
          console.log(`[kethyrpay:checkout] ${label} status`, res)
          if (res.transactionId && /^at1/.test(res.transactionId)) {
            return res.transactionId
          }
          if (res.status === 'failed' || res.status === 'rejected' || res.error) {
            throw new Error(`${label} 链上失败：${res.error ?? res.status}`)
          }
          lastError = null
        } catch (err) {
          if (err instanceof Error && /链上失败/.test(err.message)) throw err
          lastError = err
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
      throw new Error(
        `${label} 确认超时（${timeoutMs / 1000}s 内未上链）。` +
          (lastError ? ` 最后错误：${String(lastError)}` : ''),
      )
    }

    try {
      // 1. 用付款人钱包自己扫描到的 InvoiceRecord 构造 pay_invoice 交易参数
      //    （先构造，确认发票存在；真正签名在转账确认后）
      let payInvoiceTx = intent.transaction
      if (demoParams.invoiceRecord && publicKey) {
        const expectedField = paymentIdToField(invoiceId)
        const records = (await requestRecords('pay_private_v2.aleo', true)) ?? []
        const owned = records
          .map(parseInvoiceRecord)
          .find(
            (r) =>
              r &&
              r.owner === publicKey &&
              r.invoiceId === expectedField &&
              !r.spent &&
              r.plaintext,
          )
        if (owned) {
          payInvoiceTx = createPayInvoiceTransaction({
            invoiceId: expectedField,
            amount: intent.amount,
            merchant: intent.merchant,
            invoiceRecord: owned.plaintext,
            senderCiphertext: '0group',
          })
          console.log('[kethyrpay:checkout] using wallet-owned InvoiceRecord', {
            owner: owned.owner,
            invoiceId: owned.invoiceId,
          })
        } else {
          throw new Error(
            '未能在当前钱包中找到待支付的 InvoiceRecord。请确认：1) 商家已通过 transfer_invoice 把发票转移给你；2) 钱包已同步/扫描到该记录（等待链上确认或刷新钱包记录）。',
          )
        }
      }

      // 2. 先转账 credits（credits.aleo::transfer_public 是标准公开转账）
      startPhase('checkout-prove')
      const amountU64 = `${creditsToMicrocredits(intent.amount).toString()}u64`
      console.log('[kethyrpay:checkout] signing credits transfer', {
        to: intent.merchant,
        amount: amountU64,
      })
      const transferTxId = await signAndConfirm(
        'credits transfer_public',
        {
          program: 'credits.aleo',
          function: 'transfer_public',
          inputs: [intent.merchant, amountU64],
          fee: 100_000,
          privateFee: false,
        },
      )
      console.log('[kethyrpay:checkout] credits transfer confirmed on chain:', transferTxId)

      // 3. 转账已确认，才签名 pay_invoice 消费发票
      console.log('[kethyrpay:checkout] transaction inputs before sign', {
        program: (payInvoiceTx as { program?: string }).program,
        function: (payInvoiceTx as { function?: string }).function,
        inputs: (payInvoiceTx as { inputs?: unknown[] }).inputs,
      })
      const payTxId = await signAndConfirm('pay_invoice', payInvoiceTx)
      console.log('[kethyrpay:checkout] pay_invoice confirmed on chain:', payTxId)
      endPhase('checkout-prove')

      startPhase('checkout-broadcast')
      endPhase('checkout-broadcast')
      setPayStatus('broadcasting')

      startPhase('checkout-confirm')
      endPhase('checkout-confirm')

      const returnUrl = demoParams.returnUrl ?? sanitizeReturnUrl(search.return_url)
      await navigate({
        to: '/pay/$invoiceId/status',
        params: { invoiceId },
        search: {
          tx: payTxId,
          transfer_tx: transferTxId,
          amount: intent.amount,
          return_url: returnUrl ?? undefined,
        },
      })
    } catch (err) {
      const classified = classifyPaymentError(err)
      setError({ kind: classified.kind, message: classified.message })
      setPayStatus('error')
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-4xl font-bold text-gray-900">Checkout</h1>
        <WalletStatus />
      </div>

      <RequireWallet>
        {intentState.kind === 'loading' && (
          <div className="flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-gray-600">发票信息加载中…</p>
          </div>
        )}

        {intentState.kind === 'not-found' && (
          <div className="flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">无法加载发票</h2>
            <p className="max-w-md text-gray-600">{intentState.reason}</p>
            {!isDemo && (
              <a
                href={`/pay/demo?amount=1.5&merchant=${DEMO_MERCHANT}`}
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
              >
                用 Demo 发票试试
              </a>
            )}
          </div>
        )}

        {intentState.kind === 'ready' && (
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
            <p className="mb-6 text-gray-600">完成一笔隐私支付（pay_private.aleo）</p>

            {/* 金额大字展示 */}
            <div className="mb-6 rounded-xl bg-gray-50 p-6 text-center">
              <p className="text-sm uppercase tracking-wide text-gray-500">应付金额</p>
              <p className="mt-2 text-5xl font-extrabold text-gray-900">
                {intentState.intent.amount}
                <span className="ml-2 text-2xl font-semibold text-gray-500">credits</span>
              </p>
            </div>

            <div className="mb-6 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-gray-500">商家</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-gray-800" title={intentState.intent.merchant}>
                    {truncateAddress(intentState.intent.merchant)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyAddress(intentState.intent.merchant)}
                    className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                    title="复制完整地址"
                  >
                    copy
                  </button>
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="font-medium text-gray-500">发票号</span>
                <span className="font-mono text-gray-800">{intentState.intent.invoice_id}</span>
              </div>
              {intentState.intent.expires_at && (
                <div className="flex items-start justify-between gap-4">
                  <span className="font-medium text-gray-500">过期时间</span>
                  <span className={`font-mono ${expired ? 'text-red-600' : 'text-gray-800'}`}>
                    {expired ? '已过期' : formatRemaining(remainingMs)}
                  </span>
                </div>
              )}
            </div>

            {isDemo && (
              <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Demo 模式：交易参数由 SDK 现场构造，可直接签名广播到 testnet。
                {demoParams.invoiceRecord
                  ? ' 已附带商家转移的 InvoiceRecord，支付将消费该发票记录。'
                  : ' 未附带 InvoiceRecord（无真实发票记录），仅用于界面演示。'}
              </div>
            )}

            {/* 支付按钮 */}
            <button
              type="button"
              disabled={!connected || !publicKey || payStatus !== 'idle' || expired}
              onClick={handlePay}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {expired
                ? '发票已过期'
                : payStatus === 'signing'
                  ? '签名中…'
                  : payStatus === 'broadcasting'
                    ? '广播中…'
                    : `支付 ${intentState.intent.amount} credits`}
            </button>

            {payStatus === 'error' && error && (
              <div className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">
                <p className="font-semibold">支付失败（{error.kind}）</p>
                <p className="mt-1 text-sm break-all">{error.message}</p>
                <button
                  type="button"
                  onClick={() => setPayStatus('idle')}
                  className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  重试支付
                </button>
              </div>
            )}
          </div>
        )}
      </RequireWallet>
    </main>
  )
}
