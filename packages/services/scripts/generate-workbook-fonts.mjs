// Build-time only. Decompresses the Noto Sans WOFF2 source into raw TTF
// bytes and writes them, base64-encoded, into two committed .ts modules
// under src/artifact/internal/renderers/pdf/fonts/.
//
// Why decompressed, and why committed rather than read from node_modules at
// runtime:
//
// 1. pdf-lib's non-subset custom-font embedder mishandles WOFF2-sourced font
//    bytes: glyphs still draw at the correct position (drawing uses glyph
//    IDs directly), but the generated ToUnicode CMap is wrong, so text
//    extraction, copy-paste, search and accessibility all read back the
//    wrong characters (confirmed during the operational-workbooks spike:
//    "Problem-Interview-Guide.md" extracted as "Probl)m-I2t)rvi)w-G9id).md").
//    Decompressing to a genuine TTF before embedding produces byte-perfect
//    extraction. This must happen before embedFont is ever called, so it
//    cannot be deferred to request time without paying the decompression
//    cost on every workbook download.
// 2. apps/web's next.config.ts deliberately carries no
//    `outputFileTracingIncludes` (removed once no route read files off disk
//    at request time) — a font shipped as a loose file would silently not
//    exist in the standalone build. Baking the bytes into a .ts module
//    sidesteps that entirely: the font ships as ordinary source, traced and
//    bundled like any other import.
//
// `wawoff2` and `typeface-noto-sans` are devDependencies only, used here and
// nowhere else — neither is a runtime dependency of the renderer.
//
// Run with: pnpm --filter @ai-catalyst/services generate-workbook-fonts
// Re-run only if the font source changes; the output is checked in.
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import * as wawoff2 from "wawoff2";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../src/artifact/internal/renderers/pdf/fonts");

const FACES = [
  {
    name: "noto-sans-regular",
    exportName: "NOTO_SANS_REGULAR_TTF_BASE64",
    source: "typeface-noto-sans/files/noto-sans-latin-400.woff2",
  },
  {
    name: "noto-sans-bold",
    exportName: "NOTO_SANS_BOLD_TTF_BASE64",
    source: "typeface-noto-sans/files/noto-sans-latin-700.woff2",
  },
];

async function main() {
  for (const face of FACES) {
    const woff2Path = require.resolve(face.source);
    const woff2Bytes = readFileSync(woff2Path);
    const ttfBytes = Buffer.from(await wawoff2.decompress(woff2Bytes));
    const base64 = ttfBytes.toString("base64");

    const outPath = join(OUT_DIR, `${face.name}.ts`);
    const content = `// GENERATED FILE — do not hand-edit.
// Produced by packages/services/scripts/generate-workbook-fonts.mjs from
// ${face.source}, decompressed from WOFF2 to raw TTF at authoring time (see
// that script's header comment for why decompression cannot happen at
// request time). Re-run the script to regenerate after a font source change.
//
// OFL-licensed (Noto Sans, Google Fonts).
export const ${face.exportName} = "${base64}";
`;
    writeFileSync(outPath, content, "utf-8");
    console.log(
      `${face.name}: ${(woff2Bytes.length / 1024).toFixed(1)}KB woff2 -> ` +
        `${(ttfBytes.length / 1024).toFixed(1)}KB ttf -> ` +
        `${(content.length / 1024).toFixed(1)}KB module (${outPath})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
