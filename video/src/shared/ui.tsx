import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

import { theme } from './theme'

/** 入场：从下方 18px 淡入，`delay` 为相对本场景起点的帧数。 */
export const reveal = (frame: number, delay: number, duration = 16): CSSProperties => {
  const p = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return { opacity: p, transform: `translateY(${(1 - p) * 18}px)` }
}

/** 每个场景统一的淡入淡出包裹。 */
export const Scene: React.FC<{ durationInFrames: number; children: ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  return <AbsoluteFill style={{ opacity, padding: '0 120px' }}>{children}</AbsoluteFill>
}

/**
 * 深色渐变底。
 *
 * ⚠️ 刻意保持「便宜」：无 GPU 的环境下 Remotion 走软件光栅化，
 * 多层全屏径向渐变 + mask 会让每帧成本高到离谱（实测 1080p 跑不完）。
 * 所以这里只用两层渐变、不用 mask。
 */
export const Background: React.FC = () => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.bgTop} 0%, ${theme.bgBottom} 100%)` }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 520px at 82% -8%, rgba(59,130,246,0.22), transparent 62%)`,
      }}
    />
    <AbsoluteFill
      style={{
        background: `radial-gradient(760px 460px at 6% 106%, rgba(56,189,248,0.10), transparent 60%)`,
      }}
    />
  </AbsoluteFill>
)

export const Kicker: React.FC<{ children: ReactNode; style?: CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontFamily: theme.font,
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color: theme.accentSoft,
      ...style,
    }}
  >
    {children}
  </div>
)

export const Headline: React.FC<{ children: ReactNode; style?: CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontFamily: theme.font,
      fontSize: 74,
      lineHeight: 1.08,
      fontWeight: 700,
      letterSpacing: -1.5,
      color: theme.text,
      ...style,
    }}
  >
    {children}
  </div>
)

export const Body: React.FC<{ children: ReactNode; style?: CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontFamily: theme.font,
      fontSize: 30,
      lineHeight: 1.45,
      fontWeight: 400,
      color: theme.muted,
      ...style,
    }}
  >
    {children}
  </div>
)

export const Card: React.FC<{ children: ReactNode; style?: CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: theme.card,
      border: `1px solid ${theme.border}`,
      borderRadius: 22,
      padding: '28px 32px',
      ...style,
    }}
  >
    {children}
  </div>
)

/** 盾牌标（与 App 的 KethyrLogo 同一几何），用于片头/片尾。 */
export const ShieldMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2.5 4 5.5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10v-6L12 2.5Z"
      fill={theme.text}
    />
    <path
      d="M12 7.5c-1.4 0-2.5 1.1-2.5 2.5 0 1 .4 1.7 1 2.2v3.3a1.5 1.5 0 0 0 3 0v-3.3c.6-.5 1-1.2 1-2.2 0-1.4-1.1-2.5-2.5-2.5Z"
      fill={theme.bg}
    />
    <path
      d="M12 4.2 5.5 6.6v.4L12 4.8l6.5 2.2v-.4L12 4.2Z"
      fill={theme.accent}
      opacity="0.85"
    />
  </svg>
)
