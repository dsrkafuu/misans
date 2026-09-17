import fs from 'fs';
/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */
import path from 'path';

import {
  ROOT,
  FAMILIES,
  WEIGHT_NAMES,
  WEIGHT_CSS,
  expandRange,
  hash16,
  readFontMeta,
} from './util.js';

const FACE_RE =
  /^(?:\/\*\[(-?\d+)\]\*\/)?@font-face\{font-family:([^;]+);font-style:normal;font-weight:([^;]+);font-display:swap;src: url\('([^']+)'\) format\('woff2'\);(?:unicode-range:([^;]+);)?\}$/;

let failures = 0;

/**
 * @param {string} message
 */
function fail(message) {
  failures++;
  console.error(`  ✗ ${message}`);
}

/**
 * @param {string} message
 */
function info(message) {
  console.log(`  · ${message}`);
}

/**
 * parse one generated min.css file
 * @param {string} file
 */
function parseCss(file) {
  const faces = [];
  const text = fs.readFileSync(file, 'utf-8');
  for (const line of text.split('\n')) {
    const m = FACE_RE.exec(line);
    if (!m) {
      fail(`${path.basename(file)}: unparsable face line: ${line.slice(0, 100)}`);
      continue;
    }
    faces.push({
      comment: m[1] || null,
      family: m[2],
      weight: m[3],
      src: m[4],
      range: m[5] || null,
    });
  }
  return faces;
}

