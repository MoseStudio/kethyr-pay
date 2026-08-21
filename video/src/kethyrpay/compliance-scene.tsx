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

const ROWS = [
  { currency: "ALEO", date: "2026-08-01", amount: "1.50", payer: "aleo1…8f3k" },
  { currency: "ALEO", date: "2026-08-05", amount: "2.00", payer: "aleo1…2b7q" },
  { currency: "ALEO", date: "2026-08-12", amount: "1.50", payer: "aleo1…9m4d" },
];

const TableRow: React.FC<{
  row: { currency: string; date: string; amount: string; payer: string };
  index: number;
  frame: number;
}> = ({ row, index, frame }) => {
  const at = 16 + index * 13;
  const opacity = fade(frame, at);
  const shift = rise(frame, at, 10);

  return (
    <div
      style={{
        alignItems: "center",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        color: "#1F2937",
        display: "flex",
        fontFamily: geistMono,
        fontSize: 16,
        gap: 16,
        opacity,
        padding: "12px 20px",
        transform: `translateY(${shift}px)`,
      }}
    >
      <span style={{ color: "#9CA3AF", width: 120 }}>{row.date}</span>
      <span style={{ alignItems: "center", display: "flex", gap: 8, width: 150 }}>
        <span
            style={{
              background: "rgba(14,116,144,0.12)",
              borderRadius: 999,
              color: "#0E7490",
              fontSize: 11,
              padding: "2px 8px",
            }}
          >
            {row.currency}
          </span>
        <span>+{row.amount}</span>
      </span>
      <span style={{ color: "#0E7490" }}>{row.payer}</span>
      <span
        style={{
          background: "rgba(5,150,105,0.12)",
          borderRadius: 999,
          color: "#047857",
          fontSize: 12,
          marginLeft: "auto",
          padding: "3px 10px",
        }}
      >
        ✓ decrypted
      </span>
    </div>
  );
};

export const ComplianceScene: React.FC = () => {
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
      <SceneTitle eyebrow="Compliance" title="Auditable, not anonymous." />
      <div
        style={{
          background: "#FBF9F4",
          borderRadius: 16,
          boxShadow:
            "0 40px 90px rgba(60, 40, 20, 0.28), 0 1px 0 rgba(255, 255, 255, 0.6) inset",
          opacity: panelOpacity,
          overflow: "hidden",
          transform: `translateY(${panelShift}px)`,
          width: 880,
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "rgba(245, 242, 233, 0.7)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
            display: "flex",
            height: 52,
            justifyContent: "space-between",
            padding: "0 20px",
          }}
        >
          <span
            style={{
              alignItems: "center",
              color: "#1F2937",
              display: "flex",
              fontFamily: geistMono,
              fontSize: 15,
              gap: 10,
            }}
          >
            <span
              style={{
                background: "rgba(14,116,144,0.12)",
                borderRadius: 999,
                color: "#0E7490",
                fontSize: 12,
                padding: "3px 10px",
              }}
            >
              View Key
            </span>
            merchant dashboard
          </span>
          <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
            {["CSV", "JSON"].map((fmt, i) => (
              <span
                key={fmt}
                style={{
                  alignItems: "center",
                  background: i === 0 ? "#059669" : "#EFEDE6",
                  borderRadius: 7,
                  color: i === 0 ? "#FFFFFF" : "#6B7280",
                  display: "flex",
                  fontSize: 12,
                  fontWeight: 500,
                  gap: 5,
                  height: 30,
                  padding: "0 12px",
                }}
              >
                <span style={{ fontSize: 11 }}>↓</span>
                {fmt}
              </span>
            ))}
          </div>
        </div>
        <div style={{ padding: "8px 0 6px" }}>
          <div
            style={{
              alignItems: "center",
              color: "#9CA3AF",
              display: "flex",
              fontFamily: geistMono,
              fontSize: 12,
              gap: 16,
              padding: "8px 20px",
            }}
          >
            <span style={{ width: 120 }}>date</span>
            <span style={{ width: 110 }}>amount</span>
            <span>payer (decrypted)</span>
          </div>
          {ROWS.map((row, i) => (
            <TableRow frame={frame} index={i} key={row.date} row={row} />
          ))}
        </div>
        <div
          style={{
            alignItems: "center",
            borderTop: "1px solid rgba(0,0,0,0.05)",
            color: "#9CA3AF",
            display: "flex",
            fontFamily: geistMono,
            fontSize: 12,
            gap: 8,
            justifyContent: "space-between",
            letterSpacing: -0.1,
            padding: "13px 20px",
          }}
        >
          <span>export statement · period 7d</span>
          <span style={{ color: "#0E7490", fontSize: 14 }}>
            sender_ciphertext included
          </span>
        </div>
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.85)",
          fontFamily: geist,
          fontSize: 20,
          letterSpacing: -0.2,
          opacity: fade(frame, 72),
          textShadow: "0 1px 12px rgba(20, 12, 6, 0.40)",
        }}
      >
        Privacy without a mixer — regulators get a View Key, not a backdoor.
      </div>
    </AbsoluteFill>
  );
};
