import "./index.css";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Composition } from "remotion";

import { Kethyrpay } from "./kethyrpay/composition";
import { TOTAL_DURATION } from "./kethyrpay/timings";

loadGeist({
  weights: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  // remotion 4.0's typings lag behind the runtime option
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ignoreTooManyRequestsWarning: true,
} as any)
loadGeistMono({
  weights: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ignoreTooManyRequestsWarning: true,
} as any)

export const RemotionRoot: React.FC = () => (
  <Composition
    calculateMetadata={async () => ({ durationInFrames: TOTAL_DURATION, fps: 30 })}
    component={Kethyrpay}
    durationInFrames={TOTAL_DURATION}
    fps={30}
    height={1080}
    id="Kethyrpay"
    width={1920}
  />
);
