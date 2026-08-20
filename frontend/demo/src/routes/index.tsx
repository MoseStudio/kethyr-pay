import { Link, createFileRoute } from '@tanstack/react-router'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'

/** demo 商家地址：pay_private_v3.aleo 部署者地址（v3 原子结算） */
const DEMO_MERCHANT = 'aleo1cdsz2pdt2wsejg4rqfx5hnkwc3nndsn2c5fafuycjtg440e2gcrqdv8z69'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { connected, connecting, publicKey, connect, disconnect } =
    useAleoWallet()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600 text-3xl font-bold text-white shadow-lg">
          A
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
          KethyrPay
        </h1>
        <p className="max-w-md text-lg text-gray-600">
          Privacy-first subscription payments on Aleo. Authorize recurring
          charges, pull scheduled payments, and cancel subscriptions with one
          click.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        {connected && publicKey ? (
          <div className="flex flex-col items-center gap-2">
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
              Connected
            </span>
            <span className="font-mono text-sm text-gray-500">
              {publicKey.slice(0, 10)}...{publicKey.slice(-10)}
            </span>
            <button
              type="button"
              onClick={() => disconnect()}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              Disconnect wallet
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={connecting}
            onClick={() => connect()}
            className="rounded-lg bg-gray-900 px-5 py-2.5 font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {connecting ? 'Connecting…' : 'Connect Aleo Wallet'}
          </button>
        )}
      </div>

      <nav className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          to="/authorize"
          className="rounded-xl bg-indigo-600 px-5 py-4 font-semibold text-white shadow transition hover:bg-indigo-700"
        >
          Authorize
        </Link>
        <Link
          to="/pay/$invoiceId"
          params={{ invoiceId: 'demo' }}
          search={{ amount: '1.5', merchant: DEMO_MERCHANT }}
          className="rounded-xl bg-emerald-600 px-5 py-4 font-semibold text-white shadow transition hover:bg-emerald-700"
        >
          Pay
        </Link>
        <Link
          to="/cancel"
          className="rounded-xl bg-rose-600 px-5 py-4 font-semibold text-white shadow transition hover:bg-rose-700"
        >
          Cancel
        </Link>
        <Link
          to="/merchant"
          className="rounded-xl bg-sky-600 px-5 py-4 font-semibold text-white shadow transition hover:bg-sky-700"
        >
          Merchant
        </Link>
      </nav>
    </main>
  )
}
