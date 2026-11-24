import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { LongPlan } from "../src/plan";
import { SceneSlide } from "./SceneSlide";
import { COLORS, FONT_STACK, FPS } from "./theme";

export const LongForm: React.FC<LongPlan> = ({ scenes, title, total_duration_s }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={Math.round(scene.start_s * FPS)}
          durationInFrames={Math.max(1, Math.round(scene.duration_s * FPS))}
        >
          <SceneSlide scene={scene} variant="long" showCitations />
        </Sequence>
      ))}

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 64,
            color: COLORS.muted,
            fontFamily: FONT_STACK,
            fontSize: 24,
            letterSpacing: 1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 64,
            color: COLORS.muted,
            fontFamily: FONT_STACK,
            fontSize: 22,
            border: `1px solid ${COLORS.accentSoft}`,
            borderRadius: 999,
            padding: "6px 16px",
          }}
        >
          AI narration
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: 6,
            width: `${progress * 100}%`,
            backgroundColor: COLORS.accent,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 24,
            right: 64,
            color: COLORS.muted,
            fontFamily: FONT_STACK,
            fontSize: 20,
          }}
        >
          {Math.floor(total_duration_s / 60)} min
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
