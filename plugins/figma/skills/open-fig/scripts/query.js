#!/usr/bin/env node
/*
 * query — inspect a decoded canvas.json (output of fig2json.js).
 *
 * The decoded doc is a FLAT list (`nodeChanges`); the tree is implicit via
 * each node's `guid` (sessionID:localID) and `parentIndex.guid`. This script
 * rebuilds the parent→children index once, then answers common questions so
 * each invocation doesn't re-derive the traversal.
 *
 * Usage:
 *   node query.js <canvas.json> screens [pageSubstr]   list top-level frames per page
 *   node query.js <canvas.json> frame "<name>"         dump a frame's tree (text, size, colors)
 *   node query.js <canvas.json> text "<name>"          just the text content under a frame
 *   node query.js <canvas.json> find "<substr>"        find nodes whose name matches
 *   node query.js <canvas.json> tokens                 list design tokens (variables) + values
 */
const fs = require('fs');

const file = process.argv[2], cmd = process.argv[3], arg = process.argv[4];
if (!file || !cmd) { console.error('usage: node query.js <canvas.json> <screens|frame|text|find|tokens> [arg]'); process.exit(1); }
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const nodes = doc.nodeChanges || [];

const key = (g) => (g ? g.sessionID + ':' + g.localID : null);
const byGuid = new Map();
const children = new Map(); // parentKey -> [node]
for (const n of nodes) byGuid.set(key(n.guid), n);
for (const n of nodes) {
  const p = n.parentIndex && key(n.parentIndex.guid);
  if (p == null) continue;
  if (!children.has(p)) children.set(p, []);
  children.get(p).push(n);
}
const hex = (c) => {
  if (!c) return '';
  const h = (x) => Math.round((x || 0) * 255).toString(16).padStart(2, '0');
  const base = '#' + h(c.r) + h(c.g) + h(c.b);
  return c.a != null && c.a < 1 ? base + h(c.a) : base;
};
const solidColors = (n) => (n.fillPaints || []).filter(p => p.type === 'SOLID' && p.visible !== false && p.color).map(p => hex(p.color));

function dump(node, depth, opts) {
  const pad = '  '.repeat(depth);
  let line = pad + (node.type || '?');
  if (node.name) line += ' "' + node.name + '"';
  if (node.size) line += ' [' + Math.round(node.size.x) + 'x' + Math.round(node.size.y) + ']';
  if (node.type === 'TEXT' && node.textData && node.textData.characters != null) {
    line += '  ⟶ ' + JSON.stringify(node.textData.characters);
    if (node.fontSize) line += '  ' + node.fontSize + 'px';
    if (node.fontName && node.fontName.family) line += ' ' + node.fontName.family;
  }
  const cols = solidColors(node);
  if (cols.length) line += '  fill:' + cols.join(',');
  console.log(line);
  const kids = children.get(key(node.guid)) || [];
  for (const c of kids) dump(c, depth + 1, opts);
}

function findFrames(substr) {
  const s = (substr || '').toLowerCase();
  return nodes.filter(n => (n.type === 'FRAME' || n.type === 'INSTANCE' || n.type === 'COMPONENT')
    && (n.name || '').toLowerCase().includes(s));
}

if (cmd === 'screens') {
  const canvases = nodes.filter(n => n.type === 'CANVAS');
  for (const c of canvases) {
    if (arg && !(c.name || '').toLowerCase().includes(arg.toLowerCase())) continue;
    const tops = (children.get(key(c.guid)) || []).filter(n => n.type === 'FRAME');
    console.log('=== PAGE: ' + (c.name || '(unnamed)') + '  (' + tops.length + ' top-level frames) ===');
    for (const t of tops) console.log('  • ' + (t.name || '(unnamed)') +
      (t.size ? '  [' + Math.round(t.size.x) + 'x' + Math.round(t.size.y) + ']' : ''));
  }
} else if (cmd === 'find') {
  if (!arg) { console.error('find needs a substring'); process.exit(1); }
  const m = findFrames(arg);
  console.log(m.length + ' match(es):');
  for (const n of m.slice(0, 100)) console.log('  ' + n.type + ' "' + n.name + '"');
} else if (cmd === 'frame' || cmd === 'text') {
  if (!arg) { console.error(cmd + ' needs a frame name'); process.exit(1); }
  const matches = findFrames(arg);
  if (!matches.length) { console.error('no frame matching "' + arg + '"'); process.exit(1); }
  // Prefer an exact name match, else the largest (likely the screen, not a sub-element).
  const exact = matches.find(m => (m.name || '').toLowerCase() === arg.toLowerCase());
  const target = exact || matches.sort((a, b) =>
    ((b.size ? b.size.x * b.size.y : 0) - (a.size ? a.size.x * a.size.y : 0)))[0];
  if (matches.length > 1) console.error('(' + matches.length + ' matches; using "' + target.name + '")');
  if (cmd === 'frame') {
    dump(target, 0, {});
  } else {
    const out = [];
    (function walk(n) {
      if (n.type === 'TEXT' && n.textData && n.textData.characters != null) out.push(n.textData.characters);
      for (const c of (children.get(key(n.guid)) || [])) walk(c);
    })(target);
    console.log(out.join('\n'));
  }
} else if (cmd === 'tokens') {
  const sets = new Map();
  for (const n of nodes) if (n.type === 'VARIABLE_SET') sets.set(key(n.guid), n.name);
  const vars = nodes.filter(n => n.type === 'VARIABLE');
  console.log(vars.length + ' variables in ' + sets.size + ' set(s):\n');
  const grouped = {};
  for (const v of vars) {
    const setName = sets.get(key(v.variableSetID && v.variableSetID.guid)) || '(no set)';
    const e = v.variableDataValues && v.variableDataValues.entries && v.variableDataValues.entries[0];
    const vd = e && e.variableData && e.variableData.value;
    let val = '';
    if (vd && vd.colorValue) val = hex(vd.colorValue);
    else if (vd && vd.floatValue != null) val = String(vd.floatValue);
    else if (vd && vd.textValue != null) val = JSON.stringify(vd.textValue);
    else if (vd && vd.alias) val = '→ alias';
    (grouped[setName] = grouped[setName] || []).push('  ' + (v.name || '?') +
      '  (' + (v.variableResolvedType || '?') + ')  ' + val);
  }
  for (const [set, lines] of Object.entries(grouped)) { console.log('## ' + set); console.log(lines.join('\n') + '\n'); }
} else {
  console.error('unknown command: ' + cmd); process.exit(1);
}
