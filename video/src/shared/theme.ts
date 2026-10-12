export const theme = {
  bg: '#0a0e17',
  bgTop: '#0d1424',
  bgBottom: '#070a11',
  card: 'rgba(255,255,255,0.045)',
  border: 'rgba(255,255,255,0.10)',
  text: '#f4f4f5',
  muted: '#a1a1aa',
  faint: '#71717a',
  accent: '#3b82f6',
  accentSoft: '#93c5fd',
  good: '#34d399',
  warn: '#fbbf24',
  font:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const

/** 时间轴（秒 → 帧，30fps）。改文案不用动这里，改 scenes.tsx 即可。 */
export const FPS = 30
export const secs = (s: number) => Math.round(s * FPS)

export const TIMELINE = {
  intro: secs(0),
  problem: secs(10),
  product: secs(32),
  whyUs: secs(66),
  roadmap: secs(92),
  close: secs(104),
  total: secs(110),
} as const
