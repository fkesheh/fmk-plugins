// =============================================================================
// single-shot-game-generation — Workflow script TEMPLATE
// =============================================================================
// Adapt the marked >>> SLOTS <<< below, then run this via the Workflow tool.
// You (the orchestrator) must already have: scaffolded the project, written the
// immutable contract + the STYLE BIBLE, and decided the module decomposition
// (validated with check_plan.py). This script runs the build end-to-end:
//   implement -> static-fix loop -> review (incl. AESTHETIC lens) -> verify ->
//   fix -> gate -> run + gameplay assert -> SCREENSHOT-JUDGE loop.
//
// Conventions this template assumes (rename to your stack):
//   - ROOT                : absolute repo path
//   - TYPECHECK / BUILD   : the static-analysis and build gate commands
//   - RUN_AND_ASSERT      : how an agent runs the game headless + asserts a flow
//   - SHOTS               : the screenshot set to capture + judge
//   - immutable contract files are NEVER edited by any subagent
//
// Notes for the Workflow runtime: Date.now()/Math.random() are unavailable — this
// script uses indices for labels. Judge agents Read the screenshot PNGs visually.
// =============================================================================

export const meta = {
  name: 'single-shot-game-build',
  description: 'Build a complete, visually beautiful game: parallel implementers (incl. art agents), compile-fix loop, multi-lens + aesthetic review, adversarial verify, fix, gate, run, and a screenshot/art-director-judge loop.',
  phases: [
    { title: 'Implement', detail: 'parallel module agents incl. dedicated art roles' },
    { title: 'Compile', detail: 'typecheck reporter + per-file fixers (bounded)' },
    { title: 'Review', detail: 'multi-lens incl. aesthetic, integration review' },
    { title: 'Verify', detail: 'adversarial verification of findings' },
    { title: 'Fix', detail: 'one fixer per affected file' },
    { title: 'Gate', detail: 'static-analysis + build must pass' },
    { title: 'Run', detail: 'run headless + assert a core gameplay flow' },
    { title: 'Judge', detail: 'screenshot set -> art-director judge -> fix loop' },
  ],
}

// >>> SLOT: paths and gate/run/screenshot commands ---------------------------
const ROOT = '/ABSOLUTE/PATH/TO/PROJECT'
const TYPECHECK = 'npx tsc --noEmit'
const BUILD = 'npx vite build'
// How an agent runs the game headless and asserts a core flow (adapt to stack):
const RUN_AND_ASSERT =
  'In ' + ROOT + ', build then drive the game in a headless browser (Playwright). Wait for the debug ' +
  'surface (e.g. window.__game ready), advance the sim a few seconds, trigger ONE core flow end-to-end ' +
  '(e.g. gather a resource OR spawn+resolve combat), and ASSERT the outcome changed. Assert zero console/page errors.'
// The screenshot set to capture + judge (each becomes one judge agent):
const SHOTS = [
  { key: 'default-day',  how: 'default RTS camera, midday',        path: 'verify/shots/default-day.png' },
  { key: 'hero-closeup', how: 'close-up of the town hall, midday', path: 'verify/shots/hero-closeup.png' },
  { key: 'overview-day', how: 'high overview of the settlement',   path: 'verify/shots/overview-day.png' },
  { key: 'dusk',         how: 'default camera at dusk/night',      path: 'verify/shots/dusk.png' },
]
const VISUAL_BAR = 8       // each rubric axis must reach this
const MAX_JUDGE_ROUNDS = 3 // bound the screenshot-judge loop

// Models — DEFINED CONCRETELY here because this script targets one runtime (the Claude Code Workflow
// tool). The skill's methodology stays model-agnostic; the workflow is where you pin actual names.
// Prefer the most cost-effective model that does each step well — this fans out to dozens of calls,
// so model choice dominates cost. Running elsewhere? Swap these for your environment's tiers (e.g. a
// single cost-effective coding model on Cursor). The orchestrator (whoever runs this) uses its own model.
const M_BUILD = 'sonnet' // implementers, reviewers, verifiers, fixers, judges, gate, run (mid-tier coding)
const M_MECH  = 'haiku'  // mechanical structured-output steps (parse checker output to JSON) — cheap+fast

// >>> SLOT: rules prepended to every agent -----------------------------------
const RULES = [
  '# Project rules (apply to every file you write)',
  '- Repo root: ' + ROOT + '. All paths are relative to it.',
  '- Strict typing; no stubs/TODOs; production quality; handle edge cases (empty selection, dead targets, no path, unaffordable cost).',
  '- The contract files are FINAL — never modify them; adapt your implementation to them.',
  '- Create ONLY your assigned files; other modules are written in parallel — import their documented exports and trust them.',
  '- ALL colors come from the frozen palette in the shared primitives file — never hard-code ad-hoc hex.',
  '- Do NOT run the dev server or build (a later phase compiles). Comments only where non-obvious.',
].join('\n')

