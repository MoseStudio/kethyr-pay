import "./index.css";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Composition } from "remotion";

import { Kethyrpay } from "./kethyrpay/composition";
import { TOTAL_DURATION } from "./kethyrpay/timings";

loadGeist("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
} as unknown as Parameters<typeof loadGeist>[1])
loadGeistMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
} as unknown as Parameters<typeof loadGeistMono>[1])

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
