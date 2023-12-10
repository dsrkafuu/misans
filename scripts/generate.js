/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */
const path = require('path');
const fse = require('fs-extra');
const glob = require('glob');
const childProcess = require('child_process');

/**
 * create css for a font file
 * @param {string} file
 */
async function generateCSS(file) {
  const dirname = path.dirname(file);
  const baseName = path.basename(file, '.woff2');
  const outFile = path.join(dirname, `./${baseName}.min.css`);
  const fontFamily = baseName.split('-')[0];

  const ttxFile = file.replace(/\.woff2$/, '.ttx');
  console.log(`Extracting TTX to ${ttxFile}...`);
  childProcess.execSync(`fonttools ttx -t OS/2 -o ${ttxFile} ${file}`);
  const ttxMeta = fse.readFileSync(ttxFile, 'utf-8');

  // get font weight
  const exp = /<usWeightClass +value="([^"]+)"/g;
  const expr = exp.exec(ttxMeta);
  const weightClass = +expr[1] || 0;

  const css =
    `@font-face{font-family:${fontFamily};font-style:normal;` +
    `font-weight:${weightClass};font-display:swap;` +
    `src: url('${baseName}.woff2') format('woff2');}`;
  fse.writeFileSync(outFile, css.trim(), 'utf-8');

  fse.unlinkSync(ttxFile);
}

async function main() {
  const files = glob
    .sync('lib/*/*.woff2')
    .map((file) => path.resolve(__dirname, '../', file))
    .filter((file) => !/lib(.+)Normal/g.test(file) && !/lib(.+)TC/g.test(file));
  for (const file of files) {
    await generateCSS(file);
  }
}
main().catch((e) => {
  console.log(e);
  process.exit(1);
});