// >>> SLOT: the CONTRACT text (Layer-2) — embed your full contract VERBATIM ---
// Must include: file-by-file public shapes + conventions, the STYLE BIBLE, and a
// per-ASSET model-sheet spec (silhouette + primitive budget + storytelling props),
// plus the world-density and atmosphere spec. This is the biggest lever on looks.
const CONTRACT = `>>> PASTE YOUR FULL CONTRACT + STYLE BIBLE + PER-ASSET VISUAL SPEC HERE <<<`

// >>> SLOT: module decomposition — disjoint files, validated by check_plan.py -
// Visuals are a DEDICATED workstream: keep the art roles split, not folded into one.
const MODULES = [
  // --- simulation / systems (adapt to your game) ---
  { key: 'core',     files: ['>>> core files <<<'],     spec: 'Input, events, camera, audio. Rock-solid, frame-rate independent.' },
  { key: 'entities', files: ['>>> entity files <<<'],   spec: 'The simulation heart: bulletproof FSMs; every state exits on death/depletion; never reference a dead target.' },
  { key: 'systems',  files: ['>>> system files <<<'],   spec: 'Pathfinding, combat, waves, production. Correctness first, then performance.' },
  // --- ART DEPARTMENT (dedicated, parallel — do NOT merge into one renderer) ---
  { key: 'art-world',      files: ['>>> terrain/water/sky files <<<'], spec: 'Focus: the world is the art department (1/5). Biome-tinted terrain, smooth blends, gentle heightfield, water with motion, sky. Atmospheric and readable. Use the palette + bake helper.' },
  { key: 'art-structures', files: ['>>> building mesh files <<<'],     spec: 'Focus: art department (2/5). Each building per its model-sheet line: distinct silhouette, 20–50 prims, storytelling props (banners/barrels/sacks). Bake static parts; keep animated parts live via userData.animate. Origin = footprint center.' },
  { key: 'art-characters', files: ['>>> unit/creature mesh files <<<'],spec: 'Focus: art department (3/5). Characterful blocky figures, pivot-anchored limbs, readable silhouettes per kind, walk/idle/attack as pure functions of phase.' },
  { key: 'art-fx',         files: ['>>> particles/fx files <<<'],      spec: 'Focus: art department (4/5). Pooled particles (dust/smoke/sparks), health bars, selection rings, projectiles. Never allocate per burst.' },
  { key: 'art-scene',      files: ['>>> scene/lighting/postfx files <<<'], spec: 'Focus: art department (5/5). Camera rig, ambient+key+fill, SHADOWS ON, day/night mood palettes + fog matched to sky, post-processing (tone mapping, subtle bloom, vignette). This is the agent that makes the scene feel lit, not flat.' },
  { key: 'world-gen',      files: ['>>> worldgen file <<<'],           spec: 'Densely populate the world per the contract: scatter vegetation/props in organic clusters with clearings at the specified counts. No empty plane.' },
  // --- ui + integrator ---
  { key: 'ui',   files: ['>>> ui files <<<'],            spec: 'Cohesive themed HUD per the style bible; readable over the 3D scene.' },
  { key: 'game', files: ['>>> game.ts + main entry <<<'],spec: 'Integrator: assemble the context, the loop, the removal pass; the only place broad concrete imports are allowed.' },
]

// =============================================================================
//  PHASE 1 — Implement (parallel)
// =============================================================================
phase('Implement')
log('Spawning ' + MODULES.length + ' module implementers in parallel (incl. ' +
    MODULES.filter(m => m.key.startsWith('art-')).length + ' dedicated art agents)')
const implResults = await parallel(MODULES.map((m) => () => agent(
  RULES + '\n\n' + CONTRACT + '\n\n# YOUR MODULE — "' + m.key + '"\nCreate EXACTLY these files and no others:\n' +
  m.files.map((f) => '- ' + ROOT + '/' + f).join('\n') +
  '\n\nModule guidance: ' + m.spec +
  '\n\nRe-read every file you wrote end-to-end before finishing; fix anything incomplete. Return a terse summary (data for the orchestrator, not prose).',
  { label: 'impl:' + m.key, phase: 'Implement', model: M_BUILD }
)))
log('Implementers done: ' + implResults.filter(Boolean).length + '/' + MODULES.length)

