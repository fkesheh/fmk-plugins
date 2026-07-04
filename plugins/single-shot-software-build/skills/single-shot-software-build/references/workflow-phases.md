# The Six-Phase Workflow, in executable detail

Run this after the contract is committed and the module briefs are written. Before phase 1, scaffold the inert shell yourself: `package.json` (all deps pinned), tsconfig (strict), vite/build config, and kick off `npm install` in the background so it finishes while implementers write.

## Model tiering (fixed, not per-run judgment)

| Role | Tier | Why |
| --- | --- | --- |
| Architect (you) | top — the session model | the 6% where capability compounds |
| Implementers, reviewers, verifiers, fixers | mid (Sonnet-class) | high-volume work where a well-directed mid-tier model matches top-tier output per task, at a fraction of cost and latency |
| Error-grouping reporter | cheap (Haiku-class) | pure transcription |

Never route implementation to a top-tier model: measured head-to-head, top-tier-everywhere took ~2× wall-clock for a worse product. Escalate a single stuck task to a higher tier only after two failed mid-tier rounds.

## Phase 1 — Implement (parallel fan-out)

One agent per module, all simultaneously. Each prompt = RULES + DIRECTION + its MODULE BRIEF (see prompt-templates.md). No worktrees: disjoint file ownership is the isolation. Agents return a summary (files written, exports, notes), not file contents — keep your context clean.

## Phase 2 — Compile loop (≤ 6 rounds)

```
round:
  run `npx tsc --noEmit` (and `npm run build` on the final green round)
  if silent → done
  cheap reporter: group raw errors by file → [{file, errors[]}]
  spawn one mid-tier fixer PER FILE (parallel, no collisions):
    "Fix ONLY these compile errors in <file>. Contract is FINAL — if the error
     says your code disagrees with the contract, your code is wrong. No any,
     no @ts-ignore, no signature changes to exported functions other modules use."
```

Cross-module type mismatches resolve here mechanically — that's the contract doing its job. If the same error survives two rounds, read that one file section yourself; it usually means a fixer is oscillating between two interpretations, and one sentence of clarification in the fixer prompt settles it.

## Phase 3 + 4 — Review and Verify (pipelined, not sequential)

Spawn the five lens reviewers in parallel. AS EACH LENS COMPLETES, immediately fan its serious findings out to verifiers (one skeptic per finding, parallel) — do not wait for all reviewers before starting verification, or the slowest lens stalls everything. Drop `cosmetic-runtime` findings unless trivially co-located with a confirmed fix.

Expect roughly half of findings to be rejected. That is the system working, not reviewers failing.

## Phase 5 — Fix

Group confirmed findings by file; one fixer per file, parallel; fixer prompt from prompt-templates.md. If a confirmed bug spans files owned by no one fixer cleanly, assign both files to one fixer — never two fixers on one file.

## Phase 6 — Gate (mechanical; not done until green)

```
npx tsc --noEmit
npm run lint            (if configured)
npm run build
npm run seed && start server in background
smoke:
  - login with seeded credentials (curl the auth endpoint)
  - curl 3-5 core endpoints: expect 200 + contract-shaped JSON
  - curl one endpoint WITHOUT auth: expect 401 contract-shaped error
  - GET / on the web server: expect 200 HTML
kill background server
```

A gate failure returns to the phase that owns it (compile error → phase 2 loop; runtime 500 → read the stack trace, one targeted fixer). A green gate hands off to the judge loops (SKILL.md Phase 6, `judge-rubrics.md`) — the gate proves it runs, not that it's good.

## Workflow-tool script skeleton

If the Workflow tool is available, encode the above so the fan-out is deterministic and the run is resumable. Shape (adapt, don't transcribe blindly):

```js
export const meta = { name: 'single-shot-build', description: '...', phases: [
  { title: 'Implement' }, { title: 'Compile' }, { title: 'Review' },
  { title: 'Verify' }, { title: 'Fix' }, { title: 'Gate' } ] }

// Phase 1 — barrier is correct here: compile needs ALL modules present
const impl = await parallel(MODULES.map(m => () =>
  agent(RULES + DIRECTION + m.brief, { label: `impl:${m.name}`, phase: 'Implement' })))

// Phase 2 — compile loop: run tsc via an agent that returns structured errors,
// then one fixer per file, ≤ 6 rounds
// (tsc runner returns {clean: bool, byFile: [{file, errors}]})

// Phases 3+4 — pipeline() so each lens's findings verify immediately:
const verified = await pipeline(LENSES,
  l => agent(reviewPrompt(l), { phase: 'Review', schema: FINDINGS }),
  r => parallel(r.findings.filter(serious).map(f => () =>
        agent(verifyPrompt(f), { phase: 'Verify', schema: VERDICT })
          .then(v => ({ ...f, v })))))

// Phase 5 — group confirmed by file, one fixer per file (parallel)
// Phase 6 — gate agent runs the mechanical script; loop back on failure
```

No Workflow tool? Same structure with parallel Agent-tool calls per phase — you lose resumability and pipelining (verify after all reviews complete), keep everything else.

## Save the run

Commit alongside the app: the workflow script (or the exact agent prompts you used), the module briefs, and the contract commit hash. The reusable asset from a successful build is the workflow and contract that produced it — with them the result is reproducible on demand; without them it was weather.
