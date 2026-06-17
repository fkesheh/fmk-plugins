---
name: single-shot-game-generation
description: >-
  End-to-end generator for a complete, playable, VISUALLY BEAUTIFUL game built in one orchestrated
  multi-agent workflow. Use this whenever the user wants to build a whole game from scratch — "build
  me a game", "make a 3D/2D/browser game", "generate a complete game", "single-shot a game",
  "vibe-code a game", or describes a game concept they want turned into working software — ESPECIALLY
  when visual polish matters. The orchestrator writes an immutable contract plus a one-page
  art-direction style bible, fans the build out across parallel sonnet implementers (with dedicated
  world / structure / character / fx / lighting art agents), runs a review → adversarial-verify → fix
  gauntlet, then actually runs the game, captures screenshots, and iterates against an art-director
  judge until it looks great. Trigger it even if the user never says "contract", "workflow", or
  "agents" — if the task is a sizable from-scratch game, this is what makes it come together AND look
  good. Do NOT use it for small edits to an existing game, a single mechanic or asset, engine/tooling
  questions, or non-game apps.
---

# Single-Shot Game Generation

## Why this exists

Two failure modes kill from-scratch game builds. The first is **structural**: split the work across
many implementers and two of them invent the same interface with different signatures, the pieces
don't fit, and integration becomes a swamp. The second is **aesthetic**: the game runs, typechecks,
and is *ugly* — a flat grey plane with generic boxes — because nobody authored the look and nothing
ever looked at the output.

This skill cures both. It is the full pipeline: write one **immutable contract** so a fan-out can run
blind and parallel (the structural cure), AND author the **art direction up front** plus close the
loop with a **screenshot → art-director-judge → fix** cycle (the aesthetic cure). You are the
architect and art director; sonnet agents are the crew.

**The key insight, learned the hard way:** in a multi-agent game build, *the same model produces
beautiful or generic visuals depending almost entirely on the prompt, not its capability.* The magic
is not in the seed code — it's in the **art direction written into the contract** and in **having a
feedback loop that judges the rendered result.** A build that only checks correctness will look like
programmer art no matter how good the model is. This skill front-loads art direction and adds the
missing feedback loop.

This skill is the end-to-end sibling of `contract-first-prep` (which stops at the blueprint and hands
off). Here you run the whole thing.

## Non-negotiable method

- **You** plan, write the contract, write the style bible, and integrate. You do **not** hand-write
  module bodies.
- **All** implementation, review, fixing, and judging is done by subagents pinned to **`sonnet`**
  (and **`haiku`** for cheap mechanical parsing of tool output to JSON). Never `opus` for module
  work; never yourself.
- One orchestrated Workflow. Implementers never make design decisions — they fill bodies against a
  frozen contract.
- Set the model explicitly on **every** subagent call.

## Process

Work top to bottom. Every phase ends in a concrete artifact.

### Phase 0 — Read the idea, choose the stack, decide the four gates

- Pick the **simplest, most boring** stack that fits the idea. For 3D, TypeScript + Three.js + Vite
  is the proven default; for 2D, a canvas/WebGL or a small engine. Browser/canvas games are the
  sweet spot because the screenshot-judge loop (Phase 4) is trivial there.
- Decide four things in the stack's terms — everything downstream adapts to these:
  1. the **static-analysis gate** (typecheck / lint),
  2. the **build gate**,
  3. how you **run and observe** it (headless browser, a debug surface on `window`, structured logs),
  4. how you **capture screenshots** (headless browser screenshot, canvas `toDataURL` dump to file).
- If you can't capture a screenshot programmatically, you've lost the aesthetic feedback loop — fix
  that before continuing (e.g. add a tiny headless-browser screenshot script to the scaffold).

### Phase 1 — Scaffold with a strict gate + git

- Lay down minimal tooling, a **strict** checker config (strict mode, no implicit any, strict null
  checks, or the language equivalent — a lax checker lets cross-module divergence slip back in),
  `git init`, and commit the bare scaffold **before** writing the contract so the contract lands as a
  clean diff. Commit at every milestone after that.

### Phase 2 — Write the frozen contract + the style bible  ← the heart

This is where the build's structure *and* its beauty are decided. Produce both halves before any
subagent runs.

**2a. Two-layer contract (structural).**

Layer 1 — a small set of **literally immutable** files freezing cross-module boundaries + shared
vocabulary (adapt names to the stack):
1. **Type/interface contract** — every cross-module type, signature, event/DTO, and one shared
   **context handle** passed through the system. Types only, no logic; it must typecheck on its own.
