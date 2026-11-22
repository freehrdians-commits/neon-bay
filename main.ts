// Neon Bay's entrypoint (Node 22, standard library only). The game itself is
// the static files under game/ — index.html plus its ES modules, no library,
// no network request — and this program hands them in: it copies game/ and
// screenshots/ from beside this file into the output directory and writes
// dossier.json, the summary the judge reads, using the vendored make.fun
// library. It also writes a small manifest.json describing the build. The
// grader runs this twice and both runs must write the same bytes, so nothing
// here depends on the time or the machine.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (Inside the grader's container MAKEFUN_OUTPUT_DIR is unset and /output is
// used instead.) Serve the game itself with `node serve.ts`, then open
// http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in, and the folder the entry goes to.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

// Count the files under a directory, recursively — a stable number for the
// manifest, since the file list itself never changes between runs.
function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    n += statSync(full).isDirectory() ? countFiles(full) : 1;
  }
  return n;
}

mkdirSync(outputDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outputDir, 'game'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
} else {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
}

// A deterministic manifest: the game's name, its four story jobs, and how
// many files the build holds. No timestamps, no machine facts.
const manifest = {
  game: 'Neon Bay',
  missions: ['First Job', 'Hot Wheels', 'Turf War', 'The Ledger'],
  game_files: countFiles(join(outputDir, 'game')),
  offline: true,
};
writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// The caps are the scorer's own: only the text cap shapes the bytes, the
// rest refuse an entry the scorer would refuse — more than 4 screenshots or
// one over 256 KiB, more than 993 files in game/ or 48 MiB of game files in
// all, or a path under game/ over 1000 bytes. game/ counts beside /output's
// own 1000-entry cap, its screenshots/ and dossier.json.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
