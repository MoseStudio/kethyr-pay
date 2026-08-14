import { useAleoWallet } from '@/hooks/useAleoWallet.ts'

export function WalletStatus() {
  const { loaded, connected, connecting, publicKey, disconnect } = useAleoWallet()

  return (
    <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-2 shadow-sm">
      {!loaded ? (
        <span className="text-sm text-gray-600">Loading wallet adapter...</span>
      ) : connected && publicKey ? (
        <>
          <span className="font-mono text-sm text-gray-700">
            {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
          </span>
          <button
            type="button"
            onClick={disconnect}
            className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
          >
            Disconnect
          </button>
        </>
      ) : connecting ? (
        <span className="text-sm text-gray-600">Connecting wallet...</span>
      ) : (
        <span className="text-sm text-gray-600">No wallet connected</span>
      )}
    </div>
  )
}
