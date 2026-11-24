export type Citation = { label: string; url: string };

export type PlannedScene = {
  id: string;
  purpose: string;
  start_s: number;
  duration_s: number;
  text: string;
  on_screen?: string;
  /** Scene bullets rendered instead of the full script text. */
  points?: string[];
  citations: Citation[];
  /** Narration track, relative to public/ — consumed by staticFile() in Remotion.
   *  The planner always sets it; it is optional only so the studio placeholder compiles. */
  audio?: string | null;
  /** Speech-only length, for reference in the upload checklist. */
  narration_s?: number;
};
