import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'

import type { WalletContextState } from '@provablehq/aleo-wallet-adaptor-react'
import { Network } from '@provablehq/aleo-types'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'

import {
  AleoWalletProvider as OurWalletProvider,
  type AleoWallet,
} from '@/contexts/AleoWalletContext.tsx'

const WALLET_PROGRAMS = ['pay_private_v3.aleo', 'credits.aleo']
const WALLET_SESSION_KEY = 'kethyr-wallet-connected'
const WALLET_SELECTION_KEY = 'kethyr-wallet-selection'

function walletDebug(event: string, details?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    // Keep this at log level: browser consoles commonly hide debug messages,
    // which makes wallet lifecycle issues look like unexplained disconnects.
    console.log(`[KethyrPay wallet] ${event}`, details ?? '')
  }
}

// Placeholder rendered during SSR and before the adapter loads on the client.
function FallbackProvider({ children }: { children: ReactNode }) {
  return (
    <OurWalletProvider
      value={{
        loaded: false,
        connected: false,
        connecting: false,
        publicKey: null,
        connect: async () => {},
        disconnect: async () => {},
        signTransaction: async () => {
          throw new Error('Wallet adapter is not loaded yet')
        },
        requestRecords: async () => {
          throw new Error('Wallet adapter is not loaded yet')
        },
        exportViewKey: async () => null,
        requestTransactionHistory: async () => [],
        transactionStatus: async () => ({ status: 'unknown' }),
        decryptRecord: async () => null,
      }}
    >
      {children}
    </OurWalletProvider>
  )
}

