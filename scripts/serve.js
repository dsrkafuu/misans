/*! DSRKafuU (https://dsrkafuu.net) | Copyright (c) Apache License 2.0 */

import fs from 'fs';
import path from 'path';

import { ROOT } from './util.js';

const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

Bun.serve({
  port: PORT,
  fetch(req) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    if (pathname === '/') {
      pathname = '/demo.html';
    }
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      return new Response('Forbidden', { status: 403 });
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      const index = path.join(file, 'index.html');
      if (fs.existsSync(index)) {
        return sendFile(index);
      }
      return new Response('Not Found', { status: 404 });
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return new Response('Not Found', { status: 404 });
    }
    return sendFile(file);
  },
});

function sendFile(file) {
  return new Response(fs.readFileSync(file), {
    headers: {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    },
  });
}

console.log(`Serving ${ROOT} at http://localhost:${PORT}/`);
