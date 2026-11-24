import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ShortPlan } from "../src/plan";
import { SceneSlide } from "./SceneSlide";
import { COLORS, FONT_STACK, FPS } from "./theme";

/** First 2.5s is the whole short. If the hook does not land, nothing after it is seen. */
const HOOK_FRAMES = Math.round(2.5 * FPS);

export const Short: React.FC<ShortPlan> = ({ scenes, hook, cta }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const hookOpacity = interpolate(frame, [0, 6, HOOK_FRAMES - 8, HOOK_FRAMES], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaStart = Math.max(0, durationInFrames - FPS * 3);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={Math.round(scene.start_s * FPS)}
          durationInFrames={Math.max(1, Math.round(scene.duration_s * FPS))}
        >
          <SceneSlide scene={scene} variant="short" showCitations={false} />
        </Sequence>
      ))}

      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "150px 80px 0",
            opacity: hookOpacity,
            fontFamily: FONT_STACK,
            color: COLORS.text,
            fontSize: 86,
            lineHeight: 1.15,
            fontWeight: 800,
          }}
        >
          {hook}
        </div>

        {cta ? (
          <div
            style={{
              position: "absolute",
              bottom: 200,
              left: 80,
              right: 80,
              opacity: interpolate(frame, [ctaStart, ctaStart + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              fontFamily: FONT_STACK,
              color: COLORS.accent,
              fontSize: 44,
              lineHeight: 1.3,
            }}
          >
            {cta}
          </div>
        ) : null}

        <div
          style={{
            position: "absolute",
            bottom: 96,
            left: 80,
            color: COLORS.muted,
            fontFamily: FONT_STACK,
            fontSize: 26,
          }}
        >
          AI narration · full episode on the channel
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
