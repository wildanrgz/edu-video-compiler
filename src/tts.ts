import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  audioManifestPath,
  round2,
  sceneAudioPublicPath,
  sceneAudioRelativePath,
  wavDurationSeconds,
  type AudioLocale,
  type AudioManifest,
  type AudioScene,
} from "./audio";
import { loadEpisode } from "./loader";
import { LOCALES, type Episode, type Locale } from "./schema";

/** Free, local, CPU-only voices. Override per locale in episode.yml under `tts:`. */
export const DEFAULT_VOICES: Record<Locale, { voice: string; length_scale: number; tail_s: number }> = {
  id: { voice: "id_ID-news_tts-medium", length_scale: 0.95, tail_s: 0.5 },
  en: { voice: "en_US-lessac-medium", length_scale: 0.95, tail_s: 0.5 },
};

export type VoiceSettings = { voice: string; length_scale: number; tail_s: number };

export function voiceSettingsFor(episode: Episode, locale: Locale): VoiceSettings {
  const override = episode.tts?.[locale];
  const base = DEFAULT_VOICES[locale];
  return {
    voice: override?.voice ?? base.voice,
    length_scale: override?.length_scale ?? base.length_scale,
    tail_s: override?.tail_s ?? base.tail_s,
  };
}

function run(command: string, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: Error) => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export type TtsOptions = {
  slug: string;
  locales?: Locale[];
  /** Directory holding <voice>.onnx and <voice>.onnx.json */
  voiceDir?: string;
  /** Path to the piper binary; defaults to `piper` on PATH */
  piperCommand?: string;
  force?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
};

const PIPER_INSTALL_HINT = [
  "Piper is not installed. Free, CPU-only setup:",
  "  python3 -m venv .venv",
  "  .venv/bin/pip install piper-tts",
  "  .venv/bin/python -m piper.download_voices en_US-lessac-medium id_ID-news_tts-medium --download-dir voices",
  "  npm run tts -- <slug> --piper .venv/bin/piper",
].join("\n");

export async function synthesizeEpisode(options: TtsOptions): Promise<AudioManifest> {
  const log = options.log ?? ((line: string) => console.log(line));
  const locales = options.locales ?? [...LOCALES];
  const voiceDir = path.resolve(options.voiceDir ?? "voices");
  const piper = options.piperCommand ?? "piper";
  const episode = await loadEpisode(options.slug);

  const manifest: AudioManifest = {
    slug: episode.data.slug,
    generated_at: new Date().toISOString(),
    locales: {},
  };

  for (const locale of locales) {
    const settings = voiceSettingsFor(episode.data, locale);
    const model = path.join(voiceDir, `${settings.voice}.onnx`);
    const config = path.join(voiceDir, `${settings.voice}.onnx.json`);

    if (!options.dryRun && (!existsSync(model) || !existsSync(config))) {
      throw new Error(`Voice "${settings.voice}" is missing from ${voiceDir}.\n${PIPER_INSTALL_HINT}`);
    }

    const scenes: AudioScene[] = [];
    let total = 0;

    for (const scene of episode.data.scenes) {
      const text = scene.script[locale].trim();
      const wavPath = sceneAudioPublicPath(episode.data.slug, locale, scene.id);
      const textPath = path.join("dist/tts", episode.data.slug, locale, `${scene.id}.txt`);

      await mkdir(path.dirname(wavPath), { recursive: true });
      await mkdir(path.dirname(textPath), { recursive: true });
      await writeFile(textPath, `${text}\n`);

      if (options.dryRun) {
        log(`  [dry-run] ${locale}/${scene.id} -> ${wavPath}`);
        continue;
      }

      if (options.force || !existsSync(wavPath)) {
        const argv = [
          "--model",
          model,
          "--config",
          config,
          "--input-file",
          textPath,
          "--output-file",
          wavPath,
          "--length-scale",
          String(settings.length_scale),
          "--sentence-silence",
          "0.25",
        ];
        const result = await run(piper, argv);
        if (result.code !== 0) {
          const detail = (result.stderr || result.stdout).trim().split("\n").slice(-4).join("\n");
          throw new Error(`piper failed for ${locale}/${scene.id} (exit ${result.code}):\n${detail}\n\n${PIPER_INSTALL_HINT}`);
        }
      }

      const narration = wavDurationSeconds(wavPath);
      if (narration === null) {
        throw new Error(`${wavPath} is not a readable PCM WAV; piper may have failed silently`);
      }
      const duration = round2(narration + settings.tail_s);
      scenes.push({
        id: scene.id,
        file: sceneAudioRelativePath(episode.data.slug, locale, scene.id),
        narration_s: round2(narration),
        duration_s: duration,
      });
      total += duration;
      log(`  ${locale}/${scene.id}  ${narration.toFixed(2)}s speech -> ${duration.toFixed(2)}s slot`);
    }

    const localeAudio: AudioLocale = {
      voice: settings.voice,
      tail_s: settings.tail_s,
      scenes,
      total_s: round2(total),
    };
    manifest.locales[locale] = localeAudio;
    log(`${locale}: ${settings.voice} · ${scenes.length} scenes · ${formatClock(total)} narration`);
  }

  if (!options.dryRun) {
    await mkdir(path.dirname(audioManifestPath(episode.data.slug)), { recursive: true });
    await writeFile(audioManifestPath(episode.data.slug), `${JSON.stringify(manifest, null, 2)}\n`);
    log(`wrote ${audioManifestPath(episode.data.slug)}`);
  }

  return manifest;
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
