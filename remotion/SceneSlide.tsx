import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlannedScene } from "../src/plan";
import { COLORS, FONT_STACK, typeScale } from "./theme";

export type SlideProps = {
  scene: PlannedScene;
  variant: "long" | "short";
  showCitations: boolean;
};

export const SceneSlide: React.FC<SlideProps> = ({ scene, variant, showCitations }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(enter, exit);
  const translateY = interpolate(enter, [0, 1], [28, 0]);

  const isShort = variant === "short";
  const baseSize = isShort ? 78 : 62;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        color: COLORS.text,
        fontFamily: FONT_STACK,
        justifyContent: "center",
        padding: isShort ? "180px 90px" : "140px 160px",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 20% 10%, ${COLORS.surface} 0%, ${COLORS.background} 60%)`,
        }}
      />

      {scene.on_screen ? (
        <div
          style={{
            position: "relative",
            color: COLORS.accent,
            fontSize: isShort ? 54 : 34,
            letterSpacing: 2,
            textTransform: "uppercase",
            opacity,
            transform: `translateY(${translateY}px)`,
            marginBottom: isShort ? 48 : 36,
          }}
        >
          {scene.on_screen}
        </div>
      ) : null}

      {scene.points && scene.points.length > 0 ? (
        <div
          style={{
            position: "relative",
            opacity,
            transform: `translateY(${translateY}px)`,
            maxWidth: isShort ? "100%" : 1400,
          }}
        >
          {scene.points.map((point, index) => (
            <div
              key={point}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: isShort ? 28 : 22,
                marginTop: index === 0 ? 0 : isShort ? 36 : 28,
                fontSize: typeScale(point, isShort ? 60 : 48),
                lineHeight: 1.3,
                fontWeight: 600,
              }}
            >
              <span style={{ color: COLORS.accent, fontSize: "0.7em" }}>—</span>
              <span>{point}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            fontSize: typeScale(scene.text, baseSize),
            lineHeight: 1.3,
            fontWeight: 600,
            opacity,
            transform: `translateY(${translateY}px)`,
            maxWidth: isShort ? "100%" : 1400,
          }}
        >
          {scene.text}
        </div>
      )}

      {showCitations && scene.citations.length > 0 ? (
        <div
          style={{
            position: "relative",
            marginTop: isShort ? 56 : 48,
            color: COLORS.muted,
            fontSize: isShort ? 30 : 26,
            opacity,
          }}
        >
          Sumber / Source:
          {scene.citations.map((citation) => (
            <div key={citation.url} style={{ marginTop: 8, color: COLORS.muted }}>
              {citation.label}
            </div>
          ))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
