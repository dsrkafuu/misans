/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */
import path from 'path';
import crypto from 'crypto';
import fse from 'fs-extra';
import * as glob from 'glob';
import childProcess from 'child_process';

const config = fse.readJSONSync(path.resolve(__dirname, '../config.json'));
// output of `fetch.js` script
const ranges = fse.readJSONSync(path.resolve(__dirname, '../raw/ranges.json'));
const ranges_tc = fse.readJSONSync(path.resolve(__dirname, '../raw/ranges_tc.json'));

/**
 * get all supported unicodes of a font file
 * @returns {Promise<Set<string>>}
 */
async function getSupportedUnicodeSet(file) {
  // get cmap ttx with fonttools
  const ttxFile = file.replace(/\.ttf$/, '.ttx');
  console.log(`Extracting TTX to ${ttxFile}...`);
  childProcess.execSync(`fonttools ttx -t cmap -t OS/2 -o ${ttxFile} ${file}`);
  const ttxMeta = fse.readFileSync(ttxFile, 'utf-8');

  // get font weight
  let exp = /<usWeightClass +value="([^"]+)"/g;
  let expr = exp.exec(ttxMeta);
  const weightClass = +expr[1] || 0;

  // match unicodes
  const unicodeSet = new Set();
  exp = /<map +code="([^"]+)"/g;
  expr = exp.exec(ttxMeta);
  while (expr && expr[1]) {
    const str = expr[1];
    const unicode = str.toLowerCase().replace(/^0x/, 'U+');
    unicodeSet.add(unicode);
    expr = exp.exec(ttxMeta);
  }

  // remove ttx file
  fse.unlinkSync(ttxFile);
  return [unicodeSet, weightClass];
}

/**
 * get hash of a font file
 * @param {string} file
 * @returns {string}
 */
function getHash(file) {
  const hasher = crypto.createHash('sha1');
  hasher.update(fse.readFileSync(file));
  return hasher.digest('hex');
}

/**
 * unicode (hex) to number
 * @param {string} u
 * @returns {number}
 */
function u2n(u) {
  return Number.parseInt(/U\+([0-9A-F]+)/i.exec(u)[1], 16);
}

/**
 * merge sequential unicodes for css
 * @param {string[]} unicodes
 * @returns {string}
 */
function mergeUnicodes(unicodes) {
  unicodes = [...unicodes].sort((a, b) => u2n(a) - u2n(b));

  const merged = [];
  let start = null;
  let end = null;
  for (const cur of unicodes) {
    if (start === null) {
      start = cur;
      end = cur;
    } else if (u2n(end) === u2n(cur) - 1) {
      end = cur;
    } else {
      merged.push(start === end ? start : `${start}-${u2n(end).toString(16)}`);
      start = cur;
      end = cur;
    }
  }
  if (start !== null) {
    merged.push(start === end ? start : `${start}-${u2n(end).toString(16)}`);
  }
  return merged.join(',');
}

/**
 * @param {Set<string>} set
 */
async function sliceUnprocessedUnicodes(set) {
  if (set.size === 0) {
    return {};
  }
  const arr = Array.from(set).sort((a, b) => u2n(a) - u2n(b));
  // 200 char per slice
  const slices = {};
  let idx = 1;
  slices[`[-${idx}]`] = [];
  for (const u of arr) {
    if (slices[`[-${idx}]`].length >= 200) {
      idx++;
      slices[`[-${idx}]`] = [];
    } else {
      slices[`[-${idx}]`].push(u);
    }
  }
  // if last slice is to small
  if (slices[`[-${idx}]`].length < 100) {
    slices[`[-${idx - 1}]`] = [...slices[`[-${idx - 1}]`], ...slices[`[-${idx}]`]];
    delete slices[`[-${idx}]`];
  }
  return slices;
}

let empty = false;
/**
 * create subsets for a font file
 * @param {string} file
 * @param {string} mode
 */
