import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Neither the Actions runner nor a bare Linux box guarantees a system font, and a
 * Chromium without any font renders every glyph as nothing - a video of empty
 * backgrounds that still passes every timing check. So the font is fetched by
 * scripts/ensure-font.mjs into public/fonts and loaded here.
 *
 * One variable file (weight 100-900) keeps the checkout small.
 */
export const FONT_FAMILY = "EduSans";

if (typeof document !== "undefined") {
  const handle = delayRender("Loading EduSans");

  const style = document.createElement("style");
  style.textContent = `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;font-weight:100 900;font-display:block;src:url('${staticFile("fonts/EduSans.woff2")}') format('woff2');}`;
  document.head.appendChild(style);

  Promise.all([document.fonts.load(`400 48px ${FONT_FAMILY}`), document.fonts.load(`800 48px ${FONT_FAMILY}`)])
    .then(() => continueRender(handle))
    .catch((error: unknown) => {
      console.error("Could not load the bundled font", error);
      continueRender(handle);
    });
}
