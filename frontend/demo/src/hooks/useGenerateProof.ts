import { useCallback, useState } from 'react'
import { createAccount, initAleoSDK } from '@/lib/aleo.ts'

export interface GenerateProofResult {
  proof: string
  address: string
  durationMs: number
}

export interface UseGenerateProofReturn {
  generateProof: () => Promise<GenerateProofResult | undefined>
  loading: boolean
  error: string | null
}

export function useGenerateProof(): UseGenerateProofReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateProof = useCallback(async (): Promise<GenerateProofResult | undefined> => {
    setLoading(true)
    setError(null)

    try {
      await initAleoSDK()

      const account = createAccount()

      const start = performance.now()
      const proof = `aleo-poc-dummy-proof-${Date.now()}-${account.address.slice(0, 16)}`
      const durationMs = performance.now() - start

      return { proof, address: account.address, durationMs }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown WASM/proof error'
      setError(message)
      return undefined
    } finally {
      setLoading(false)
    }
  }, [])

  return { generateProof, loading, error }
}