// =============================================================================
//  PHASE 2 — Compile-fix loop (mechanical reporter + per-file fixers)
// =============================================================================
phase('Compile')
const TSC_SCHEMA = {
  type: 'object', required: ['clean', 'errorsByFile'],
  properties: {
    clean: { type: 'boolean' },
    errorsByFile: { type: 'array', items: {
      type: 'object', required: ['file', 'errors'],
      properties: { file: { type: 'string' }, errors: { type: 'array', items: { type: 'string' } } } } },
  },
}
let compileClean = false
for (let round = 1; round <= 6 && !compileClean; round++) {
  const check = await agent(
    'In ' + ROOT + ' run: ' + TYPECHECK + ' 2>&1 | head -300\n' +
    'Report as structured output: group every error under its source file (repo-relative). Each error = "line:col code message". ' +
    'If zero errors, clean=true with empty errorsByFile. Do NOT edit files.',
    { label: 'tsc:round' + round, phase: 'Compile', schema: TSC_SCHEMA, model: M_MECH }
  )
  if (!check) break
  if (check.clean) { compileClean = true; log('Typecheck clean on round ' + round); break }
  const byFile = check.errorsByFile.filter((e) => e.errors.length > 0)
  log('Compile round ' + round + ': ' + byFile.reduce((s, e) => s + e.errors.length, 0) + ' errors / ' + byFile.length + ' files')
  const groups = []
  byFile.forEach((e, i) => { const g = i % 8; (groups[g] ||= []).push(e) })
  await parallel(groups.filter(Boolean).map((g, gi) => () => agent(
    'Repo: ' + ROOT + '. Contract files are IMMUTABLE ground truth — adapt implementations to them, never the reverse.\n' +
    'Fix ALL of these tsc errors. EDIT ONLY these files:\n' +
    g.map((e) => '## ' + e.file + '\n' + e.errors.map((er) => '- ' + er).join('\n')).join('\n') + '\n\n' +
    'CARVE-OUT: if an error is a missing/misnamed export in ANOTHER file (TS2305/2307/2724), make the minimal contract-conformant add/rename there — never a wholesale rewrite. Confirm YOUR files are clean afterward. Return a terse changelog.',
    { label: 'fix:r' + round + 'g' + gi, phase: 'Compile', model: M_BUILD }
  )))
}

// =============================================================================
//  PHASE 3 — Multi-lens review (incl. AESTHETIC) + adversarial verify
// =============================================================================
phase('Review')
const FINDINGS_SCHEMA = {
  type: 'object', required: ['findings'],
  properties: { findings: { type: 'array', items: {
    type: 'object', required: ['file', 'issue', 'severity'],
    properties: { file: { type: 'string' }, line: { type: 'number' }, issue: { type: 'string' },
      fix: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'major', 'minor'] } } } } },
}
const VERDICT_SCHEMA = { type: 'object', required: ['real', 'reason'],
  properties: { real: { type: 'boolean' }, reason: { type: 'string' } } }
const LENSES = [
  { key: 'lifecycle', prompt: 'LENS: game loop & entity lifecycle. Every system updated each frame; removal pass handles all side effects; emit/on event names match everywhere; no use of a dead target; scene add/remove balanced.' },
  { key: 'gameplay',  prompt: 'LENS: core gameplay loop end to end. Trace it as if playing; every step actually wired; costs paid; states entered/exited; win/lose conditions reachable.' },
  { key: 'wiring',    prompt: 'LENS: interface wiring. Every DOM id / cross-module call / constructor arg list matches; entry point imports styles; UI reaches the real ctx methods.' },
  { key: 'edge',      prompt: 'LENS: error-handling & edge cases. Empty selection, depleted node, no path, unaffordable, target destroyed mid-action — all handled without crashing.' },
  // ALWAYS include the aesthetic (static) lens — catches visual BUGS (beauty is judged in Phase Judge):
  { key: 'aesthetic', prompt: 'LENS: 3D visuals & performance (static). Every entity attaches a visible mesh at correct height; mesh factory names match exports; the bake/merge helper is used for static art; ALL colors come from the palette (flag any ad-hoc hex); userData.animate called for animated parts; SHADOWS configured (sun castShadow + reasonable frustum); selection rings/health bars attach+detach without leaks; particle pool recycles; no per-frame geometry/material allocation in hot paths.' },
]
const allMinor = []
const verifiedByLens = await pipeline(
  LENSES,
  (lens) => agent(
    'Repo: ' + ROOT + ' — a game just assembled from parallel modules; it typechecks but has NOT run. Hunt INTEGRATION/RUNTIME bugs. ' + lens.prompt +
    '\n\nReport <=12 findings: exact repo-relative file, line if known, the issue quoting the offending code, a suggested fix, severity (critical=breaks boot; major=a feature does not work; minor=polish). Only what you can EVIDENCE by quoting code.',
    { label: 'review:' + lens.key, phase: 'Review', schema: FINDINGS_SCHEMA, model: M_BUILD }
  ),
  (rev, lens) => {
    if (!rev) return []
    const serious = rev.findings.filter((f) => f.severity !== 'minor').slice(0, 10)
    for (const f of rev.findings) if (f.severity === 'minor') allMinor.push(f)
    return parallel(serious.map((f) => () => agent(
      'Repo: ' + ROOT + '. A reviewer claims this bug:\nFILE: ' + f.file + (f.line ? ' line ~' + f.line : '') + '\nISSUE: ' + f.issue + '\nSUGGESTED FIX: ' + (f.fix || 'n/a') +
      '\n\nAdversarially verify by reading the file + everything it touches. REAL only if you can quote the exact failing path. Default real=false when uncertain or already handled.',
      { label: 'verify:' + lens.key + ':' + f.file.split('/').pop(), phase: 'Verify', schema: VERDICT_SCHEMA, model: M_BUILD }
    ).then((v) => (v && v.real ? { ...f, verifiedReason: v.reason } : null))))
  }
)

