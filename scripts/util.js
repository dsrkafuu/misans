import crypto from 'crypto';
import fs from 'fs';
/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */
import path from 'path';

import * as fontkit from 'fontkit';
import wawoff2 from 'wawoff2';

export const ROOT = path.resolve(__dirname, '..');

/** static weight names in canonical order */
export const WEIGHT_NAMES = [
  'Thin',
  'ExtraLight',
  'Light',
  'Normal',
  'Regular',
  'Medium',
  'Demibold',
  'Semibold',
  'Bold',
  'Heavy',
];

/**
 * css font-weight mapped from the weight name. MiSans font files carry
 * non-standard internal usWeightClass values (see WEIGHT_INTERNAL below), the
 * css declarations use the common web scale instead.
 */
export const WEIGHT_CSS = {
  Thin: 100,
  ExtraLight: 200,
  Light: 300,
  Normal: 350,
  Regular: 400,
  Medium: 500,
  Demibold: 600,
  Semibold: 650,
  Bold: 700,
  Heavy: 900,
};

/** internal usWeightClass of MiSans statics, only used for sanity warnings */
export const WEIGHT_INTERNAL = {
  Thin: 150,
  ExtraLight: 200,
  Light: 250,
  Normal: 305,
  Regular: 330,
  Medium: 380,
  Demibold: 450,
  Semibold: 520,
  Bold: 630,
  Heavy: 700,
};

/**
 * family configs. `dir` is the directory under raw/ (and lib/ unless `out` is
 * given), `prefix` is the source file base name, `cssFamily` is the
 * @font-face family name, VF faces use `${cssFamily} VF`. `ranges` points to
 * the official range snapshot used for subsetting.
 */
export const FAMILIES = [
  {
    dir: 'Normal',
    out: 'Normal',
    prefix: 'MiSans',
    cssFamily: 'MiSans',
    subset: true,
    ranges: 'sc',
  },
  { dir: 'TC', out: 'TC', prefix: 'MiSansTC', cssFamily: 'MiSansTC', subset: true, ranges: 'tc' },
  { dir: 'Latin', out: 'Latin', prefix: 'MiSansLatin', cssFamily: 'MiSansLatin', subset: false },
  {
    dir: 'Arabic UI',
    out: 'ArabicUI',
    prefix: 'MiSansArabicUI',
    cssFamily: 'MiSansArabicUI',
    subset: false,
  },
  {
    dir: 'Arabic',
    out: 'Arabic',
    prefix: 'MiSansArabic',
    cssFamily: 'MiSansArabic',
    subset: false,
  },
  {
    dir: 'Devanagari',
    out: 'Devanagari',
    prefix: 'MiSansDevanagari',
    cssFamily: 'MiSansDevanagari',
    subset: false,
  },
  {
    dir: 'Gurmukhi',
    out: 'Gurmukhi',
    prefix: 'MiSansGurmukhi',
    cssFamily: 'MiSansGurmukhi',
    subset: false,
  },
  { dir: 'Khmer', out: 'Khmer', prefix: 'MiSansKhmer', cssFamily: 'MiSansKhmer', subset: false },
  { dir: 'Lao', out: 'Lao', prefix: 'MiSansLao', cssFamily: 'MiSansLao', subset: false },
  {
    dir: 'Myanmar',
    out: 'Myanmar',
    prefix: 'MiSansMyanmar',
    cssFamily: 'MiSansMyanmar',
    subset: false,
  },
  { dir: 'Thai', out: 'Thai', prefix: 'MiSansThai', cssFamily: 'MiSansThai', subset: false },
  {
    dir: 'Tibetan',
    out: 'Tibetan',
    prefix: 'MiSansTibetan',
    cssFamily: 'MiSansTibetan',
    subset: false,
  },
];

/**
 * extract all unicode-range values from a css text, in document order
 * @param {string} css
 * @returns {string[]} whitespace-stripped range strings like "U+20,U+2013-2014,..."
 */
