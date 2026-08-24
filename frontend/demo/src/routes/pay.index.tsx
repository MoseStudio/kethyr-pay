/**
 * /pay（精确路径）—— 收款演示生成器（Wave H3 ALEO-MVP-010 入口）。
 *
 * 输入金额 + 商家地址 → 生成 inv_demo_xxx 发票 → 跳转新 Checkout 页
 * /pay/:invoiceId?amount=..&merchant=..&return_url=..（demo 模式）。
 *
 * 说明：本页由 H1 POC 的 Pull Payment 页面改造而来。原 Pull Payment
 * （escrow_subscription 的 pull_payment）功能已由 H3 Checkout（pay_private.aleo）
 * 取代，完整实现保留在 git 历史 c9b4579^ 的 src/routes/pay.tsx。
 * 首页「Pay」入口现指向本生成器 → demo Checkout 流。
 */

import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'

import { WalletStatus } from '@/components/WalletStatus.tsx'
import { generateDemoInvoiceId, sanitizeReturnUrl } from '@/lib/payment-intents.ts'

export const Route = createFileRoute('/pay/')({
  component: Pay,
  // POC 遗留：authorize.tsx 曾以 ?escrow=... 跳转到 /pay 走 Pull Payment。
  // H3 起 /pay 是 Checkout 演示生成器，escrow 参数保留在类型中以兼容旧链接，内容被忽略。
  // amount / merchant：pay.$invoiceId.tsx 的「用 Demo 发票试试」会通过 navigate 把
  // 这两个值预填到表单，避免用户重复输入（不进入实际 intent 计算，仅 form state）。
  validateSearch: (search: Record<string, unknown>): {
    escrow?: string
    amount?: string
    merchant?: string
  } => ({
    escrow: typeof search.escrow === 'string' ? search.escrow : undefined,
    amount: typeof search.amount === 'string' ? search.amount : undefined,
    merchant: typeof search.merchant === 'string' ? search.merchant : undefined,
  }),
})

/** demo 商家地址：HANDOFF §3 的 pay_private_v3.aleo 部署者地址 */
const DEMO_MERCHANT = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'

function Pay() {
  const navigate = useNavigate()
  // 如果 URL 带 amount / merchant（来自 /pay/:invoiceId 的「用 Demo 发票试试」回跳），
  // 则用 URL 值预填表单；否则用默认 demo 值。
  const initialSearch = Route.useSearch()
  const [amount, setAmount] = useState(initialSearch.amount ?? '1.5')
  const [merchant, setMerchant] = useState(initialSearch.merchant ?? DEMO_MERCHANT)
  const [returnUrl, setReturnUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const { isValidAleoAddress } = await import('@kethyrpay/sdk')
    if (Number(amount) <= 0 || !Number.isFinite(Number(amount))) {
      setError('请输入有效的正数金额。')
      return
    }
    if (!isValidAleoAddress(merchant.trim())) {
      setError('商家地址必须是有效的 aleo1... 地址。')
      return
    }

    setSubmitting(true)
    try {
      const invoiceId = generateDemoInvoiceId(merchant.trim() + amount, Date.now())
      const search: Record<string, string> = {
        amount: Number(amount).toFixed(6),
        merchant: merchant.trim(),
      }
      const cleanReturnUrl = sanitizeReturnUrl(returnUrl.trim() || undefined)
      if (cleanReturnUrl) search.return_url = cleanReturnUrl

      void navigate({
        to: '/pay/$invoiceId',
        params: { invoiceId },
        search,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-4xl font-bold text-gray-900">收款演示生成器</h1>
        <WalletStatus />
      </div>

      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
        <p className="mb-6 text-gray-600">
          输入金额与商家地址，生成一个 demo 发票并跳转到 Checkout 页
          （<code className="rounded bg-gray-100 px-1">/pay/:invoiceId?amount=..&amp;merchant=..</code>）。
          Demo 模式交易参数由 SDK 现场构造，可直接签名广播到 testnet。
        </p>

        <div className="mb-6 flex items-center justify-between rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600">
            只看 UI？直接打开{' '}
            <Link
              to="/preview"
              className="font-mono text-emerald-700 hover:underline"
            >
              /preview
            </Link>{' '}
            视觉预览页（无需钱包、无链上交互）。
          </span>
          <Link
            to="/preview"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            打开预览
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            金额（ALEO）
            <input
              type="number"
              min="0"
              step="0.000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.5"
              className="rounded-lg border border-gray-300 px-4 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            商家地址（aleo1...）
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="aleo1merchant..."
              className="rounded-lg border border-gray-300 px-4 py-2.5 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            返回地址（可选，支付成功后回跳）
            <input
              type="text"
              value={returnUrl}
              onChange={(e) => setReturnUrl(e.target.value)}
              placeholder="https://merchant.example/order/123"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? '生成中…' : '生成 Checkout 发票'}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}
      </div>

      {/* POC 遗留：Pull Payment 功能入口说明（完整实现见 git 历史） */}
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm">
        <p>
          旧版 Pull Payment（POC，escrow_subscription 合约）已由 H3 Checkout
          （pay_private_v3.aleo）取代，完整实现保留在 git 历史{' '}
          <code className="rounded bg-gray-100 px-1">c9b4579^</code> 的
          src/routes/pay.tsx。
        </p>
      </div>

      <Link to="/" className="text-emerald-600 hover:underline">
        Back to home
      </Link>
    </main>
  )
}
