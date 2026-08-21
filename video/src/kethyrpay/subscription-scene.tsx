import { geist, geistMono } from "../shared/fonts";

import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { SceneTitle } from "./scene-title";


const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const SCENE_DURATION = 234;
const EXIT = 16;

const fade = (frame: number, at: number, dur = 18): number =>
  interpolate(frame, [at, at + dur], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const rise = (frame: number, at: number, dist = 14, dur = 18): number =>
  interpolate(frame, [at, at + dur], [dist, 0], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const STEPS = [
  {
    label: "Authorize",
    detail: "escrow · 120 USD · 30d",
    tone: "#0E7490",
  },
  {
    label: "Auto-pull",
    detail: "periodic · only merchant",
    tone: "#7C3AED",
  },
  {
    label: "Cancel",
    detail: "refund remaining",
    tone: "#B45309",
  },
];

const StepRow: React.FC<{
  step: { label: string; detail: string; tone: string };
  index: number;
  frame: number;
}> = ({ step, index, frame }) => {
  const at = 16 + index * 14;
  const opacity = fade(frame, at);
  const shift = rise(frame, at, 10);

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: 14,
        opacity,
        padding: "9px 0",
        transform: `translateY(${shift}px)`,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: `${step.tone}1A`,
          borderRadius: 999,
          color: step.tone,
          display: "flex",
          fontSize: 14,
          fontWeight: 600,
          height: 34,
          justifyContent: "center",
          width: 34,
        }}
      >
        {index + 1}
      </div>
      <div>
        <div
          style={{
            color: "#1F2937",
            fontFamily: geist,
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: -0.1,
          }}
        >
          {step.label}
        </div>
        <div
          style={{
            color: "#9CA3AF",
            fontFamily: geistMono,
            fontSize: 13,
            letterSpacing: -0.1,
            marginTop: 2,
          }}
        >
          {step.detail}
        </div>
      </div>
    </div>
  );
};

export const SubscriptionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const exitOpacity = interpolate(
    frame,
    [SCENE_DURATION - EXIT, SCENE_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const exitLift = interpolate(
    frame,
    [SCENE_DURATION - EXIT, SCENE_DURATION],
    [0, -14],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const panelOpacity = fade(frame, 8);
  const panelShift = rise(frame, 8);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        flexDirection: "column",
        gap: 40,
        justifyContent: "center",
        opacity: exitOpacity,
        transform: `translateY(${exitLift}px)`,
      }}
    >
      <SceneTitle eyebrow="Subscriptions" title="Pre-authorized, never silent." />
      <div
        style={{
          background: "#FBF9F4",
          borderRadius: 16,
          boxShadow:
            "0 40px 90px rgba(60, 40, 20, 0.28), 0 1px 0 rgba(255, 255, 255, 0.6) inset",
          display: "flex",
          gap: 0,
          opacity: panelOpacity,
          overflow: "hidden",
          transform: `translateY(${panelShift}px)`,
          width: 880,
        }}
      >
        <div
          style={{
            background: "rgba(245, 242, 233, 0.7)",
            borderRight: "1px solid rgba(0, 0, 0, 0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "26px 30px",
            width: 320,
          }}
        >
          <div
            style={{
              color: "#1F2937",
              fontFamily: geistMono,
              fontSize: 15,
              marginBottom: 6,
            }}
          >
            escrow_subscription.aleo
          </div>
          <div
            style={{
              color: "#9CA3AF",
              fontFamily: geist,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Subscriber pre-funds an escrow record. The merchant pulls only what
            was authorized — on a ZK chain, no silent charges.
          </div>
          <div
            style={{
              alignItems: "baseline",
              display: "flex",
              gap: 6,
              marginTop: 16,
            }}
          >
            <span
              style={{
                color: "#047857",
                fontFamily: geistMono,
                fontSize: 30,
                fontWeight: 600,
              }}
            >
              96.00
            </span>
            <span style={{ color: "#9CA3AF", fontFamily: geistMono, fontSize: 14 }}>
              USD remaining
            </span>
          </div>
          <div
            style={{
              color: "#9CA3AF",
              fontFamily: geistMono,
              fontSize: 12,
              marginTop: 6,
            }}
          >
            also payable in aleo
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            justifyContent: "center",
            padding: "26px 30px",
            width: 480,
          }}
        >
          {STEPS.map((step, i) => (
            <StepRow frame={frame} index={i} key={step.label} step={step} />
          ))}
        </div>
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.85)",
          fontFamily: geist,
          fontSize: 20,
          letterSpacing: -0.2,
          opacity: fade(frame, 74),
          textShadow: "0 1px 12px rgba(20, 12, 6, 0.40)",
        }}
      >
        Authorize once. Pull on schedule. Refund on cancel.
      </div>
    </AbsoluteFill>
  );
};
