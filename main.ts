// Warung Senja — entrypoint (Node 22, no build step).
// Stage the game and its screenshots into the output directory, then write the dossier.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from "./vendor/makefun-game.ts";

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const repoRoot = new URL('.', import.meta.url).pathname;

mkdirSync(outDir, { recursive: true });
for (const folder of ['game', 'screenshots']) {
  const src = join(repoRoot, folder);
  if (existsSync(src)) cpSync(src, join(outDir, folder), { recursive: true });
}

const caps = {
  text_max_bytes: 160 * 1024,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  game_max_files: 1000 - 7,
  game_max_bytes: 48 * 1024 * 1024,
};
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, caps));
console.log('dossier written to ' + join(outDir, 'dossier.json'));
