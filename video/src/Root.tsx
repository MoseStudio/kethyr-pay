import { Composition } from 'remotion'

import { KethyrPitch, type KethyrPitchProps } from './KethyrPitch'
import { FPS, TIMELINE } from './shared/theme'

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KethyrPitch"
      component={KethyrPitch}
      durationInFrames={TIMELINE.total}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={
        {
          presenter: '',
          voiceoverFile: '',
          url: 'kethyrpay.suseayah.workers.dev',
        } satisfies KethyrPitchProps
      }
    />
  )
}