2. **Data/config** — all constants, balance tables, enums. Pure data, no logic.
3. **Shared primitives** — the handful of helpers many modules need. **For a game this MUST include
   the shared *visual* vocabulary** (see 2c) — that's the game-specific extension over a plain
   contract-first build.

Layer 2 — a **CONTRACT spec text** embedded **verbatim** in every implementer prompt: each module's
public shapes, conventions, and a file-by-file spec. Implementers fill bodies + privates; they may
**never** alter the frozen interfaces or public exported shapes.

For the deep craft of writing a contract that survives parallel implementation — completeness, the
star-shaped context handle, an event contract, semantics-in-comments — the `contract-first-prep`
skill is the companion reference. Don't re-derive it; reuse it.

**2b. The STYLE BIBLE (aesthetic) — author this yourself, freeze it.**

A one-page art-direction doc, embedded verbatim in every *visual* implementer prompt. It is the
single biggest lever on how the game looks. Write it before any art agent runs. Full template and
worked example: **`references/style-bible.md`**. It must pin down: mood + references; ONE coherent
material model (flat/toon OR PBR-with-mandatory-IBL, never mixed); a small harmonious named **color
palette** that ALL colors trace to (ad-hoc hex in implementer code is a contract violation a reviewer
checks); the lighting recipe; camera framing; and the silhouette language for assets.

**2c. Freeze the shared visual vocabulary into Layer 1.**

So N parallel art agents stay visually consistent, the immutable primitives file must export: the
curated **palette** (named colors), shared **mesh/draw factories** (box/cyl/cone/sphere, or
sprite/tile equivalents), a **geometry-merge / draw-batch / "bake" helper**, and a **seeded RNG**.
Every art agent imports these — no exceptions. This shared vocabulary is what makes five independent
agents' output look like one art-directed game instead of five.

**2d. The CONTRACT carries a per-ASSET visual spec — dense, not vague.**

"Detailed and nonblank" is a banned brief — it reliably produces generic results. Instead, in the
CONTRACT text describe **every** building / unit / creature / prop by name with: a distinct readable
**silhouette** at gameplay distance, a **generous primitive/part budget** (e.g. 20–50 each), and
concrete **storytelling details** (banners, barrels, sacks, fences, chimneys, wear). Write it like a
model sheet. Likewise specify the **world population** (densely scatter vegetation/props in organic
clusters — never an empty plane; give target densities) and the **atmosphere** (real-time shadows ON,
day/night with mood palettes, fog matched to sky, post-processing where the stack allows).

### Phase 3 — One Workflow: implement → gauntlet → gate

Validate the decomposition with **`scripts/check_plan.py`** (disjoint + total, integrator named,
contract files separate) before running. Then adapt **`references/build-workflow.template.js`** and
run it via the **Workflow** tool. Re-assert contract immutability in every phase. The shape:

- **3a. Implement (parallel · sonnet)** — N disjoint modules, no two agents share a file. Prompt =
  RULES + CONTRACT + sealed file list + brief. **Visuals are a dedicated multi-agent workstream**,
  not one renderer agent — minimum five art roles: *world/environment* (terrain, water, sky),
  *structures*, *characters/creatures* (with idle/walk/work/attack animation), *fx/particles*, and
  *scene & lighting* (camera rig, shadows, day/night, post-processing). Folding all rendering into one
  agent is the single biggest cause of generic-looking output.
- **3b. Static-fix loop (haiku reporter + sonnet per-file fixers · bounded)** — structured errors
  grouped by file. Carve-out: a minimal contract-conformant symbol add/rename in a neighbor's file
  only for a missing/misnamed-symbol or broken-import error — never a wholesale rewrite.
- **3c. Multi-lens review (~5 lenses · sonnet)** — pick correctness/integration, state & data-flow,
  edge-cases, interface wiring + any domain lens, **and always include the AESTHETIC lens** (does
  every entity attach a visible mesh; bake helper used; colors trace to the palette; shadows/animate
  hooks wired; no per-frame allocation in hot paths). Note: this static aesthetic lens catches visual
  *bugs* but cannot judge *beauty* — that's Phase 4's job.
- **3d. Adversarial verify (sonnet · pipelined)** — each finding to an independent skeptic told to
  REFUTE; default real=false; survives only if it quotes the failing path.
- **3e. Per-file fix (sonnet)** — dedup, group by file, one fixer per file.
- **3f. Gate (sonnet)** — run static-analysis + build; fix until both pass; may edit any file except
  the immutable contract files.