// Reads the real adapter state and exposes it through our own context.
function AdapterBridge({
  children,
  useWallet,
}: {
  children: ReactNode
  useWallet: () => WalletContextState
}) {
  const wallet = useWallet()
  const reconnectStarted = useRef(false)

  useEffect(() => {
    walletDebug('provider state', {
      readyState: wallet.wallet?.readyState ?? null,
      selectedWallet: wallet.wallet?.adapter.name ?? null,
      connected: wallet.connected,
      connecting: wallet.connecting,
      address: wallet.address ? `${wallet.address.slice(0, 10)}…` : null,
    })
  }, [wallet.wallet, wallet.connected, wallet.connecting, wallet.address])

  useEffect(() => {
    if (typeof window !== 'undefined' && wallet.connected) {
      window.localStorage.setItem(WALLET_SESSION_KEY, 'true')
      walletDebug('connection persisted', {
        wallet: wallet.wallet?.adapter.name ?? null,
        address: wallet.address ? `${wallet.address.slice(0, 10)}…` : null,
      })
    }
  }, [wallet.connected, wallet.wallet, wallet.address])

  useEffect(() => {
    const persisted =
      typeof window !== 'undefined' &&
      window.localStorage.getItem(WALLET_SESSION_KEY) === 'true'
    walletDebug('restore check', {
      persisted,
      connected: wallet.connected,
      connecting: wallet.connecting,
      selectedWallet: wallet.wallet?.adapter.name ?? null,
      readyState: wallet.wallet?.readyState ?? null,
    })
    if (
      typeof window === 'undefined' ||
      wallet.connected ||
      wallet.connecting ||
      reconnectStarted.current ||
      !persisted
    ) {
      return
    }

    reconnectStarted.current = true
    if (!wallet.wallet) {
      walletDebug('restore selecting wallet', { wallet: 'Shield Wallet' })
      wallet.selectWallet('Shield Wallet' as Parameters<typeof wallet.selectWallet>[0])
      // `selectWallet` updates provider state asynchronously. Wait for the
      // selected wallet to be reflected before calling connect.
      reconnectStarted.current = false
      return
    }
    walletDebug('restore connecting', { wallet: wallet.wallet.adapter.name })
    void wallet.connect(Network.TESTNET).catch(() => {
      walletDebug('restore failed', { wallet: wallet.wallet?.adapter.name ?? null })
      // The wallet may be locked or unavailable. Keep the marker so a later
      // navigation can retry without forcing a new authorization flow.
    })
  }, [wallet.connected, wallet.connecting, wallet.wallet])

  const aleoWallet: AleoWallet = {
    loaded: true,
    connected: wallet.connected,
    connecting: wallet.connecting,
    publicKey: wallet.address,
    connect: async () => {
      walletDebug('connect requested', {
        selectedWallet: wallet.wallet?.adapter.name ?? null,
        network: Network.TESTNET,
      })
      // The Provable adapter requires a wallet to be explicitly selected before
      // calling connect. Default to Shield Wallet (the only adapter configured
      // for this POC) if the user has not selected one yet.
      if (!wallet.wallet) {
        wallet.selectWallet('Shield Wallet' as Parameters<typeof wallet.selectWallet>[0])
      }
      await wallet.connect(Network.TESTNET)
      window.localStorage.setItem(WALLET_SESSION_KEY, 'true')
      walletDebug('connect succeeded', {
        wallet: wallet.wallet?.adapter.name ?? null,
        address: wallet.address ? `${wallet.address.slice(0, 10)}…` : null,
      })
    },
    disconnect: async () => {
      walletDebug('disconnect requested', {
        wallet: wallet.wallet?.adapter.name ?? null,
        address: wallet.address ? `${wallet.address.slice(0, 10)}…` : null,
      })
      await wallet.disconnect()
      window.localStorage.removeItem(WALLET_SESSION_KEY)
      walletDebug('disconnect completed')
    },
    signTransaction: async (transaction: unknown) => {
      const result = await wallet.executeTransaction(transaction as Parameters<typeof wallet.executeTransaction>[0])
      return result?.transactionId ?? null
    },
    requestRecords: async (program, includePlaintext) => {
      return wallet.requestRecords(program, includePlaintext)
    },
    // View Key 导出：钱包适配器（Shield 等）不暴露 viewKey 字符串，
    // 返回 null 引导商家手动填写 View Key（ALEO-MVP-016 手动导出路径）。
    exportViewKey: async () => null,
    requestTransactionHistory: async (program) => {
      return wallet.requestTransactionHistory(program)
    },
    transactionStatus: async (transactionId) => {
      return wallet.transactionStatus(transactionId)
    },
    // 记录密文解密：钱包 decrypt(ciphertext) 在授权后返回明文 JSON
    decryptRecord: async (ciphertext) => {
      try {
        return await wallet.decrypt(ciphertext)
      } catch {
        return null
      }
    },
  }

  return <OurWalletProvider value={aleoWallet}>{children}</OurWalletProvider>
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const [adapter, setAdapter] = useState<{
    AleoWalletProvider: ComponentType<{
      wallets: any[]
      network?: Network
      autoConnect?: boolean
      localStorageKey?: string
      decryptPermission?: DecryptPermission
      // 声明需要同步记录的程序（Shield 钱包只自动同步 connect 时列出的程序）
      programs?: string[]
      children: ReactNode
    }>
    WalletModalProvider: ComponentType<{ children: ReactNode }>
    useWallet: () => WalletContextState
    wallets: any[]
  } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    let cancelled = false

    Promise.all([
      import('@provablehq/aleo-wallet-adaptor-react'),
      import('@provablehq/aleo-wallet-adaptor-react-ui'),
      import('@provablehq/aleo-wallet-adaptor-shield'),
    ]).then(([{ AleoWalletProvider, useWallet }, { WalletModalProvider }, { ShieldWalletAdapter }]) => {
      if (cancelled) return
      // Create the wallet adapter instances once during load so they stay
      // stable across renders and navigation. Recreating them causes the
      // Provable provider to disconnect/reconnect on every route change.
      setAdapter({
        AleoWalletProvider,
        WalletModalProvider,
        useWallet,
        wallets: [new ShieldWalletAdapter()],
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  // Render a fallback during SSR and the first client paint to avoid hydration mismatches.
  if (!mounted || !adapter) {
    return <FallbackProvider>{children}</FallbackProvider>
  }

  const { AleoWalletProvider, WalletModalProvider, useWallet } = adapter
  const wallets = adapter.wallets

  return (
    <AleoWalletProvider
      wallets={wallets}
      network={Network.TESTNET}
      // Let the adapter provider persist the selected adapter as well as our
      // separate "was connected" marker. Using the same key for both would
      // store "true" where the provider expects a wallet name.
      localStorageKey={WALLET_SELECTION_KEY}
      // Reconnection is handled below from the persisted session marker.
      // Running the provider's autoConnect at the same time races with
      // selectWallet/connect and can disconnect an otherwise valid session.
      autoConnect={false}
      decryptPermission={DecryptPermission.UponRequest}
      // 声明需要同步记录的程序：Shield 钱包只自动同步 connect 时列出的程序，
      // 缺省时 requestRecords('pay_private_v3.aleo') 会返回空数组，
      // 导致铸造发票后扫描不到 InvoiceRecord（ALEO-MVP-018 H5 联调）。
      // credits.aleo 用于 transfer_private 支付（v3 pay_invoice 内置 credits.aleo::transfer_private）。
      programs={WALLET_PROGRAMS}
    >
      <WalletModalProvider>
        <AdapterBridge useWallet={useWallet}>{children}</AdapterBridge>
      </WalletModalProvider>
    </AleoWalletProvider>
  )
}
