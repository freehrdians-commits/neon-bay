// A tiny static file server for local playtesting: it serves the files of this repo over
// HTTP, nothing else, and adds no headers beyond a content type and a no-store cache control
// for the game files. The game itself makes no network requests; this server exists only so
// the browser can load the modules from a local origin.
//
// Usage: node serve.ts [--port 8080] [--host 127.0.0.1] [--quiet]

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function parseArgs(argv) {
  const args = { port: 8080, host: '127.0.0.1', quiet: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) args.port = Number.parseInt(argv[++i], 10);
    else if (argv[i] === '--host' && argv[i + 1]) args.host = argv[++i];
    else if (argv[i] === '--quiet') args.quiet = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const root = fileURLToPath(new URL('.', import.meta.url));

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/game/index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('Forbidden');
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  }
});

server.listen(args.port, args.host, () => {
  if (!args.quiet) {
    console.log(`Neon Bay is served at http://${args.host}:${args.port}/game/index.html`);
  }
});
