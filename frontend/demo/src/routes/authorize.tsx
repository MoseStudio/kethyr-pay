import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { RequireWallet } from '@/components/RequireWallet.tsx'
import { WalletStatus } from '@/components/WalletStatus.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { usePerformance } from '@/hooks/usePerformance.ts'
import { useTransaction } from '@/hooks/useTransaction.ts'
import {
  MOCK_FALLBACK,
  USE_REAL_TRANSACTIONS,
  encodeAddress,
  encodeU32,
  encodeU64,
  isValidAleoAddress,
} from '@/lib/contract.ts'

type Status = 'idle' | 'submitting' | 'success' | 'error'

interface AuthorizeResult {
  txId: string
  serialNumber: string
  mock: boolean
}

export const Route = createFileRoute('/authorize')({
  component: Authorize,
})

function generateMockSerial(): string {
  return (
    'field' +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  )
}

function Authorize() {
  const { startPhase, endPhase } = usePerformance()
  const { execute } = useTransaction()
  const { publicKey } = useAleoWallet()
  const [merchant, setMerchant] = useState('')
  const [total, setTotal] = useState('')
  const [intervalDays, setIntervalDays] = useState('30')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<AuthorizeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runMockAuthorize = async (): Promise<AuthorizeResult> => {
    startPhase('authorize-prove')
    await new Promise((resolve) => setTimeout(resolve, 300))
    endPhase('authorize-prove')

    startPhase('authorize-broadcast')
    await new Promise((resolve) => setTimeout(resolve, 200))
    endPhase('authorize-broadcast')

    startPhase('authorize-confirm')
    await new Promise((resolve) => setTimeout(resolve, 150))
    endPhase('authorize-confirm')

    const mockHash =
      'au1authorize' +
      Math.random().toString(36).slice(2, 14) +
      Math.random().toString(36).slice(2, 14)

    return {
      txId: mockHash,
      serialNumber: generateMockSerial(),
      mock: true,
    }
  }

  const runRealAuthorize = async (): Promise<AuthorizeResult> => {
    const inputs = [
      encodeAddress(merchant),
      encodeU64(total),
      encodeU32(intervalDays),
    ]

    startPhase('authorize-prove')
    const txId = await execute({
      functionName: 'authorize_subscription',
      inputs,
    })
    endPhase('authorize-prove')

    startPhase('authorize-broadcast')
    endPhase('authorize-broadcast')

    startPhase('authorize-confirm')
    await new Promise((resolve) => setTimeout(resolve, 500))
    endPhase('authorize-confirm')

    if (!txId) {
      throw new Error('Authorization did not return a transaction ID.')
    }

    return {
      txId,
      serialNumber: generateMockSerial(),
      mock: false,
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('submitting')
    setError(null)
    setResult(null)

    try {
      if (!isValidAleoAddress(merchant)) {
        throw new Error('Invalid merchant address.')
      }
      if (Number(total) <= 0) {
        throw new Error('Total amount must be greater than zero.')
      }
      if (Number(intervalDays) <= 0) {
        throw new Error('Interval must be at least one day.')
      }

      let authResult: AuthorizeResult

      if (USE_REAL_TRANSACTIONS) {
        try {
          authResult = await runRealAuthorize()
        } catch (err) {
          if (!MOCK_FALLBACK) throw err
          const message = err instanceof Error ? err.message : 'Real transaction failed.'
          authResult = await runMockAuthorize()
          authResult.txId = `${authResult.txId} (mock fallback after real failure: ${message})`
        }
      } else {
        authResult = await runMockAuthorize()
      }

      setResult(authResult)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed.')
      setStatus('error')
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-4xl font-bold text-gray-900">
          Authorize Subscription
        </h1>
        <WalletStatus />
      </div>

      <RequireWallet>
        <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
          <p className="mb-6 text-gray-600">
            Allow a merchant to pull payments on a recurring schedule.
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
              <span className="flex items-center justify-between">
                Merchant address
                {publicKey && (
                  <button
                    type="button"
                    onClick={() => setMerchant(publicKey)}
                    className="rounded-md bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200"
                  >
                    Use my address
                  </button>
                )}
              </span>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="aleo1merchant..."
                className="rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Total authorized amount
              <input
                type="number"
                min="0"
                step="0.000001"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="100"
                className="rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Charge interval (days)
              <input
                type="number"
                min="1"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                placeholder="30"
                className="rounded-lg border border-gray-300 px-4 py-2.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                required
              />
            </label>

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="mt-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {status === 'submitting'
                ? 'Authorizing…'
                : 'Authorize Subscription'}
            </button>
          </form>

          {status === 'success' && result && (
            <div className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">
              <p className="font-semibold">
                Subscription authorized{result.mock ? ' (mock)' : ''}!
              </p>
              <p className="mt-2 text-sm">
                <span className="font-medium">Transaction ID:</span>
              </p>
              <p className="break-all font-mono text-sm">{result.txId}</p>
              <p className="mt-2 text-sm">
                <span className="font-medium">Escrow serial number:</span>
              </p>
              <p className="break-all font-mono text-sm">{result.serialNumber}</p>
              <div className="mt-4">
                <Link
                  to="/pay"
                  search={{ escrow: result.serialNumber }}
                  className="inline-block rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow transition hover:bg-emerald-700"
                >
                  Proceed to Pull Payment
                </Link>
              </div>
            </div>
          )}

          {status === 'error' && error && (
            <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}
        </div>
      </RequireWallet>

      <Link to="/" className="text-indigo-600 hover:underline">
        Back to home
      </Link>
    </main>
  )
}
