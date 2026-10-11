/**
 * EmployerDashboard — 老板端：初始化企业、批量开流、税率设置、金库监控。
 *
 * 展示企业配置（税率 / 审计员 / 税务金库余额）与开流表单，并列出本企业
 * 已创建的所有薪酬流。
 */

import { useCallback, useEffect, useState } from 'react'
import { PublicKey, type Connection } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'

import { useMintInfo } from '@/hooks/useMintInfo.ts'
import { usePayrollStreams, type PayrollStreamRecord } from '@/hooks/usePayrollStreams.ts'
import { useSolanaPayroll } from '@/hooks/useSolanaPayroll.ts'
import {
  BPS_BASE,
  deriveCompanyConfig,
  formatRateBps,
  nextStreamId,
  parseTokenAmount,
  payrollAccounts,
  toDateTimeLocal,
} from '@/lib/solana/payroll.ts'

import { AnimatedAmount } from './AnimatedAmount.tsx'
import { StreamCard } from './StreamCard.tsx'

interface CompanyConfigView {
  authority: string
  mint: PublicKey
  taxVault: PublicKey
  auditor: string
  withholdingRate: number
  totalStreams: number
}

type CompanyState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; config: CompanyConfigView }
  | { kind: 'error'; message: string }

export function EmployerDashboard() {
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const payroll = useSolanaPayroll()

  const [company, setCompany] = useState<CompanyState>({ kind: 'loading' })
  const [nonce, setNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!payroll.program || !publicKey) return
    let cancelled = false
    const pda = deriveCompanyConfig(publicKey)
    payrollAccounts(payroll.program)
      .companyConfig.fetch(pda)
      .then((a) => {
        if (cancelled) return
        setCompany({
          kind: 'ready',
          config: {
            authority: String(a.authority),
            mint: a.mint as PublicKey,
            taxVault: a.taxVault as PublicKey,
            auditor: String(a.auditor),
            withholdingRate: Number(a.withholdingRate),
            totalStreams: Number(a.totalStreams),
          },
        })
      })
      .catch(() => {
        if (!cancelled) setCompany({ kind: 'missing' })
      })
    return () => {
      cancelled = true
    }
  }, [payroll.program, publicKey, nonce])

  const companyPda = publicKey ? deriveCompanyConfig(publicKey) : undefined
  const { state: streamsState, refresh: refreshStreams } = usePayrollStreams({
    company: companyPda,
  })

  const mint = company.kind === 'ready' ? company.config.mint : null
  const { decimals } = useMintInfo(mint)

  const taxVault = company.kind === 'ready' ? company.config.taxVault : null
  const treasuryBalance = useTreasuryBalance(connection, taxVault)

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      setBusy(true)
      setNotice(null)
      try {
        const sig = await fn()
        setNotice(`${label} succeeded: ${sig.slice(0, 12)}…`)
        refresh()
        refreshStreams()
      } catch (err) {
        setNotice(`${label} failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setBusy(false)
      }
    },
    [refresh, refreshStreams],
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Employer · Streaming Payroll Console</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Set up the company tax vault, create time-linear streams, and watch unlocked balances in real time.
        </p>
      </header>

      {notice && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2 text-xs text-blue-700 dark:text-sky-400">
          {notice}
        </div>
      )}

      {company.kind === 'loading' && <p className="text-xs text-zinc-500">Loading company configuration…</p>}
      {company.kind === 'error' && (
        <p className="text-xs text-red-600 dark:text-red-400">Failed to load: {company.message}</p>
      )}

      {company.kind === 'missing' && (
        <InitCompanyForm
          busy={busy}
          onSubmit={(args) =>
            run('Initialize company', () =>
              payroll.initializeCompany({
                mint: args.mint,
                withholdingRate: args.rate,
                auditor: args.auditor,
              }),
            )
          }
        />
      )}

      {company.kind === 'ready' && (
        <CompanyPanel
          config={company.config}
          decimals={decimals}
          treasuryBalance={treasuryBalance}
          busy={busy}
          onUpdate={(rate, auditor) =>
            run('Update company', () => payroll.updateCompany({ withholdingRate: rate, auditor }))
          }
        />
      )}

      {company.kind === 'ready' && (
        <CreateStreamForm
          decimals={decimals}
          defaultRate={company.config.withholdingRate}
          busy={busy}
          onSubmit={(args) =>
            run('Create stream', () =>
              payroll.createStream({
                streamId: nextStreamId(),
                recipient: args.recipient,
                totalAmount: args.totalAmount,
                startTime: args.startTime,
                endTime: args.endTime,
                withholdingRate: args.rate,
                mint: company.config.mint,
              }),
            )
          }
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Created payroll streams</h2>
        {streamsState.kind === 'loading' && <p className="text-xs text-zinc-500">Loading…</p>}
        {streamsState.kind === 'error' && (
          <p className="text-xs text-red-600 dark:text-red-400">{streamsState.message}</p>
        )}
        {streamsState.kind === 'ready' && streamsState.streams.length === 0 && (
          <p className="text-xs text-zinc-500">No payroll streams yet.</p>
        )}
        {streamsState.kind === 'ready' && (
          <div className="space-y-3">
            {streamsState.streams.map((stream) => (
              <StreamCard
                key={stream.publicKey.toBase58()}
                stream={stream}
                decimals={decimals}
                role="employer"
                busy={busy}
                connectedAddress={publicKey?.toBase58()}
                onCancel={(s: PayrollStreamRecord) =>
                  run('Terminate stream', () =>
                    payroll.cancelStream({
                      streamId: s.streamId,
                      company: s.company,
                      employer: s.employer,
                      recipient: s.recipient,
                      mint: s.mint,
                    }),
                  )
                }
                onClose={(s: PayrollStreamRecord) =>
                  run('Close stream account', () =>
                    payroll.closeStream({
                      streamId: s.streamId,
                      company: s.company,
                      employer: s.employer,
                      recipient: s.recipient,
                      mint: s.mint,
                    }),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 子组件                                                              */
/* ------------------------------------------------------------------ */

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

function InitCompanyForm({
  busy,
  onSubmit,
}: {
  busy: boolean
  onSubmit: (args: { mint: PublicKey; rate: number; auditor?: PublicKey }) => void
}) {
  // 本地 dev 环境可用 VITE_PAYROLL_MINT 预填测试 mint，省去手动粘贴。
  const [mint, setMint] = useState(
    (import.meta.env.VITE_PAYROLL_MINT as string | undefined) ?? '',
  )
  const [rate, setRate] = useState('1500')
  const [auditor, setAuditor] = useState('')

  const submit = () => {
    try {
      onSubmit({
        mint: new PublicKey(mint.trim()),
        rate: Number(rate),
        auditor: auditor.trim() ? new PublicKey(auditor.trim()) : undefined,
      })
    } catch {
      // 无效地址由 UI 输入校验兜底；此处静默
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h2 className="text-sm font-semibold">Initialize company (first time)</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Bind the payroll token mint and create the tax vault PDA.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Payroll token mint</span>
          <input className={inputCls} value={mint} onChange={(e) => setMint(e.target.value)} placeholder="Token mint…" />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Withholding rate (bps, 1500 = 15%)</span>
          <input className={inputCls} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Auditor (optional)</span>
          <input className={inputCls} value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="Pubkey…" />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !mint.trim()}
        onClick={submit}
        className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        Initialize company
      </button>
    </div>
  )
}

function CompanyPanel({
  config,
  decimals,
  treasuryBalance,
  busy,
  onUpdate,
}: {
  config: CompanyConfigView
  decimals: number
  treasuryBalance: bigint
  busy: boolean
  onUpdate: (rate: number, auditor?: PublicKey) => void
}) {
  const [rate, setRate] = useState(String(config.withholdingRate))
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Company configuration</h2>
          <dl className="mt-2 space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <div>mint: <span className="font-mono">{config.mint.toBase58().slice(0, 10)}…</span></div>
            <div>Tax vault: <span className="font-mono">{config.taxVault.toBase58().slice(0, 10)}…</span></div>
            <div>Streams created: {config.totalStreams}</div>
            <div>Current rate: {formatRateBps(config.withholdingRate)}</div>
          </dl>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Tax vault balance</p>
          <p className="text-2xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
            <AnimatedAmount raw={treasuryBalance} decimals={decimals} maxFractionDigits={4} className="mr-0.5" />
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Update rate (bps)</span>
          <input className={inputCls} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => onUpdate(Number(rate), undefined)}
          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Save rate
        </button>
      </div>
    </div>
  )
}

function CreateStreamForm({
  decimals,
  defaultRate,
  busy,
  onSubmit,
}: {
  decimals: number
  defaultRate: number
  busy: boolean
  onSubmit: (args: {
    recipient: PublicKey
    totalAmount: bigint
    startTime: number
    endTime: number
    rate: number
  }) => void
}) {
  const now = Math.floor(Date.now() / 1000)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [start, setStart] = useState(toDateTimeLocal(now))
  const [end, setEnd] = useState(toDateTimeLocal(now + 30 * 24 * 3600))
  const [rate, setRate] = useState(String(defaultRate))

  const submit = () => {
    try {
      const rateNum = Math.min(BPS_BASE, Math.max(0, Number(rate) || 0))
      onSubmit({
        recipient: new PublicKey(recipient.trim()),
        totalAmount: parseTokenAmount(amount, decimals),
        startTime: Math.floor(new Date(start).getTime() / 1000),
        endTime: Math.floor(new Date(end).getTime() / 1000),
        rate: rateNum,
      })
    } catch {
      // 无效输入由下方 disabled 兜底
    }
  }

  const valid = recipient.trim() && amount.trim() && start && end

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h2 className="text-sm font-semibold">Create a new stream</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Principal is deposited into the stream PDA vault immediately; the employee unlocks it linearly over time.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Employee wallet address</span>
          <input className={inputCls} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient pubkey…" />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Total amount (tokens)</span>
          <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" inputMode="decimal" />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Start time</span>
          <input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">End time</span>
          <input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">Withholding rate (bps)</span>
          <input className={inputCls} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !valid}
        onClick={submit}
        className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        Create stream &amp; fund
      </button>
    </div>
  )
}

function useTreasuryBalance(
  connection: Connection,
  taxVault: PublicKey | null,
): bigint {
  const [balance, setBalance] = useState(0n)
  useEffect(() => {
    if (!taxVault) {
      setBalance(0n)
      return
    }
    let cancelled = false
    const load = () => {
      connection
        .getTokenAccountBalance(taxVault)
        .then((res) => {
          if (!cancelled) setBalance(BigInt(res.value.amount))
        })
        .catch(() => {
          if (!cancelled) setBalance(0n)
        })
    }
    load()
    const id = window.setInterval(load, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [connection, taxVault])
  return balance
}
