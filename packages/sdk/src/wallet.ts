/**
 * 框架无关的钱包适配器抽象。
 *
 * 架构灵感来自 POC 的 `WalletProviders` / `AleoWalletContext`（useAleoWallet），
 * 但 SDK 核心不依赖 React：这里只定义纯接口 + 工厂函数，React 集成由使用方
 * （如未来的 @aleopay/react）基于本抽象实现。
 *
 * 接口对齐 Provable wallet adaptor 的能力面：
 * connect / disconnect / signTransaction / requestRecords / publicKey / connected。
 */

import type { TransactionOptions } from '@provablehq/aleo-types'

/** 钱包适配器统一接口（框架无关） */
export interface WalletAdapter {
  /** 适配器名称（如 "Shield Wallet" / "Memory Wallet"） */
  readonly name: string
  /** 是否已连接 */
  readonly connected: boolean
  /** 当前连接的账户地址（未连接为 null） */
  readonly publicKey: string | null
  /** 连接钱包，成功后返回账户地址（aleo1...） */
  connect(): Promise<string>
  /** 断开连接 */
  disconnect(): Promise<void>
  /**
   * 签名并执行交易（基于 @provablehq/aleo-types 的 TransactionOptions）。
   * 返回交易 ID（transition id / tx id）。
   */
  signTransaction(transaction: TransactionOptions): Promise<string>
  /** 请求指定程序的记录（records） */
  requestRecords(program: string, includePlaintext?: boolean): Promise<unknown[]>
}

/* ------------------------------------------------------------------ */
/* Shield Wallet（client-only，动态加载）                               */
/* ------------------------------------------------------------------ */

/**
 * 创建 Shield Wallet 适配器。
 *
 * - **client-only**：@provablehq/aleo-wallet-adaptor-shield 依赖浏览器
 *   `window.shield` 注入，因此采用动态 import（参考 POC WalletProviders 的
 *   client-only 动态加载模式）。在 Node / SSR 环境调用会抛出明确错误。
 * - 连接时使用 TESTNET + `DecryptPermission.UponRequest`（与 POC 一致）。
 */
export async function createShieldAdapter(): Promise<WalletAdapter> {
  if (typeof window === 'undefined') {
    throw new Error(
      '[AleoPay] createShieldAdapter() 仅支持浏览器环境（client-only）：' +
        'Shield Wallet 适配器依赖 window.shield 注入，请在客户端调用。',
    )
  }

  const [{ ShieldWalletAdapter }, { DecryptPermission }, { Network }] = await Promise.all([
    import('@provablehq/aleo-wallet-adaptor-shield'),
    import('@provablehq/aleo-wallet-adaptor-core'),
    import('@provablehq/aleo-types'),
  ])

  const adapter = new ShieldWalletAdapter()

  return {
    name: 'Shield Wallet',
    get connected(): boolean {
      return adapter.connected
    },
    get publicKey(): string | null {
      return adapter.account?.address ?? null
    },
    connect: async (): Promise<string> => {
      const account = await adapter.connect(Network.TESTNET, DecryptPermission.UponRequest)
      return account.address
    },
    disconnect: (): Promise<void> => adapter.disconnect(),
    signTransaction: async (transaction: TransactionOptions): Promise<string> => {
      const result = await adapter.executeTransaction(transaction)
      return result.transactionId
    },
    requestRecords: (program: string, includePlaintext = true): Promise<unknown[]> =>
      adapter.requestRecords(program, includePlaintext),
  }
}

/* ------------------------------------------------------------------ */
/* 内存钱包（测试 / 本地开发用，可选）                                   */
/* ------------------------------------------------------------------ */

/**
 * 简单内存钱包：无需浏览器注入、无需 WASM，便于单测与商家侧本地开发。
 * 账户地址为确定性生成的占位地址；signTransaction 返回模拟交易 ID。
 */
export interface MemoryWalletOptions {
  /** 账户地址（默认生成一个合法的 aleo1... 占位地址） */
  address?: string
}

export function createMemoryWalletAdapter(
  options: MemoryWalletOptions = {},
): WalletAdapter {
  const address =
    options.address ??
    // 占位地址：合法前缀 + 58 位小写字母数字（仅用于测试 / 本地开发，不可上链）
    'aleo1' + 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123'
  let connected = false

  return {
    name: 'Memory Wallet',
    get connected(): boolean {
      return connected
    },
    get publicKey(): string | null {
      return connected ? address : null
    },
    connect: async (): Promise<string> => {
      connected = true
      return address
    },
    disconnect: async (): Promise<void> => {
      connected = false
    },
    signTransaction: async (transaction: TransactionOptions): Promise<string> => {
      if (!connected) {
        throw new Error('[AleoPay] Memory Wallet 未连接，请先调用 connect()')
      }
      // 模拟交易 ID：基于 program/function 的确定性哈希（仅占位，不可用于链上广播）
      const seed = `${transaction.program}:${transaction.function}:${(transaction.inputs ?? []).join(',')}`
      let hash = 0
      for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0
      }
      const txId = (hash >>> 0).toString(16).padStart(8, '0')
      return `at1${'0'.repeat(58)}${txId}`
    },
    requestRecords: async (): Promise<unknown[]> => {
      if (!connected) {
        throw new Error('[AleoPay] Memory Wallet 未连接，请先调用 connect()')
      }
      return []
    },
  }
}

/** 工厂函数集合（后续可扩展 Leo 等适配器） */
export const walletAdapters = {
  shield: createShieldAdapter,
  memory: createMemoryWalletAdapter,
} as const
