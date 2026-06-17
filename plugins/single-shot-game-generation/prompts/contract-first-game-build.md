---
name: contract-first-game-build
title: Contract-first, multi-agent, verified build — with Visual Excellence Mandate
description: >-
  The original prose prompt this plugin was distilled from. A generic, stack-agnostic template for
  building a complete, working, verified deliverable in one orchestrated multi-agent workflow
  (contract-first → fan-out → review/verify/fix gauntlet → run-and-verify → harden), plus an appended
  Visual Excellence Mandate that makes generated games beautiful: orchestrator-owned art direction, a
  shared visual vocabulary, dedicated art agents, atmosphere, and a screenshot → art-director-judge
  feedback loop. Paste a concrete game idea into the slot at the bottom and run it as a single prompt
  to an orchestrator model. The `single-shot-game-generation` SKILL.md is the structured form of this.
category: workflow
tags: [contract-first, multi-agent, workflow, game, art-direction, visual, screenshot-judge, verified-build]
author:
  name: Foad Kesheh
  email: foad@fmktech.com.br
usage: >-
  Keep everything above "The idea" fixed; paste your project/game idea into the slot at the bottom.
  The Visual Excellence Mandate is wired into Steps 3c/4, so it runs as part of the method.
---

# Contract-first, multi-agent, verified build — generic template

> How to use: keep everything above "The idea" fixed; append your idea/spec in the slot at the bottom.

## Mission
Build the software described under **The idea** (bottom) as a complete, working, verified deliverable —
not a demo. Match the idea's ambition; cover its core flows end-to-end.

## Non-negotiable method
You are the orchestrator/architect. YOU plan and write the contract. ALL implementation, review, and
fixing is done by subagents pinned to `sonnet` (and `haiku` for cheap mechanical steps) — never `opus`,
never you hand-writing modules. One orchestrated workflow. Implementers never make design decisions.

### Model assignment (set the model explicitly on every subagent call)
- Orchestrator (planning, contract, integration): your own model
- Implementers · fixers · reviewers · verifiers · per-file fixers · gate: **sonnet**
- Mechanical structured-output steps (parsing tool output to JSON): **haiku**

## Step 0 — Read the idea and choose the stack
Pick the simplest stack that fits. Decide the project's three real gates in that stack's terms: its
static-analysis gate (type-check/lint), its build gate, and how you'll run and observe it (browser,
CLI, HTTP, public API/tests). Every step adapts to these.

## Step 1 — Scaffold + git
Create the project, `git init` immediately, minimal config, commit the scaffold. Commit at milestones.

## Step 2 — Write the frozen contract yourself (before any subagent)
Remove design authority from implementers: sealed file list + TWO-LAYER frozen contract; they only fill
bodies + private internals.
Layer 1 — a small set of files (often three) declared LITERALLY IMMUTABLE in the rules (adapt names to
the stack); the principle is to freeze cross-module boundaries + shared vocabulary:
  1. the interface/type contract — shared types/signatures + the events/DTOs crossing boundaries +
     one shared context handle passed through the system;
  2. the data/config/constants;
  3. the shared primitives/utilities + conventions.
Layer 2 — a CONTRACT spec text embedded VERBATIM in every implementer prompt fixing each module's
public shapes + conventions + a file-by-file spec.
Division of authority: implementers fill bodies + privates; may NOT alter the frozen cross-module
interfaces or public exported shapes.
Also build it OBSERVABLE from outside (debug surface / structured logs / clean testable API) so Step 4
can verify real behavior.

## Step 3 — One Workflow: implement → gauntlet → gate
Re-assert immutability of the contract files in EVERY phase.
3a Implement (parallel · sonnet): N disjoint modules, no two agents share a file. Prompt = RULES +
   CONTRACT + sealed file list + brief. Production quality, no stubs, edge cases.
3b Static-fix loop (haiku reporter + sonnet per-file fixers · bounded): structured errors grouped by
   file. CARVE-OUT: minimal contract-conformant symbol/export add or rename in a NEIGHBOR's file ONLY
   for a missing/misnamed-symbol or broken-import error — NEVER a wholesale rewrite.
3c Multi-lens review (~5 lenses · sonnet): pick lenses matching the idea's risk surface from —
   correctness/integration, state & data-flow, error-handling & edge-cases, interface wiring,
   security/input-validation, performance, + any domain lens. Structured findings.
   For visual products, ADD the aesthetic lens + screenshot-judge loop from section G below.
3d Adversarial verify (sonnet · pipelined): each finding to an independent skeptic told to REFUTE;
   default real=false; survives only if it quotes the failing path.
3e Per-file fix (sonnet): dedup, group by file, ONE fixer per file.
3f Gate (sonnet): run static-analysis + build; fix until all pass; may edit any file EXCEPT the
   immutable contract files.

## Step 4 — Verify by running it
Static green ≠ works. Actually run it; trigger a core flow through its real interface (headless
browser / CLI / endpoints / public API) and ASSERT the outcome; confirm zero errors. Capture evidence.
For visual products, capture screenshots and run the art-director judge (section G).

## Step 5 — Harden
Fix the bugs only running reveals. Keep the verification as a regression harness. Commit.

