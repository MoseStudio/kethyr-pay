import { AbsoluteFill, Sequence } from "remotion";

import { Background } from "../shared/background";
import { IntroScene } from "../shared/intro-scene";
import { Outro } from "../shared/outro";
import { ComplianceScene } from "./compliance-scene";
import { PayflowScene } from "./payflow-scene";
import { PrivacyScene } from "./privacy-scene";
import { SubscriptionScene } from "./subscription-scene";
import { TIMING } from "./timings";

export const Kethyrpay: React.FC = () => (
  <AbsoluteFill style={{ background: "#1a1410" }}>
    <Background src="background-3.jpg" />
    <Sequence
      durationInFrames={TIMING.intro.duration}
      from={TIMING.intro.from}
      layout="none"
    >
      <IntroScene
        command="npm i @kethyrpay/sdk"
        durationInFrames={TIMING.intro.duration}
        tagline="privacy-first payments on Aleo"
        version="v0.1"
      />
    </Sequence>
    <Sequence
      durationInFrames={TIMING.payflow.duration}
      from={TIMING.payflow.from}
      layout="none"
    >
      <PayflowScene />
    </Sequence>
    <Sequence
      durationInFrames={TIMING.privacy.duration}
      from={TIMING.privacy.from}
      layout="none"
    >
      <PrivacyScene />
    </Sequence>
    <Sequence
      durationInFrames={TIMING.compliance.duration}
      from={TIMING.compliance.from}
      layout="none"
    >
      <ComplianceScene />
    </Sequence>
    <Sequence
      durationInFrames={TIMING.subscription.duration}
      from={TIMING.subscription.from}
      layout="none"
    >
      <SubscriptionScene />
    </Sequence>
    <Sequence
      durationInFrames={TIMING.outro.duration}
      from={TIMING.outro.from}
      layout="none"
    >
      <Outro brand="KethyrPay" tagline="Privacy-first payments on Aleo." />
    </Sequence>
  </AbsoluteFill>
);
