/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */

import fs from 'fs';
import path from 'path';

import {
  ROOT,
  FAMILIES,
  WEIGHT_NAMES,
  WEIGHT_CSS,
  WEIGHT_INTERNAL,
  expandRange,
  mergeRange,
  cpsToText,
  hash16,
  readFontMeta,
  faceLine,
  emptyDir,
} from './util.js';

/** codepoints per custom (out-of-table) slice */
const CUSTOM_SLICE_SIZE = 200;
/** the official range snapshots loaded from raw/ */
const SNAPSHOTS = { sc: 'raw/ranges-sc.json', tc: 'raw/ranges-tc.json' };

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// ---------- subset worker pool ----------

/**
 * run subset-font tasks on a pool of workers (harfbuzzjs is cpu bound wasm),
 * falls back to in-thread execution when workers are unavailable
 * @param {number} size
 * @returns {Promise<{run: (buffer: Buffer, text: string) => Promise<Buffer>, destroy: () => Promise<void>}>}
 */
async function createPool(size) {
  let subsetFont;
  try {
    // Bun's global Worker (Web Worker semantics) — node:worker_threads Worker
    // lacks addEventListener, and Buffers serialize as plain arrays across the
    // structured clone boundary, so exact-size ArrayBuffers are transferred instead
    const workers = [];
    for (let i = 0; i < size; i++) {
      workers.push({
        worker: new Worker(new URL('./subset-worker.js', import.meta.url)),
        busy: false,
        pending: null,
      });
    }
    const queue = [];
    let nextId = 1;
    const pump = () => {
      for (const w of workers) {
        if (w.busy || queue.length === 0) {
          continue;
        }
        const task = queue.shift();
        w.busy = true;
        w.pending = task;
        w.worker.postMessage({ id: task.id, arrayBuffer: task.arrayBuffer, text: task.text }, [
          task.arrayBuffer,
        ]);
      }
    };
    for (const w of workers) {
      w.worker.addEventListener('message', (e) => {
        const task = w.pending;
        w.busy = false;
        w.pending = null;
        const { ok, data, error } = e.data;
        if (ok) {
          task.resolve(Buffer.from(data));
        } else {
          task.reject(new Error(error));
        }
        pump();
      });
      w.worker.addEventListener('error', (e) => {
        const task = w.pending;
        w.busy = false;
        w.pending = null;
        if (task) {
          task.reject(new Error(e.message || 'subset worker error'));
        }
        pump();
      });
    }
    return {
      run(buffer, text) {
        return new Promise((resolve, reject) => {
          const arrayBuffer = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          );
          queue.push({ id: nextId++, arrayBuffer, text, resolve, reject });
          pump();
        });
      },
      async destroy() {
        for (const w of workers) {
          w.worker.terminate();
        }
      },
    };
  } catch {
    console.warn('worker pool unavailable, falling back to in-thread subsetting');
    ({ default: subsetFont } = await import('subset-font'));
    return {
      run: (buffer, text) => subsetFont(buffer, text, { targetFormat: 'woff2' }),
      async destroy() {},
    };
  }
}

// ---------- subset css ----------

/**
 * slice a font by the official ranges (filtered by its cmap, each codepoint
 * only assigned to its first slice) plus optional custom slices for
 * out-of-table codepoints, subset and emit all slice files & css lines
 * @param {object} opts
 * @returns {Promise<{lines: string[], unprocessed: Set<number>}>}
 */
