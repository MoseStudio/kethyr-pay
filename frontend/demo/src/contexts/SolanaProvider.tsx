/**
 * SolanaProvider — 客户端专用的 Solana 钱包上下文（与 Aleo 的 WalletProviders 并存）。
 *
 * 设计动机（沿用 WalletProviders 的既有模式）：
 *  - Solana wallet adapter 及其 UI 依赖浏览器全局对象，且在 Cloudflare
 *    Workers SSR 阶段不可用 → 用 `useEffect` + 动态 `import()` 仅客户端加载。
 *  - SSR 与适配器就绪前，渲染一个「未就绪」上下文（`useSolanaReady()` 返回
 *    false），让依赖钱包的薪酬组件自行降级为占位符，避免 SSR 调用 `useWallet()` 抛错。
 *  - 与 Aleo 侧完全独立的 provider 树，互不共享 localStorage key。
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import type { Adapter } from '@solana/wallet-adapter-base'

const SolanaReadyContext = createContext(false)

/** 适配器是否已就绪（SSR / 加载中返回 false）。 */
export function useSolanaReady(): boolean {
  return useContext(SolanaReadyContext)
}

interface SolanaAdapterModule {
  ConnectionProvider: ComponentType<{ endpoint: string; children: ReactNode }>
  WalletProvider: ComponentType<{
    wallets: Adapter[]
    autoConnect?: boolean
    children: ReactNode
  }>
  WalletModalProvider: ComponentType<{ children: ReactNode }>
  PhantomWalletAdapter: new () => Adapter
}

const DEFAULT_ENDPOINT = 'https://api.devnet.solana.com'

export function SolanaProvider({ children }: { children: ReactNode }) {
  const [adapter, setAdapter] = useState<SolanaAdapterModule | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      import('@solana/wallet-adapter-react'),
      import('@solana/wallet-adapter-react-ui'),
      import('@solana/wallet-adapter-phantom'),
    ]).then(([react, ui, phantom]) => {
      if (cancelled) return
      setAdapter({
        ConnectionProvider: react.ConnectionProvider,
        WalletProvider: react.WalletProvider,
        WalletModalProvider: ui.WalletModalProvider,
        PhantomWalletAdapter: phantom.PhantomWalletAdapter,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const endpoint =
    (import.meta.env.VITE_SOLANA_RPC as string | undefined) ?? DEFAULT_ENDPOINT

  // 所有 hook 必须在 early return 之前调用（rules of hooks）：
  // 否则适配器加载前后 hook 数量不一致，触发 React #310。
  const wallets = useMemo<Adapter[]>(
    () => (adapter ? [new adapter.PhantomWalletAdapter()] : []),
    [adapter],
  )

  const ready = adapter !== null
  const inner = (
    <SolanaReadyContext.Provider value={ready}>
      {children}
    </SolanaReadyContext.Provider>
  )

  if (!adapter) return inner

  const { ConnectionProvider, WalletProvider, WalletModalProvider } = adapter

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{inner}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