### Phase 4 — Run it, then JUDGE what it looks like  ★ the upgrade that makes it beautiful

Static green ≠ works, and works ≠ beautiful. Close both loops:

- **Gameplay:** actually run it; trigger a core flow through its real interface (headless browser /
  debug surface) and **assert** the outcome; confirm zero console/page errors. Capture evidence.
- **Aesthetic judge loop:** capture screenshots at **≥3 camera angles and ≥2 times of day**, plus one
  close-up of a hero asset. Feed each to a **sonnet "art-director judge"** that scores against the
  style bible on the rubric in **`references/visual-judge-rubric.md`** (composition, color cohesion,
  world density, lighting/mood, silhouette readability, programmer-art smells) — structured output,
  1–10 per axis + concrete, file-targeted fixes. Adversarially verify findings, run the per-file fix
  loop, then **RE-SCREENSHOT and RE-JUDGE.** Iterate until every axis clears the bar (e.g. ≥8). This
  closed loop on the *rendered result* is what lets the build surpass, not just match, a one-shot
  generation.

### Phase 5 — Harden

Fix the bugs only running reveals. Keep the gameplay assertions **and** the screenshot set (baseline
images) as a **regression harness**. Final commit; the git history should read scaffold → contract →
build → hardening.

## Definition of done

- [ ] Scaffold committed; static-analysis + build gates both **green**.
- [ ] Contract is **complete** (every cross-boundary call resolves to a signature), **types-only**;
      config is **pure data**; shared primitives include the **visual vocabulary** (palette +
      mesh/draw factories + bake helper + RNG).
- [ ] **Style bible** written and was embedded in every visual implementer prompt.
- [ ] Decomposition **disjoint + total**, integrator named (verified with `check_plan.py`); visuals
      were a **dedicated multi-agent workstream** (≥5 art roles), not one renderer agent.
- [ ] Game **runs**, a core gameplay flow is **asserted** through its real interface, **zero errors**.
- [ ] **Art-director judge clears the bar on every axis**; shadows + day/night + atmosphere present;
      all colors trace to the shared palette; the world reads as populated and art-directed at
      gameplay distance AND charming in close-up.
- [ ] Gameplay assertions + screenshot baseline kept as a regression harness; clean git history.

## Anti-patterns (stop if you see these)

- **"Render the scene, make it detailed and nonblank" as the only art direction** — the textbook
  cause of generic output. Write the dense per-asset style bible instead.
- **All rendering folded into one module/agent** — kills the parallel art workstream and the result
  reads as one tired generalist's work. Split into ≥5 art roles.
- **No screenshot-judge loop** — then nothing ever looks at the output and "beautiful" is left to
  luck on first generation. The loop in Phase 4 is the headline feature; don't skip it.
- **Disabling shadows / post-processing "for test performance"** — a known regression that flattens
  the look. Keep them in the product; run the visual verification at reduced resolution instead.
- **Mixing material models** (flat-shaded here, PBR there) or **PBR with no environment map/IBL** —
  both read as inconsistent or plastic. Pick one model in the style bible and enforce it.
- **Ad-hoc hex colors in implementer code** — defeats the shared palette and the cross-agent
  cohesion it buys. All colors come from the frozen palette.
- **`any` / untyped holes in the contract**, **a file owned by two modules**, **concrete cross-module
  imports outside the integrator**, **logic in the config file** — the standard contract-first
  hazards; they break the fan-out.
- **Implementing module bodies yourself** — you've then produced one serial version and parallelized
  nothing, and the contract was never stress-tested by independent implementers.

## Bundled resources

- **`references/style-bible.md`** — how to write the one-page art-direction style bible + per-asset
  model-sheet spec, with a worked low-poly example. Read before Phase 2b.
- **`references/visual-judge-rubric.md`** — the art-director judge: screenshot protocol, the 6-axis
  scoring rubric, the JSON schema for findings, and the pass bar. Read before Phase 4.
- **`references/build-workflow.template.js`** — a ready, stack-agnostic Workflow script (implement →
  static-fix → review+aesthetic-lens → verify → fix → gate → run → screenshot-judge loop). Adapt the
  marked slots and run via the Workflow tool. Read at Phase 3.
- **`scripts/check_plan.py`** — validate the module decomposition is disjoint + total before fan-out.
- **`prompts/contract-first-game-build.md`** — the original prose prompt this skill was distilled
  from (the contract-first template + the Visual Excellence Mandate). Useful as a single paste-and-run
  prompt for an orchestrator model, or as provenance for why the method is shaped this way.
