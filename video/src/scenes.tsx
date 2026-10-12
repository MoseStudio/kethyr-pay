import type { CSSProperties } from 'react'
import { useCurrentFrame } from 'remotion'

import { theme } from './shared/theme'
import { Body, Card, Headline, Kicker, Scene, ShieldMark, reveal } from './shared/ui'

const PAGE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  height: '100%',
  gap: 30,
}

/* ------------------------------------------------------------------ */
/* 1. Intro                                                            */
/* ------------------------------------------------------------------ */

export const Intro: React.FC<{ durationInFrames: number; presenter?: string }> = ({
  durationInFrames,
  presenter,
}) => {
  const frame = useCurrentFrame()
  return (
    <Scene durationInFrames={durationInFrames}>
      <div style={PAGE}>
        <div style={{ ...reveal(frame, 2), display: 'flex', alignItems: 'center', gap: 22 }}>
          <ShieldMark size={76} />
          <div
            style={{
              fontFamily: theme.font,
              fontSize: 66,
              fontWeight: 700,
              letterSpacing: -1.5,
              color: theme.text,
            }}
          >
            KethyrPay
          </div>
        </div>
        <Headline style={{ ...reveal(frame, 18), fontSize: 58 }}>
          Streaming payroll &amp; treasury on Solana
        </Headline>
        <Body style={reveal(frame, 34)}>
          Fund a stream once. The balance unlocks by the second. Tax is withheld atomically.
        </Body>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center', ...reveal(frame, 52) }}>
          <Kicker style={{ color: theme.faint }}>Colosseum · Solana Track</Kicker>
          {presenter ? <Kicker style={{ color: theme.accentSoft }}>by {presenter}</Kicker> : null}
        </div>
      </div>
    </Scene>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Problem                                                          */
/* ------------------------------------------------------------------ */

const PROBLEMS = [
  {
    k: '01',
    t: 'Payroll is a monthly batch job',
    s: 'Money arrives after the work, not with it.',
  },
  {
    k: '02',
    t: 'Cross-border teams wait days',
    s: 'Settlement latency measured in days, not seconds.',
  },
  {
    k: '03',
    t: 'Withholding lives in a spreadsheet',
    s: 'Tax is computed apart from the payment it belongs to.',
  },
]

export const Problem: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame()
  return (
    <Scene durationInFrames={durationInFrames}>
      <div style={PAGE}>
        <Kicker style={reveal(frame, 2)}>The problem</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {PROBLEMS.map((p, i) => (
            <Card key={p.k} style={{ ...reveal(frame, 14 + i * 26), display: 'flex', gap: 26, alignItems: 'baseline' }}>
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: 26,
                  color: theme.accent,
                  fontWeight: 600,
                }}
              >
                {p.k}
              </span>
              <span>
                <span
                  style={{
                    display: 'block',
                    fontFamily: theme.font,
                    fontSize: 40,
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  {p.t}
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontFamily: theme.font,
                    fontSize: 26,
                    color: theme.muted,
                  }}
                >
                  {p.s}
                </span>
              </span>
            </Card>
          ))}
        </div>
      </div>
    </Scene>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Product                                                          */
/* ------------------------------------------------------------------ */

const MECHANICS = [
  { t: 'Fund a stream once', s: 'The principal sits in a program-owned vault.', mono: false },
  { t: 'It unlocks by the second', s: 'unlocked = total × (now − start) ÷ (end − start)', mono: true },
  { t: 'Withholding is atomic', s: 'net → employee, tax → company vault, one instruction', mono: true },
]

export const Product: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame()
  return (
    <Scene durationInFrames={durationInFrames}>
      <div style={{ ...PAGE, gap: 26 }}>
        <Kicker style={reveal(frame, 2)}>What we are building</Kicker>
        <Headline style={{ ...reveal(frame, 12), fontSize: 62 }}>
          Salary that accrues by the second
        </Headline>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {MECHANICS.map((m, i) => (
            <Card key={m.t} style={{ ...reveal(frame, 30 + i * 24), height: 220 }}>
              <div
                style={{
                  fontFamily: theme.font,
                  fontSize: 30,
                  fontWeight: 600,
                  color: theme.text,
                  marginBottom: 14,
                }}
              >
                {m.t}
              </div>
              <div
                style={{
                  fontFamily: m.mono ? theme.mono : theme.font,
                  fontSize: m.mono ? 21 : 24,
                  lineHeight: 1.5,
                  color: m.mono ? theme.accentSoft : theme.muted,
                }}
              >
                {m.s}
              </div>
            </Card>
          ))}
        </div>
        <Body style={{ ...reveal(frame, 112), fontSize: 26, color: theme.faint }}>
          No per-second transactions — a stream costs the same whether it runs an hour or a year.
        </Body>
      </div>
    </Scene>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Why us                                                           */
/* ------------------------------------------------------------------ */

const SHIPPED = [
  { t: 'Anchor program', s: '6 instructions, 2 PDAs' },
  { t: 'Client', s: 'employer console + employee portal' },
  { t: 'Deployed on devnet', s: 'live, ready for you to try' },
  { t: 'Invariant tests', s: 'net + tax == claimed, vault drains to zero' },
]

export const WhyUs: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame()
  return (
    <Scene durationInFrames={durationInFrames}>
      <div style={{ ...PAGE, gap: 26 }}>
        <Kicker style={reveal(frame, 2)}>Why us</Kicker>
        <Headline style={{ ...reveal(frame, 12), fontSize: 54 }}>
          We shipped the whole stack — and we sweat correctness.
        </Headline>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {SHIPPED.map((s, i) => (
            <Card key={s.t} style={{ ...reveal(frame, 30 + i * 20), display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <span style={{ color: theme.good, fontSize: 30, lineHeight: '36px' }}>✓</span>
              <span>
                <span style={{ display: 'block', fontFamily: theme.font, fontSize: 30, fontWeight: 600, color: theme.text }}>
                  {s.t}
                </span>
                <span style={{ display: 'block', marginTop: 2, fontFamily: theme.font, fontSize: 24, color: theme.muted }}>
                  {s.s}
                </span>
              </span>
            </Card>
          ))}
        </div>
        <Body style={{ ...reveal(frame, 118), fontSize: 26 }}>
          Settlement is lazy and deterministic: on-chain state changes only when someone claims.
        </Body>
      </div>
    </Scene>
  )
}

/* ------------------------------------------------------------------ */
/* 5. Roadmap                                                          */
/* ------------------------------------------------------------------ */

const NEXT = [
  'Confidential amounts — Token-2022 + auditor key',
  'Hide the schedule — commitment + proof',
  'Mainnet',
]

export const Roadmap: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame()
  return (
    <Scene durationInFrames={durationInFrames}>
      <div style={{ ...PAGE, gap: 26 }}>
        <Kicker style={reveal(frame, 2)}>What is next</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {NEXT.map((n, i) => (
            <div
              key={n}
              style={{ ...reveal(frame, 16 + i * 22), display: 'flex', gap: 20, alignItems: 'center' }}
            >
              <span
                style={{
                  fontFamily: theme.mono,
                  fontSize: 24,
                  color: theme.accent,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: '8px 14px',
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontFamily: theme.font, fontSize: 36, fontWeight: 600, color: theme.text }}>{n}</span>
            </div>
          ))}
        </div>
        <Body style={{ ...reveal(frame, 92), fontSize: 25, color: theme.faint }}>
          Today amounts are public on-chain; we would rather say that than imply privacy we have not shipped.
        </Body>
      </div>
    </Scene>
  )
}

/* ------------------------------------------------------------------ */
/* 6. Close                                                            */
/* ------------------------------------------------------------------ */

export const Close: React.FC<{ durationInFrames: number; url: string }> = ({ durationInFrames, url }) => {
  const frame = useCurrentFrame()
  return (
    <Scene durationInFrames={durationInFrames}>
      <div style={{ ...PAGE, gap: 26, alignItems: 'center', textAlign: 'center' }}>
        <div style={{ ...reveal(frame, 2) }}>
          <ShieldMark size={72} />
        </div>
        <Headline style={{ ...reveal(frame, 12), fontSize: 62 }}>Try it on devnet</Headline>
        <div style={{ ...reveal(frame, 26), fontFamily: theme.mono, fontSize: 32, color: theme.accentSoft }}>
          {url}
        </div>
        <Body style={{ ...reveal(frame, 40), fontSize: 25, color: theme.faint }}>
          github.com/MoseStudio/kethyr-pay
        </Body>
      </div>
    </Scene>
  )
}
