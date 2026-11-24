import { readFileSync } from "node:fs";
import type { Locale } from "./schema";

/**
 * Duration of a PCM WAV file, read straight from the RIFF header.
 * No ffprobe/ffmpeg dependency: the render factory runs on a bare runner.
 */
export function wavDurationSeconds(file: string): number | null {
  let buffer: Buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    return null;
  }
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt " && offset + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(offset + 16);
    }
    if (chunkId === "data") {
      if (byteRate <= 0) return null;
      return chunkSize / byteRate;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

/** Where a scene's narration lives, relative to `public/` (what staticFile() wants). */
export function sceneAudioRelativePath(slug: string, locale: string, sceneId: string): string {
  return `audio/${slug}/${locale}/${sceneId}.wav`;
}

/** Absolute path on disk for the same file. */
export function sceneAudioPublicPath(slug: string, locale: string, sceneId: string): string {
  return `public/${sceneAudioRelativePath(slug, locale, sceneId)}`;
}

export function audioManifestPath(slug: string): string {
  return `dist/audio/${slug}.json`;
}

export type AudioScene = {
  id: string;
  /** Path relative to public/, as consumed by Remotion's staticFile() */
  file: string;
  /** Speech only */
  narration_s: number;
  /** Speech + tail silence; this is what the timeline allocates */
  duration_s: number;
};

export type AudioLocale = {
  voice: string;
  tail_s: number;
  scenes: AudioScene[];
  total_s: number;
};

export type AudioManifest = {
  slug: string;
  generated_at: string;
  locales: Partial<Record<Locale, AudioLocale>>;
};

export function readAudioManifestSync(slug: string): AudioManifest | null {
  try {
    const raw = readFileSync(audioManifestPath(slug), "utf8");
    const parsed = JSON.parse(raw) as AudioManifest;
    return parsed.slug === slug ? parsed : null;
  } catch {
    return null;
  }
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