## RULES (prepended to every agent)
- contract files FINAL — never modify; adapt. - create ONLY your files; trust neighbors' exports.
- match the stack's idioms; strong typing where available; no stubs/TODOs; handle edge cases.
- comments only where non-obvious.

## Definition of Done
static-analysis clean + build clean · runs and is verified through its real interface with zero
errors · the idea's core flows work end-to-end · git history scaffold → hardening + regression harness.

---

## The idea — append yours here ▼

## The idea — <PASTE YOUR GAME HERE>
(e.g. "A 3D low-poly medieval survivors RTS: build a village economy, raise an army,
survive escalating night raids; lose if the keep falls." — swap in any game.)

═══════════════════════════════════════════════════════════════════════════
## VISUAL EXCELLENCE MANDATE  (applies on top of the method above)
This game is judged on how it LOOKS, not only on whether it runs. Treat art
direction as a FIRST-CLASS, ORCHESTRATOR-OWNED deliverable. Beauty is authored
in the contract + prompts, never left to implementers to improvise. Target bar:
visibly more polished, atmospheric, and cohesive than a competent baseline.

### A. The orchestrator writes a STYLE BIBLE (part of Step 2, frozen)
Before any subagent, author a 1-page art direction doc and embed it VERBATIM in
every visual implementer prompt:
- Mood & references (e.g. "golden-hour storybook low-poly; cozy, hand-crafted").
- ONE coherent material model — pick flat-shaded/toon OR PBR, never mixed.
  If PBR: an environment map / IBL is MANDATORY (PBR with no IBL looks flat/plastic).
- A small, harmonious COLOR PALETTE (a limited named ramp). ALL colors come from
  it — ad-hoc hex literals in implementer code are a RULE violation (review checks this).
- Lighting recipe, camera framing, and the silhouette language for assets.

### B. Layer-1 immutable primitives MUST include the shared visual vocabulary
So N parallel art agents stay consistent, freeze into the immutable primitives file:
- the curated PALETTE (named colors), shared mesh/material factories
  (box/cyl/cone/sphere or sprite/tile equivalents), a geometry-merge / draw-batch /
  "bake" helper, and a seeded RNG. Every visual agent imports these — no exceptions.

### C. The CONTRACT carries a per-ASSET visual spec (dense, not vague)
"Detailed and nonblank" is BANNED as a brief. Instead, for EVERY building / unit /
creature / prop, the contract specifies: a distinct readable SILHOUETTE at gameplay
distance, a GENEROUS primitive/part budget (e.g. 20–50 each), and concrete
STORYTELLING details (banners, barrels, sacks, fences, chimneys, wear). Describe
each one by name. This is the single biggest lever — write it like a model sheet.

### D. Visuals are a DEDICATED multi-agent workstream (not one renderer agent)
Split rendering across parallel sonnet "art department" agents, minimum:
  1. Environment / world  — terrain with biome vertex-tinting, water, skybox.
  2. Structures           — buildings, with construction/animated parts.
  3. Characters/creatures — rigged, with idle/walk/work/attack animation funcs.
  4. FX / particles       — dust, smoke, sparks, impacts, weather.
  5. Scene & lighting      — camera rig, lights, shadows, day/night, post-processing.
NEVER fold all visuals into a single module/agent.

### E. A POPULATED, atmospheric world (no empty planes)
Mandate a worldgen that densely scatters vegetation/rocks/decorative props in
ORGANIC CLUSTERS with clearings — specify target densities (e.g. hundreds of trees +
hundreds of props). The world must look lived-in before the player does anything.

### F. Atmosphere is required, not optional
- Real-time SHADOWS ON. Do NOT disable shadows for test performance — instead run
  visual verification at reduced resolution / software-GL but keep shadows in the
  product. (This is a known regression trap.)
- Day/night cycle with mood palettes (dawn / noon / dusk / night), fog color matched
  to sky, ambient + key + fill lighting.
- Post-processing where the stack allows: tone mapping, bloom, contact shadows/SSAO,
  subtle vignette + color grade. Ambient motion: water ripple, foliage/flag sway.

### G. NEW review lens + screenshot JUDGE loop (extends Steps 3c/3d/4) ★ key upgrade
Correctness review does NOT improve looks. Add an AESTHETIC pass that judges OUTPUT:
- Step 4 verification MUST capture canvas screenshots at ≥3 camera angles AND ≥2
  times of day, plus one close-up of a hero asset.
- Feed each screenshot to a sonnet "art-director judge" that scores against the
  style bible on: composition, color cohesion, world density, lighting/mood,
  silhouette readability, and "empty/flat/programmer-art" smells. Structured output
  with a 1–10 per axis + concrete, file-targeted fixes.
- Adversarially verify findings (Step 3d), then run the per-file fix loop, then
  RE-SCREENSHOT and RE-JUDGE. Iterate until every axis clears a set bar (e.g. ≥8).
- Keep the screenshot set as a visual-regression harness (baseline images).

### Definition of Done (visual additions)
The screenshot judge clears the bar on every axis · shadows + day/night + atmosphere
present in the product · all colors trace to the shared palette · the world reads as
populated and art-directed at gameplay distance AND charming in close-up.
═══════════════════════════════════════════════════════════════════════════
