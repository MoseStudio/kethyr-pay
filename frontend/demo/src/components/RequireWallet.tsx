import { ConnectWalletButton } from '@/components/ConnectWalletButton.tsx'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'

export function RequireWallet({ children }: { children: React.ReactNode }) {
  const { loaded, connected } = useAleoWallet()

  if (!loaded) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-900">Loading Wallet</h2>
        <p className="max-w-md text-gray-600">
          Please wait while the wallet adapter initializes.
        </p>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-900">Wallet Required</h2>
        <p className="max-w-md text-gray-600">
          Connect your Leo Wallet to continue with this flow.
        </p>
        <ConnectWalletButton />
      </div>
    )
  }

  return <>{children}</>
}
