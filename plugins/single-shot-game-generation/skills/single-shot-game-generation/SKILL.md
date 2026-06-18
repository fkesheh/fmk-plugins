---
name: single-shot-game-generation
description: >-
  End-to-end generator for a complete, playable, visually beautiful game built in one orchestrated
  multi-agent workflow. Use whenever the user wants a whole game from scratch — "build me a game",
  "make a 3D/2D/browser game", "generate a complete game", "single-shot a game", "vibe-code a game",
  or describes a game concept to turn into working software, especially when visual polish matters.
  The orchestrator writes an immutable contract plus a one-page art-direction style bible, fans the
  build across parallel implementers (dedicated world/structure/character/fx/lighting/audio
  art agents), runs a review/verify/fix gauntlet, then runs the game, captures screenshots, and
  iterates against an art-director judge until it looks great. Trigger even if the user never says
  "contract", "workflow", or "agents". Do NOT use for small edits to an existing game, a single
  mechanic or asset, engine/tooling questions, or non-game apps.
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
architect and art director; the subagents are the crew.

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
- **All** implementation, review, fixing, and judging is done by subagents — never by you directly.
- One orchestrated Workflow. Implementers never make design decisions — they fill bodies against a
  frozen contract.

### Model policy — a nudge, not a lineup

This methodology is **model-agnostic on purpose**: it names no specific model, because your runtime
decides what's available (a Cursor user reaches for a cost-effective coding model; a Claude user has a
mid-tier and a cheap-fast tier; a Codex user has neither of those). So treat the below as a nudge, and
**pin the actual model names in the concrete workflow script you generate**, not here — that script
targets one runtime, so it's the right place to name models (see the template's `M_BUILD` / `M_MECH`).
Set the model explicitly on every subagent call there.

A multi-agent build fans out to dozens of calls, so model choice dominates cost. **Prefer the most
cost-effective model that does each step well**, matching tier to difficulty:

- **Orchestrator (you):** your strongest reasoning model — you're doing the planning, contract, and
  art direction.
- **Implementers / reviewers / verifiers / per-file fixers / judges:** a solid mid-tier coding model
  is usually enough; reserve a stronger tier for the hardest review/verify steps and drop to a cheaper
  one where a step is simple.
- **Mechanical structured-output steps** (parsing tool output to JSON): the cheapest fast model that
  reliably returns valid JSON.

If you don't know which models are available or how to weigh cost vs. quality for this run, **ask the
user** rather than guessing — a quick question here can save a large bill. Honor any budget/preference
the user states.

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

**2e. Cover the full feature surface + game feel — don't spec a tech demo.**

A game that is *pretty* but *thin* still feels like a demo. The contract must enumerate the **whole
feature surface the idea implies**, not just the core loop — and beauty includes how it *feels*, not
only how it looks. Before freezing, walk the idea and make sure the contract covers:
- **Audio** — synthesized or asset-based SFX tied to events (build, gather, hit, death, UI), plus
  ambience/music. Silence reads as unfinished; this is half of "polish" and a screenshot can't catch
  its absence, so it must be specified up front.
- **Game feel / juice** — the feedback layer that makes actions satisfying: hit reactions, screen
  shake, damage numbers, particle bursts on events, easing on UI, selection/hover states. Name the
  juice in the per-asset/fx spec the same way you name silhouettes.
- **Meta-progression & economy depth** — upgrades/tech, conversions/trades, tiers — whatever gives the
  player decisions beyond the first loop. A lean core loop with no progression exhausts fast.
- **UI/HUD completeness & stats** — every resource/state the player must read, plus run stats for the
  end screen. The context handle should expose **every** cross-cutting capability the systems need.
A useful check: list the verbs and feedback a player experiences in 5 minutes of play; each must
resolve to something in the contract. Gaps here are why a technically-correct build feels hollow.

### Phase 2.5 — Freeze gate: adversarially review the prep BEFORE you freeze  ★ catches the silent killers

The contract is about to become **immutable**, so any flaw frozen in is inherited by every implementer
and can never be fixed during the build. The typecheck gate proves the contract *compiles*; it cannot
see the *judgment* failures that actually sink builds — a helper whose name lies about its body, a
style bible whose mood the frozen kit can't produce, a decomposition that leaves an asset category
unowned, a "gate" that scores nothing. So before the fan-out, run an **adversarial contract gauntlet**:
spawn a **panel (≥3) of independent, strong-tier** reviewers — *not* the prep's author — each told to
**refute** "this prep is sound and ready to freeze" across five lenses: **contract coherence**,
**decomposition totality** (is any responsibility/asset owned by *no* module?), **doc↔code
self-consistency** (does any frozen artifact contradict another?), **visual buildability** (can the
frozen kit actually produce the bible's mood?), and **gate completeness** (does the workflow run+assert
*and* score rendered output?). A `fatal`/`major` finding **blocks the fan-out**; fix the contract, then
freeze and proceed. Lenses, the reviewer prompt, the finding schema, and an optional visual
tracer-bullet are in **`references/contract-gauntlet.md`**.

This is also the best compensation when the orchestrator was a weaker model: independent strong-tier
reviewers catch the contradictions the author couldn't see. (Validated: run blind on a real failed
low-model build, a 3-reviewer panel returned 3/3 REJECT and caught every known killer plus one the
human post-mortem had missed.)

