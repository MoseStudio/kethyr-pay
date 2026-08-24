import { createContext, useContext } from 'react'
import { KethyrPay, type WalletAdapter } from '@kethyrpay/sdk'

export interface AleoWallet {
  /** Whether the wallet adapter has finished loading on the client */
  loaded: boolean
  connected: boolean
  connecting: boolean
  publicKey: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signTransaction: (transaction: unknown) => Promise<unknown>
  requestRecords: (program: string, includePlaintext?: boolean) => Promise<unknown[]>
  /**
   * 导出当前账户的 View Key（商家后台解密收款记录 / 账期导出用，ALEO-MVP-015/016）。
   * 钱包未实现导出时返回 null（调用方需引导用户手动填写）。
   */
  exportViewKey: () => Promise<string | null>
  /**
   * 请求指定程序的交易历史（链上 PaymentRecord 扫描入口，ALEO-MVP-015）。
   * 钱包未实现时返回空数组。
   */
  requestTransactionHistory: (program: string) => Promise<unknown>
  /**
   * 查询交易的链上状态（Shield 的 executeTransaction 返回 job ID，
   * 用 transactionStatus(jobId) 拿到链上交易 ID 与确认状态）。
   */
  transactionStatus: (transactionId: string) => Promise<{
    status: string
    transactionId?: string
    error?: string
  }>
  /**
   * 解密一条记录密文（View Key 解密路径，ALEO-MVP-015/016）。
   * 钱包未实现时返回 null（调用方可用 exportViewKey + WASM 解密兜底）。
   */
  decryptRecord: (ciphertext: string) => Promise<string | null>
}

const defaultWallet: AleoWallet = {
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
}

const AleoWalletContext = createContext<AleoWallet>(defaultWallet)

export function useAleoWallet(): AleoWallet {
  return useContext(AleoWalletContext)
}

/** Adapt the Demo wallet bridge to the SDK's high-level payment client. */
export async function createDemoKethyrPay(wallet: AleoWallet): Promise<KethyrPay> {
  const adapter: WalletAdapter = {
    name: 'Demo Wallet',
    get connected() {
      return wallet.connected
    },
    get publicKey() {
      return wallet.publicKey
    },
    connect: wallet.connect,
    disconnect: wallet.disconnect,
    signTransaction: async (transaction) => {
      const jobId = await wallet.signTransaction(transaction)
      if (!jobId) throw new Error('Wallet did not return a transaction ID')
      if (!String(jobId).startsWith('shield_')) return String(jobId)

      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        const result = await wallet.transactionStatus(String(jobId))
        if (result.transactionId?.startsWith('at1')) return result.transactionId
        if (result.status === 'failed' || result.status === 'rejected' || result.error) {
          throw new Error(result.error ?? `Wallet transaction ${result.status}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      throw new Error('Timed out waiting for the wallet transaction')
    },
    requestRecords: wallet.requestRecords,
  }

  return KethyrPay.create({
    wallet: () => adapter,
    skipWasmInit: true,
  })
}

export const AleoWalletProvider = AleoWalletContext.Provider
