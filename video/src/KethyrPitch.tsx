import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

import { Close, Intro, Problem, Product, Roadmap, WhyUs } from './scenes'
import { TIMELINE, theme } from './shared/theme'
import { Background } from './shared/ui'

export type KethyrPitchProps = {
  /**
   * 你自己的名字/ID（片头显示「by …」）。留空则不显示。
   * 渲染时用 `--props='{"presenter":"你的名字"}'` 传入。
   */
  presenter?: string
  /**
   * 可选旁白：把音频放进 `public/`（如 voiceover.mp3），
   * 渲染时 `--props='{"voiceoverFile":"voiceover.mp3"}'`。
   * 留空则渲染成无声版（屏幕字幕本身已承载内容）。
   */
  voiceoverFile?: string
  url?: string
}

export const KethyrPitch: React.FC<KethyrPitchProps> = ({
  presenter = '',
  voiceoverFile = '',
  url = 'kethyrpay.suseayah.workers.dev',
}) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const len = {
    intro: TIMELINE.problem - TIMELINE.intro,
    problem: TIMELINE.product - TIMELINE.problem,
    product: TIMELINE.whyUs - TIMELINE.product,
    whyUs: TIMELINE.roadmap - TIMELINE.whyUs,
    roadmap: TIMELINE.close - TIMELINE.roadmap,
    close: TIMELINE.total - TIMELINE.close,
  }

  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0

  return (
    <AbsoluteFill style={{ background: theme.bgBottom }}>
      <Background />

      {voiceoverFile ? <Audio src={staticFile(voiceoverFile)} /> : null}

      <Sequence from={TIMELINE.intro} durationInFrames={len.intro}>
        <Intro durationInFrames={len.intro} presenter={presenter} />
      </Sequence>
      <Sequence from={TIMELINE.problem} durationInFrames={len.problem}>
        <Problem durationInFrames={len.problem} />
      </Sequence>
      <Sequence from={TIMELINE.product} durationInFrames={len.product}>
        <Product durationInFrames={len.product} />
      </Sequence>
      <Sequence from={TIMELINE.whyUs} durationInFrames={len.whyUs}>
        <WhyUs durationInFrames={len.whyUs} />
      </Sequence>
      <Sequence from={TIMELINE.roadmap} durationInFrames={len.roadmap}>
        <Roadmap durationInFrames={len.roadmap} />
      </Sequence>
      <Sequence from={TIMELINE.close} durationInFrames={len.close}>
        <Close durationInFrames={len.close} url={url} />
      </Sequence>

      {/* 底部细进度条 */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          right: 120,
          bottom: 40,
          height: 4,
          borderRadius: 99,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentSoft})`,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 120,
          bottom: 60,
          fontFamily: theme.font,
          fontSize: 16,
          letterSpacing: 1,
          color: theme.faint,
        }}
      >
        KethyrPay · streaming payroll on Solana
      </div>
      <div
        style={{
          position: 'absolute',
          right: 120,
          bottom: 60,
          fontFamily: theme.font,
          fontSize: 16,
          letterSpacing: 1,
          color: theme.faint,
        }}
      >
        Solana devnet
      </div>
    </AbsoluteFill>
  )
}
