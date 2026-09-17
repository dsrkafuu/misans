/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */

import fs from 'fs';
import path from 'path';

import { ROOT, parseCssRanges, expandRange } from './util.js';

/** all weight tiers served by the official font service */
const WEIGHTS = [200, 300, 400, 450, 500, 600, 650, 700];
/** the canonical tier used for the range snapshot (ranges are weight-invariant) */
const CANONICAL_WEIGHT = 400;

const SERVICE_URL =
  'https://font.sec.miui.com/font/css?family=MiSans:<weights>:<subsets>&display=swap';
const HR_URL = 'https://hr.xiaomi.com/website/assets/fonts/global.css';

const TARGETS = [
  {
    id: 'sc',
    subsets: 'Chinese_Simplify,Latin',
    // MiSans VF css from hr.xiaomi.com covers the same sc+latin table
    crossSource: HR_URL,
  },
  {
    id: 'tc',
    subsets: 'Chinese_Traditional,Chinese_Simplify,Latin',
    // the hr css has no traditional table
    crossSource: null,
  },
];

/**
 * fetch a url with a small retry budget
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchText(url) {
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw new Error(`failed to fetch ${url}: ${lastErr}`);
}

/**
 * diff two slice tables, returns a human readable report (empty when equal)
 * @param {string[]} a
 * @param {string[]} b
 * @param {string} aName
 * @param {string} bName
 * @param {number} maxLines
 * @returns {string}
 */
function diffSlices(a, b, aName, bName, maxLines = 8) {
  const lines = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) {
      continue;
    }
    const setA = a[i] !== undefined ? expandRange(a[i]) : new Set();
    const setB = b[i] !== undefined ? expandRange(b[i]) : new Set();
    if (setA.size === setB.size && [...setA].every((cp) => setB.has(cp))) {
      continue; // same codepoints, different range formatting
    }
    lines.push(
      `slice [${i}] differs: ${aName}=${a[i] ? a[i].slice(0, 120) : 'missing'} | ` +
        `${bName}=${b[i] ? b[i].slice(0, 120) : 'missing'}`,
    );
    if (lines.length >= maxLines) {
      lines.push(`...(more diffs omitted)`);
      break;
    }
  }
  return lines.join('\n');
}

async function main() {
  for (const target of TARGETS) {
    console.log(`Fetching official ranges for "${target.id}" (${target.subsets})...`);

    // one request per weight tier
    const tables = new Map(); // weight -> slices
    for (const weight of WEIGHTS) {
      const url = SERVICE_URL.replace('<weights>', String(weight)).replace(
        '<subsets>',
        target.subsets,
      );
      const css = await fetchText(url);
      const slices = parseCssRanges(css);
      if (slices.length === 0) {
        throw new Error(`no unicode-range found for weight ${weight} (${target.id})`);
      }
      tables.set(weight, slices);
      console.log(`  weight ${weight}: ${slices.length} slices`);
    }

    // verification 1: ranges must be identical across all weight tiers
    const canonical = tables.get(CANONICAL_WEIGHT);
    let weightsIdentical = true;
    for (const [weight, slices] of tables) {
      if (weight === CANONICAL_WEIGHT) {
        continue;
      }
      const diff = diffSlices(canonical, slices, `weight ${CANONICAL_WEIGHT}`, `weight ${weight}`);
      if (diff) {
        weightsIdentical = false;
        console.error(`Weight verification failed for "${target.id}" (weight ${weight}):`);
        console.error(diff);
      }
    }
    if (!weightsIdentical) {
      throw new Error(
        `official ranges differ across weights for "${target.id}", snapshot not updated`,
      );
    }

    // verification 2: compare against the second official source when available
    let crossSource = null;
    if (target.crossSource) {
      const hrSlices = parseCssRanges(await fetchText(target.crossSource));
      const diff = diffSlices(canonical, hrSlices, 'font.sec.miui.com', 'hr.xiaomi.com');
      // count formatting-only diffs separately (same codepoints, different range items)
      let formatDiff = 0;
      for (let i = 0; i < Math.max(canonical.length, hrSlices.length); i++) {
        if (canonical[i] === hrSlices[i]) {
          continue;
        }
        const setA = canonical[i] !== undefined ? expandRange(canonical[i]) : new Set();
        const setB = hrSlices[i] !== undefined ? expandRange(hrSlices[i]) : new Set();
        if (setA.size === setB.size && [...setA].every((cp) => setB.has(cp))) {
          formatDiff++;
        }
      }
      if (diff) {
        console.error(`Cross-source verification failed for "${target.id}":`);
        console.error(diff);
        throw new Error(`official range sources disagree for "${target.id}", snapshot not updated`);
      }
      crossSource = { source: 'hr.xiaomi.com', url: target.crossSource, identical: true };
      console.log(
        `  cross-source check: identical to hr.xiaomi.com (${hrSlices.length} slices` +
          (formatDiff ? `, ${formatDiff} formatting-only diffs` : '') +
          ')',
      );
    }

    const snapshot = {
      fetchedAt: new Date().toISOString(),
      canonical: {
        source: 'font.sec.miui.com',
        weight: CANONICAL_WEIGHT,
        url: SERVICE_URL.replace('<weights>', String(CANONICAL_WEIGHT)).replace(
          '<subsets>',
          target.subsets,
        ),
      },
      crossSource,
      verification: {
        weightsChecked: WEIGHTS,
        weightsIdentical: true,
        sourceDiff: 0,
      },
      slices: canonical.map((range, index) => ({ index, range })),
    };
    const outFile = path.resolve(ROOT, `raw/ranges-${target.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
    console.log(`  snapshot written: ${outFile} (${snapshot.slices.length} slices)`);
  }
  console.log('Done for official range snapshots');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
