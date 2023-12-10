/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */
const path = require('path');
const fse = require('fs-extra');

const url = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC';
const url_tc = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC';

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:101.0) Gecko/20100101 Firefox/101.0';

/**
 * get css from google fonts
 * @returns {Promise<string>}
 */
async function getCSS() {
  console.log('Fetching CSS from Google Fonts...');
  const res = await fetch(url, {
    headers: { 'User-Agent': ua },
  });
  const css = await res.text();
  return css;
}

/**
 * get css from google fonts
 * @returns {Promise<string>}
 */
async function getCSS_TC() {
  console.log('Fetching CSS (TC) from Google Fonts...');
  const res = await fetch(url_tc, {
    headers: { 'User-Agent': ua },
  });
  const css = await res.text();
  return css;
}

/**
 * get unicode ranges from css
 * @param {string} css
 * @returns {any}
 */
function getUnicodeRanges(css) {
  css = css.replace(/\n/g, '');
  const idExp = /(\[[0-9]+\])/gi;
  const rangeExp = /unicode-range: ([^;]+);/gi;
  let idExpr = idExp.exec(css);
  let rangeExpr = rangeExp.exec(css);
  const res = {};
  while (idExpr && rangeExpr && idExpr[1] && rangeExpr[1]) {
    res[idExpr[1]] = rangeExpr[1].replace(/ /g, '');
    idExpr = idExp.exec(css);
    rangeExpr = rangeExp.exec(css);
  }
  if (Object.keys(res).length === 0) {
    return null;
  }
  return res;
}

/**
 * replace unicode range to individual unicode
 * @param {string} range
 * @returns {string[]}
 */
function parseUnicodeRange(range) {
  const rangeArr = range.split(',');
  const res = [];
  rangeArr.forEach((item) => {
    if (!item.includes('-')) {
      res.push(item);
    } else {
      const tempArr = /U\+([0-9A-F]+)-([0-9A-F]+)/i.exec(item);
      const startInt = Number.parseInt(tempArr[1], 16);
      const endInt = Number.parseInt(tempArr[2], 16);
      for (let i = startInt; i <= endInt; i++) {
        const hex = i.toString(16);
        res.push('U+' + hex);
      }
    }
  });
  return res;
}

async function main() {
  const css = await getCSS();
  const css_tc = await getCSS_TC();

  const ranges = getUnicodeRanges(css);
  const ranges_tc = getUnicodeRanges(css_tc);

  if (!ranges || !ranges_tc) {
    throw new Error('no valid ranges fetched');
  }

  Object.entries(ranges).forEach(([id, range]) => {
    const unicodeArr = parseUnicodeRange(range);
    ranges[id] = unicodeArr;
  });
  fse.writeJSONSync(path.resolve(__dirname, '../raw/ranges.json'), ranges, {
    spaces: 2,
  });

  Object.entries(ranges_tc).forEach(([id, range]) => {
    const unicodeArr = parseUnicodeRange(range);
    ranges_tc[id] = unicodeArr;
  });
  fse.writeJSONSync(path.resolve(__dirname, '../raw/ranges_tc.json'), ranges_tc, {
    spaces: 2,
  });
  console.log('Done for unicode ranges');
}
main().catch((e) => {
  console.log(e);
  process.exit(1);
});
