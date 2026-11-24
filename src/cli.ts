#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readAudioManifestSync } from "./audio";
import { checkEpisode, keywordOverlap, summarize } from "./compliance";
import { loadAllEpisodes, loadEpisode } from "./loader";
import { audioFor, buildLongPlan, buildManifest, buildShortPlans, stamp, type LongPlan, type ShortPlan } from "./plan";
import { LOCALES, type Locale } from "./schema";
import { synthesizeEpisode } from "./tts";

const OUT_DIR = "dist/plan";
const MIN_MASTER_S = 240;
const MAX_MASTER_S = 900;
const MAX_SHORT_S = 60;

type MatrixEntry = {
  slug: string;
  locale: Locale;
  kind: "long" | "short";
  id: string;
  composition: "LongForm" | "Short";
  props: string;
  output: string;
};

function args(argv: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token?.startsWith("--")) {
      const [key, inline] = token.slice(2).split("=");
      if (inline !== undefined) flags[key as string] = inline;
      else {
        const next = argv[index + 1];
        if (next && !next.startsWith("--")) {
          flags[key as string] = next;
          index += 1;
        } else flags[key as string] = "true";
      }
    } else if (token) positional.push(token);
  }
  return { positional, flags };
}

function parseLocales(value: string | undefined): Locale[] {
  if (!value || value === "all") return [...LOCALES];
  const wanted = value.split(",").map((part) => part.trim()) as Locale[];
  const invalid = wanted.filter((locale) => !LOCALES.includes(locale));
  if (invalid.length > 0) throw new Error(`unknown locale(s): ${invalid.join(", ")} (use id, en)`);
  return wanted;
}

async function commandValidate(): Promise<number> {
  const { episodes, failures } = await loadAllEpisodes();
  let errorCount = 0;
  let warnCount = 0;

  for (const failure of failures) {
    errorCount += 1;
    console.log(`\n✗ ${failure.file}`);
    for (const message of failure.errors) console.log(`   schema  ${message}`);
  }

  for (const episode of episodes) {
    const issues = checkEpisode(episode, episodes);
    const { errors, warnings } = summarize(issues);
    errorCount += errors;
    warnCount += warnings;
    const icon = errors > 0 ? "✗" : warnings > 0 ? "!" : "✓";
    console.log(`\n${icon} ${episode.data.slug}  (${errors} error, ${warnings} warn)`);
    for (const issue of issues) {
      console.log(`   ${issue.severity === "error" ? "ERROR" : "warn "} ${issue.rule}: ${issue.message}`);
    }
  }

  console.log(
    `\n${episodes.length} episode(s) checked — ${errorCount} error(s), ${warnCount} warning(s)${errorCount === 0 ? " · publishable" : ""}`,
  );
  return errorCount === 0 ? 0 : 1;
}

async function commandTts(slug: string | undefined, flags: Record<string, string>): Promise<number> {
  if (!slug)
    throw new Error("usage: tts <slug> [--locales id,en] [--piper path] [--voice-dir voices] [--force] [--dry-run]");
  const manifest = await synthesizeEpisode({
    slug,
    locales: parseLocales(flags.locales),
    piperCommand: flags.piper,
    voiceDir: flags["voice-dir"],
    force: flags.force === "true",
    dryRun: flags["dry-run"] === "true",
  });
  const total = Object.values(manifest.locales).reduce((sum, locale) => sum + (locale?.total_s ?? 0), 0);
  console.log(`\n${slug}: ${Object.keys(manifest.locales).join(" + ")} · ${total.toFixed(1)}s of narration generated`);
  return 0;
}

