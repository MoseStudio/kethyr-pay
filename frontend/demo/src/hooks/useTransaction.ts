import { useCallback, useState } from 'react'
import { useAleoWallet } from '@/hooks/useAleoWallet.ts'
import { createTransactionOptions, PROGRAM_ID } from '@/lib/contract.ts'

export interface ExecuteTransactionOptions {
  program?: string
  functionName: string
  inputs: string[]
  fee?: number
  privateFee?: boolean
}

export interface UseTransactionReturn {
  execute: (options: ExecuteTransactionOptions) => Promise<string | undefined>
  loading: boolean
  error: string | null
  txId: string | null
}

export function useTransaction(): UseTransactionReturn {
  const { connected, publicKey, signTransaction } = useAleoWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)

  const execute = useCallback(
    async (options: ExecuteTransactionOptions): Promise<string | undefined> => {
      if (!connected || !publicKey) {
        throw new Error('Wallet not connected. Please connect your Leo Wallet.')
      }

      setLoading(true)
      setError(null)
      setTxId(null)

      try {
        const txOptions = createTransactionOptions(
          options.functionName,
          options.inputs,
          options.program ?? PROGRAM_ID,
          options.fee ?? 0,
          options.privateFee ?? true,
        )

        const result = await signTransaction(txOptions)
        const id = typeof result === 'string' ? result : null

        if (!id) {
          throw new Error('Transaction was submitted but no transaction ID was returned.')
        }

        setTxId(id)
        return id
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed.'
        setError(message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [connected, publicKey, signTransaction],
  )

  return { execute, loading, error, txId }
}
