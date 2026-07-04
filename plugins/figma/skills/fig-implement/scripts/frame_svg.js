#!/usr/bin/env node
/*
 * frame_svg — export a node's vector geometry (icon / logo / illustration) as SVG.
 *
 * Figma vectors are REAL geometry, not images: each VECTOR node's fillGeometry
 * references a path in the document's top-level blobs[] array (commandsBlob index).
 * This decodes those blobs and composites the whole subtree (applying each node's
 * transform) into one SVG — so logos/icons render crisply instead of being screenshotted.
 *
 * Path command grammar (decoded by tiling the blob): tag 1=moveTo(2 floats),
 * 2=lineTo(2), 4=cubic(6), 0=close; coords are little-endian float32 in node-local space.
 *
 * Usage: node frame_svg.js <canvas.json> <nodeId A:B|A-B> <out.svg> [--vector-only] [bgHex]
 *   --vector-only  emit only VECTOR fills (skip background rects) -> transparent asset
 */
const fs = require('fs');

const cjsonPath = process.argv[2];
let nodeId = (process.argv[3] || '').replace('-', ':');
const out = process.argv[4];
const rest = process.argv.slice(5);
const vectorOnly = rest.includes('--vector-only');
const bg = rest.find(a => a.startsWith('#'));
if (!cjsonPath || !nodeId || !out) {
	console.error('usage: node frame_svg.js <canvas.json> <nodeId> <out.svg> [--vector-only] [bgHex]');
	process.exit(1);
}
const j = JSON.parse(fs.readFileSync(cjsonPath, 'utf8'));
const n = j.nodeChanges || [], blobs = j.blobs || [];
const key = g => (g ? g.sessionID + ':' + g.localID : null);
const byG = new Map(), kids = new Map();
for (const x of n) byG.set(key(x.guid), x);
for (const x of n) { const p = x.parentIndex && key(x.parentIndex.guid); if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(x); } }
const root = byG.get(nodeId);
if (!root) { console.error('node not found: ' + nodeId); process.exit(1); }

const hx = v => Math.round((v || 0) * 255).toString(16).padStart(2, '0');
const hex = c => (c ? '#' + hx(c.r) + hx(c.g) + hx(c.b) : null);
const I = [1, 0, 0, 0, 1, 0];
const T = t => (t ? [t.m00, t.m01, t.m02, t.m10, t.m11, t.m12] : I.slice());
const mul = (A, B) => [
	A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
	A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5],
];
const apply = (M, x, y) => [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
const r2 = v => Math.round(v * 100) / 100;
const sane = v => isFinite(v) && Math.abs(v) < 1e6 && (v === 0 || Math.abs(v) > 1e-4);

function tile(buf) { // backtracking segmentation of the path-command blob
	const memo = new Map();
	function solve(o) {
		if (o === buf.length) return [];
		if (memo.has(o)) return memo.get(o);
		const tag = buf[o]; let res = null;
		if (tag <= 8) {
			for (const nf of [2, 4, 6, 0]) {
				const end = o + 1 + nf * 4; if (end > buf.length) continue;
				let ok = true; for (let k = 0; k < nf; k++) if (!sane(buf.readFloatLE(o + 1 + k * 4))) { ok = false; break; }
				if (!ok) continue;
				const rsst = solve(end); if (rsst) { res = [[tag, nf, o]].concat(rsst); break; }
			}
		}
		memo.set(o, res); return res;
	}
	return solve(0);
}
function pathD(blobIdx, M) {
	const b = blobs[blobIdx]; if (!b) return null;
	const buf = Buffer.from(Object.values(b.bytes));
	const til = tile(buf); if (!til) return null;
	const pt = o => apply(M, buf.readFloatLE(o), buf.readFloatLE(o + 4));
	let d = '';
	for (const [tag, nf, o] of til) {
		if (nf === 0) d += 'Z ';
		else if (nf === 2) { const [x, y] = pt(o + 1); d += (tag === 1 ? 'M' : 'L') + r2(x) + ' ' + r2(y) + ' '; }
		else if (nf === 4) { const [a, b2] = pt(o + 1), [x, y] = pt(o + 9); d += 'Q' + r2(a) + ' ' + r2(b2) + ' ' + r2(x) + ' ' + r2(y) + ' '; }
		else if (nf === 6) { const [a, b2] = pt(o + 1), [c, e] = pt(o + 9), [x, y] = pt(o + 17); d += 'C' + r2(a) + ' ' + r2(b2) + ' ' + r2(c) + ' ' + r2(e) + ' ' + r2(x) + ' ' + r2(y) + ' '; }
	}
	return d.trim();
}

const paths = [];
(function walk(node, M) {
	for (const c of (kids.get(key(node.guid)) || [])) {
		const cm = mul(M, T(c.transform));
		if (vectorOnly && c.type !== 'VECTOR') { walk(c, cm); continue; }
		const fill = (c.fillPaints || []).find(p => p.type === 'SOLID' && p.visible !== false && p.color);
		if (c.fillGeometry && fill) for (const g of c.fillGeometry) { const d = pathD(g.commandsBlob, cm); if (d) paths.push({ d, fill: hex(fill.color) }); }
		walk(c, cm);
	}
})(root, I);

const w = root.size ? Math.round(root.size.x) : 100, h = root.size ? Math.round(root.size.y) : 100;
let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">';
if (bg) svg += '<rect width="' + w + '" height="' + h + '" fill="' + bg + '"/>';
for (const p of paths) svg += '<path d="' + p.d + '" fill="' + p.fill + '"/>';
svg += '</svg>';
fs.writeFileSync(out, svg);
console.log('wrote ' + out + ' — ' + paths.length + ' paths, viewBox 0 0 ' + w + ' ' + h);
console.log('fills: ' + [...new Set(paths.map(p => p.fill))].join(' '));
console.log('TIP: also dump per-path d+fill as JSON for a react-native-svg component if implementing in RN.');