export function parseCssRanges(css) {
  const ranges = [];
  const re = /unicode-range\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(css))) {
    ranges.push(m[1].replace(/\s+/g, ''));
  }
  return ranges;
}

/**
 * expand a unicode-range string to a set of codepoints
 * @param {string} range
 * @returns {Set<number>}
 */
export function expandRange(range) {
  const cps = new Set();
  for (const item of range.split(',')) {
    const m = /^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/.exec(item);
    if (!m) {
      throw new Error(`invalid unicode-range item: ${item}`);
    }
    const start = parseInt(m[1], 16);
    const end = m[2] ? parseInt(m[2], 16) : start;
    for (let i = start; i <= end; i++) {
      cps.add(i);
    }
  }
  return cps;
}

/**
 * merge codepoints to a sorted unicode-range string
 * @param {Iterable<number>} cps
 * @returns {string}
 */
export function mergeRange(cps) {
  const sorted = [...new Set(cps)].sort((a, b) => a - b);
  const parts = [];
  let start = null;
  let prev = null;
  for (const cp of sorted) {
    if (start === null) {
      start = prev = cp;
    } else if (cp === prev + 1) {
      prev = cp;
    } else {
      parts.push(
        start === prev ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${prev.toString(16)}`,
      );
      start = prev = cp;
    }
  }
  if (start !== null) {
    parts.push(
      start === prev ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${prev.toString(16)}`,
    );
  }
  return parts.join(',');
}

/**
 * codepoints to subset text for subset-font (must be a string, surrogates are
 * not valid standalone codepoints)
 * @param {Iterable<number>} cps
 * @returns {string}
 */
export function cpsToText(cps) {
  let text = '';
  for (const cp of cps) {
    if (cp >= 0xd800 && cp <= 0xdfff) {
      continue;
    }
    text += String.fromCodePoint(cp);
  }
  return text;
}

/**
 * first 16 hex chars of the sha256 of a buffer (content addressing, mirrors
 * the official slice file naming)
 * @param {Buffer} buffer
 * @returns {string}
 */
export function hash16(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/**
 * read font metadata (cmap, weight, variation axes). woff2 buffers are
 * decompressed first as fontkit cannot read them directly.
 * @param {Buffer} buffer
 * @param {string} ext "ttf" | "woff2"
 * @returns {Promise<{cmap: Set<number>, weightClass: number | null, wght: {min: number, max: number, default: number} | null}>}
 */
export async function readFontMeta(buffer, ext) {
  let sfnt = buffer;
  if (ext === 'woff2') {
    sfnt = Buffer.from(await wawoff2.decompress(buffer));
  }
  const font = fontkit.create(sfnt);
  const cmap = new Set(font.characterSet);
  const weightClass = font['OS/2'] ? font['OS/2'].usWeightClass : null;
  let wght = null;
  try {
    const axes = font.variationAxes;
    if (axes && axes.wght) {
      wght = { min: axes.wght.min, max: axes.wght.max, default: axes.wght.default };
    }
  } catch {
    // static fonts have no fvar table
  }
  return { cmap, weightClass, wght };
}

/**
 * build one minified @font-face line
 * @param {object} opts
 * @param {string} opts.comment css comment id like "[0]" or "[-1]", empty for none
 * @param {string} opts.family
 * @param {string | number} opts.weight
 * @param {string} opts.src file name relative to the css file
 * @param {string} [opts.range] unicode-range value, omit when not sliced
 * @returns {string}
 */
export function faceLine({ comment, family, weight, src, range }) {
  let css = '';
  if (comment) {
    css += `/*${comment}*/`;
  }
  css += `@font-face{font-family:${family};font-style:normal;`;
  css += `font-weight:${weight};font-display:swap;`;
  css += `src: url('${src}') format('woff2');`;
  if (range) {
    css += `unicode-range:${range};`;
  }
  css += '}';
  return css;
}

/**
 * remove a directory and recreate it
 * @param {string} dir
 */
export function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}
