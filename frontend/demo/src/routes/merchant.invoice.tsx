/**
 * /merchant/invoice — 商家原子铸造+交付发票（H5 ALEO-MVP-018 真实闭环入口）。
 *
 * 真实 Demo 链路第一步：商家在链上**单笔**调用 `mint_to_payer(merchant, payee,
 * amount, invoice_id)` 铸造 InvoiceRecord 并直接把 owner 写为付款人，
 * 付款人随后即可调用 v3 `pay_invoice` 完成支付。
 *
 * 流程：
 * 1. 商家输入金额 + 付款人地址
 * 2. 执行 mint_to_payer（钱包弹窗一次，签名广播）→ 产出 owner=payee 的 InvoiceRecord
 * 3. 展示一笔交易 ID + 给付款人的 Checkout 链接（付款人打开后用自己钱包
 *    `requestRecords('pay_private_v3.aleo')` 扫描即可消费）
 *
 * 历史两笔交易路径（create_invoice + transfer_invoice）已被本流程替代——
 * 省去中间等待钱包扫描的环节，钱包弹窗从两次降为一次。
 */

import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import {
  isValidAleoAddress,
  mintInvoiceToPayerTransaction,
  paymentIdToField,
} from '@kethyrpay/sdk'

import { MerchantTopbar } from '@/components/merchant/MerchantTopbar.tsx'
import { ConnectWalletButton } from '@/components/ConnectWalletButton.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { usePerformance } from '@/hooks/usePerformance.ts'
import { generateDemoInvoiceId } from '@/lib/payment-intents.ts'

export const Route = createFileRoute('/merchant/invoice')({
  component: MerchantInvoice,
})

type MintState =
  | { kind: 'idle' }
  | { kind: 'minting' }
  | { kind: 'done'; mintTx: string; checkoutUrl: string }
  | { kind: 'error'; message: string }

function MerchantInvoice() {
  const { loaded, connected, publicKey, signTransaction } = useAleoWallet()
  const { startPhase, endPhase } = usePerformance()

  const [amount, setAmount] = useState('1.5')
  const [payee, setPayee] = useState('')
  const [state, setState] = useState<MintState>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const merchant = connected && publicKey ? publicKey : null

  const handleMint = async () => {
    console.log('[kethyrpay:invoice] handleMint start', {
      merchant,
      hasSign: typeof signTransaction,
      amount,
      payee,
    })
    if (!merchant || !signTransaction) return
    setError(null)

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('请输入有效的正数金额。')
      return
    }
    if (!isValidAleoAddress(payee.trim())) {
      setError('付款人地址必须是有效的 aleo1... 地址。')
      return
    }

    const invoiceId = generateDemoInvoiceId(merchant + amount, Date.now())
    // 链上 invoice_id field：与 verifyPayment 的 paymentIdToField 映射一致，
    // 保证铸造 / 支付 / 确认三侧可对上
    const invoiceIdField = paymentIdToField(invoiceId)
    const payeeAddr = payee.trim()
    // mint_to_payer 单笔交易：owner 直接写为 payee，无需扫描 + 二次签名。
    const tx = mintInvoiceToPayerTransaction({
      merchant,
      payee: payeeAddr,
      amount: Number(amount).toFixed(6),
      invoiceId: invoiceIdField,
    })

    setState({ kind: 'minting' })
    try {
      startPhase('invoice-mint')
      console.log('[kethyrpay:invoice] signing mint_to_payer', tx)
      const mintTxRaw = await signTransaction(tx)
      endPhase('invoice-mint')
      const mintTx = String(mintTxRaw)
      console.log('[kethyrpay:invoice] mint_to_payer signed, tx =', mintTx)

      // Checkout URL 只带 demo 参数（amount / merchant / invoice_id）；
      // 付款人打开链接后由自己钱包的 requestRecords 扫描链上发票，无需
      // 通过 URL 传递 InvoiceRecord 明文（owner 已经是付款人地址）。
      const checkoutUrl =
        `${window.location.origin}/pay/${invoiceId}` +
        `?amount=${Number(amount).toFixed(6)}&merchant=${merchant}`
      setState({ kind: 'done', mintTx, checkoutUrl })
    } catch (err) {
      console.error('[kethyrpay:invoice] handleMint threw', err)
      setState({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : '发票铸造失败。',
      })
    }
  }

  return (
    <>
      <MerchantTopbar
        left={
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-100">
              铸造发票
            </h1>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              商家后台 · 单笔 mint_to_payer 铸造 InvoiceRecord 并交付付款人
            </p>
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        {!loaded && (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
            钱包适配器加载中…
          </div>
        )}

        {loaded && !connected && (
          <div className="space-y-4 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-8 text-center dark:border-zinc-800/60 dark:bg-zinc-900/60">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-sky-400">
              <Wallet className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              连接钱包以铸造发票
            </h2>
            <p className="mx-auto max-w-md text-xs text-zinc-500 dark:text-zinc-400">
              您的钱包地址即商家身份。铸造并交付发票需要签名并广播
              mint_to_payer 交易（Testnet）。
            </p>
            <div className="flex justify-center">
              <ConnectWalletButton />
            </div>
          </div>
        )}

        {connected && (
          <div className="space-y-4 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-6 dark:border-zinc-800/60 dark:bg-zinc-900/60">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              在链上铸造一张发票（{merchant?.slice(0, 10)}…）并直接交付给付款人——
              单笔 <code className="font-mono">mint_to_payer</code> 交易，owner 一步写为付款人。
              付款人随后可在 Checkout 链接中完成支付。
            </p>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                金额（ALEO）
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 transition focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100 dark:focus:border-zinc-600"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                付款人地址（aleo1...）
                <input
                  type="text"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="aleo1payee..."
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-mono text-sm text-zinc-900 transition focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100 dark:focus:border-zinc-600"
                />
              </label>

              <button
                type="button"
                disabled={state.kind === 'minting'}
                onClick={handleMint}
                className="mt-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.kind === 'minting'
                  ? '铸造并交付中（mint_to_payer）…'
                  : '铸造并交付发票（单笔交易）'}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            )}

            {state.kind === 'done' && (
              <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                <p className="font-semibold">发票已铸造并交付付款人 ✓</p>
                <p className="break-all">
                  mint_to_payer 交易：{state.mintTx}
                </p>
                <p>付款人 Checkout 链接（复制发送给付款人；付款人用自己钱包的 requestRecords 即可消费）：</p>
                <textarea
                  readOnly
                  value={state.checkoutUrl}
                  rows={3}
                  className="w-full break-all rounded-lg border border-emerald-300 bg-white p-2 font-mono text-xs text-emerald-900 dark:border-emerald-500/40 dark:bg-zinc-950/40 dark:text-emerald-200"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = state.checkoutUrl
                  }}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  打开支付页 →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
