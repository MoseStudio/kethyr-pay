/**
 * EmployeeView — 员工端内容：跳动余额水表 + 一键 Claim。
 *
 * 只负责「内容」；页面外壳（品牌头、画布、连接钱包引导）由 EmployeePortal 提供，
 * 以便员工页与收银台/发票页保持同一视觉语言，而不是后台管理的壳。
 *
 * 时间确定性结算意味着前端无需轮询：每条流由 useStreamingBalance 逐帧插值，
 * 到账金额实时跳动；Claim 时链上原子分流（net 归员工、tax 归企业金库）。
 */

import { useCallback, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

import { useMintInfo } from '@/hooks/useMintInfo.ts'
import { usePayrollStreams, type PayrollStreamRecord } from '@/hooks/usePayrollStreams.ts'
import { useSolanaPayroll } from '@/hooks/useSolanaPayroll.ts'

import { StreamCard } from './StreamCard.tsx'

export function EmployeeView() {
  const { publicKey } = useWallet()
  const payroll = useSolanaPayroll()
  const { state, refresh } = usePayrollStreams({ recipient: publicKey ?? undefined })

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const activeMint =
    state.kind === 'ready' && state.streams.length > 0 ? state.streams[0].mint : null
  const { decimals } = useMintInfo(activeMint)

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      setBusy(true)
      setNotice(null)
      try {
        const sig = await fn()
        setNotice(`${label} succeeded: ${sig.slice(0, 12)}…`)
        refresh()
      } catch (err) {
        setNotice(`${label} failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  return (
    <div className="space-y-5">
      {notice && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-xs text-blue-700 dark:text-sky-400">
          {notice}
        </div>
      )}

      {state.kind === 'loading' && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading your payroll streams…</p>
      )}
      {state.kind === 'error' && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.message}</p>
      )}

      {state.kind === 'ready' && state.streams.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No payroll streams yet</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            No payroll streams are assigned to wallet {publicKey?.toBase58().slice(0, 6)}…
          </p>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="space-y-3">
          {state.streams.map((stream) => (
            <StreamCard
              key={stream.publicKey.toBase58()}
              stream={stream}
              decimals={decimals}
              role="employee"
              busy={busy}
              connectedAddress={publicKey?.toBase58()}
              onClaim={(s: PayrollStreamRecord) =>
                run('Claim', () =>
                  payroll.claimStream({
                    streamId: s.streamId,
                    company: s.company,
                    employer: s.employer,
                    recipient: s.recipient,
                    mint: s.mint,
                  }),
                )
              }
              onCancel={(s: PayrollStreamRecord) =>
                run('Terminate & settle', () =>
                  payroll.cancelStream({
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
    </div>
  )
}
