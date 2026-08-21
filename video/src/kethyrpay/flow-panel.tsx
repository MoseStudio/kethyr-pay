import { geist, geistMono } from "../shared/fonts";

import {
  Easing,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";


const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export interface FlowState {
  id: string;
  title: string;
  subtitle: string;
}

// Three beats of the v3 atomic payment lifecycle, in order.
// v3 settles in a single pay_invoice transaction (transfer_private +
// InvoiceRecord consume + dual receipts); no separate public transfer.
export const STATES: FlowState[] = [
  {
    id: "mint",
    title: "Mint to payer",
    subtitle: "mint_to_payer · owner = payer",
  },
  {
    id: "prove",
    title: "Prove in browser",
    subtitle: "ZK proof · keys never leave",
  },
  {
    id: "atomic",
    title: "Atomic pay_invoice",
    subtitle: "transfer_private + receipts · 1 tx",
  },
];

export const STATE_STEP = 34;
export const STATE_HOLD = 26;
/** Total frames the state machine animates for (after the code types). */
export const STATE_ACTION_FRAMES = STATE_STEP * 3 + STATE_HOLD;

// Status dot: three states — idle (grey number), loading (amber progress ring
// that fills as the step runs), done (green check that springs in). The
// transitions overlap by a few frames so nothing snaps.
const R = 13;
const CIRCUMFERENCE = 2 * Math.PI * R;
const LEAD = 8; // spinner fades in this many frames before a step starts
const DONE_FADE = 6; // check fades/springs in over this many frames

/** Frame at which step `index` flips to done. The last step holds before it. */
const stepEndOf = (index: number): number =>
  index === STATES.length - 1 ? STATE_ACTION_FRAMES : (index + 1) * STATE_STEP;

const StatusDot: React.FC<{ frame: number; index: number }> = ({
  frame,
  index,
}) => {
  const { fps } = useVideoConfig();
  const stepStart = index * STATE_STEP;
  const stepEnd = stepEndOf(index);
  const doneAt = stepEnd - DONE_FADE;

  // 0 → 1 across the step's own window (the ring fills up as the step runs).
  const progress = interpolate(frame, [stepStart, stepEnd], [0, 1], {
    easing: EASE,
    ...CLAMP,
  });

  // idle → loading: number fades out, ring fades in.
  const spinIn = interpolate(frame, [stepStart - LEAD, stepStart], [0, 1], {
    easing: EASE,
    ...CLAMP,
  });

  // loading → done: ring fades out, green check springs in.
  const doneOpacity = interpolate(frame, [doneAt, stepEnd], [0, 1], {
    easing: EASE,
    ...CLAMP,
  });
  const doneScale = spring({
    config: { damping: 12, stiffness: 260 },
    fps,
    frame: frame - doneAt,
  });

  const isDone = frame >= stepEnd;
  const idleOpacity = isDone ? 0 : 1 - spinIn;
  const spinOpacity = isDone ? 1 - doneOpacity : spinIn;

  return (
    <div style={{ height: 34, position: "relative", width: 34 }}>
      <div
        style={{
          alignItems: "center",
          background: "#EFEDE6",
          borderRadius: 999,
          color: "#9CA3AF",
          display: "flex",
          fontSize: 13,
          fontWeight: 600,
          height: 34,
          justifyContent: "center",
          opacity: idleOpacity,
          position: "absolute",
          width: 34,
        }}
      >
        {index + 1}
      </div>
      <svg
        style={{
          height: 34,
          opacity: spinOpacity,
          position: "absolute",
          transform: "rotate(-90deg)",
          width: 34,
        }}
        viewBox="0 0 34 34"
      >
        <circle
          cx="17"
          cy="17"
          fill="none"
          r={R}
          stroke="#E5E1D8"
          strokeWidth="3"
        />
        <circle
          cx="17"
          cy="17"
          fill="none"
          r={R}
          stroke="#D97706"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
      <div
        style={{
          alignItems: "center",
          background: "#10B981",
          borderRadius: 999,
          color: "#FFFFFF",
          display: "flex",
          fontSize: 15,
          fontWeight: 700,
          height: 34,
          justifyContent: "center",
          opacity: doneOpacity,
          position: "absolute",
          transform: `scale(${doneScale})`,
          width: 34,
        }}
      >
        ✓
      </div>
    </div>
  );
};

const StateRow: React.FC<{ state: FlowState; index: number; frame: number }> = ({
  state,
  index,
  frame,
}) => {
  const stepStart = index * STATE_STEP;
  const stepEnd = stepEndOf(index);
  const opacity = interpolate(frame, [stepStart - 12, stepStart], [0, 1], {
    easing: EASE,
    ...CLAMP,
  });
  const shift = interpolate(frame, [stepStart - 12, stepStart], [14, 0], {
    easing: EASE,
    ...CLAMP,
  });

  const isDone = frame >= stepEnd;
  const isActive = !isDone && frame >= stepStart;

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: 14,
        opacity,
        transform: `translateY(${shift}px)`,
      }}
    >
      <StatusDot frame={frame} index={index} />
      <div>
        <div
          style={{
            color: isActive || isDone ? "#1F2937" : "#9CA3AF",
            fontFamily: geist,
            fontSize: 17,
            fontWeight: isActive ? 600 : 500,
            letterSpacing: -0.1,
          }}
        >
          {state.title}
          {isDone && index === STATES.length - 1 && (
            <span style={{ color: "#059669", marginLeft: 8, fontSize: 15 }}>
              ✓ paid
            </span>
          )}
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
          {state.subtitle}
        </div>
      </div>
    </div>
  );
};

