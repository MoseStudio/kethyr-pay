import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { SceneTitle } from "./scene-title";

const { fontFamily: geist } = loadGeist();
const { fontFamily: geistMono } = loadGeistMono();

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

interface Field {
  label: string;
  value: string;
  tone: string;
  badge?: string;
}

const FIELDS: Field[] = [
  {
    label: "merchant",
    value: "aleo1cdsz2pd...",
    tone: "#0E7490",
  },
  {
    label: "invoice_id",
    value: "field: 2043…",
    tone: "#7C3AED",
  },
  {
    label: "sender_ciphertext",
    value: "group: 1122…",
    tone: "#B45309",
    badge: "encrypted",
  },
  {
    label: "amount",
    value: "u64: 120500000",
    tone: "#1F2937",
    badge: "private",
  },
];

const FieldRow: React.FC<{ field: Field; index: number; frame: number }> = ({
  field,
  index,
  frame,
}) => {
  const at = 14 + index * 14;
  const opacity = fade(frame, at);
  const shift = rise(frame, at);

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        fontFamily: geistMono,
        fontSize: 18,
        gap: 14,
        opacity,
        padding: "7px 0",
        transform: `translateY(${shift}px)`,
      }}
    >
      <span style={{ color: "#9CA3AF", width: 210 }}>{field.label}</span>
      <span
        style={{
          alignItems: "center",
          background: "rgba(255,255,255,0.7)",
          borderRadius: 7,
          color: field.tone,
          display: "flex",
          flex: 1,
          gap: 10,
          justifyContent: "space-between",
          padding: "9px 14px",
        }}
      >
        <span>{field.value}</span>
        {field.badge && (
          <span
            style={{
              background:
                field.badge === "encrypted"
                  ? "rgba(217,119,6,0.14)"
                  : "rgba(5,150,105,0.14)",
              borderRadius: 999,
              color:
                field.badge === "encrypted" ? "#B45309" : "#047857",
              fontSize: 12,
              padding: "3px 10px",
            }}
          >
            {field.badge}
          </span>
        )}
      </span>
    </div>
  );
};

export const PrivacyScene: React.FC = () => {
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

  const recordOpacity = fade(frame, 8);
  const recordShift = rise(frame, 8);

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
      <SceneTitle eyebrow="Privacy" title="On-chain, but encrypted." />
      <div
        style={{
          background: "#FBF9F4",
          borderRadius: 16,
          boxShadow:
            "0 40px 90px rgba(60, 40, 20, 0.28), 0 1px 0 rgba(255, 255, 255, 0.6) inset",
          opacity: recordOpacity,
          overflow: "hidden",
          transform: `translateY(${recordShift}px)`,
          width: 860,
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "rgba(245, 242, 233, 0.7)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
            display: "flex",
            height: 48,
            padding: "0 22px",
          }}
        >
          <span
            style={{
              color: "#1F2937",
              fontFamily: geist,
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            PaymentRecord
          </span>
          <span
            style={{
              background: "rgba(217,119,6,0.14)",
              borderRadius: 999,
              color: "#B45309",
              fontFamily: geistMono,
              fontSize: 12,
              marginLeft: 12,
              padding: "3px 10px",
            }}
          >
            pay_private_v2.aleo
          </span>
        </div>
        <div style={{ padding: "18px 24px 22px" }}>
          {FIELDS.map((field, i) => (
            <FieldRow field={field} frame={frame} index={i} key={field.label} />
          ))}
        </div>
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.85)",
          fontFamily: geist,
          fontSize: 20,
          letterSpacing: -0.2,
          opacity: fade(frame, 70),
          textShadow: "0 1px 12px rgba(20, 12, 6, 0.40)",
        }}
      >
        Amount &amp; payer identity encrypted — only the merchant&apos;s View Key can read them.
      </div>
    </AbsoluteFill>
  );
};
