#!/usr/bin/env node
/*
 * frame_spec — turn one decoded Figma frame into a COMPLETE, faithful render spec.
 *
 * Operates on canvas.json (produced by open-fig's fig2json.js). Emits a z-ordered,
 * scale-aware spec of every visible node with all render-relevant properties, so an
 * implementation can be driven from data instead of a lossy visual impression.
 *
 * The whole point of this skill: NOT approximating. So this captures the things a
 * naive pass drops — exact z-order (via parentIndex.position), accumulated transform
 * scale, image scaleMode + imageTransform, gradient stops + transform, blur/shadow
 * effects, strokes, corner radii, opacity/blend, text + full typography.
 *
 * Vector-only subtrees (icons/logos) are collapsed to a single node flagged for SVG
 * export via frame_svg.js — they are real geometry, not images.
 *
 * Usage: node frame_spec.js <canvas.json> <frameId A:B | A-B> [outDir]
 *   frameId accepts the Figma URL form (node-id=54646-2561) or guid form (54646:2561).
 */
const fs = require('fs');
const path = require('path');

const cjsonPath = process.argv[2];
let frameId = process.argv[3];
const outDir = process.argv[4] || path.dirname(path.resolve(cjsonPath || '.'));
if (!cjsonPath || !frameId) {
	console.error('usage: node frame_spec.js <canvas.json> <frameId> [outDir]');
	process.exit(1);
}
frameId = frameId.replace('-', ':');

const j = JSON.parse(fs.readFileSync(cjsonPath, 'utf8'));
const n = j.nodeChanges || [];
const key = g => (g ? g.sessionID + ':' + g.localID : null);
const byG = new Map();
const kids = new Map();
for (const x of n) byG.set(key(x.guid), x);
for (const x of n) {
	const p = x.parentIndex && key(x.parentIndex.guid);
	if (p == null) continue;
	if (!kids.has(p)) kids.set(p, []);
	kids.get(p).push(x);
}
// Z-ORDER: siblings sort by the fractional-index parentIndex.position (ascending = bottom..top).
for (const arr of kids.values()) {
	arr.sort((a, b) => {
		const pa = (a.parentIndex && a.parentIndex.position) || '';
		const pb = (b.parentIndex && b.parentIndex.position) || '';
		return pa < pb ? -1 : pa > pb ? 1 : 0;
	});
}
const frame = byG.get(frameId);
if (!frame) { console.error('frame not found: ' + frameId); process.exit(1); }

const I = [1, 0, 0, 0, 1, 0];
const T = t => (t ? [t.m00, t.m01, t.m02, t.m10, t.m11, t.m12] : I.slice());
const mul = (A, B) => [
	A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
	A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5],
];
const abs = new Map();
abs.set(frameId, I.slice());
(function w(g) { const M = abs.get(g); for (const c of (kids.get(g) || [])) { abs.set(key(c.guid), mul(M, T(c.transform))); w(key(c.guid)); } })(frameId);

const W = frame.size ? frame.size.x : 0, H = frame.size ? frame.size.y : 0;
const hx = v => Math.round((v || 0) * 255).toString(16).padStart(2, '0');
const hex = c => (c ? '#' + hx(c.r) + hx(c.g) + hx(c.b) + (c.a != null && c.a < 1 ? hx(c.a) : '') : null);
const r2 = v => Math.round(v * 100) / 100;
const pctH = v => (H ? Math.round((v / H) * 1000) / 10 : 0);
const pctW = v => (W ? Math.round((v / W) * 1000) / 10 : 0);

const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'ELLIPSE', 'STAR', 'REGULAR_POLYGON']);
function subtreeIsVectorOnly(g) {
	const node = byG.get(g);
	if (!node) return true;
	if (node.type === 'TEXT' || (node.fillPaints || []).some(p => p.type === 'IMAGE')) return false;
	const cs = kids.get(g) || [];
	if (cs.length === 0) return VECTOR_TYPES.has(node.type);
	// a group/frame is "vector-only" if every descendant is a vector shape (no text/image/sub-frame-with-content)
	return cs.every(c => {
		const t = c.type;
		if (t === 'TEXT') return false;
		if ((c.fillPaints || []).some(p => p.type === 'IMAGE')) return false;
		if (t === 'FRAME' || t === 'GROUP' || t === 'INSTANCE' || t === 'COMPONENT') return subtreeIsVectorOnly(key(c.guid));
		return VECTOR_TYPES.has(t) || t === 'ROUNDED_RECTANGLE' || t === 'RECTANGLE';
	});
}