/** The right-hand payment lifecycle panel. `frame` is the local frame within
 *  the panel's own timeline (0 = the state machine starts). */
export const FlowPanel: React.FC<{ frame: number }> = ({ frame }) => (
  <div
    style={{
      background: "#FFFFFF",
      borderRadius: 14,
      boxShadow:
        "0 18px 48px rgba(60, 40, 20, 0.18), 0 1px 0 rgba(255,255,255,0.6) inset",
      display: "flex",
      flexDirection: "column",
      fontFamily: geist,
      gap: 18,
      padding: "24px 26px",
      width: 460,
    }}
  >
    <div
      style={{
        alignItems: "center",
        color: "#1F2937",
        display: "flex",
        fontFamily: geistMono,
        fontSize: 15,
        justifyContent: "space-between",
        letterSpacing: -0.2,
      }}
    >
      <span>payment flow</span>
      <span
        style={{
          background: "rgba(5,150,105,0.12)",
          borderRadius: 999,
          color: "#047857",
          fontFamily: geistMono,
          fontSize: 12,
          padding: "3px 10px",
        }}
      >
        pay_private_v3
      </span>
    </div>
    <div
      style={{
        borderLeft: "2px solid #EFEDE6",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        marginLeft: 16,
        paddingLeft: 22,
      }}
    >
      {STATES.map((state, i) => (
        <StateRow frame={frame} index={i} key={state.id} state={state} />
      ))}
    </div>
    <div
      style={{
        alignItems: "center",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        color: "#9CA3AF",
        display: "flex",
        fontFamily: geistMono,
        fontSize: 11,
        gap: 6,
        justifyContent: "space-between",
        letterSpacing: -0.1,
        overflow: "hidden",
        paddingTop: 13,
      }}
    >
      <span style={{ flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>inv_00ea · 1.50 ALEO</span>
      <span
        style={{
          background: "rgba(14,116,144,0.12)",
          borderRadius: 999,
          color: "#0E7490",
          flexShrink: 0,
          fontSize: 10,
          padding: "2px 6px",
          whiteSpace: "nowrap",
        }}
      >
        ALEO · credits.aleo
      </span>
      <span
        style={{
          color: "#059669",
          flexShrink: 0,
          fontSize: 11,
          whiteSpace: "nowrap",
        }}
      >
        payment.secured ✓
      </span>
    </div>
  </div>
);
