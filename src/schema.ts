import { z } from "zod";

/** The two output tracks. Same episode, two scripts, two sets of metadata. */
export const LOCALES = ["id", "en"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

const nonEmpty = z.string().trim().min(1);

/** Every human-facing string exists in Indonesian and English. */
export const localizedText = z.object({ id: nonEmpty, en: nonEmpty });
export type LocalizedText = z.infer<typeof localizedText>;

/** Topics where a synthetic presenter giving advice is not monetisable (YouTube). */
export const SENSITIVE_TOPICS = [
  "health",
  "medical",
  "medication",
  "mental_health",
  "finance",
  "investment",
  "legal",
  "politics",
  "safety",
] as const;
export type SensitiveTopic = (typeof SENSITIVE_TOPICS)[number];

export const ASSET_KINDS = [
  "own_footage",
  "own_screen_recording",
  "own_chart",
  "own_animation",
  "licensed_still",
  "public_domain_still",
] as const;

export const ASSET_LICENCES = ["own", "cc0", "cc_by", "purchased", "tiktok_commercial_library"] as const;

export const SCENE_PURPOSES = [
  "hook",
  "context",
  "explain",
  "evidence",
  "counterpoint",
  "takeaway",
  "cta",
] as const;

export const sourceSchema = z.object({
  title: z.string().trim().min(3),
  url: z.string().url(),
  published: z.string().trim().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

export const claimSchema = z.object({
  id: z.string().regex(/^c\d+$/, "claim id must look like c1, c2, ..."),
  text: localizedText,
  /** No claim survives without a citable source. */
  source: sourceSchema,
});
export type Claim = z.infer<typeof claimSchema>;

export const assetSchema = z.object({
  id: z.string().regex(/^a\d+$/, "asset id must look like a1, a2, ..."),
  kind: z.enum(ASSET_KINDS),
  /** Repo-relative path under episodes/<slug>/assets/ */
  path: z.string().trim().min(1),
  /** True when you filmed/drew/recorded it yourself. */
  own_work: z.boolean(),
  licence: z.enum(ASSET_LICENCES),
  source_url: z.string().url().optional(),
  credit: z.string().trim().optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const sceneSchema = z.object({
  id: z.string().regex(/^s\d+$/, "scene id must look like s1, s2, ..."),
  purpose: z.enum(SCENE_PURPOSES),
  /** No duration here on purpose: the timeline comes from the narration WAV. */
  script: localizedText,
  on_screen: localizedText.optional(),
  claim_ids: z.array(z.string()).default([]),
  asset_ids: z.array(z.string()).default([]),
});
export type Scene = z.infer<typeof sceneSchema>;

export const shortSchema = z.object({
  id: z.string().regex(/^sh\d+$/, "short id must look like sh1, sh2, ..."),
  /** The first 2 seconds. If this line does not earn the scroll-stop, nothing else matters. */
  hook: localizedText,
  /** Design intent only; the real length is whatever the narration takes. */
  target_seconds: z.number().min(15).max(60),
  scene_ids: z.array(z.string()).min(1),
  /** Related-video link set in YouTube Studio: turns a Short into a bridge. */
  related_video: z.boolean(),
  cta: localizedText.optional(),
});
export type Short = z.infer<typeof shortSchema>;

export const ttsVoiceSchema = z.object({
  /** Piper voice id, e.g. id_ID-news_tts-medium */
  voice: z.string().trim().min(3),
  /** 1.0 = the voice's default pace; lower = slower, more deliberate delivery */
  length_scale: z.number().min(0.6).max(1.6).default(0.95),
  /** Silence appended after each scene's narration, in seconds */
  tail_s: z.number().min(0).max(3).default(0.5),
});
export type TtsVoice = z.infer<typeof ttsVoiceSchema>;

/** Per-locale narration settings. Override in episode.yml when a topic needs a different read. */
export const ttsSchema = z
  .object({
    id: ttsVoiceSchema.optional(),
    en: ttsVoiceSchema.optional(),
  })
  .default({});
export type TtsConfig = z.infer<typeof ttsSchema>;

export const disclosureSchema = z.object({
  /** Altered or synthetic content, per YouTube's disclosure requirement. */
  aigc: z.boolean(),
  synthetic_voice: z.boolean(),
  /** Paid promotion / affiliate commission. */
  sponsored: z.boolean(),
});

export const episodeSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase-with-hyphens")
    .max(60),
  status: z.enum(["draft", "ready"]).default("draft"),
  title: localizedText,
  /** One sentence. The thing the whole episode proves. */
  thesis: localizedText,
  /** 4-8 keywords used to detect a near-duplicate thesis against past episodes. */
  thesis_keywords: z.array(z.string().trim().min(2)).min(3).max(12),
  audience: localizedText,
  presenter: z.enum(["human", "ai_avatar", "none"]),
  sensitive_topics: z.array(z.enum(SENSITIVE_TOPICS)).default([]),
  disclosure: disclosureSchema,
  /** Piper voice settings per locale; defaults live in src/tts.ts */
  tts: ttsSchema,
  assets: z.array(assetSchema).default([]),
  claims: z.array(claimSchema).min(1),
  scenes: z.array(sceneSchema).min(5),
  shorts: z.array(shortSchema).default([]),
  tags: z.object({ id: z.array(z.string()).default([]), en: z.array(z.string()).default([]) }),
});

export type Episode = z.infer<typeof episodeSchema>;

export type LoadedEpisode = {
  /** Path of the yaml relative to the repo root. */
  file: string;
  dir: string;
  data: Episode;
};