async function buildSubsetCss(opts) {
  const { pool, libDir, config, baseName, buffer, meta, officialSlices, cssFamily, weight } = opts;

  const assigned = new Set();
  const slices = [];
  for (const { index, range } of officialSlices) {
    const cps = [];
    for (const cp of expandRange(range)) {
      if (meta.cmap.has(cp) && !assigned.has(cp)) {
        cps.push(cp);
        assigned.add(cp);
      }
    }
    if (cps.length > 0) {
      slices.push({ index, cps });
    }
  }

  // codepoints supported by the font but missing from the official table
  const unprocessed = new Set();
  for (const cp of meta.cmap) {
    if (!assigned.has(cp)) {
      unprocessed.add(cp);
    }
  }
  if (config.extendSlices || (config.customUnicodes && config.customUnicodes.length > 0)) {
    const pool_ = new Set(unprocessed);
    for (const u of config.customUnicodes || []) {
      pool_.add(parseInt(/^U\+/i.test(u) ? u.slice(2) : u, 16));
    }
    const arr = [...pool_].sort((a, b) => a - b);
    const chunks = [];
    for (let i = 0; i < arr.length; i += CUSTOM_SLICE_SIZE) {
      chunks.push(arr.slice(i, i + CUSTOM_SLICE_SIZE));
    }
    // merge a small tail chunk into the previous one
    if (chunks.length > 1 && chunks[chunks.length - 1].length < CUSTOM_SLICE_SIZE / 2) {
      chunks[chunks.length - 2] = chunks[chunks.length - 2].concat(chunks.pop());
    }
    chunks.forEach((cps, i) => slices.push({ index: -(i + 1), cps }));
  }

  // run all slice subsets in parallel through the pool
  const results = await Promise.all(
    slices.map((s) => pool.run(buffer, cpsToText(s.cps)).then((out) => ({ s, out }))),
  );
  const lines = results.map(({ s, out }) => {
    const file = `${baseName}.${hash16(out)}.${s.index}.woff2`;
    fs.writeFileSync(path.join(libDir, file), out);
    return faceLine({
      comment: `[${s.index}]`,
      family: cssFamily,
      weight,
      src: file,
      range: mergeRange(s.cps),
    });
  });
  return { lines, unprocessed };
}

// ---------- family build ----------

/**
 * build one family: VF + 10 statics, subset or full
 * @returns {Promise<{stats: {woff2: number, css: number, bytes: number}, unprocessed: Set<number>}>}
 */
async function buildFamily(family, pool, config, snapshot) {
  const libDir = path.resolve(ROOT, 'lib', family.out);
  emptyDir(libDir);
  const rawDir = path.resolve(ROOT, 'raw', family.dir);
  const stats = { woff2: 0, css: 0, bytes: 0 };
  const unprocessed = new Set();
  console.log(`Building ${family.dir} -> lib/${family.out}...`);

  // variable font
  const vfName = `${family.prefix}VF`;
  const vfSrc = ['ttf', 'woff2']
    .map((ext) => path.join(rawDir, `${vfName}.${ext}`))
    .find((p) => fs.existsSync(p));
  if (!vfSrc) {
    throw new Error(`VF source not found for family "${family.dir}"`);
  }
  const vfExt = path.extname(vfSrc).slice(1);
  const vfBuffer = fs.readFileSync(vfSrc);
  const vfMeta = await readFontMeta(vfBuffer, vfExt);
  if (!vfMeta.wght) {
    throw new Error(`no wght variation axis found in ${vfSrc}`);
  }
  const vfWeight = `${vfMeta.wght.min} ${vfMeta.wght.max}`;
  const vfFamily = `${family.cssFamily} VF`;
  if (family.subset) {
    const { lines, unprocessed: un } = await buildSubsetCss({
      pool,
      libDir,
      config,
      baseName: vfName,
      buffer: vfBuffer,
      meta: vfMeta,
      officialSlices: snapshot.slices,
      cssFamily: vfFamily,
      weight: vfWeight,
    });
    un.forEach((cp) => unprocessed.add(cp));
    stats.woff2 += lines.length;
    fs.writeFileSync(path.join(libDir, `${vfName}.min.css`), lines.join('\n'), 'utf-8');
  } else {
    // full VF: convert ttf sources to woff2, copy woff2 sources as-is
    const out = vfExt === 'woff2' ? vfBuffer : await pool.run(vfBuffer, cpsToText(vfMeta.cmap));
    const file = `${vfName}.woff2`;
    fs.writeFileSync(path.join(libDir, file), out);
    stats.woff2++;
    stats.bytes += out.length;
    fs.writeFileSync(
      path.join(libDir, `${vfName}.min.css`),
      faceLine({ comment: '', family: vfFamily, weight: vfWeight, src: file }),
      'utf-8',
    );
  }
  stats.css++;
  console.log(`  VF: ${vfSrc.split(/[\\/]/).pop()} (wght ${vfWeight})`);

  // static fonts
  for (const weightName of WEIGHT_NAMES) {
    const baseName = `${family.prefix}-${weightName}`;
    const src = path.join(rawDir, 'woff2', `${baseName}.woff2`);
    if (!fs.existsSync(src)) {
      throw new Error(`static source not found: ${src}`);
    }
    const buffer = fs.readFileSync(src);
    const meta = await readFontMeta(buffer, 'woff2');
    if (family.subset && meta.weightClass !== WEIGHT_INTERNAL[weightName]) {
      console.warn(
        `  ! ${baseName}: internal usWeightClass ${meta.weightClass} != expected ` +
          `${WEIGHT_INTERNAL[weightName]} (css uses ${WEIGHT_CSS[weightName]})`,
      );
    }
    if (family.subset) {
      const { lines, unprocessed: un } = await buildSubsetCss({
        pool,
        libDir,
        config,
        baseName,
        buffer,
        meta,
        officialSlices: snapshot.slices,
        cssFamily: family.cssFamily,
        weight: WEIGHT_CSS[weightName],
      });
      un.forEach((cp) => unprocessed.add(cp));
      stats.woff2 += lines.length;
      fs.writeFileSync(path.join(libDir, `${baseName}.min.css`), lines.join('\n'), 'utf-8');
    } else {
      const file = `${baseName}.woff2`;
      fs.writeFileSync(path.join(libDir, file), buffer);
      stats.woff2++;
      stats.bytes += buffer.length;
      fs.writeFileSync(
        path.join(libDir, `${baseName}.min.css`),
        faceLine({
          comment: '',
          family: family.cssFamily,
          weight: WEIGHT_CSS[weightName],
          src: file,
        }),
        'utf-8',
      );
    }
    stats.css++;
  }
  console.log(
    `  done: ${stats.css} css, ${stats.woff2} woff2 (${(stats.bytes / 1024 / 1024).toFixed(1)} MiB non-slice)`,
  );
  return { stats, unprocessed };
}

