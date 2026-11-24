#!/usr/bin/env node
/**
 * A render host without any font draws no glyphs at all: the video looks like empty
 * backgrounds while every timing check still passes. So Remotion loads one font file
 * from public/fonts, and this script makes sure that file exists.
 *
 * It is not committed (48 KB of binary); the URL below is pinned to one build of Inter.
 */
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const URL = "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2";
const OUT = path.join("public", "fonts", "EduSans.woff2");
const MIN_BYTES = 20_000;

if (existsSync(OUT) && statSync(OUT).size >= MIN_BYTES) {
  console.log(`font ok: ${OUT} (${statSync(OUT).size} bytes)`);
  process.exit(0);
}

console.log(`fetching font -> ${OUT}`);
const response = await fetch(URL);
if (!response.ok) {
  console.error(`font download failed: HTTP ${response.status} from ${URL}`);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length < MIN_BYTES) {
  console.error(`font download looks wrong: ${bytes.length} bytes, expected at least ${MIN_BYTES}`);
  process.exit(1);
}
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, bytes);
console.log(`font ok: ${OUT} (${bytes.length} bytes)`);
