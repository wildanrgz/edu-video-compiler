import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { episodeSchema, type Episode, type LoadedEpisode } from "./schema";

export const EPISODES_DIR = "episodes";

export type LoadFailure = { file: string; errors: string[] };

function formatZodError(error: unknown): string[] {
  const issues = (error as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
  return issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`);
}

/** Reads `episodes/<slug>/episode.yml`. Structural failures are returned, not thrown. */
export async function loadEpisodeFile(file: string, dir: string): Promise<{ episode?: LoadedEpisode; failure?: LoadFailure }> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { failure: { file, errors: [`file not found: ${file}`] } };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    return { failure: { file, errors: [`invalid YAML: ${(error as Error).message}`] } };
  }

  const result = episodeSchema.safeParse(parsed);
  if (!result.success) {
    return { failure: { file, errors: formatZodError(result.error) } };
  }

  return { episode: { file, dir, data: result.data as Episode } };
}

export async function loadAllEpisodes(root = EPISODES_DIR): Promise<{ episodes: LoadedEpisode[]; failures: LoadFailure[] }> {
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return { episodes: [], failures: [{ file: root, errors: [`episodes directory missing: ${root}`] }] };
  }

  const episodes: LoadedEpisode[] = [];
  const failures: LoadFailure[] = [];

  for (const entry of entries.sort()) {
    const dir = path.join(root, entry);
    const file = path.join(dir, "episode.yml");
    const { episode, failure } = await loadEpisodeFile(file, dir);
    if (episode) episodes.push(episode);
    if (failure) failures.push(failure);
  }

  return { episodes, failures };
}

export async function loadEpisode(slug: string, root = EPISODES_DIR): Promise<LoadedEpisode> {
  const dir = path.join(root, slug);
  const file = path.join(dir, "episode.yml");
  const { episode, failure } = await loadEpisodeFile(file, dir);
  if (!episode) {
    throw new Error(`Cannot load episode "${slug}":\n  - ${failure?.errors.join("\n  - ")}`);
  }
  return episode;
}

/** Everything a viewer will actually hear, per locale, in one string. */
export function fullScript(episode: Episode, locale: "id" | "en"): string {
  return episode.scenes.map((scene) => scene.script[locale]).join("\n");
}

export function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