// =============================================================================
//  PHASE 4 — Per-file fix
// =============================================================================
phase('Fix')
const confirmed = []
const seen = new Set()
for (const f of verifiedByLens.filter(Boolean).flat().filter(Boolean)) {
  const k = f.file + '::' + f.issue.slice(0, 60)
  if (!seen.has(k)) { seen.add(k); confirmed.push(f) }
}
log('Confirmed: ' + confirmed.length + ' (+ ' + allMinor.length + ' minors deferred)')
const fileGroups = new Map()
for (const f of confirmed) { (fileGroups.get(f.file) || fileGroups.set(f.file, []).get(f.file)).push(f) }
await parallel(Array.from(fileGroups.entries()).map(([file, fs]) => () => agent(
  'Repo: ' + ROOT + '. Fix these VERIFIED bugs. Primary target: ' + file + ' (minimal coordinated edits in directly-related files only if unavoidable; conform to the contract). Never edit the immutable contract files.\n\n' +
  fs.map((f, i) => (i + 1) + '. ' + (f.line ? '(line ~' + f.line + ') ' : '') + f.issue + '\n   Fix: ' + (f.fix || 'use judgment') + '\n   Evidence: ' + f.verifiedReason).join('\n') +
  '\n\nAfter editing, ' + TYPECHECK + ' must introduce no new errors. Return a terse changelog.',
  { label: 'apply:' + file.split('/').pop(), phase: 'Fix', model: M_BUILD }
)))

// =============================================================================
//  PHASE 5 — Gate (static-analysis + build)
// =============================================================================
phase('Gate')
const GATE_SCHEMA = { type: 'object', required: ['clean', 'notes'],
  properties: { clean: { type: 'boolean' }, notes: { type: 'string' } } }
const gate = await agent(
  'Repo: ' + ROOT + '. Final build gate. Run: ' + TYPECHECK + ' && ' + BUILD + '. If either fails, fix the errors (any file EXCEPT the immutable contract files) and rerun, up to 4 attempts. clean=true only when BOTH pass. notes = warnings/bundle size/anything suspicious.',
  { label: 'final-gate', phase: 'Gate', schema: GATE_SCHEMA, model: M_BUILD }
)
log('Gate: ' + (gate && gate.clean ? 'PASS' : 'see notes — ' + (gate && gate.notes)))

// =============================================================================
//  PHASE 6 — Run + assert a core gameplay flow
// =============================================================================
phase('Run')
const RUN_SCHEMA = { type: 'object', required: ['ran', 'flowAsserted', 'errors', 'notes'],
  properties: { ran: { type: 'boolean' }, flowAsserted: { type: 'boolean' },
    errors: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } }
const run = await agent(
  RUN_AND_ASSERT + '\nReturn structured output. If it crashes or the flow does not change state, ran/flowAsserted=false with the errors. Fix only if the fix is small and obvious; otherwise report.',
  { label: 'run-assert', phase: 'Run', schema: RUN_SCHEMA, model: M_BUILD }
)
log('Run: ran=' + (run && run.ran) + ' flow=' + (run && run.flowAsserted) + ' errors=' + ((run && run.errors.length) || 0))

