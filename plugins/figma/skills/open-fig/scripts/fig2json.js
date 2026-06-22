#!/usr/bin/env node
/*
 * fig2json — decode a Figma .fig file to JSON + extract its assets.
 *
 * A .fig is a ZIP wrapping `canvas.fig` (a `fig-kiwi` binary), `thumbnail.png`,
 * `meta.json`, and `images/*`. Inside canvas.fig: an 8-byte `fig-kiwi` magic,
 * a u32, then length-prefixed blocks — block 0 = the Kiwi schema (deflate-raw),
 * block 1 = the document tree. Modern Figma compresses that data block with
 * Zstandard (magic 28 b5 2f fd); older files used deflate. We auto-detect per
 * block, decode the tree with its OWN embedded schema, and emit canvas.json.
 *
 * Usage: node fig2json.js <file.fig | canvas.fig> [outDir]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const kiwi = require('./lib/kiwi.js');

function die(msg) { console.error('fig2json: ' + msg); process.exit(1); }

const input = process.argv[2];
if (!input) die('usage: node fig2json.js <file.fig | canvas.fig> [outDir]');
if (!fs.existsSync(input)) die('no such file: ' + input);

if (typeof zlib.zstdDecompressSync !== 'function') {
  die('Node ' + process.version + ' lacks zlib.zstdDecompressSync. Modern .fig data ' +
      'blocks are Zstandard-compressed; use Node >= 23.8 (24 LTS recommended).');
}

// ---- locate canvas.fig (unzip the .fig container if needed) ----
const head = Buffer.alloc(8);
const fd = fs.openSync(input, 'r');
fs.readSync(fd, head, 0, 8, 0);
fs.closeSync(fd);
const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
const isKiwi = head.toString('latin1') === 'fig-kiwi';

const base = path.basename(input).replace(/\.fig$/i, '');
const outDir = process.argv[3] || path.join(path.dirname(path.resolve(input)), base + '.extracted');
fs.mkdirSync(outDir, { recursive: true });

let canvasPath;
if (isZip) {
  // Extract the whole container so thumbnail.png / meta.json / images/ are available too.
  try {
    execFileSync('unzip', ['-o', '-q', path.resolve(input), '-d', outDir], { stdio: 'inherit' });
  } catch (e) {
    die('failed to unzip the .fig container (is `unzip` installed?): ' + e.message);
  }
  canvasPath = path.join(outDir, 'canvas.fig');
  if (!fs.existsSync(canvasPath)) die('canvas.fig not found inside the .fig archive');
} else if (isKiwi) {
  canvasPath = path.resolve(input);
} else {
  die('not a .fig (PK zip) nor a fig-kiwi file: ' + input);
}

// ---- parse the fig-kiwi block container ----
const buf = fs.readFileSync(canvasPath);
if (buf.slice(0, 8).toString('latin1') !== 'fig-kiwi') die('bad fig-kiwi magic in ' + canvasPath);

const ZSTD = [0x28, 0xb5, 0x2f, 0xfd];
function decompressBlock(slice) {
  if (slice[0] === ZSTD[0] && slice[1] === ZSTD[1] && slice[2] === ZSTD[2] && slice[3] === ZSTD[3]) {
    return zlib.zstdDecompressSync(slice);                 // modern data block
  }
  if (slice[0] === 0x89 && slice[1] === 0x50) return slice; // embedded PNG — leave as-is
  try { return zlib.inflateRawSync(slice); }                // schema / legacy deflate-raw
  catch (e) { try { return zlib.inflateSync(slice); } catch (e2) { return slice; } }
}

let off = 8;
off += 4; // version / delimiter word
const blocks = [];
while (off + 4 <= buf.length) {
  const len = buf.readUInt32LE(off); off += 4;
  if (len === 0 || off + len > buf.length) break;
  blocks.push(decompressBlock(buf.slice(off, off + len)));
  off += len;
}
if (blocks.length < 2) die('expected >= 2 blocks (schema + data), got ' + blocks.length);

// ---- decode the document tree with its embedded schema ----
const schema = kiwi.decodeBinarySchema(new kiwi.ByteBuffer(new Uint8Array(blocks[0])));
const helper = kiwi.compileSchema(schema);
let doc;
try {
  doc = helper.decodeMessage(new kiwi.ByteBuffer(new Uint8Array(blocks[1])));
} catch (e) {
  die('kiwi decode failed: ' + e.message + '\n(If this is a very new .fig, the embedded ' +
      'schema may use a feature kiwi-schema 0.5.0 cannot model.)');
}

const jsonPath = path.join(outDir, 'canvas.json');
fs.writeFileSync(jsonPath, JSON.stringify(doc, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));

// ---- summary ----
const nodes = doc.nodeChanges || [];
const guidKey = (g) => (g ? g.sessionID + ':' + g.localID : null);
const types = {};
for (const n of nodes) types[n.type] = (types[n.type] || 0) + 1;

let fileName = base;
const metaPath = path.join(outDir, 'meta.json');
if (fs.existsSync(metaPath)) {
  try { fileName = JSON.parse(fs.readFileSync(metaPath, 'utf8')).file_name || base; } catch {}
}
const imagesDir = path.join(outDir, 'images');
const imageCount = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).filter(f => f !== '.').length : 0;

console.log('file:        ' + fileName);
console.log('decoded ->   ' + jsonPath);
console.log('nodes:       ' + nodes.length);
console.log('images:      ' + imageCount + (imageCount ? '  (' + imagesDir + ')' : ''));
const tokenSets = types.VARIABLE_SET || 0, tokens = types.VARIABLE || 0;
console.log('tokens:      ' + tokens + ' variables in ' + tokenSets + ' set(s)');
console.log('node types:  ' + JSON.stringify(types));

const canvases = nodes.filter(n => n.type === 'CANVAS');
for (const c of canvases) {
  const ck = guidKey(c.guid);
  const tops = nodes.filter(n => n.parentIndex && guidKey(n.parentIndex.guid) === ck && n.type === 'FRAME');
  console.log('\n=== PAGE: ' + (c.name || '(unnamed)') + '  (' + tops.length + ' top-level frames) ===');
  for (const t of tops) {
    const w = t.size ? Math.round(t.size.x) : '?';
    const h = t.size ? Math.round(t.size.y) : '?';
    console.log('  • ' + (t.name || '(unnamed)') + '  [' + w + 'x' + h + ']');
  }
}
