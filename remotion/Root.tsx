import React from "react";
import { Composition } from "remotion";
import type { LongPlan, ShortPlan } from "../src/plan";
import { LongForm } from "./LongForm";
import { Short } from "./Short";
import { FPS } from "./theme";

const sampleScene: LongPlan["scenes"][number] = {
  id: "s1",
  purpose: "hook",
  start_s: 0,
  duration_s: 8,
  text: "Run with --props=dist/plan/<slug>.<locale>.long.json to render the real plan.",
  on_screen: "placeholder",
  citations: [{ label: "npm run plan <slug>", url: "https://github.com" }],
  audio: null,
};

const fallbackLong: LongPlan = {
  kind: "long",
  slug: "sample",
  locale: "en",
  title: "Placeholder — pass a plan JSON",
  total_duration_s: 8,
  scenes: [sampleScene],
  meta: {
    title: "Placeholder",
    description: "",
    tags: [],
    chapters: [],
    sources: [],
    disclosure_lines: [],
  },
};

const fallbackShort: ShortPlan = {
  kind: "short",
  slug: "sample",
  locale: "en",
  short_id: "sh1",
  hook: "Placeholder — pass a short plan JSON",
  cta: null,
  target_seconds: 8,
  total_duration_s: 8,
  scenes: [sampleScene],
};

const durationInFrames = (seconds: number) => Math.max(1, Math.round(seconds * FPS));

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LongForm"
        component={LongForm}
        durationInFrames={durationInFrames(fallbackLong.total_duration_s)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={fallbackLong}
        calculateMetadata={({ props }) => ({ durationInFrames: durationInFrames(props.total_duration_s) })}
      />
      <Composition
        id="Short"
        component={Short}
        durationInFrames={durationInFrames(fallbackShort.total_duration_s)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={fallbackShort}
        calculateMetadata={({ props }) => ({ durationInFrames: durationInFrames(props.total_duration_s) })}
      />
    </>
  );
};
