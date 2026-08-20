/**
 * /preview — CheckoutModal 视觉预览页。
 *
 * 不需要真实发票 / 钱包连接，直接渲染 CheckoutModal 以便设计 / 主题调试。
 * Pay 按钮点击后只会闪一个 toast，**不会**触发任何链上交易或 SDK 调用。
 *
 * 路径说明：早期版本挂在 `/pay/demo`，会与 `/pay/$invoiceId`（动态段）
 * 形成路由冲突 — 当 `invoiceId === 'demo'` 时 TanStack Router 会打印
 * "Generated path '/pay/demo' for route '/pay/$invoiceId' matched route
 * '/pay/demo' instead" 警告。把预览页放到 `/pay` 之外（顶层 `/preview`）
 * 可以彻底消除该警告，且语义清晰。
 *
 * 使用场景：
 * - 设计走查：把链接丢给设计师即可对比 light/dark
 * - 主题回归：theme toggle / 排版调整的纯视觉验证
 * - 集成前原型：在对接钱包前先看收银台长什么样
 *
 * 注意：这里的 PaymentIntent / wallet state 都是合成数据；不应被任何
 * 业务逻辑读取或签名。预览页右上角提供一个 wallet state 切换器，
 * 让设计师一次性看到 idle / connecting / connected 三种外观。
 */

import { useCallback, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Info, Wallet } from 'lucide-react'

import { CheckoutModal } from '@/components/CheckoutModal.tsx'
import type { CheckoutModalProps, WalletState } from '@/components/CheckoutModal.tsx'
import type { PaymentIntent } from '@kethyrpay/sdk'

/** 与 pay.index.tsx / pay.$invoiceId.tsx 共用的 demo 商家地址 */
const DEMO_MERCHANT =
  'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'

/** 与 pay.$invoiceId.tsx 钱包连接后的 aleo1 公钥格式保持一致（用于视觉对齐） */
const DEMO_PAYER =
  'aleo1qgqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0w7w8e'

type WalletPreset = 'idle' | 'connecting' | 'connected'

const WALLET_PRESETS: Record<WalletPreset, WalletState> = {
  idle: { status: 'idle' },
  connecting: { status: 'connecting' },
  connected: { status: 'connected', publicKey: DEMO_PAYER },
}

/** 合成 PaymentIntent：仅供 UI 展示。transaction 是真实可签名的占位结构，
 * 但 demo 页永远不会调用 signTransaction。 */
function buildPreviewIntent(): PaymentIntent {
  const invoiceId = 'inv_demo_preview_4b9c2e8f'
  // 29 分钟后过期（短一点，方便看倒计时动效）
  const expires_at = new Date(Date.now() + 29 * 60 * 1000).toISOString()
  return {
    invoice_id: invoiceId,
    amount: '99.5',
    merchant: DEMO_MERCHANT,
    expires_at,
    payment_url: `/pay/${invoiceId}`,
    // transaction 字段类型上必填；这里是纯占位，不会被使用
    // v3 原子结算 pay_invoice 4-input 形态（invoice + amount + sender_ciphertext + token）
    transaction: {
      program: 'pay_private_v3.aleo',
      function: 'pay_invoice',
      inputs: [invoiceId, '99500000u64', '0group', '0field'],
      fee: 100_000,
      privateFee: false,
    },
  }
}

export const Route = createFileRoute('/preview')({
  component: PreviewCheckout,
})

function PreviewCheckout() {
  const intent = useMemo(() => buildPreviewIntent(), [])
  const [walletPreset, setWalletPreset] = useState<WalletPreset>('idle')
  const [meta, setMeta] = useState({ memo: '', taxId: '', reference: '' })
  // 让 Pay 按钮看起来「可点」；点击时只弹一个轻提示，不会触发任何链上动作
  const [hint, setHint] = useState<string | null>(null)
  const handlePay = useCallback(() => {
    setHint('Demo 预览：点击不会上链 / 不调用 signTransaction。')
    window.setTimeout(() => setHint(null), 2400)
  }, [])

  // 倒计时剩余（mock，让预览看到计数）
  const remainingMs = useMemo(() => {
    const ms = new Date(intent.expires_at).getTime() - Date.now()
    return Number.isFinite(ms) && ms > 0 ? ms : null
  }, [intent.expires_at])

  const payDisabled = walletPreset !== 'connected'

  const modalProps: CheckoutModalProps = {
    intent,
    wallet: WALLET_PRESETS[walletPreset],
    onConnectWallet: () => setWalletPreset('connected'),
    payDisabled,
    payStatus: 'idle',
    remainingMs,
    meta,
    onMetaChange: setMeta,
    onPay: handlePay,
  }

  return (
    <>
      <CheckoutModal {...modalProps} />

      {/* 顶部提示条：标明这是预览态，且不会触发链上交易 */}
      <DemoPreviewBanner walletPreset={walletPreset} onPresetChange={setWalletPreset} />

      {/* 底部提示：Pay 按钮反馈（与 CheckoutModal 的视觉风格保持一致） */}
      {hint && (
        <p
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 shadow-lg backdrop-blur dark:text-amber-200"
        >
          {hint}
        </p>
      )}
    </>
  )
}

function DemoPreviewBanner({
  walletPreset,
  onPresetChange,
}: {
  walletPreset: WalletPreset
  onPresetChange: (next: WalletPreset) => void
}) {
  return (
    <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-full border border-zinc-200 bg-white/90 px-4 py-1.5 text-xs text-zinc-700 shadow-lg backdrop-blur transition-colors dark:border-zinc-800 dark:bg-[#121214]/90 dark:text-zinc-200">
        <Info
          className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400"
          aria-hidden="true"
        />
        <span className="font-medium">Visual preview</span>
        <span className="hidden text-zinc-400 md:inline">·</span>
        <span className="hidden text-zinc-500 md:inline">
          无真实发票，点击 Pay 不会上链。
        </span>
        <span className="hidden text-zinc-400 md:inline">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Wallet
            className="h-3.5 w-3.5 text-zinc-500"
            aria-hidden="true"
          />
          <span className="text-zinc-500">Wallet:</span>
          {(['idle', 'connecting', 'connected'] as WalletPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPresetChange(p)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                walletPreset === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {p}
            </button>
          ))}
        </span>
        <Link
          to="/pay"
          className="text-blue-600 hover:underline dark:text-sky-400"
        >
          返回生成器
        </Link>
      </div>
    </div>
  )
}