async function main() {
  const started = Date.now();
  const config = readJSON(path.resolve(ROOT, 'config.json'));
  const snapshots = {};
  for (const key of Object.keys(SNAPSHOTS)) {
    const file = path.resolve(ROOT, SNAPSHOTS[key]);
    if (!fs.existsSync(file)) {
      throw new Error(`range snapshot missing: ${file} (run "bun run fetch" first)`);
    }
    snapshots[key] = readJSON(file);
  }

  emptyDir(path.resolve(ROOT, 'lib'));
  const pool = await createPool(Math.min(8, navigator.hardwareConcurrency || 4));
  const reports = [];
  try {
    for (const family of FAMILIES) {
      const { stats, unprocessed } = await buildFamily(
        family,
        pool,
        config,
        family.subset ? snapshots[family.ranges] : null,
      );
      reports.push({ family, stats, unprocessed });
    }
  } finally {
    await pool.destroy();
  }

  // out-of-table codepoint reports (per subset family)
  for (const { family, unprocessed } of reports) {
    if (!family.subset) {
      continue;
    }
    const sorted = [...unprocessed].sort((a, b) => a - b);
    const file = path.resolve(
      ROOT,
      `raw/ranges-unprocessed${family.ranges === 'tc' ? '_tc' : ''}.json`,
    );
    fs.writeFileSync(
      file,
      JSON.stringify(
        sorted.map((cp) => `U+${cp.toString(16)}`),
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    console.log(
      `${family.dir}: ${sorted.length} out-of-table codepoints -> ${path.basename(file)}`,
    );
  }

  const totals = reports.reduce(
    (acc, { stats }) => ({
      woff2: acc.woff2 + stats.woff2,
      css: acc.css + stats.css,
      bytes: acc.bytes + stats.bytes,
    }),
    { woff2: 0, css: 0, bytes: 0 },
  );
  console.log(
    `Done for ${reports.length} families in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
      `${totals.woff2} woff2, ${totals.css} css`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
