/**
 * useMintInfo — 读取 SPL / Token-2022 mint 的 decimals。
 *
 * 金额在链上是 raw 最小单位，UI 展示需要 mint 的 decimals 做缩位。
 */

import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import type { PublicKey } from '@solana/web3.js'

export interface MintInfo {
  decimals: number
  loading: boolean
  error: string | null
}

interface ParsedMint {
  parsed?: { info?: { decimals?: number } }
}

export function useMintInfo(mint: PublicKey | null): MintInfo {
  const { connection } = useConnection()
  const [state, setState] = useState<MintInfo>({ decimals: 0, loading: true, error: null })

  useEffect(() => {
    if (!mint) {
      setState({ decimals: 0, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    connection
      .getParsedAccountInfo(mint)
      .then((res) => {
        if (cancelled) return
        const data = res.value?.data as ParsedMint | undefined
        const decimals = data?.parsed?.info?.decimals
        setState({
          decimals: typeof decimals === 'number' ? decimals : 0,
          loading: false,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          decimals: 0,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to read mint',
        })
      })

    return () => {
      cancelled = true
    }
  }, [connection, mint])

  return state
}
