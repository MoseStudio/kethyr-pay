import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'

import { PerformanceTracker, perf } from '@/lib/performance.ts'

export interface UsePerformanceResult {
  tracker: PerformanceTracker
  startPhase: (name: string) => void
  endPhase: (name: string) => void
  downloadReport: () => void
}

export interface PerformanceContextValue {
  tracker: PerformanceTracker
  version: number
  bumpVersion: () => void
}

export const PerformanceContext =
  createContext<PerformanceContextValue | null>(null)

export interface PerformanceProviderProps {
  tracker?: PerformanceTracker
  children: ReactNode
}

export function usePerformance(
  tracker?: PerformanceTracker,
): UsePerformanceResult {
  const context = useContext(PerformanceContext)
  const activeTracker = tracker ?? context?.tracker ?? perf

  const [, localBump] = useReducer((v: number) => v + 1, 0)

  const bumpVersion = useCallback(() => {
    if (context && !tracker) {
      context.bumpVersion()
    } else {
      localBump()
    }
  }, [context, tracker])

  const startPhase = useCallback(
    (name: string) => {
      activeTracker.start(name)
      bumpVersion()
    },
    [activeTracker, bumpVersion],
  )

  const endPhase = useCallback(
    (name: string) => {
      activeTracker.end(name)
      bumpVersion()
    },
    [activeTracker, bumpVersion],
  )

  const downloadReport = useCallback(() => {
    activeTracker.download()
  }, [activeTracker])

  return useMemo(
    () => ({ tracker: activeTracker, startPhase, endPhase, downloadReport }),
    [activeTracker, startPhase, endPhase, downloadReport],
  )
}
