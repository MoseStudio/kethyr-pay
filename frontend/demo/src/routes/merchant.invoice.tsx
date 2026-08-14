/**
 * /merchant/invoice — 商家铸造发票 + 转移（H5 ALEO-MVP-018 真实闭环入口）。
 *
 * 真实 Demo 链路第一步：商家在链上铸造 InvoiceRecord（create_invoice），
 * 再通过 transfer_invoice 把发票转移给付款人，付款人才能调用 pay_invoice。
 *
 * 流程：
 * 1. 商家输入金额 + 付款人地址
 * 2. 执行 create_invoice（钱包签名广播）→ 产出 InvoiceRecord（owner=商家）
 * 3. 钱包 requestRecords 扫描到新 InvoiceRecord 明文
 * 4. 执行 transfer_invoice(record, payee) → 发票转移给付款人
 * 5. 展示两个交易 ID + 给付款人的 Checkout 链接
 *
 * 说明：付款人需先把发票记录「扫入」自己的钱包（通过钱包 requestRecords /
 * 记录同步）后才能在 /pay/:invoiceId 完成支付；本页生成的 Checkout 链接
 * 直接带 invoiceRecord 参数，付款人打开即可支付（demo 模式）。
 */

import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  createInvoiceTransaction,
  isValidAleoAddress,
  paymentIdToField,
  transferInvoiceTransaction,
} from '@aleopay/sdk'

import { ConnectWalletButton } from '@/components/ConnectWalletButton.tsx'
import { WalletStatus } from '@/components/WalletStatus.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { usePerformance } from '@/hooks/usePerformance.ts'
import { generateDemoInvoiceId } from '@/lib/payment-intents.ts'

export const Route = createFileRoute('/merchant/invoice')({
  component: MerchantInvoice,
})

type MintState =
  | { kind: 'idle' }
  | { kind: 'minting' }
  | { kind: 'minted'; createTx: string; record: string }
  | { kind: 'transferring'; createTx: string; record: string }
  | { kind: 'done'; createTx: string; transferTx: string; checkoutUrl: string }
  | { kind: 'error'; message: string }

