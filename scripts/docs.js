/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */

import fs from 'fs';
import path from 'path';

import { minify } from 'html-minifier-terser';

import { ROOT } from './util.js';

/** jsDelivr base of the published package, GitHub Pages serves docs/ only */
const CDN = 'https://cdn.jsdelivr.net/npm/misans@5.0.0';

async function main() {
  const source = fs.readFileSync(path.resolve(ROOT, 'demo.html'), 'utf-8');

  // the source demo links fonts locally (for `bun run serve` debugging), the
  // deployed page links them at jsDelivr
  const deployed = source.replace(/(<link[^>]*?href=")lib\//g, `$1${CDN}/lib/`);
  const minified = await minify(deployed, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
  });

  fs.writeFileSync(path.resolve(ROOT, 'docs/index.html'), minified, 'utf-8');
  console.log(`docs/index.html generated (${(minified.length / 1024).toFixed(1)} KiB minified)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