async function main() {
  const started = Date.now();
  const grandTotal = { files: 0, bytes: 0 };

  // subset determinism spot check: same input subset twice must hash identical
  {
    const { default: subsetFont } = await import('subset-font');
    const snapshot = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'raw/ranges-sc.json'), 'utf-8'));
    const vf = fs.readFileSync(path.resolve(ROOT, 'raw/Normal/MiSansVF.ttf'));
    const cps = [...expandRange(snapshot.slices[0].range)];
    const text = String.fromCodePoint(...cps);
    const a = await subsetFont(vf, text, { targetFormat: 'woff2' });
    const b = await subsetFont(vf, text, { targetFormat: 'woff2' });
    if (hash16(a) === hash16(b)) {
      info(`determinism: subset output hashes identical (${hash16(a)})`);
    } else {
      fail(`subset output not deterministic: ${hash16(a)} != ${hash16(b)}`);
    }
  }

  for (const family of FAMILIES) {
    const libDir = path.resolve(ROOT, 'lib', family.out);
    if (!fs.existsSync(libDir)) {
      fail(`${family.out}: lib directory missing`);
      continue;
    }
    console.log(`Checking lib/${family.out}...`);

    const onDisk = new Set(fs.readdirSync(libDir));
    const referenced = new Set();
    const sliceIdSets = new Map(); // css basename -> set of slice comments (subset families)
    let familyBytes = 0;

    // expected css files
    const expectedCss = new Set([`${family.prefix}VF.min.css`]);
    for (const weightName of WEIGHT_NAMES) {
      expectedCss.add(`${family.prefix}-${weightName}.min.css`);
    }
    for (const css of expectedCss) {
      if (!onDisk.has(css)) {
        fail(`${family.out}: missing ${css}`);
      }
    }

    // VF weight range must match the fvar axis
    {
      const vfSrc = ['ttf', 'woff2']
        .map((ext) => path.resolve(ROOT, 'raw', family.dir, `${family.prefix}VF.${ext}`))
        .find((p) => fs.existsSync(p));
      const meta = await readFontMeta(fs.readFileSync(vfSrc), path.extname(vfSrc).slice(1));
      const expected = `${meta.wght.min} ${meta.wght.max}`;
      const vfFaces = parseCss(path.join(libDir, `${family.prefix}VF.min.css`));
      for (const face of vfFaces) {
        if (face.weight !== expected) {
          fail(`${family.prefix}VF.min.css: font-weight ${face.weight} != fvar axis ${expected}`);
        }
        if (face.family !== `${family.cssFamily} VF`) {
          fail(
            `${family.prefix}VF.min.css: font-family ${face.family} != "${family.cssFamily} VF"`,
          );
        }
      }
    }

    for (const css of [...expectedCss].filter((c) => onDisk.has(c))) {
      const faces = parseCss(path.join(libDir, css));
      // "MiSansVF.min.css" -> "VF", "MiSans-Regular.min.css" -> "Regular"
      let weightName = css.slice(family.prefix.length, -'.min.css'.length);
      if (weightName.startsWith('-')) {
        weightName = weightName.slice(1);
      }
      const isVf = weightName === 'VF';
      const sliceIds = new Set();

      for (const face of faces) {
        const file = path.join(libDir, face.src);
        referenced.add(face.src);
        if (!fs.existsSync(file)) {
          fail(`${css}: referenced file missing: ${face.src}`);
          continue;
        }
        familyBytes += fs.statSync(file).size;

        // woff2 magic
        const magic = Buffer.from(fs.readFileSync(file).subarray(0, 4)).toString();
        if (magic !== 'wOF2') {
          fail(`${face.src}: bad magic "${magic}"`);
          continue;
        }

        // statics declare the standard css weight, VF slices declare the fvar range
        const expectedFamily = isVf ? `${family.cssFamily} VF` : family.cssFamily;
        if (face.family !== expectedFamily) {
          fail(`${css}: font-family ${face.family} != ${expectedFamily}`);
        }
        if (!isVf && face.weight !== String(WEIGHT_CSS[weightName])) {
          fail(`${css}: font-weight ${face.weight} != ${WEIGHT_CSS[weightName]}`);
        }

        // slice reconciliation: css range must be fully covered by the subset's cmap
        if (face.range) {
          if (!face.comment) {
            fail(`${css}: ranged face without slice comment`);
          } else {
            sliceIds.add(face.comment);
          }
          const expected = expandRange(face.range);
          const meta = await readFontMeta(fs.readFileSync(file), 'woff2');
          const missing = [...expected].filter((cp) => !meta.cmap.has(cp));
          if (missing.length > 0) {
            fail(
              `${face.src}: ${missing.length} codepoint(s) declared in css but missing from subset cmap ` +
                `(e.g. U+${missing[0].toString(16)})`,
            );
          }
          // hb-subset maps U+FFFF (and sometimes U+0000) to the .notdef glyph
          const extras = [...meta.cmap].filter(
            (cp) => !expected.has(cp) && cp !== 0xffff && cp !== 0,
          );
          if (extras.length > 0) {
            info(
              `${face.src}: subset cmap has ${extras.length} extra glyph mapping(s) ` +
                `(e.g. U+${extras[0].toString(16)})`,
            );
          }
        } else if (face.comment) {
          fail(`${css}: slice comment without unicode-range`);
        } else if (family.subset && !isVf) {
          fail(`${css}: static face of a subset family must be sliced`);
        }
      }

      if (family.subset) {
        sliceIdSets.set(css, sliceIds);
      }
    }

    // slice ids must be consistent across all css of a subset family (same cmap)
    if (family.subset && sliceIdSets.size > 0) {
      const base = sliceIdSets.get(`${family.prefix}VF.min.css`);
      for (const [css, ids] of sliceIdSets) {
        if (ids.size !== base.size || [...ids].some((id) => !base.has(id))) {
          fail(`${css}: slice set differs from VF css (${ids.size} vs ${base.size} slices)`);
        }
      }
      const official = base ? [...base].filter((id) => !id.startsWith('-')).length : 0;
      info(`${family.out}: ${base ? base.size : 0} slices per weight (${official} official)`);
    }

    // orphans: files on disk that no css references
    for (const file of onDisk) {
      if (!file.endsWith('.min.css') && !referenced.has(file)) {
        fail(`${family.out}: orphan file not referenced by any css: ${file}`);
      }
    }

    const fileCount = fs.readdirSync(libDir).length;
    grandTotal.files += fileCount;
    grandTotal.bytes += familyBytes;
    console.log(
      `  ${family.out}: ${fileCount} files, ${(familyBytes / 1024 / 1024).toFixed(1)} MiB font data`,
    );
  }

  console.log(
    failures === 0
      ? `All checks passed in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
          `(${grandTotal.files} files, ${(grandTotal.bytes / 1024 / 1024).toFixed(1)} MiB font data)`
      : `${failures} check(s) failed`,
  );
  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
