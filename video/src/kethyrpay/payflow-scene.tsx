import { geist } from "../shared/fonts";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { CodeWindow } from "../shared/code-window";
import { useCharBudget } from "../shared/typewriter";
import { tokenizeLines } from "./flow-code";
import { FlowPanel } from "./flow-panel";
import { FLOW, FLOW_SCHEDULE } from "./timings";


const ENTER = 18;
const EXIT = 16;

const enter = (frame: number, fps: number) => {
  const s = spring({
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 30,
    fps,
    frame,
  });
  return {
    opacity: interpolate(s, [0, 1], [0, 1]),
    scale: interpolate(s, [0, 1], [0.98, 1]),
    y: interpolate(s, [0, 1], [24, 0]),
  };
};

const exit = (frame: number) => {
  const from = FLOW_SCHEDULE.duration - EXIT;
  const opacity = interpolate(frame, [from, FLOW_SCHEDULE.duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [from, FLOW_SCHEDULE.duration], [0, -14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, y };
};

const SceneTitle: React.FC<{ title: string; eyebrow: string }> = ({
  title,
  eyebrow,
}) => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, ENTER], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(frame, [0, ENTER], [16, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: reveal,
        transform: `translateY(${lift}px)`,
      }}
    >
      <div
        style={{
          color: "#FDE68A",
          fontFamily: geist,
          fontSize: 15,
          letterSpacing: 0.6,
          textShadow: "0 1px 10px rgba(20, 12, 6, 0.40)",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          color: "#FFFFFF",
          fontFamily: geist,
          fontSize: 44,
          fontWeight: 600,
          letterSpacing: -1.2,
          textShadow:
            "0 2px 20px rgba(20, 12, 6, 0.45), 0 1px 2px rgba(20, 12, 6, 0.30)",
        }}
      >
        {title}
      </div>
    </div>
  );
};

export const PayflowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { flowTypeStart, stateFrom } = FLOW_SCHEDULE;
  const e = enter(frame, fps);
  const x = exit(frame);

  // Code window types until stateFrom, then holds (fully revealed).
  const budget = useCharBudget(flowTypeStart, FLOW.charsPerSec);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        flexDirection: "column",
        gap: 40,
        justifyContent: "center",
        opacity: e.opacity * x.opacity,
        transform: `translateY(${e.y + x.y}px) scale(${e.scale})`,
      }}
    >
      <SceneTitle eyebrow="Payments" title="Real money. Real ZK. In the browser." />
      <div style={{ alignItems: "center", display: "flex", gap: 52 }}>
        <CodeWindow
          budget={budget}
          filename="pay.ts"
          lines={tokenizeLines()}
          showActiveLine={frame < stateFrom}
          width={760}
        />
        <FlowPanel frame={Math.max(0, frame - stateFrom)} />
      </div>
    </AbsoluteFill>
  );
};
