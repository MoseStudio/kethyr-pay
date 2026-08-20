import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { RequireWallet } from '@/components/RequireWallet.tsx'
import { WalletStatus } from '@/components/WalletStatus.tsx'
import { usePerformance } from '@/hooks/usePerformance.ts'
import { useTransaction } from '@/hooks/useTransaction.ts'
import {
  MOCK_FALLBACK,
  USE_REAL_TRANSACTIONS,
  formatRecordInput,
  microcreditsToCredits,
  parseEscrowRecord,
} from '@/lib/contract.ts'
import type { EscrowRecordPlaintext } from '@/lib/contract.ts'

type Status = 'idle' | 'submitting' | 'success' | 'error'

interface CancelResult {
  txId: string
  refundAmount: string
  mock: boolean
}

export const Route = createFileRoute('/cancel')({
  component: Cancel,
})

function Cancel() {
  const { startPhase, endPhase } = usePerformance()
  const { execute } = useTransaction()
  const [escrowRef, setEscrowRef] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<CancelResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runMockCancel = async (): Promise<CancelResult> => {
    startPhase('cancel-prove')
    await new Promise((resolve) => setTimeout(resolve, 300))
    endPhase('cancel-prove')

    startPhase('cancel-broadcast')
    await new Promise((resolve) => setTimeout(resolve, 200))
    endPhase('cancel-broadcast')

    startPhase('cancel-confirm')
    await new Promise((resolve) => setTimeout(resolve, 150))
    endPhase('cancel-confirm')

    const mockRefund = Number((Math.random() * 100).toFixed(6))
    const mockHash =
      'au1cancel' +
      Math.random().toString(36).slice(2, 14) +
      Math.random().toString(36).slice(2, 14)

    return {
      txId: mockHash,
      refundAmount: mockRefund.toFixed(6),
      mock: true,
    }
  }

  const runRealCancel = async (escrow: EscrowRecordPlaintext): Promise<CancelResult> => {
    const recordInput = formatRecordInput(escrow)

    startPhase('cancel-prove')
    const txId = await execute({
      functionName: 'cancel_subscription',
      inputs: [recordInput],
    })
    endPhase('cancel-prove')

    startPhase('cancel-broadcast')
    endPhase('cancel-broadcast')

    startPhase('cancel-confirm')
    await new Promise((resolve) => setTimeout(resolve, 500))
    endPhase('cancel-confirm')

    if (!txId) {
      throw new Error('Cancellation did not return a transaction ID.')
    }

    const remaining = String(escrow.remaining_amount).replace(/u64$/, '')
    const remainingMicrocredits = Number(remaining)
    const refundCredits = Number.isNaN(remainingMicrocredits)
      ? '0.000000'
      : microcreditsToCredits(BigInt(Math.trunc(remainingMicrocredits)))

    return {
      txId,
      refundAmount: refundCredits,
      mock: false,
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('submitting')
    setError(null)
    setResult(null)

    try {
      if (!escrowRef.trim()) {
        throw new Error('Escrow record reference is required.')
      }

      const escrow = parseEscrowRecord(escrowRef)

      let cancelResult: CancelResult

      if (USE_REAL_TRANSACTIONS) {
        if (!escrow) {
          if (!MOCK_FALLBACK) {
            throw new Error(
              'Real cancellation requires the full EscrowRecord plaintext (JSON or record format). A serial number alone is not sufficient.',
            )
          }
          cancelResult = await runMockCancel()
          cancelResult.txId = `${cancelResult.txId} (mock fallback: real flow requires full EscrowRecord plaintext)`
        } else {
          try {
            cancelResult = await runRealCancel(escrow)
          } catch (err) {
            if (!MOCK_FALLBACK) throw err
            const message = err instanceof Error ? err.message : 'Real transaction failed.'
            cancelResult = await runMockCancel()
            cancelResult.txId = `${cancelResult.txId} (mock fallback after real failure: ${message})`
          }
        }
      } else {
        cancelResult = await runMockCancel()
      }

      setResult(cancelResult)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancellation failed.')
      setStatus('error')
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-4xl font-bold text-gray-900">
          Cancel Subscription
        </h1>
        <WalletStatus />
      </div>

      <RequireWallet>
        <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
          <p className="mb-6 text-gray-600">
            Cancel an active escrow and receive a refund of the remaining
            balance.
          </p>

          {!USE_REAL_TRANSACTIONS && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Mock mode: transactions are simulated. Set{' '}
              <code className="rounded bg-amber-100 px-1">VITE_USE_REAL_TRANSACTIONS=true</code>{' '}
              to use testnet.
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Escrow record
              <textarea
                value={escrowRef}
                onChange={(e) => setEscrowRef(e.target.value)}
                placeholder={`Paste the EscrowRecord plaintext or serial number.\n\nJSON example:\n{\n  "owner": "aleo1...",\n  "merchant": "aleo1...",\n  "total_amount": "100000000u64",\n  "remaining_amount": "50000000u64",\n  "interval": "30u32",\n  "created_at": "0u32",\n  "last_charged_at": "0u32",\n  "serial_number": "123field",\n  "_nonce": "123456789group"\n}`}
                rows={6}
                className="rounded-lg border border-gray-300 px-4 py-2.5 font-mono text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                required
              />
            </label>

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="mt-2 rounded-lg bg-rose-600 px-4 py-2.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {status === 'submitting' ? 'Cancelling…' : 'Cancel Subscription'}
            </button>
          </form>

          {status === 'success' && result && (
            <div className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">
              <p className="font-semibold">
                Subscription cancelled{result.mock ? ' (mock)' : ''}
              </p>
              <p className="mt-1">
                Refund amount:{' '}
                <span className="font-mono font-semibold">{result.refundAmount}</span>{' '}
                ALEO
              </p>
              <p className="mt-2 break-all font-mono text-sm">{result.txId}</p>
            </div>
          )}

          {status === 'error' && error && (
            <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}
        </div>
      </RequireWallet>

      <Link to="/" className="text-rose-600 hover:underline">
        Back to home
      </Link>
    </main>
  )
}
