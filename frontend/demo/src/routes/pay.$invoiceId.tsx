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
 * - 未连接钱包 → CheckoutModal 内的「Pay from」钱包卡片引导，
 *   不再单独用 RequireWallet 包裹整个页面。
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

import { CheckoutModal } from '@/components/CheckoutModal.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { usePerformance } from '@/hooks/usePerformance.ts'
import {
  parseCreditsRecord,
  parseInvoiceRecord,
  pickCreditsRecord,
  sanitizeInvoiceRecordPlaintext,
} from '@/lib/invoice-record.ts'
import {
  buildDemoPaymentIntent,
  fetchPaymentIntent,
  parseDemoParams,
  sanitizeReturnUrl,
} from '@/lib/payment-intents.ts'
import {
  classifyPaymentError,
  getRemainingMs,
} from '@/lib/checkout.ts'

/** demo 商家地址：HANDOFF §3 的 pay_private_v3.aleo 部署者地址 */
const DEMO_MERCHANT = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'

interface CheckoutSearch {
  amount?: string
  merchant?: string
  return_url?: string
  invoice_record?: string
}

function stripSearchQuotes(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim()
  }
  return t
}

export const Route = createFileRoute('/pay/$invoiceId')({
  component: PayInvoiceLayout,
  validateSearch: (search: Record<string, unknown>): CheckoutSearch => {
    // 注意：TanStack Router 默认 parseSearch 会把 URL 中可 JSON 解析的值
    // （如 "1.5" / "2"）转成 number，因此 amount 需兼容 string | number。
    // 另外有些入口会把 amount 编成 %221.5%22（带引号），需去引号。
    const rawAmount = search.amount
    let amount: string | undefined
    if (typeof rawAmount === 'string' || typeof rawAmount === 'number') {
      amount = stripSearchQuotes(String(rawAmount))
    }
    return {
      amount,
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

  const {
    loaded: walletLoaded,
    connected,
    connecting,
    publicKey,
    connect: connectWallet,
    disconnect: disconnectWallet,
    signTransaction,
    requestRecords,
    transactionStatus,
  } = useAleoWallet()
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
  // 用户在右栏填写的元数据（备注 / Tax ID / 参考号）。
  // 当前 demo 未消费这些字段；为后续把 memo / reference 写入 transaction.metadata
  // （ALEO-MVP-022）保留 UI 入口。
  const [meta, setMeta] = useState({ memo: '', taxId: '', reference: '' })

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

  /** 支付主流程：v3 原子结算（单笔 pay_invoice 4-input 交易）。
   *
   *  1. 从付款人钱包扫描自己的 InvoiceRecord（owner=publicKey, invoice_id 匹配）。
   *  2. 从付款人钱包扫描 credits.aleo private record（balance ≥ 金额）。
   *  3. 构造 4-input pay_invoice：invoice + amount + sender_ciphertext + credits token。
   *  4. 签名广播 → 链上原子完成 credits.aleo::transfer_private + 消费 InvoiceRecord
   *     + 产出 MerchantReceipt + PayerReceipt。任一步失败整笔 revert。
   */
  const handlePay = async () => {
    if (intentState.kind !== 'ready') return
    const intent = intentState.intent
    setError(null)
    setPayStatus('signing')

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} 超时（${ms / 1000}s）——钱包未响应，请检查钱包是否已解锁/是否已授权记录访问，或重试。`)), ms),
        ),
      ])

    /** 签名交易并轮询确认链上成功，返回链上交易 ID（at1...）。失败抛错。 */
    const signAndConfirm = async (
      label: string,
      transaction: unknown,
      timeoutMs = 60_000,
    ): Promise<string> => {
      const jobId = await withTimeout(
        Promise.resolve(signTransaction(transaction) as Promise<unknown>),
        60_000,
        `${label} 钱包签名`,
      )
      if (!jobId) {
        throw new Error(`${label} 签名失败：未返回交易 ID（钱包可能取消了签名）。`)
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
      if (!publicKey) {
        throw new Error('钱包未连接：无法定位付款人记录。')
      }

      const amountMicro = creditsToMicrocredits(intent.amount)

      // 1) 付款人扫描自己的 InvoiceRecord（owner=publicKey, invoice_id 匹配）。
      // 扫描前给 wallet 一个明确的超时，避免 requestRecords 挂起导致按钮永久 loading 且不弹签名。
      const expectedField = paymentIdToField(invoiceId)
      console.log('[kethyrpay:checkout] scanning records', { expectedField, publicKey, invoiceId })
      const invoiceRecords = (await withTimeout(
        Promise.resolve(requestRecords('pay_private_v3.aleo', true) as Promise<unknown[]>).then((r) => r ?? []),
        15_000,
        '扫描 InvoiceRecord',
      )) ?? []
      console.log('[kethyrpay:checkout] invoiceRecords', invoiceRecords.length)
      let ownedInvoice = invoiceRecords
        .map(parseInvoiceRecord)
        .find(
          (r) =>
            r &&
            r.owner === publicKey &&
            r.invoiceId === expectedField &&
            !r.spent &&
            r.plaintext,
        )
      // fallback：若钱包扫描不到但 URL 带了 invoice_record（商家通过链接直接交付的明文），则直接使用该记录
      if (!ownedInvoice && demoParams.invoiceRecord) {
        const fallback = parseInvoiceRecord(demoParams.invoiceRecord)
        if (fallback && fallback.owner === publicKey && fallback.invoiceId === expectedField && fallback.plaintext) {
          console.log('[kethyrpay:checkout] using invoiceRecord from URL fallback')
          ownedInvoice = fallback
        }
      }
      if (!ownedInvoice) {
        throw new Error(
          '未能在当前钱包中找到待支付的 InvoiceRecord。请确认：1) 商家已通过 mint_to_payer 把发票铸造并交付给你；2) 钱包已同步/扫描到该记录（等待链上确认或刷新钱包记录）。' +
            (invoiceRecords.length === 0 ? '（钱包当前返回 0 条 pay_private_v3.aleo 记录）' : `（钱包返回 ${invoiceRecords.length} 条记录，但无匹配项）`),
        )
      }

      // 2) 付款人扫描 credits.aleo private record（balance ≥ 金额）。
      // v3 pay_invoice 内置 credits.aleo::transfer_private，必须由付款人提供一张
      // ≥ 金额的 private credits record；多余余额会作为找零返回。
      const creditsRecords = (await withTimeout(
        Promise.resolve(requestRecords('credits.aleo', true) as Promise<unknown[]>).then((r) => r ?? []),
        15_000,
        '扫描 credits.aleo 记录',
      )) ?? []
      console.log('[kethyrpay:checkout] creditsRecords', creditsRecords.length)
      const tokenPlaintext = pickCreditsRecord(
        creditsRecords,
        publicKey,
        amountMicro,
      )
      if (!tokenPlaintext) {
        const debug = creditsRecords
          .map((r) => {
            const p = parseCreditsRecord(r)
            if (!p) return 'unparseable'
            return `${p.owner.slice(0, 10)}…:${p.microcredits}u64${p.spent ? ':spent' : ''}${!p.plaintext ? ':no-plaintext' : ''} ownerMatch=${p.owner === publicKey}`
          })
          .slice(0, 5)
          .join(' | ')
        throw new Error(
          '当前钱包没有余额 ≥ 支付金额的 private credits record。' +
            '请先用 credits.aleo::transfer_public_to_private 把 public credits 转成 private 后重试。' +
            (creditsRecords.length === 0 ? '（钱包当前返回 0 条 credits.aleo 记录）' : `（钱包返回 ${creditsRecords.length} 条记录，但均不满足余额 ≥ ${intent.amount}）`) +
            (debug ? ` 调试：${debug}。也可在控制台查看 [kethyrpay:checkout] creditsRecords 明细。` : ''),
        )
      }

      // 3) 构造 v3 4-input 原子 pay_invoice 交易。
      // 钱包返回的 InvoiceRecord 可能多带 sender/_version 等字段（或少字段），
      // 直接原样签名会导致 `InvoiceRecord expected 4/5 entries` 这类授权失败。
      // 清洗为 5 字段标准形态后再签。
      const sanitizedInvoice = sanitizeInvoiceRecordPlaintext(ownedInvoice.plaintext, {
        expectedMerchant: intent.merchant,
      })
      if (sanitizedInvoice !== ownedInvoice.plaintext) {
        console.log('[kethyrpay:checkout] sanitized InvoiceRecord plaintext (removed extra fields / normalized _nonce/_version)')
      }
      const payInvoiceTx = createPayInvoiceTransaction({
        invoiceId: expectedField,
        amount: intent.amount,
        merchant: intent.merchant,
        invoiceRecord: sanitizedInvoice,
        token: tokenPlaintext,
        senderCiphertext: '0group',
      })
      console.log('[kethyrpay:checkout] v3 atomic pay_invoice ready', {
        owner: ownedInvoice.owner,
        invoiceId: ownedInvoice.invoiceId,
        merchant: intent.merchant,
        amount: intent.amount,
        tokenProvided: true,
      })

      // 4) 单笔交易签名广播（v3 atomic：credits.aleo::transfer_private +
      //    消费 InvoiceRecord + 双 Receipt 在同一笔交易内完成）。
      startPhase('checkout-prove')
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
    <>
      {intentState.kind === 'loading' && (
        <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4 transition-colors duration-200 dark:bg-zinc-950 md:p-8">
          <div className="flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-[#121214] dark:shadow-2xl">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-zinc-600 dark:text-zinc-400">发票信息加载中…</p>
          </div>
        </main>
      )}

      {intentState.kind === 'not-found' && (
        <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4 transition-colors duration-200 dark:bg-zinc-950 md:p-8">
          <div className="flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-[#121214] dark:shadow-2xl">
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              无法加载发票
            </h2>
            <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              {intentState.reason}
            </p>
            {!isDemo && (
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: '/pay',
                    search: { amount: '1.5', merchant: DEMO_MERCHANT },
                  })
                }
                className="mt-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                用 Demo 发票试试
              </button>
            )}
          </div>
        </main>
      )}

      {intentState.kind === 'ready' && (
        <>
          <CheckoutModal
            intent={intentState.intent}
            wallet={
              !walletLoaded
                ? { status: 'idle' }
                : connecting
                  ? { status: 'connecting' }
                  : connected && publicKey
                    ? { status: 'connected', publicKey }
                    : { status: 'idle' }
            }
            onConnectWallet={() => {
              void connectWallet()
            }}
            onDisconnectWallet={() => {
              void disconnectWallet()
            }}
            payDisabled={
              !connected || !publicKey || payStatus !== 'idle' || expired
            }
            payStatus={payStatus === 'error' ? 'idle' : payStatus}
            remainingMs={
              expired
                ? 0
                : intentState.kind === 'ready'
                  ? getRemainingMs(intentState.intent.expires_at, now)
                  : null
            }
            meta={meta}
            onMetaChange={setMeta}
            onPay={handlePay}
          />

          {/* 过期 / 错误状态条：固定在卡片下方，不遮挡主交互 */}
          {expired && (
            <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs text-red-700 shadow-lg backdrop-blur dark:text-red-300">
              发票已过期
            </p>
          )}

          {isDemo && (
            <aside className="mx-auto mb-6 w-full max-w-5xl rounded-xl border border-amber-500/20 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/5 dark:text-amber-200/90">
              Demo 模式：交易参数由 SDK 现场构造，可直接签名广播到 testnet。
              {demoParams.invoiceRecord
                ? ' 已附带商家转移的 InvoiceRecord，支付将消费该发票记录。'
                : ' 未附带 InvoiceRecord（无真实发票记录），仅用于界面演示。'}
            </aside>
          )}

          {payStatus === 'error' && error && (
            <div
              role="alert"
              className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,640px)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-red-500/30 bg-white/95 px-4 py-3 text-sm shadow-xl backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-red-500/30 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/80"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-red-800 dark:text-red-200">
                  支付失败（{error.kind}）
                </p>
                <p className="mt-1 break-all text-xs leading-relaxed text-red-700/90 dark:text-red-300/90">
                  {error.message}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPayStatus('idle')}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
                >
                  重试
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPayStatus('idle')
                    setError(null)
                  }}
                  aria-label="关闭提示"
                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
