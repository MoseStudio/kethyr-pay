import { geist } from "../shared/fonts";
import { Easing, interpolate, useCurrentFrame } from "remotion";


const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** The eyebrow + headline shared by every feature scene. */
export const SceneTitle: React.FC<{
  title: string;
  eyebrow: string;
  delay?: number;
}> = ({ title, eyebrow, delay = 0 }) => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [delay, delay + 20], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(frame, [delay, delay + 20], [16, 0], {
    easing: EASE,
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