function paint(p) {
	if (!p || p.visible === false) return null;
	if (p.type === 'SOLID') return { kind: 'solid', color: hex(p.color), opacity: p.opacity };
	if (p.type && p.type.startsWith('GRADIENT')) {
		const t = p.gradientTransform;
		let direction = 'unknown';
		if (t) direction = Math.abs(t.m10) >= Math.abs(t.m00) ? 'vertical (top->bottom-ish)' : 'horizontal-ish';
		return {
			kind: p.type.replace('GRADIENT_', '').toLowerCase() + '-gradient',
			stops: (p.stops || []).map(s => ({ color: hex(s.color), pos: r2(s.position) })),
			direction, gradientTransform: t || null,
		};
	}
	if (p.type === 'IMAGE') return {
		kind: 'image',
		hash: p.image && p.image.hash ? Object.values(p.image.hash).map(b => b.toString(16).padStart(2, '0')).join('') : null,
		scaleMode: p.imageScaleMode || p.scaleMode,
		// the in-box crop/position matrix is stored on `transform` (Figma also exposes `scale`)
		imageTransform: p.imageTransform || p.transform || null,
		scale: p.scale != null ? r2(p.scale) : undefined,
		opacity: p.opacity,
		note: 'FILL->cover, FIT->contain. STRETCH = Figma Crop mode: imageTransform is a CROP RECTANGLE (show that sub-region of the image, then scale to fill) — implement as cover + anchor/zoom from the matrix, NOT resizeMode "stretch" (distorts) and NOT scaleY on the element (squishes — the inverse). m11<1 = show that vertical fraction (zoom in), m12 = offset down.',
	};
	return { kind: p.type };
}

function describe(node, depth, collapsedVector) {
	const M = abs.get(key(node.guid));
	const sx = Math.hypot(M[0], M[3]), sy = Math.hypot(M[1], M[4]); // accumulated scale
	const w = node.size ? node.size.x * sx : 0, h = node.size ? node.size.y * sy : 0;
	const o = {
		id: key(node.guid), type: node.type, name: node.name, depth,
		box: { x: r2(M[2]), y: r2(M[5]), w: r2(w), h: r2(h) },
		boxPct: { top: pctH(M[5]), left: pctW(M[2]), w: pctW(w), h: pctH(h) },
	};
	if (sx !== 1 || sy !== 1) o.accumulatedScale = { x: r2(sx), y: r2(sy) };
	// rotation / shear: a non-zero m01/m10 means the node is rotated (or flipped).
	// The box above is the raw translation, NOT a rotated bounding box — surface the
	// matrix so the implementer rotates correctly instead of treating it axis-aligned.
	if (Math.abs(M[1]) > 1e-3 || Math.abs(M[3]) > 1e-3) {
		o.rotationDeg = r2((Math.atan2(M[3], M[0]) * 180) / Math.PI);
		o.flipped = M[0] * M[4] - M[1] * M[3] < 0;
		o.transform = { m00: r2(M[0]), m01: r2(M[1]), m10: r2(M[3]), m11: r2(M[4]) };
		o.boxNote = 'ROTATED/flipped — `box` is the translation, not a rotated bounding box. Apply `transform`/`rotationDeg`. A large off-frame rotated+blurred shape only shows a soft edge in part of the frame; figure out WHERE that edge lands.';
	}
	if (node.visible === false) o.hidden = true;
	if (node.opacity != null && node.opacity < 1) o.opacity = r2(node.opacity);
	if (node.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(node.blendMode)) o.blendMode = node.blendMode;
	if (node.cornerRadius) o.cornerRadius = r2(node.cornerRadius);
	const fills = (node.fillPaints || []).map(paint).filter(Boolean);
	if (fills.length) o.fills = fills;
	const strokes = (node.strokePaints || []).map(paint).filter(Boolean);
	if (strokes.length) { o.strokes = strokes; o.strokeWeight = r2(node.strokeWeight || 0); }
	const eff = (node.effects || []).filter(e => e.visible !== false).map(e => ({
		type: e.type, radius: r2(e.radius || 0),
		color: e.color ? hex(e.color) : undefined,
		offset: e.offset ? { x: r2(e.offset.x), y: r2(e.offset.y) } : undefined,
		spread: e.spread ? r2(e.spread) : undefined,
	}));
	if (eff.length) o.effects = eff;
	if (node.stackMode && node.stackMode !== 'NONE') o.autoLayout = {
		dir: node.stackMode, gap: r2(node.stackSpacing || 0),
		padV: r2(node.stackVerticalPadding || 0), padH: r2(node.stackHorizontalPadding || 0),
		primary: node.stackPrimaryAlignItems, counter: node.stackCounterAlignItems,
	};
	if (node.type === 'TEXT' && node.textData) {
		o.text = node.textData.characters;
		o.font = {
			family: node.fontName && node.fontName.family, style: node.fontName && node.fontName.style,
			size: r2(node.fontSize || 0),
			lineHeight: node.lineHeight ? (node.lineHeight.units === 'PERCENT' ? r2(node.lineHeight.value) + '%' : r2(node.lineHeight.value)) : null,
			letterSpacing: node.letterSpacing ? r2(node.letterSpacing.value) + (node.letterSpacing.units === 'PERCENT' ? '%' : '') : null,
			align: node.textAlignHorizontal,
		};
	}
	if (collapsedVector) o.note = 'VECTOR ASSET — export with frame_svg.js (real geometry in blobs[], not an image). Use this node id.';
	return o;
}

