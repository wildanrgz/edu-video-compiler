import { FONT_FAMILY } from "./fonts";

export const FPS = 30;

export const COLORS = {
  background: "#0B1020",
  surface: "#151D33",
  text: "#F5F7FA",
  muted: "#8A93AE",
  accent: "#FFD166",
  accentSoft: "#33405F",
};

/** The bundled font first: a render host without system fonts would otherwise draw nothing. */
export const FONT_STACK = `"${FONT_FAMILY}", "DejaVu Sans", "Liberation Sans", system-ui, sans-serif`;

/** Long scenes carry more text than a headline; shrink instead of clipping. */
export function typeScale(text: string, base: number): number {
  const length = text.length;
  if (length > 320) return base * 0.55;
  if (length > 240) return base * 0.66;
  if (length > 170) return base * 0.78;
  if (length > 120) return base * 0.9;
  return base;
}
