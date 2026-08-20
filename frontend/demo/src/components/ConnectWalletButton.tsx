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
        className="mx-auto inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-[#121214] cursor-not-allowed opacity-70"
      >
        Loading Wallet...
      </button>
    )
  }

  const btnClass =
    'wallet-adapter-button wallet-adapter-button-trigger !rounded-xl !border-0 !bg-blue-600 !text-white hover:!bg-blue-500 [&:hover]:!bg-blue-500 hover:!text-white [&:not([disabled]):hover]:!bg-blue-500 mx-auto inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 text-base font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white'

  return (
    <>
      <style>{`.wallet-adapter-button.wallet-adapter-button-trigger{--wallet-adapter-primary:#2563eb;--wallet-adapter-primary-hover:#3b82f6}`}</style>
      <Button className={btnClass}>Connect Wallet</Button>
    </>
  )
}