// A subtree must NOT be collapsed to a flat SVG-asset pointer if it carries
// effects (blur/shadow), rotation/flip, or stroke-only paints — those are not
// reproducible as plain filled paths and silently lose the design (e.g. a
// rotated, blurred, gradient-stroked glow). Keep such nodes expanded.
function subtreeNeedsExplicitRender(g) {
	const node = byG.get(g);
	if (!node) return false;
	const M = abs.get(g);
	const rotated = M && (Math.abs(M[1]) > 1e-3 || Math.abs(M[3]) > 1e-3);
	const hasEffects = (node.effects || []).some(e => e.visible !== false);
	const strokeOnly = (node.strokePaints || []).some(p => p.visible !== false)
		&& !(node.fillPaints || []).some(p => p.visible !== false);
	if (rotated || hasEffects || strokeOnly) return true;
	return (kids.get(g) || []).some(c => subtreeNeedsExplicitRender(key(c.guid)));
}

const out = [];
(function walk(g, depth) {
	for (const c of (kids.get(g) || [])) {
		const cid = key(c.guid);
		if (c.visible === false) continue;
		const isVectorGroup = (kids.get(cid) || []).length > 0
			&& subtreeIsVectorOnly(cid) && !subtreeNeedsExplicitRender(cid);
		out.push(describe(c, depth, isVectorGroup));
		if (isVectorGroup) continue; // collapse: don't dump dozens of sub-paths
		walk(cid, depth + 1);
	}
})(frameId, 0);

const spec = {
	frame: {
		id: frameId, name: frame.name, size: { w: W, h: H }, aspect: H && W ? r2(H / W) : null,
		background: (frame.fillPaints || []).map(paint).filter(Boolean),
	},
	hint: 'Position by boxPct (% of artboard) since aspect usually ~matches phones, or by absolute box px. zOrderBottomToTop is render order. Images list a hash -> find the file in the extracted images/ dir.',
	zOrderBottomToTop: out,
};
fs.mkdirSync(outDir, { recursive: true });
const specPath = path.join(outDir, 'frame-spec.json');
fs.writeFileSync(specPath, JSON.stringify(spec, null, 1));
console.log('wrote ' + specPath);
console.log('frame: ' + frame.name + '  ' + W + 'x' + H + '  aspect ' + spec.frame.aspect + '  | ' + out.length + ' visible nodes');
const imgs = out.filter(o => o.fills && o.fills.some(f => f.kind === 'image'));
const vecs = out.filter(o => o.note && o.note.startsWith('VECTOR ASSET'));
console.log('image fills: ' + imgs.length + '  | vector assets (export via frame_svg.js): ' + vecs.length);
for (const v of vecs) console.log('  vector asset: ' + v.id + ' "' + v.name + '"');
