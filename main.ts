// Hand-in program for Kestrel Courier: Skyward Isles.
// Copies the static game and its four screenshots into the output directory, rejects anything the
// scorer would reject (links, special files, oversize images, too many files) and writes the
// canonical dossier with the vendored make.fun library. Node 22+ standard library only.

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GAME = join(HERE, 'game');
const SHOTS = join(HERE, 'screenshots');
const OUT = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const SHOT_EXT = /\.(jpe?g|png)$/i;

class EntryError extends Error {}

function fail(message) {
  throw new EntryError(message);
}

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
}

function guardPaths() {
  if (!existsSync(GAME) || !statSync(GAME).isDirectory()) fail('game/ is missing');
  if (!existsSync(SHOTS) || !statSync(SHOTS).isDirectory()) fail('screenshots/ is missing');
  if (OUT === HERE || isInside(OUT, GAME) || isInside(OUT, SHOTS) || isInside(HERE, OUT)) {
    fail(`refusing output directory ${OUT}: it overlaps the entry`);
  }
  const gameTarget = resolve(OUT, 'game');
  const shotTarget = resolve(OUT, 'screenshots');
  if (gameTarget === GAME || shotTarget === SHOTS) fail('output would overwrite the entry');
}

function checkNode(path, relativePath, counters) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) fail(`symbolic link not allowed: ${relativePath}`);
  if (info.isDirectory()) {
    counters.entries += 1;
    for (const name of readdirSync(path)) {
      checkNode(join(path, name), `${relativePath}/${name}`, counters);
    }
    return;
  }
  if (!info.isFile()) fail(`special file not allowed: ${relativePath}`);
  counters.entries += 1;
  counters.bytes += info.size;
  counters.pathBytes = Math.max(counters.pathBytes, Buffer.byteLength(relativePath));
}

function checkGame() {
  const counters = { entries: 0, bytes: 0, pathBytes: 0 };
  checkNode(GAME, 'game', counters);
  if (counters.entries > CAPS.game_max_files) fail(`game/ has ${counters.entries} entries, cap ${CAPS.game_max_files}`);
  if (counters.bytes > CAPS.game_max_bytes) fail(`game/ is ${counters.bytes} bytes, cap ${CAPS.game_max_bytes}`);
  if (counters.pathBytes > CAPS.game_path_max_bytes) fail('a game/ path is too long');
  const index = join(GAME, 'index.html');
  if (!existsSync(index)) fail('game/index.html is missing');
  if (statSync(index).size > 1048576) fail('game/index.html is over 1 MiB');
  return counters;
}

function readDimensions(bytes) {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff || marker === 0x00) {
      offset += 1;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function checkScreenshots() {
  const names = readdirSync(SHOTS).filter((name) => !name.startsWith('.')).sort();
  if (names.length !== 4) fail(`expected exactly 4 screenshots, found ${names.length}`);
  const details = [];
  for (const name of names) {
    if (!SHOT_EXT.test(name)) fail(`screenshot is not JPEG or PNG: ${name}`);
    const path = join(SHOTS, name);
    const info = lstatSync(path);
    if (!info.isFile()) fail(`screenshot is not a regular file: ${name}`);
    if (info.size > CAPS.screenshots.max_bytes) fail(`${name} is ${info.size} bytes, cap ${CAPS.screenshots.max_bytes}`);
    const dimensions = readDimensions(readFileSync(path));
    if (!dimensions || !dimensions.width || !dimensions.height) fail(`cannot read image dimensions: ${name}`);
    const long = Math.max(dimensions.width, dimensions.height);
    const short = Math.min(dimensions.width, dimensions.height);
    if (long > 1280 || short < 480) fail(`${name} is ${dimensions.width}x${dimensions.height}; need long side <=1280 and short side >=480`);
    details.push({ name, bytes: info.size, width: dimensions.width, height: dimensions.height });
  }
  return details;
}

function copyTree(source, target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: false,
    preserveTimestamps: false,
    errorOnExist: false,
    force: true,
  });
}

function main() {
  const started = performance.now();
  guardPaths();
  const game = checkGame();
  const shots = checkScreenshots();
  mkdirSync(OUT, { recursive: true });
  copyTree(GAME, join(OUT, 'game'));
  copyTree(SHOTS, join(OUT, 'screenshots'));
  const dossier = buildDossier(OUT, CAPS);
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  const digest = createHash('sha256').update(dossier).digest('hex').slice(0, 16);
  const bytes = shots.reduce((sum, shot) => sum + shot.bytes, 0);
  const cover = basename(shots[0].name);
  const seconds = (performance.now() - started) / 1000;
  console.log(`Kestrel Courier hand-in: game ${game.entries} entries / ${game.bytes} bytes; screenshots ${shots.length} / ${bytes} bytes (${cover}); dossier ${dossier.length} bytes sha256:${digest}; ${seconds.toFixed(2)}s`);
}

try {
  main();
} catch (error) {
  if (error instanceof EntryError) {
    console.error(`entry rejected: ${error.message}`);
    process.exit(1);
  }
  console.error(error?.stack ?? error);
  process.exit(1);
}
