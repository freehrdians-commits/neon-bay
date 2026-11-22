// Neon Bay — the gta6-01 entry (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request), and this program
// hands it in. It copies game/ and screenshots/ from beside this file to /output, writes a
// deterministic /output/manifest.json, and writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Count the files handed in, so the manifest states the entry's size in files as well as
// in words. The walk is alphabetical and the count depends only on the tree, so it is
// deterministic across runs.
function countFiles(dir) {
  let count = 0;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) count += countFiles(path);
    else count += 1;
  }
  return count;
}

// A fixed manifest: the game's name, what it is, and its four jobs, so a reader of /output can
// tell what the entry is without opening the game. Its content never depends on the clock or
// the machine, so two runs of this program write byte-identical output.
const manifest = {
  name: 'Neon Bay',
  kind: 'game',
  offline: true,
  missions: [
    { id: 1, name: 'The Pickup', pay: 400 },
    { id: 2, name: 'The Comet', pay: 800 },
    { id: 3, name: 'Turf War', pay: 1200 },
    { id: 4, name: 'The Ledger', pay: 2000 },
  ],
  systems: ['nitro', 'neon-tags', 'courier', 'police-intercept-ai', 'roadblocks', 'day-night'],
  tags: 8,
  gameFiles: countFiles(join(here, 'game')),
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
