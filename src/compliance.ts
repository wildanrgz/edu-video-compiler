import { existsSync } from "node:fs";
import path from "node:path";
import { fullScript, normalizeForHash } from "./loader";
import type { Episode, LoadedEpisode } from "./schema";

export type Severity = "error" | "warn";
export type Issue = { severity: Severity; rule: string; message: string };

const PLACEHOLDER_HOSTS = new Set(["example.com", "example.org", "example.net", "localhost", "127.0.0.1"]);

/** Same episode, both locales, everything a reviewer would check before publishing. */
export function checkEpisode(episode: LoadedEpisode, all: LoadedEpisode[]): Issue[] {
  const issues: Issue[] = [];
  const ep = episode.data;
  const push = (severity: Severity, rule: string, message: string) => issues.push({ severity, rule, message });

  // --- structure -----------------------------------------------------------
  // Runtime is not knowable until the narration exists, so the 4-15 minute gate
  // lives in `plan`, where the real audio lengths are known.
  if (ep.scenes[0]?.purpose !== "hook") {
    push("warn", "hook_first", "scene 1 should have purpose: hook");
  }
  if (!ep.scenes.some((scene) => scene.purpose === "evidence")) {
    push("warn", "no_evidence_scene", "no scene with purpose: evidence — the thesis is asserted, not shown");
  }

  // --- references ----------------------------------------------------------
  const claimIds = new Set(ep.claims.map((claim) => claim.id));
  const assetIds = new Set(ep.assets.map((asset) => asset.id));
  const sceneIds = new Set(ep.scenes.map((scene) => scene.id));

  for (const scene of ep.scenes) {
    for (const id of scene.claim_ids) {
      if (!claimIds.has(id)) push("error", "claim_ref", `${scene.id} references unknown claim ${id}`);
    }
    for (const id of scene.asset_ids) {
      if (!assetIds.has(id)) push("error", "asset_ref", `${scene.id} references unknown asset ${id}`);
    }
  }
  for (const short of ep.shorts) {
    for (const id of short.scene_ids) {
      if (!sceneIds.has(id)) push("error", "short_ref", `${short.id} references unknown scene ${id}`);
    }
  }

  const usedClaims = new Set(ep.scenes.flatMap((scene) => scene.claim_ids));
  for (const claim of ep.claims) {
    if (!usedClaims.has(claim.id)) push("warn", "claim_unused", `${claim.id} has a source but no scene says it aloud`);
  }

  // --- sources -------------------------------------------------------------
  for (const claim of ep.claims) {
    let host = "";
    try {
      host = new URL(claim.source.url).hostname;
    } catch {
      push("error", "claim_source_host", `${claim.id} source url is unparseable`);
    }
    if (PLACEHOLDER_HOSTS.has(host)) {
      push("error", "claim_source_placeholder", `${claim.id} cites a placeholder host (${host})`);
    }
    if (!claim.source.published) {
      push("warn", "claim_source_date", `${claim.id} source has no published date — harder to defend under review`);
    }
  }

  // --- originality ---------------------------------------------------------
  const originalAssets = ep.assets.filter((asset) => asset.own_work).length;
  if (originalAssets < 2) {
    push("error", "min_original_assets", `needs at least 2 own-work assets (has ${originalAssets}) to survive the inauthentic-content policy`);
  }
  for (const asset of ep.assets) {
    if (asset.licence === "tiktok_commercial_library") {
      push("error", "cml_asset", `${asset.id} uses a TikTok Commercial Music Library track; those may not be baked into an exported MP4`);
    }
    const absolute = path.join(episode.dir, asset.path);
    if (!existsSync(absolute)) {
      push("warn", "asset_missing", `${asset.id} file not found: ${asset.path}`);
    }
  }

  // --- disclosure & safety -------------------------------------------------
  if (ep.disclosure.synthetic_voice && !ep.disclosure.aigc) {
    push("error", "aigc_undisclosed", "synthetic_voice is true but disclosure.aigc is false");
  }
  if (ep.sensitive_topics.length > 0 && ep.presenter !== "human") {
    push(
      "error",
      "sensitive_needs_human",
      `sensitive topics (${ep.sensitive_topics.join(", ")}) need presenter: human — synthetic advice on these is not monetisable`,
    );
  }

  // --- bilingual integrity -------------------------------------------------
  for (const scene of ep.scenes) {
    if (normalizeForHash(scene.script.id) === normalizeForHash(scene.script.en)) {
      push("warn", "scene_untranslated", `${scene.id} has the same text in id and en — likely an unfinished translation`);
    }
  }
  for (const key of ["title", "thesis", "audience"] as const) {
    if (normalizeForHash(ep[key].id) === normalizeForHash(ep[key].en)) {
      push("warn", "field_untranslated", `${key} is identical in id and en`);
    }
  }

  // --- duplicate thesis against history ------------------------------------
  const keywords = new Set(ep.thesis_keywords.map((word) => word.toLowerCase()));
  for (const other of all) {
    if (other.data.slug === ep.slug) continue;
    const otherKeywords = new Set(other.data.thesis_keywords.map((word) => word.toLowerCase()));
    const jaccard = intersections(keywords, otherKeywords) / Math.max(1, unions(keywords, otherKeywords));
    if (jaccard >= 0.6) {
      push("error", "thesis_duplicate", `thesis keywords overlap ${Math.round(jaccard * 100)}% with "${other.data.slug}"`);
    }
  }

  for (const locale of ["id", "en"] as const) {
    const script = normalizeForHash(fullScript(ep, locale));
    for (const other of all) {
      if (other.data.slug === ep.slug) continue;
      if (normalizeForHash(fullScript(other.data, locale)) === script) {
        push("error", "script_duplicate", `${locale} script is identical to "${other.data.slug}"`);
      }
    }
  }

  // --- shorts --------------------------------------------------------------
  if (ep.shorts.length === 0) {
    push("warn", "no_shorts", "no Shorts defined — the episode gets no cheap topic test or bridge");
  }
  if (ep.status === "ready" && ep.shorts.length < 3) {
    push("warn", "few_shorts", `${ep.shorts.length} Shorts for a ready episode; 3 is the working number`);
  }
  for (const short of ep.shorts) {
    for (const locale of ["id", "en"] as const) {
      const hook = short.hook[locale];
      if (hook.length > 100) push("warn", "short_hook_long", `${short.id}.${locale} hook is ${hook.length} chars; keep it under 100`);
    }
    if (!short.related_video) {
      push("warn", "short_no_related", `${short.id} has no related-video link; conversion stays near the 0.04% baseline`);
    }
    if (!short.cta) {
      push("warn", "short_no_cta", `${short.id} has no verbal CTA to the long-form episode`);
    }
  }

  // --- metadata budget -----------------------------------------------------
  if (ep.tags.id.length > 15 || ep.tags.en.length > 15) {
    push("warn", "tags_many", "more than 15 tags adds no reach on YouTube");
  }

  return issues;
}

export function summarize(issues: Issue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warn").length,
  };
}

function intersections(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function unions(a: Set<string>, b: Set<string>): number {
  return a.size + b.size - intersections(a, b);
}

/** Used by `topic` to test a new idea before writing a whole episode. */
export function keywordOverlap(candidate: string[], existing: Episode): number {
  const a = new Set(candidate.map((word) => word.toLowerCase()));
  const b = new Set(existing.thesis_keywords.map((word) => word.toLowerCase()));
  return intersections(a, b) / Math.max(1, unions(a, b));
}
