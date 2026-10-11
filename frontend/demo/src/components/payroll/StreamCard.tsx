/**
 * StreamCard — 单条薪酬流卡片：跳动余额、进度条、状态徽章与操作。
 *
 * 员工视角展示「秒级跳动水表」（useStreamingBalance 驱动），雇主视角展示
 * 已释放 / 总额与终止入口。
 */

import {
  formatRateBps,
  formatTimestamp,
  formatTokenAmount,
} from '@/lib/solana/payroll.ts'
import { useStreamingBalance } from '@/hooks/useStreamingBalance.ts'
import type { PayrollStreamRecord } from '@/hooks/usePayrollStreams.ts'

import { AnimatedAmount } from './AnimatedAmount.tsx'

export interface StreamCardProps {
  stream: PayrollStreamRecord
  decimals: number
  role: 'employer' | 'employee'
  busy?: boolean
  connectedAddress?: string
  onClaim?: (stream: PayrollStreamRecord) => void
  onCancel?: (stream: PayrollStreamRecord) => void
  onClose?: (stream: PayrollStreamRecord) => void
}

function shortKey(key: string, head = 6, tail = 6): string {
  return key.length <= head + tail + 2 ? key : `${key.slice(0, head)}…${key.slice(-tail)}`
}

export function StreamCard({
  stream,
  decimals,
  role,
  busy = false,
  connectedAddress,
  onClaim,
  onCancel,
  onClose,
}: StreamCardProps) {
  const now = Date.now() / 1000
  const finished = stream.cancelled || now >= stream.endTime

  const balance = useStreamingBalance({
    total: stream.totalAmount,
    withdrawn: stream.withdrawnAmount,
    startTime: stream.startTime,
    endTime: stream.endTime,
    decimals,
    enabled: !finished,
  })

  const isRecipient = connectedAddress === stream.recipient.toBase58()
  const isEmployer = connectedAddress === stream.employer.toBase58()
  const canClaim = role === 'employee' && isRecipient && balance.canClaim && !stream.cancelled
  const canCancel =
    !stream.cancelled &&
    (isEmployer || isRecipient) &&
    now < stream.endTime

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {role === 'employee' ? 'Recipient' : 'Employee'}
            </span>
            <span className="rounded-full bg-zinc-200/70 px-2 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {shortKey(stream.recipient.toBase58())}
            </span>
            <StatusBadge stream={stream} now={now} />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 md:text-3xl dark:text-zinc-50">
            {/* NumberFlow 的数字会向两侧「滑入」，留出一点外边距避免与相邻文本相撞 */}
            <AnimatedAmount
              raw={balance.displayUnlocked}
              decimals={decimals}
              maxFractionDigits={4}
              className="mx-0.5"
            />
            <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
              / {formatTokenAmount(stream.totalAmount, decimals)}
            </span>
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Unlocked · Withholding {formatRateBps(stream.withholdingRate)} · Stream ID {stream.streamId.toString()}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Claimable</p>
          <p className="text-lg font-semibold text-blue-600 tabular-nums dark:text-sky-400">
            <AnimatedAmount
              raw={balance.displayClaimable}
              decimals={decimals}
              maxFractionDigits={4}
              className="mr-0.5"
            />
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            ~{formatTokenAmount(balance.perSecond, decimals)}/s
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-blue-600 transition-[width] duration-200 dark:bg-sky-500"
          style={{ width: `${Math.round(balance.progress * 100)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
        <span>{formatTimestamp(stream.startTime)}</span>
        <span>{formatTimestamp(stream.endTime)}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {role === 'employee' && onClaim && (
          <button
            type="button"
            disabled={!canClaim || busy}
            onClick={() => onClaim(stream)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Processing…' : 'Claim'}
          </button>
        )}
        {canCancel && onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(stream)}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Terminate &amp; settle
          </button>
        )}
        {stream.cancelled && onClose && isEmployer && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose(stream)}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close account (reclaim rent)
          </button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ stream, now }: { stream: PayrollStreamRecord; now: number }) {
  const label = stream.cancelled
    ? 'Terminated'
    : now < stream.startTime
      ? 'Not started'
      : now >= stream.endTime
        ? 'Ended'
        : 'Streaming'
  const cls = stream.cancelled
    ? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
    : now >= stream.endTime
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  )
}
