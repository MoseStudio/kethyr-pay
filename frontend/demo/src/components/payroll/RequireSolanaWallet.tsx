/**
 * RequireSolanaWallet — Solana 薪酬页的钱包门禁。
 *
 * 关键约束：`useWallet()` 只能在 `SolanaProvider` 就绪后调用，否则在
 * SSR / 适配器加载前会抛错。因此把 `useWallet()` 下沉到 `Connected` 子组件，
 * 只有 `useSolanaReady() === true` 时才渲染它。
 */

import type { ReactNode } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

import { useSolanaReady } from '@/contexts/SolanaProvider.tsx'

import { SolanaWalletButton } from './SolanaWalletButton.tsx'

function CenteredCard({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200/70 bg-zinc-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
        {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
        <div className="mt-4">
          <SolanaWalletButton />
        </div>
      </div>
    </div>
  )
}

function Connected({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet()
  if (!publicKey) {
    return (
      <CenteredCard
        title="Connect a Solana wallet to continue"
        hint="Kethyr Flow uses a Solana wallet (Phantom)"
      />
    )
  }
  return <>{children}</>
}

export function RequireSolanaWallet({ children }: { children: ReactNode }) {
  const ready = useSolanaReady()
  if (!ready) {
    return <CenteredCard title="Loading Solana wallet…" hint="Initializing the wallet adapter on first load" />
  }
  return <Connected>{children}</Connected>
}

/** 供非门禁场景（如侧栏）安全读取连接态。 */
export function useSolanaWalletSafe(): { ready: boolean } {
  return { ready: useSolanaReady() }
}
