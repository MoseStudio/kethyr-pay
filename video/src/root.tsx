import "./index.css";
import { Composition } from "remotion";

import { Kethyrpay } from "./kethyrpay/composition";
import { TOTAL_DURATION } from "./kethyrpay/timings";

export const RemotionRoot: React.FC = () => (
  <Composition
    component={Kethyrpay}
    durationInFrames={TOTAL_DURATION}
    fps={30}
    height={1080}
    id="Kethyrpay"
    width={1920}
  />
);
