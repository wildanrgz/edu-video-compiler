import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import type { Episode, LoadedEpisode, Locale } from "./schema";

export type Citation = { label: string; url: string };

export type PlannedScene = {
  id: string;
  purpose: string;
  start_s: number;
  duration_s: number;
  text: string;
  on_screen?: string;
  citations: Citation[];
};

export type UploadMeta = {
  title: string;
  description: string;
  tags: string[];
  chapters: { start_s: number; label: string }[];
  sources: Citation[];
  disclosure_lines: string[];
};

export type LongPlan = {
  kind: "long";
  slug: string;
  locale: Locale;
  title: string;
  total_duration_s: number;
  scenes: PlannedScene[];
  meta: UploadMeta;
};

export type ShortPlan = {
  kind: "short";
  slug: string;
  locale: Locale;
  short_id: string;
  hook: string;
  cta: string | null;
  total_duration_s: number;
  scenes: PlannedScene[];
};

const PURPOSE_LABEL: Record<string, { id: string; en: string }> = {
  hook: { id: "Masalahnya", en: "The problem" },
  context: { id: "Konteks", en: "Context" },
  explain: { id: "Penjelasan", en: "How it works" },
  evidence: { id: "Bukti", en: "The evidence" },
  counterpoint: { id: "Yang sering salah", en: "What most people get wrong" },
  takeaway: { id: "Yang bisa kamu pakai", en: "What to do instead" },
  cta: { id: "Langkah berikutnya", en: "Next step" },
};

/** m:ss, the only timestamp format YouTube chapters accept. */
export function stamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function citationsFor(episode: Episode, claimIds: string[]): Citation[] {
  return claimIds.flatMap((id) => {
    const claim = episode.claims.find((candidate) => candidate.id === id);
    return claim ? [{ label: claim.source.title, url: claim.source.url }] : [];
  });
}

function planScenes(episode: Episode, locale: Locale, sceneIds: string[]): PlannedScene[] {
  let cursor = 0;
  return sceneIds.flatMap((id) => {
    const scene = episode.scenes.find((candidate) => candidate.id === id);
    if (!scene) return [];
    const planned: PlannedScene = {
      id: scene.id,
      purpose: scene.purpose,
      start_s: cursor,
      duration_s: scene.duration_s,
      text: scene.script[locale],
      citations: citationsFor(episode, scene.claim_ids),
    };
    if (scene.on_screen) planned.on_screen = scene.on_screen[locale];
    cursor += scene.duration_s;
    return [planned];
  });
}

export function disclosureLines(episode: Episode, locale: Locale): string[] {
  const lines: string[] = [];
  if (episode.disclosure.aigc) {
    lines.push(
      locale === "id"
        ? "Narasi video ini disintesis dengan AI (suara sintetis). Konten telah diubah/dibuat secara sintetis."
        : "This video's narration is AI-synthesised (synthetic voice). Altered or synthetic content.",
    );
  }
  if (episode.disclosure.sponsored) {
    lines.push(
      locale === "id"
        ? "Video ini mengandung promosi berbayar / tautan afiliasi. Saya bisa mendapat komisi."
        : "This video contains paid promotion / affiliate links. I may earn a commission.",
    );
  }
  return lines;
}

export function buildDescription(episode: Episode, locale: Locale, chapters: { start_s: number; label: string }[]): string {
  const sources = episode.claims.map((claim) => `- ${claim.source.title} — ${claim.source.url}`);
  const disclosure = disclosureLines(episode, locale);
  const tags = episode.tags[locale].map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");

  const body =
    locale === "id"
      ? [
          episode.thesis.id,
          "",
          `Untuk: ${episode.audience.id}`,
          "",
          "Bab:",
          ...chapters.map((chapter) => `${stamp(chapter.start_s)} ${chapter.label}`),
          "",
          "Sumber:",
          ...sources,
        ]
      : [
          episode.thesis.en,
          "",
          `For: ${episode.audience.en}`,
          "",
          "Chapters:",
          ...chapters.map((chapter) => `${stamp(chapter.start_s)} ${chapter.label}`),
          "",
          "Sources:",
          ...sources,
        ];

  if (disclosure.length > 0) {
    body.push("", locale === "id" ? "Keterbukaan:" : "Disclosure:", ...disclosure);
  }
  if (tags) body.push("", tags);

  return body.join("\n");
}

export function buildLongPlan(episode: LoadedEpisode, locale: Locale): LongPlan {
  const ep = episode.data;
  const scenes = planScenes(ep, locale, ep.scenes.map((scene) => scene.id));
  const total = scenes.reduce((sum, scene) => sum + scene.duration_s, 0);
  const chapters = ep.scenes.map((scene, index) => {
    const start = ep.scenes.slice(0, index).reduce((sum, previous) => sum + previous.duration_s, 0);
    const label = scene.on_screen?.[locale] ?? PURPOSE_LABEL[scene.purpose]?.[locale] ?? scene.id;
    return { start_s: start, label };
  });

  const meta: UploadMeta = {
    title: ep.title[locale],
    description: buildDescription(ep, locale, chapters),
    tags: ep.tags[locale],
    chapters,
    sources: ep.claims.map((claim) => ({ label: claim.source.title, url: claim.source.url })),
    disclosure_lines: disclosureLines(ep, locale),
  };

  return {
    kind: "long",
    slug: ep.slug,
    locale,
    title: ep.title[locale],
    total_duration_s: total,
    scenes,
    meta,
  };
}

/**
 * A Short is cut from long-form scenes but must hit its own target length, so the
 * scene durations are rescaled proportionally. One script, two shapes.
 */
function scaleScenes(scenes: PlannedScene[], targetSeconds: number): PlannedScene[] {
  const weight = scenes.reduce((sum, scene) => sum + scene.duration_s, 0) || 1;
  let cursor = 0;
  return scenes.map((scene, index) => {
    const isLast = index === scenes.length - 1;
    const raw = isLast ? targetSeconds - cursor : (targetSeconds * scene.duration_s) / weight;
    const duration = Math.max(3, Math.round(raw));
    const scaled: PlannedScene = { ...scene, start_s: cursor, duration_s: duration };
    cursor += duration;
    return scaled;
  });
}

export function buildShortPlans(episode: LoadedEpisode, locale: Locale): ShortPlan[] {
  const ep = episode.data;
  return ep.shorts.map((short) => {
    const scenes = scaleScenes(planScenes(ep, locale, short.scene_ids), short.target_seconds);
    return {
      kind: "short" as const,
      slug: ep.slug,
      locale,
      short_id: short.id,
      hook: short.hook[locale],
      cta: short.cta ? short.cta[locale] : null,
      total_duration_s: short.target_seconds,
      scenes,
    };
  });
}

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export type RenderManifest = {
  generated_at: string;
  episode: { slug: string; file: string; sha256: string; git_commit: string | null };
  outputs: { locale: Locale; kind: string; id: string; sha256: string }[];
};

export function buildManifest(episode: LoadedEpisode, outputs: { locale: Locale; kind: string; id: string; body: unknown }[]): RenderManifest {
  let source = "";
  try {
    source = readFileSync(episode.file, "utf8");
  } catch {
    source = "";
  }
  return {
    generated_at: new Date().toISOString(),
    episode: {
      slug: episode.data.slug,
      file: episode.file,
      sha256: sha256(source),
      git_commit: process.env.GITHUB_SHA ?? null,
    },
    outputs: outputs.map((output) => ({
      locale: output.locale,
      kind: output.kind,
      id: output.id,
      sha256: sha256(JSON.stringify(output.body)),
    })),
  };
}