async function commandPlan(slug: string | undefined, flags: Record<string, string>): Promise<number> {
  if (!slug) throw new Error("usage: plan <slug> [--locales id,en]");
  const locales = parseLocales(flags.locales);
  const episode = await loadEpisode(slug);
  const issues = checkEpisode(episode, (await loadAllEpisodes()).episodes);
  if (summarize(issues).errors > 0) {
    console.error(`Refusing to plan "${slug}": compliance errors must be fixed first. Run: npm run validate`);
    return 1;
  }

  const audioManifest = readAudioManifestSync(slug);
  const built: { locale: Locale; long: LongPlan; shorts: ShortPlan[] }[] = [];

  // Build first, so nothing is written when the narration is incomplete.
  for (const locale of locales) {
    try {
      const audio = audioManifest?.locales[locale];
      built.push({
        locale,
        long: buildLongPlan(episode, locale, audio),
        shorts: buildShortPlans(episode, locale, audio),
      });
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
  }

  // Runtime gate: only knowable now that the audio exists.
  let blocking = false;
  for (const { locale, long, shorts } of built) {
    const tooShort = long.total_duration_s < MIN_MASTER_S;
    const tooLong = long.total_duration_s > MAX_MASTER_S;
    if (tooShort || tooLong) {
      const message = `${locale}: master is ${stamp(long.total_duration_s)} (${long.total_duration_s}s), target 4–15 min`;
      if (episode.data.status === "ready") {
        console.error(`ERROR duration: ${message}`);
        blocking = true;
      } else {
        console.warn(`! duration: ${message} — draft, not blocking`);
      }
    }
    for (const short of shorts) {
      if (short.total_duration_s > MAX_SHORT_S) {
        console.warn(
          `! ${locale}/${short.short_id}: ${short.total_duration_s}s of narration — over the 60s cap, cut a scene`,
        );
      }
    }
  }
  if (blocking) {
    console.error("Refusing to plan: fix the runtime first (add or cut scenes, then re-run tts).");
    return 1;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const written: string[] = [];
  const produced: { locale: Locale; kind: string; id: string; body: unknown; duration_s: number }[] = [];

  for (const { locale, long, shorts } of built) {
    const longFile = path.join(OUT_DIR, `${slug}.${locale}.long.json`);
    await writeFile(longFile, JSON.stringify(long, null, 2));
    written.push(longFile);
    produced.push({ locale, kind: "long", id: "long", body: long, duration_s: long.total_duration_s });

    const uploadFile = path.join(OUT_DIR, `${slug}.${locale}.upload.json`);
    await writeFile(uploadFile, JSON.stringify(long.meta, null, 2));
    written.push(uploadFile);

    for (const short of shorts) {
      const shortFile = path.join(OUT_DIR, `${slug}.${locale}.short-${short.short_id}.json`);
      await writeFile(shortFile, JSON.stringify(short, null, 2));
      written.push(shortFile);
      produced.push({ locale, kind: "short", id: short.short_id, body: short, duration_s: short.total_duration_s });
    }
  }

  const manifest = buildManifest(episode, produced);
  const manifestFile = path.join(OUT_DIR, `${slug}.manifest.json`);
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  written.push(manifestFile);

  for (const file of written) console.log(`wrote ${file}`);
  const summary = built.map(({ locale, long }) => `${locale} ${stamp(long.total_duration_s)}`).join(" · ");
  console.log(`\n${slug}: ${summary} · ${episode.data.shorts.length} short(s) per locale · timeline = narration only`);
  return 0;
}

async function commandDescribe(slug: string | undefined, flags: Record<string, string>): Promise<number> {
  if (!slug) throw new Error("usage: describe <slug> --locale en");
  const episode = await loadEpisode(slug);
  for (const locale of parseLocales(flags.locale ?? flags.locales)) {
    let plan: LongPlan;
    try {
      plan = buildLongPlan(episode, locale, audioFor(slug, locale));
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }
    console.log(`\n===== ${locale.toUpperCase()} · ${plan.meta.title} (${plan.meta.description.length} chars) =====\n`);
    console.log(plan.meta.description);
    console.log(`\nTags: ${plan.meta.tags.join(", ") || "(none)"}`);
    if (plan.meta.description.length > 5000) console.log("WARNING: description exceeds YouTube's 5000 character limit");
  }
  return 0;
}

async function commandMatrix(slug: string | undefined, flags: Record<string, string>): Promise<number> {
  if (!slug) throw new Error("usage: matrix <slug> [--locales id,en] [--github-output]");
  const locales = parseLocales(flags.locales);
  const episode = await loadEpisode(slug);
  const include: MatrixEntry[] = [];

  for (const locale of locales) {
    include.push({
      slug,
      locale,
      kind: "long",
      id: "long",
      composition: "LongForm",
      props: `${OUT_DIR}/${slug}.${locale}.long.json`,
      output: `out/${slug}.${locale}.long.mp4`,
    });
    for (const short of episode.data.shorts) {
      include.push({
        slug,
        locale,
        kind: "short",
        id: short.id,
        composition: "Short",
        props: `${OUT_DIR}/${slug}.${locale}.short-${short.id}.json`,
        output: `out/${slug}.${locale}.short-${short.id}.mp4`,
      });
    }
  }

  const payload = JSON.stringify({ include });
  if (flags["github-output"]) {
    console.log(`matrix=${payload}`);
    return 0;
  }
  console.log(payload);
  return 0;
}

async function commandTopic(flags: Record<string, string>): Promise<number> {
  const raw = flags.keywords;
  if (!raw) throw new Error('usage: topic --keywords "memory,spacing,recall"');
  const candidate = raw.split(",").map((word) => word.trim()).filter(Boolean);
  const { episodes } = await loadAllEpisodes();
  const scored = episodes
    .map((episode) => ({ slug: episode.data.slug, overlap: keywordOverlap(candidate, episode.data) }))
    .sort((a, b) => b.overlap - a.overlap);

  if (scored.length === 0) {
    console.log("No episodes yet — this topic is free.");
    return 0;
  }
  for (const row of scored) {
    const flag = row.overlap >= 0.6 ? "TOO CLOSE" : row.overlap >= 0.4 ? "related" : "ok";
    console.log(`${(row.overlap * 100).toFixed(0).padStart(3)}%  ${row.slug.padEnd(32)} ${flag}`);
  }
  return scored[0] && scored[0].overlap >= 0.6 ? 1 : 0;
}

async function main(): Promise<number> {
  const { positional, flags } = args(process.argv.slice(2));
  const [command, argument] = positional;

  switch (command) {
    case "validate":
      return commandValidate();
    case "tts":
      return commandTts(argument, flags);
    case "plan":
      return commandPlan(argument, flags);
    case "describe":
      return commandDescribe(argument, flags);
    case "matrix":
      return commandMatrix(argument, flags);
    case "topic":
      return commandTopic(flags);
    default:
      console.log(
        [
          "edu-video-compiler",
          "",
          "  validate                       check every episode against the compliance gates",
          "  tts <slug> [--locales id,en]   synthesise per-scene narration with Piper",
          "  plan <slug> [--locales id,en]  write render plans from the narration timeline",
          "  describe <slug> --locale en    print the YouTube description with chapters",
          "  matrix <slug> [--github-output] render matrix for GitHub Actions",
          '  topic --keywords "a,b,c"       test a new thesis against past episodes',
        ].join("\n"),
      );
      return command ? 1 : 0;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
  });