async function createSubsets(file, mode = 'normal') {
  // get all supported unicodes
  const [supportedUnicodeSet, weightClass] = await getSupportedUnicodeSet(file);

  // filter the ranges
  let rangesOfThisFile = { ...ranges };
  if (mode === 'tc') {
    rangesOfThisFile = { ...ranges_tc };
  }
  const processedUnicodeSet = new Set();
  Object.entries(rangesOfThisFile).forEach(([key, unicodes]) => {
    // filter the unicodes
    const supportedUnicodes = unicodes.filter((unicode) => supportedUnicodeSet.has(unicode));
    // if no unicode is supported, delete the range
    if (supportedUnicodes.length === 0) {
      delete rangesOfThisFile[key];
    } // if some unicode is supported, update the range
    else {
      rangesOfThisFile[key] = supportedUnicodes;
      // mark supported unicodes as processed
      supportedUnicodes.forEach((unicode) => processedUnicodeSet.add(unicode));
    }
  });

  // mark those unicodes supported in font but not processed
  const unProcessedUnicodeSet = new Set();
  Array.from(supportedUnicodeSet).forEach((unicode) => {
    if (!processedUnicodeSet.has(unicode)) {
      unProcessedUnicodeSet.add(unicode);
    }
  });

  // write the result to json
  fse.writeJSONSync(path.resolve(__dirname, mode === 'tc' ? '../raw/ranges-supported_tc.json' : '../raw/ranges-supported.json'), rangesOfThisFile, {
    spaces: 2,
  });
  fse.writeJSONSync(path.resolve(__dirname, mode === 'tc' ? '../raw/ranges-unprocessed_tc.json' : '../raw/ranges-unprocessed.json'), Array.from(unProcessedUnicodeSet), { spaces: 2 });

  // dont need extend slices
  if (!config.extendSlices) {
    unProcessedUnicodeSet.clear();
  }
  // has custom unicodes
  if (config.customUnicodes && config.customUnicodes.length > 0) {
    config.customUnicodes.forEach((unicode) => {
      unProcessedUnicodeSet.add(unicode);
    });
  }
  const customSlices = await sliceUnprocessedUnicodes(unProcessedUnicodeSet);
  fse.writeJSONSync(path.resolve(__dirname, mode === 'tc' ? '../raw/ranges-custom_tc.json' : '../raw/ranges-custom.json'), customSlices, {
    spaces: 2,
  });

  const outFile = file.replace(/\.ttf$/, `.subset.ttf`);
  const baseName = path.basename(file, '.ttf');
  const targetFolder = path.resolve(__dirname, mode === 'tc' ? '../raw/subset_tc' : '../raw/subset');
  // const fontWeight = baseName.split('-')[1];
  let css = '';
  fse.ensureDirSync(targetFolder);
  if (!empty) {
    fse.emptyDirSync(targetFolder);
    empty = true;
  }

  // create subsets
  console.log(`Creating subsets for "${file}"...`);
  Object.entries({ ...rangesOfThisFile, ...customSlices }).forEach(([key, unicodes]) => {
    const _unicodes = unicodes.join(',');
    childProcess.execSync(`fonttools subset --unicodes="${_unicodes}" ${file}`);
    // move subset to the output directory
    const index = /\[(-?[0-9]+|[\w-]+)\]/i.exec(key)[1];
    const targetFile = path.resolve(targetFolder, `${baseName}.${index}.ttf`);
    fse.moveSync(outFile, targetFile);
    childProcess.execSync(`fonttools ttLib.woff2 compress ${targetFile}`);
    fse.unlinkSync(targetFile);
    css += `/*${key}*/` + `@font-face{font-family:${mode === 'tc' ? 'MiSansTC' : 'MiSans'};font-style:normal;` + `font-weight:${weightClass};font-display:swap;` + `src: url('${baseName}.${index}.woff2') format('woff2');` + `unicode-range:${mergeUnicodes(unicodes)};}\n`;
  });
  fse.writeFileSync(path.resolve(targetFolder, `${baseName}.min.css`), css.trim(), 'utf-8');
  console.log(`Done for ${Object.keys(rangesOfThisFile).length} subsets`);
}

async function main() {
  const files = glob.sync('raw/Normal/ttf/*.ttf').map((file) => path.resolve(__dirname, '../', file));
  for (const file of files) {
    await createSubsets(file, 'normal');
  }

  const files_tc = glob.sync('raw/TC/ttf/*.ttf').map((file_tc) => path.resolve(__dirname, '../', file_tc));
  for (const file_tc of files_tc) {
    await createSubsets(file_tc, 'tc');
  }
}
main().catch((e) => {
  console.log(e);
  process.exit(1);
});
