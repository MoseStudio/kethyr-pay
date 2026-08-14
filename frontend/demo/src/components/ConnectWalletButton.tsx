import { useEffect, useState, type ComponentType } from 'react'

export function ConnectWalletButton() {
  const [Button, setButton] = useState<ComponentType<{ className?: string; children: React.ReactNode }> | null>(null)

  useEffect(() => {
    import('@provablehq/aleo-wallet-adaptor-react-ui').then(({ WalletModalButton }) => {
      setButton(() => WalletModalButton)
    })
  }, [])

  if (!Button) {
    return (
      <button
        type="button"
        disabled
        className="rounded-lg bg-blue-400 px-4 py-2 text-white opacity-70 cursor-not-allowed"
      >
        Loading Wallet...
      </button>
    )
  }

  return (
    <Button className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
      Connect Wallet
    </Button>
  )
}