// =============================================================================
//  PHASE 7 — Screenshot -> art-director judge -> fix  (bounded loop)
// =============================================================================
phase('Judge')
const JUDGE_SCHEMA = {
  type: 'object', required: ['shot', 'scores', 'overall', 'findings'],
  properties: {
    shot: { type: 'string' },
    scores: { type: 'object', required: ['composition','color','density','lighting','silhouette','cleanliness'],
      properties: { composition:{type:'integer'}, color:{type:'integer'}, density:{type:'integer'},
        lighting:{type:'integer'}, silhouette:{type:'integer'}, cleanliness:{type:'integer'} } },
    overall: { type: 'integer' },
    findings: { type: 'array', items: { type: 'object', required: ['axis','issue','file','fix','severity'],
      properties: { axis:{type:'string'}, issue:{type:'string'}, file:{type:'string'}, fix:{type:'string'},
        severity:{type:'string', enum:['major','minor']} } } },
  },
}
let visualPass = false
for (let round = 1; round <= MAX_JUDGE_ROUNDS && !visualPass; round++) {
  // 7a. capture the screenshot set (one agent; keep shadows + postfx ON)
  await agent(
    'In ' + ROOT + ', run the game headless (Playwright), let the scene populate + run ~3s with SHADOWS and post-processing ON, ' +
    'and save these screenshots (create dirs as needed):\n' +
    SHOTS.map((s) => '- ' + s.path + ' — ' + s.how).join('\n') +
    '\nReturn the list of files written.',
    { label: 'shots:r' + round, phase: 'Judge', model: M_BUILD }
  )
  // 7b. judge each shot in parallel against the style bible (judge READS the PNG)
  const judged = await parallel(SHOTS.map((s) => () => agent(
    'You are a demanding ART DIRECTOR. Read the screenshot at ' + ROOT + '/' + s.path + ' and score it 1-10 on each axis ' +
    '(composition, color cohesion, world density, lighting/mood, silhouette/detail, cleanliness=absence of programmer-art smells) ' +
    'against this STYLE BIBLE:\n\n' + CONTRACT + '\n\n' +
    'Return file-TARGETED findings only (which module to edit + the concrete change). Vague fixes are useless. severity major|minor.',
    { label: 'judge:' + s.key + ':r' + round, phase: 'Judge', schema: JUDGE_SCHEMA, model: M_BUILD }
  )))
  const shots = judged.filter(Boolean)
  const minAxis = Math.min(...shots.flatMap((j) => Object.values(j.scores)))
  const majors = shots.flatMap((j) => j.findings.filter((f) => f.severity === 'major'))
  log('Judge round ' + round + ': min axis=' + minAxis + ', ' + majors.length + ' major findings')
  if (minAxis >= VISUAL_BAR && majors.length === 0) { visualPass = true; break }
  // 7c. adversarially verify majors, then fix per file
  const verified = (await parallel(majors.map((f) => () => agent(
    'Re-read the screenshot ' + ROOT + '/' + f.file + ' context and the code. Is this art-direction finding REAL and worth a fix?\nISSUE: ' + f.issue + '\nFIX: ' + f.fix +
    '\nDefault real=false if it is taste-only or already acceptable.',
    { label: 'vjudge:r' + round + ':' + (f.file.split('/').pop() || 'x'), phase: 'Judge', schema: VERDICT_SCHEMA, model: M_BUILD }
  ).then((v) => (v && v.real ? f : null))))).filter(Boolean)
  const byFile = new Map()
  for (const f of verified) { (byFile.get(f.file) || byFile.set(f.file, []).get(f.file)).push(f) }
  await parallel(Array.from(byFile.entries()).map(([file, fs]) => () => agent(
    'Repo: ' + ROOT + '. Apply these ART-DIRECTION fixes. Primary target: ' + file + '. Never edit the immutable contract files (palette/primitives stay frozen — change USAGE, not the palette).\n\n' +
    fs.map((f, i) => (i + 1) + '. [' + f.axis + '] ' + f.issue + '\n   Fix: ' + f.fix).join('\n') +
    '\n\nAfter editing, ' + TYPECHECK + ' must stay clean. Return a terse changelog.',
    { label: 'artfix:r' + round + ':' + (file.split('/').pop() || 'x'), phase: 'Judge', model: M_BUILD }
  )))
}
log('Visual judge: ' + (visualPass ? 'PASS (bar ' + VISUAL_BAR + ')' : 'bound reached — see logs for remaining gaps'))

return {
  implemented: MODULES.map((m) => m.key),
  artAgents: MODULES.filter((m) => m.key.startsWith('art-')).map((m) => m.key),
  compileClean,
  confirmedFixes: confirmed.map((f) => f.file + ': ' + f.issue.slice(0, 80)),
  gate,
  run,
  visualPass,
}
