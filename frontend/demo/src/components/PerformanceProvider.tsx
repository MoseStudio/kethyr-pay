import { useCallback, useMemo, useState } from 'react'

import {
  PerformanceContext,
  type PerformanceProviderProps,
} from '@/hooks/usePerformance.ts'
import { perf } from '@/lib/performance.ts'

export function PerformanceProvider({
  tracker = perf,
  children,
}: PerformanceProviderProps) {
  const [version, setVersion] = useState(0)

  const bumpVersion = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  const value = useMemo(
    () => ({ tracker, version, bumpVersion }),
    [tracker, version, bumpVersion],
  )

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  )
}