### Phase 3 — One Workflow: implement → gauntlet → gate

Validate the decomposition with **`scripts/check_plan.py`** (disjoint + total, integrator named,
contract files separate) before running. Then adapt **`references/build-workflow.template.js`** and
run it via the **Workflow** tool. Re-assert contract immutability in every phase. The shape:

- **3a. Implement (parallel)** — N disjoint modules, no two agents share a file. Prompt =
  RULES + CONTRACT + sealed file list + brief. **Visuals are a dedicated multi-agent workstream**,
  not one renderer agent — minimum five art roles: *world/environment* (terrain, water, sky),
  *structures*, *characters/creatures* (with idle/walk/work/attack animation), *fx/particles*, and
  *scene & lighting* (camera rig, shadows, day/night, post-processing). Folding all rendering into one
  agent is the single biggest cause of generic-looking output. Give **audio & game-feel** its own role
  too (synthesized/asset SFX + ambience + the juice layer: screen shake, hit reactions, event
  particles) — feel is as much a workstream as visuals, and the screenshot judge can't see its absence.
- **3b. Static-fix loop (bounded)** — a cheap mechanical-tier agent parses the checker output into
  structured errors grouped by file; per-file fixers repair them. Carve-out: a minimal contract-conformant symbol add/rename in a neighbor's file
  only for a missing/misnamed-symbol or broken-import error — never a wholesale rewrite.
- **3c. Multi-lens review (~5 lenses)** — pick correctness/integration, state & data-flow,
  edge-cases, interface wiring + any domain lens, **and always include the AESTHETIC lens** (does
  every entity attach a visible mesh; bake helper used; colors trace to the palette; shadows/animate
  hooks wired; no per-frame allocation in hot paths). Note: this static aesthetic lens catches visual
  *bugs* but cannot judge *beauty* — that's Phase 4's job.
- **3d. Adversarial verify (pipelined)** — each finding to an independent skeptic told to
  REFUTE; default real=false; survives only if it quotes the failing path.
- **3e. Per-file fix** — dedup, group by file, one fixer per file.
- **3f. Gate** — run static-analysis + build; fix until both pass; may edit any file except
  the immutable contract files.

### Phase 4 — Run it, then JUDGE what it looks like  ★ the upgrade that makes it beautiful

Static green ≠ works, and works ≠ beautiful. Close both loops:

- **Gameplay:** actually run it; trigger a core flow through its real interface (headless browser /
  debug surface) and **assert** the outcome; confirm zero console/page errors. Capture evidence. Also
  exercise the **feedback/juice hooks** (assert an SFX/event/particle actually fires on a core action)
  — feel can't be screenshotted, so the run phase is where its presence is verified.
- **Aesthetic judge loop:** capture screenshots at **≥3 camera angles and ≥2 times of day**, plus one
  close-up of a hero asset. Feed each to an **"art-director judge"** subagent that scores against the
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
- [ ] **Full feature surface covered** — audio/SFX, game-feel/juice, meta-progression/economy depth,
      UI/HUD + run stats — not just the core loop; the context handle exposes every cross-cutting
      capability. (Walk the 5-minute verb/feedback list; each resolves to the contract.)
- [ ] Decomposition **disjoint + total**, integrator named (verified with `check_plan.py`); visuals
      were a **dedicated multi-agent workstream** (≥5 art roles), not one renderer agent.
- [ ] **Contract gauntlet passed before freeze** — a ≥3 independent strong-tier panel adversarially
      reviewed the prep and no `fatal`/`major` prep finding is unresolved.
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
- **Core-loop-only contract** — a gorgeous world with no audio, no juice, and no progression reads as
  a tech demo, not a game. Spec the full feature surface (2e); silence and dead feedback are as
  damaging as flat lighting, and the screenshot judge can't catch them.
- **Freezing the contract without the gauntlet** — type-clean ≠ sound. The judgment failures (a
  name-vs-body lie, an unowned asset category, an unbuildable mood, a scoreless gate) compile fine and
  then get inherited, unfixably, by every implementer. Run Phase 2.5 first — especially if the
  orchestrator was a weaker model, where authoring blind spots are largest.
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
- **`references/contract-gauntlet.md`** — the pre-freeze adversarial contract review: the five
  refute-lenses, the reviewer prompt, the finding/verdict schema, the panel + fix-before-freeze
  protocol, and an optional visual tracer-bullet. Read before Phase 2.5.
- **`references/visual-judge-rubric.md`** — the art-director judge: screenshot protocol, the 6-axis
  scoring rubric, the JSON schema for findings, and the pass bar. Read before Phase 4.
- **`references/build-workflow.template.js`** — a ready, stack-agnostic Workflow script (implement →
  static-fix → review+aesthetic-lens → verify → fix → gate → run → screenshot-judge loop). Adapt the
  marked slots and run via the Workflow tool. Read at Phase 3.
- **`scripts/check_plan.py`** — validate the module decomposition is disjoint + total before fan-out.
- **`prompts/contract-first-game-build.md`** — the original prose prompt this skill was distilled
  from (the contract-first template + the Visual Excellence Mandate). Useful as a single paste-and-run
  prompt for an orchestrator model, or as provenance for why the method is shaped this way.
