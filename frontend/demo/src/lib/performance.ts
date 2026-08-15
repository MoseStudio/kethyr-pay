/**
 * Performance tracking utility for KethyrPay POC.
 *
 * Measures proof generation, transaction broadcast, and confirmation timings
 * across different devices and browsers.
 */

export interface PhaseTiming {
  name: string
  start: number
  end?: number
  duration?: number
}

export interface DeviceInfo {
  userAgent: string
  platform: string
  hardwareConcurrency?: number
  deviceMemory?: number
}

export interface PerformanceReport {
  sessionId: string
  device: DeviceInfo
  phases: PhaseTiming[]
  totalDuration?: number
  memoryPeakMB?: number
  timestamp: string
}

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getDeviceInfo(): DeviceInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  return {
    userAgent: nav?.userAgent ?? 'unknown',
    platform: nav?.platform ?? 'unknown',
    hardwareConcurrency: nav?.hardwareConcurrency,
    deviceMemory: (nav as Navigator & { deviceMemory?: number })?.deviceMemory,
  }
}

export class PerformanceTracker {
  private phases: Map<string, PhaseTiming> = new Map()
  private sessionId: string
  private device: DeviceInfo
  private memoryPeakMB: number = 0

  constructor() {
    this.sessionId = generateSessionId()
    this.device = getDeviceInfo()
  }

  /**
   * Start timing a named phase.
   */
  start(phaseName: string): void {
    this.phases.set(phaseName, {
      name: phaseName,
      start: performance.now(),
    })
  }

  /**
   * End timing a named phase.
   */
  end(phaseName: string): PhaseTiming | undefined {
    const phase = this.phases.get(phaseName)
    if (!phase) {
      console.warn(`[PerformanceTracker] Phase "${phaseName}" was not started`)
      return undefined
    }

    phase.end = performance.now()
    phase.duration = phase.end - phase.start
    this.phases.set(phaseName, phase)
    return phase
  }

  /**
   * Record the peak memory usage observed by the consuming code.
   * Browser memory APIs are not standardized, so this is provided manually.
   */
  recordMemoryPeakMB(mb: number): void {
    this.memoryPeakMB = Math.max(this.memoryPeakMB, mb)
  }

  /**
   * Get the current timing for a specific phase.
   */
  getPhase(phaseName: string): PhaseTiming | undefined {
    return this.phases.get(phaseName)
  }

  /**
   * Export all collected data as a performance report.
   */
  exportReport(): PerformanceReport {
    const completedPhases = Array.from(this.phases.values())
    const totalDuration = completedPhases.reduce(
      (sum, phase) => sum + (phase.duration ?? 0),
      0,
    )

    return {
      sessionId: this.sessionId,
      device: this.device,
      phases: completedPhases,
      totalDuration: totalDuration > 0 ? totalDuration : undefined,
      memoryPeakMB: this.memoryPeakMB > 0 ? this.memoryPeakMB : undefined,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Export the report as a JSON string.
   */
  toJSON(): string {
    return JSON.stringify(this.exportReport(), null, 2)
  }

  /**
   * Download the report as a JSON file in the browser.
   */
  download(filename = `kethyrpay-perf-${this.sessionId}.json`): void {
    if (typeof document === 'undefined') {
      console.warn('[PerformanceTracker] download() is only available in the browser')
      return
    }

    const blob = new Blob([this.toJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

/**
 * Convenience singleton for global tracking.
 */
export const perf = new PerformanceTracker()
