/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) MIT License */
const path = require('path');
const crypto = require('crypto');
const fse = require('fs-extra');
const glob = require('glob');
const childProcess = require('child_process');

// output of `fetch.js` script
const ranges = fse.readJSONSync(path.resolve(__dirname, '../raw/ranges.json'));

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
 * get all supported unicodes of a font file
 * @returns {Promise<Set<string>>}
 */
async function getSupportedUnicodeSet(file) {
  // get cmap ttx with fonttools
  const ttxFile = file.replace(/\.ttf$/, '.ttx');
  childProcess.execSync(`fonttools ttx -t cmap -o ${ttxFile} ${file}`);
  const cmap = fse.readFileSync(ttxFile, 'utf-8');

  // match unicodes
  const unicodeSet = new Set();
  const exp = /<map +code="([^"]+)"/gi;
  let expr = exp.exec(cmap);
  while (expr && expr[1]) {
    const str = expr[1];
    const unicode = str.toLowerCase().replace(/^0x/, 'U+');
    unicodeSet.add(unicode);
    expr = exp.exec(cmap);
  }

  // remove ttx file
  fse.unlinkSync(ttxFile);
  return unicodeSet;
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

let empty = false;
/**
 * create subsets for a font file
 * @param {string} file
 */
async function createSubsets(file) {
  // get all supported unicodes
  const supportedUnicodeSet = await getSupportedUnicodeSet(file);

  // filter the ranges
  const rangesOfThisFile = { ...ranges };
  const processedUnicodeSet = new Set();
  Object.entries(rangesOfThisFile).forEach(([key, unicodes]) => {
    // filter the unicodes
    const supportedUnicodes = unicodes.filter((unicode) =>
      supportedUnicodeSet.has(unicode)
    );
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
  fse.writeJSONSync(
    path.resolve(__dirname, '../raw/ranges-supported.json'),
    rangesOfThisFile,
    { spaces: 2 }
  );
  fse.writeJSONSync(
    path.resolve(__dirname, '../raw/ranges-unprocessed.json'),
    Array.from(unProcessedUnicodeSet),
    { spaces: 2 }
  );

  const hash = getHash(file).substring(0, 8);
  const outFile = file.replace(/\.ttf$/, `.subset.ttf`);
  const baseName = path.basename(file, '.ttf');
  const targetFolder = path.resolve(__dirname, '../raw/subset');
  const fontWeight = baseName.split('-')[1];
  let css = '';
  fse.ensureDirSync(targetFolder);
  if (!empty) {
    fse.emptyDirSync(targetFolder);
    empty = true;
  }

  // create subsets
  console.log(`Creating subsets for "${file}"...`);
  Object.entries(rangesOfThisFile).forEach(([key, unicodes]) => {
    const _unicodes = unicodes.join(',');
    childProcess.execSync(`fonttools subset --unicodes="${_unicodes}" ${file}`);
    // move subset to the output directory
    const index = /\[([0-9]+)\]/i.exec(key)[1];
    const targetFile = path.resolve(targetFolder, `${hash}.${index}.ttf`);
    fse.moveSync(outFile, targetFile);
    childProcess.execSync(`fonttools ttLib.woff2 compress ${targetFile}`);
    fse.unlinkSync(targetFile);
    css +=
      `/*${key}*/` +
      `@font-face{font-family:MiSans;font-style:normal;` +
      `font-weight:${fontWeight};font-display:swap;` +
      `src: url('${hash}.${index}.woff2') format('woff2');` +
      `unicode-range:${mergeUnicodes(unicodes)};}\n`;
  });
  fse.writeFileSync(
    path.resolve(targetFolder, `${baseName}.min.css`),
    css.trim(),
    'utf-8'
  );
  console.log(`Done for ${Object.keys(rangesOfThisFile).length} subsets`);
}

async function main() {
  const files = glob
    .sync('raw/full/*.ttf')
    .map((file) => path.resolve(__dirname, '../', file));
  for (const file of files) {
    await createSubsets(file);
  }
}
main().catch((e) => {
  console.log(e);
  process.exit(1);
});
