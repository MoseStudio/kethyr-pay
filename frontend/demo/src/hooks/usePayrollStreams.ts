/**
 * usePayrollStreams — 拉取并订阅链上 PayrollStream 账户。
 *
 * 沿用房屋数据获取风格：useEffect + 判别联合 state + cancelled 标志；
 * 额外通过 `onProgramAccountChange` 订阅程序账户变更，任何开流 / claim /
 * cancel 都会自动刷新列表。
 */

import { useCallback, useEffect, useState } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { useConnection } from '@solana/wallet-adapter-react'

import { PAYROLL_PROGRAM_ID, payrollAccounts } from '@/lib/solana/payroll.ts'

import { useSolanaPayroll } from './useSolanaPayroll.ts'

export interface PayrollStreamRecord {
  publicKey: PublicKey
  streamId: bigint
  company: PublicKey
  employer: PublicKey
  recipient: PublicKey
  mint: PublicKey
  vault: PublicKey
  totalAmount: bigint
  withdrawnAmount: bigint
  startTime: number
  endTime: number
  withholdingRate: number
  cancelled: boolean
  createdAt: number
}

export type PayrollStreamsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; streams: PayrollStreamRecord[] }
  | { kind: 'error'; message: string }

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(Math.trunc(value))
  if (value === null || value === undefined) return 0n
  const candidate = value as { toString?: () => string }
  if (typeof candidate.toString === 'function') {
    try {
      return BigInt(candidate.toString())
    } catch {
      return 0n
    }
  }
  return 0n
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (value === null || value === undefined) return 0
  const candidate = value as { toString?: () => string }
  if (typeof candidate.toString === 'function') return Number(candidate.toString())
  return 0
}

export function usePayrollStreams(filter: {
  company?: PublicKey
  recipient?: PublicKey
}): { state: PayrollStreamsState; refresh: () => void } {
  const { program } = useSolanaPayroll()
  const { connection } = useConnection()
  const [state, setState] = useState<PayrollStreamsState>({ kind: 'idle' })
  const [nonce, setNonce] = useState(0)

  const companyKey = filter.company?.toBase58()
  const recipientKey = filter.recipient?.toBase58()

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!program) {
      setState({ kind: 'idle' })
      return
    }
    let cancelled = false

    const run = async () => {
      try {
        // 账户字段偏移（含 8 字节 discriminator）：company @8、recipient @72。
        // company 是可靠的主过滤维度；recipient 在客户端再过滤一次。
        const raw = await payrollAccounts(program).payrollStream.all(
          companyKey ? [{ memcmp: { offset: 8, bytes: companyKey } }] : [],
        )
        if (cancelled) return

        const streams: PayrollStreamRecord[] = raw
          .map((entry) => {
            const a = entry.account
            return {
              publicKey: entry.publicKey,
              streamId: toBigInt(a.streamId),
              company: a.company as PublicKey,
              employer: a.employer as PublicKey,
              recipient: a.recipient as PublicKey,
              mint: a.mint as PublicKey,
              vault: a.vault as PublicKey,
              totalAmount: toBigInt(a.totalAmount),
              withdrawnAmount: toBigInt(a.withdrawnAmount),
              startTime: toNumber(a.startTime),
              endTime: toNumber(a.endTime),
              withholdingRate: toNumber(a.withholdingRate),
              cancelled: Boolean(a.cancelled),
              createdAt: toNumber(a.createdAt),
            }
          })
          .filter((s) =>
            recipientKey ? s.recipient.toBase58() === recipientKey : true,
          )
          .sort((a, b) => b.createdAt - a.createdAt)

        setState({ kind: 'ready', streams })
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Failed to load payroll streams',
          })
        }
      }
    }

    setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }))
    void run()

    const subscriptionId = connection.onProgramAccountChange(
      PAYROLL_PROGRAM_ID,
      () => {
        void run()
      },
      'confirmed',
    )

    return () => {
      cancelled = true
      void connection.removeProgramAccountChangeListener(subscriptionId)
    }
  }, [program, connection, companyKey, recipientKey, nonce])

  return { state, refresh }
}