function MerchantInvoice() {
  const { loaded, connected, publicKey, signTransaction, requestRecords } =
    useAleoWallet()
  const { startPhase, endPhase } = usePerformance()

  const [amount, setAmount] = useState('1.5')
  const [payee, setPayee] = useState('')
  const [state, setState] = useState<MintState>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const merchant = connected && publicKey ? publicKey : null

  /** 从钱包扫描 InvoiceRecord（过滤 owner=当前钱包、invoice_id 匹配的发票） */
  const findInvoiceRecord = async (
    merchantAddr: string,
    invoiceId: string,
  ): Promise<string | null> => {
    const records = (await requestRecords('pay_private_v2.aleo', true)) ?? []
    for (const raw of records) {
      const record = parseInvoiceRecord(raw)
      // transfer_invoice 需要完整 Leo 记录字面量（含 _nonce），
      // recordView 结构化字段缺 _nonce 无法重建，必须拿到 plaintext 字符串。
      if (
        record &&
        record.plaintext &&
        record.owner === merchantAddr &&
        record.invoiceId === invoiceId &&
        !record.spent
      ) {
        return record.plaintext
      }
    }
    return null
  }

  const handleMint = async () => {
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
    const tx = createInvoiceTransaction({
      merchant,
      amount: Number(amount).toFixed(6),
      invoiceId: invoiceIdField,
    })
    const payeeAddr = payee.trim()

    setState({ kind: 'minting' })
    try {
      startPhase('invoice-create')
      const createTxRaw = await signTransaction(tx)
      endPhase('invoice-create')
      const createTx = String(createTxRaw)

      // 扫描新发票记录（链上确认需要时间，重试几次）
      let record: string | null = null
      for (let attempt = 0; attempt < 6 && !record; attempt++) {
        await new Promise((r) => setTimeout(r, 3000))
        record = await findInvoiceRecord(merchant, invoiceIdField)
      }

      if (!record) {
        setState({
          kind: 'error',
          message: `发票交易已广播（${createTx}），但未能在链上扫描到 InvoiceRecord。请稍后在 Explorer 确认交易后再试。`,
        })
        return
      }

      // 转移到付款人
      setState({ kind: 'transferring', createTx, record })
      startPhase('invoice-transfer')
      const transferTxRaw = await signTransaction(
        transferInvoiceTransaction({ invoiceRecord: record, to: payeeAddr }),
      )
      endPhase('invoice-transfer')
      const transferTx = String(transferTxRaw)

      const checkoutUrl =
        `${window.location.origin}/pay/${invoiceId}` +
        `?amount=${Number(amount).toFixed(6)}&merchant=${merchant}` +
        `&invoice_record=${encodeURIComponent(record)}`
      setState({ kind: 'done', createTx, transferTx, checkoutUrl })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : '发票铸造失败。',
      })
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex w-full max-w-4xl items-center justify-between self-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">铸造发票</h1>
          <p className="mt-1 text-sm text-gray-500">
            商家后台 · 链上铸造 InvoiceRecord 并转移给付款人
          </p>
        </div>
        <WalletStatus />
      </div>

      <div className="flex w-full max-w-4xl flex-col gap-4 self-center">
        {!loaded && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600 shadow-sm">
            钱包适配器加载中…
          </div>
        )}

        {loaded && !connected && (
          <div className="flex flex-col items-center gap-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-900">连接钱包以铸造发票</h2>
            <p className="max-w-md text-gray-600">
              您的钱包地址即商家身份。铸造发票需要签名并广播
              create_invoice 交易（Testnet）。
            </p>
            <ConnectWalletButton />
          </div>
        )}

        {connected && (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="mb-4 text-sm text-gray-600">
              在链上铸造一张发票（{merchant?.slice(0, 10)}…），并转移给付款人。
              付款人随后可在 Checkout 链接中完成支付。
            </p>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                金额（credits）
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                付款人地址（aleo1...）
                <input
                  type="text"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="aleo1payee..."
                  className="rounded-lg border border-gray-300 px-4 py-2.5 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>

              <button
                type="button"
                disabled={state.kind === 'minting' || state.kind === 'transferring'}
                onClick={handleMint}
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.kind === 'minting'
                  ? '铸造发票中（create_invoice）…'
                  : state.kind === 'transferring'
                    ? '转移发票中（transfer_invoice）…'
                    : '铸造并转移发票'}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {state.kind === 'done' && (
              <div className="mt-4 space-y-3 rounded-lg bg-green-50 p-4 text-sm text-green-900">
                <p className="font-semibold">发票已铸造并转移 ✓</p>
                <p className="break-all">
                  create_invoice 交易：{state.createTx}
                </p>
                <p className="break-all">
                  transfer_invoice 交易：{state.transferTx}
                </p>
                <p>
                  付款人 Checkout 链接（复制发送给付款人）：
                </p>
                <textarea
                  readOnly
                  value={state.checkoutUrl}
                  rows={3}
                  className="w-full break-all rounded-lg border border-green-200 bg-white p-2 font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

/** 从 requestRecords 原始返回中提取 InvoiceRecord 明文（兼容多层包装） */
function parseInvoiceRecord(raw: unknown): {
  owner: string
  amount: string
  invoiceId: string
  plaintext: string
  spent?: boolean
} | null {
  /** 剥离记录字段值的可见性后缀（.private / .public） */
  const strip = (v: unknown): string =>
    String(v ?? '')
      .trim()
      .replace(/\.(private|public)$/, '')

  /**
   * 兼容 requestRecords 返回的多种形态（同时提取结构化字段 + plaintext 字符串）：
   * - { recordView: { fields: { owner: "...", amount: "...", ... } }, plaintext: "..." }
   *   —— wallet-standard RecordEnvelope（fields 是对象，非数组；plaintext 为 Leo 字面量）
   * - { plaintext: "..." }（字符串）或 { plaintext: { owner: "...", ... } }（对象）
   * - 直接字符串（Leo 记录字面量）
   *
   * 注意：plaintext 字符串（含 _nonce）是 transfer_invoice 签名所必需的，
   * 因此 recordView 形态下也必须保留，不能因 fields 存在而丢弃。
   */
  const unwrap = (r: unknown): { fields: Record<string, string>; plaintext: string } => {
    const empty = { fields: {} as Record<string, string>, plaintext: '' }
    if (r === null || typeof r !== 'object') {
      // 直接字符串形态
      return typeof r === 'string' && r.length > 0
        ? { fields: {}, plaintext: r }
        : empty
    }
    const obj = r as Record<string, unknown>
    const fields: Record<string, string> = {}

    // 形态 1：recordView.fields（对象）
    if (obj.recordView && typeof obj.recordView === 'object') {
      const rv = obj.recordView as Record<string, unknown>
      if (rv.fields && typeof rv.fields === 'object' && !Array.isArray(rv.fields)) {
        for (const [k, v] of Object.entries(rv.fields as Record<string, unknown>)) {
          if (typeof v === 'string') fields[k] = strip(v)
        }
      }
    }

    // plaintext：字符串（Leo 字面量）或对象（结构化字段）
    let plaintext = ''
    if (typeof obj.plaintext === 'string') {
      plaintext = obj.plaintext
    } else if (obj.plaintext && typeof obj.plaintext === 'object') {
      for (const [k, v] of Object.entries(obj.plaintext as Record<string, unknown>)) {
        if (typeof v === 'string') fields[k] = strip(v)
      }
    }

    // 形态 3：记录本身平铺为对象（owner / amount / invoice_id 顶层）
    if (
      typeof obj.owner === 'string' ||
      typeof obj.invoice_id === 'string' ||
      typeof obj.amount === 'string'
    ) {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') fields[k] = strip(v)
      }
    }

    return { fields, plaintext }
  }

  const { fields, plaintext } = unwrap(raw)

  // 从结构化 fields 提取（recordView.fields / plaintext 对象 / 平铺对象）
  const owner = fields.owner ?? fields.$owner ?? ''
  const amount = fields.amount ?? ''
  const invoiceId = fields.invoice_id ?? fields.$invoice_id ?? ''
  if (owner && amount) {
    return {
      owner,
      amount: strip(amount).replace(/u64$/, ''),
      invoiceId: strip(invoiceId).replace(/field$/, ''),
      plaintext,
      spent: typeof (raw as Record<string, unknown>)?.spent === 'boolean'
        ? ((raw as Record<string, unknown>).spent as boolean)
        : undefined,
    }
  }

  // 从 Leo 字面量（字符串）提取
  const p = plaintext || (typeof raw === 'string' ? raw : '')
  if (!p) return null

  const ownerMatch = /owner:\s*(aleo1[a-z0-9]{58})/.exec(p)
  const amountMatch = /amount:\s*([0-9]+)u64/.exec(p)
  const invoiceIdMatch = /invoice_id:\s*([0-9]+)field/.exec(p)
  if (!ownerMatch || !amountMatch) return null

  return {
    owner: ownerMatch[1],
    amount: amountMatch[1],
    invoiceId: invoiceIdMatch ? invoiceIdMatch[1] : '',
    plaintext: p,
    spent: typeof (raw as Record<string, unknown>)?.spent === 'boolean'
      ? ((raw as Record<string, unknown>).spent as boolean)
      : undefined,
  }
}
