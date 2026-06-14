---
name: contract-first-prep
description: >-
  Prepare a greenfield codebase for fast, parallel, multi-agent implementation by writing an
  immutable CONTRACT first. Use this whenever the user wants to build a whole app, game, service,
  library, or system from scratch — "build me a full X", "implement this entire Y", "create a
  complete Z from scratch", "scaffold a new ..." — especially when you intend to fan the work out
  across multiple subagents or a Workflow. It produces four artifacts: a project scaffold with a
  typecheck gate, a single-source-of-truth type/interface contract, a pure-data config file, and a
  non-overlapping module decomposition with per-module specs — the groundwork that lets many
  implementers work in parallel without colliding. Trigger it even when the user never says
  "contract", "parallel", or "subagents": if the task is a sizable from-scratch build, this prep is
  what makes the build actually come together. Do NOT use it for small edits, single-file scripts,
  or work inside an existing codebase that already has its own structure.
---

# Contract-First Prep

## Why this exists

A large build fails in a predictable way when you split it across many implementers: two of them
independently invent the same interface with different signatures, a third hard-wires a concrete
class a fourth was still changing, and the pieces don't fit. The cure is counterintuitive — you go
*slower* at the start. Before any feature code exists, you write one **immutable contract** that
every module implements against. Implementers then work blind and in parallel, and the pieces snap
together because they were all measured against the same ruler.

This skill covers the **pre-build phase only**. Its deliverable is a blueprint that a fan-out can
execute. It deliberately stops *before* running the fan-out — spawning the implementers is a
separate Workflow / multi-agent step. Think of yourself as the architect drawing the plans, not the
crew pouring concrete.

**The signal you did this right:** when implementation later runs and you typecheck, the residual
errors are almost all *within* a module, not interface mismatches *between* modules — because no
implementer ever had to guess a cross-boundary signature.

## Process

Work top to bottom. Every phase ends in a concrete artifact you can point at.

### Phase 0 — Probe and choose the stack

- Look at the target directory. This skill is for greenfield; if there's already a real codebase
  with its own conventions, stop and reconsider — you'd be imposing a structure on top of one that
  exists.
- Pick a **boring, proven** stack. Novelty is risk you don't need here.
- Confirm you can establish a fast **"does it typecheck / compile" command**. This is the spine of
  everything downstream: the contract is only as load-bearing as the checker that enforces it. In
  statically typed languages this is free. In dynamically typed ones, lean on type stubs
  (e.g. Python `typing.Protocol` + `pyright`/`mypy`) so the contract is still machine-checkable.

### Phase 1 — Scaffold with a typecheck gate

- Lay down minimal build tooling, a **strict** compiler/checker config, and `git init` + a first
  commit. Keep it to the essentials — a package manifest, the strict config, an entry point stub.
- Strictness is not optional: turn on strict mode, no-implicit-any, strict null checks, or the
  language's equivalent. A lax checker lets the divergence you're trying to prevent slip back in.
- Commit the bare scaffold *before* writing the contract, so the contract lands as a clean diff.

### Phase 2 — Write the immutable contract  ← the heart of the skill

Produce three artifacts. Together they are the single source of truth.

1. **Type / interface contract** — every cross-module type, interface, method signature, and event,
   with **no runtime logic**. It should typecheck on its own. This is the file that lets N agents
   work without colliding.
2. **Pure-data config** — all constants, enums, balance numbers, static tables. **Data only, no
   logic.** One immutable file everyone reads, so there's nothing to conflict over.
3. **Shared low-level helpers** — the handful of primitives many modules need (math, RNG,
   formatting, a small mesh/DOM toolkit). Written once so modules don't each reinvent them and
   subtly diverge (two different RNG implementations is a bug farm).

Mark all three **immutable** and say so in the per-module specs: *"adapt your implementation to the
contract; never edit it."* If one agent "fixes" an interface to suit itself, every other agent that
implemented against the old shape breaks. The freeze is what makes parallelism safe.

**Qualities of a contract that survives parallel implementation:**

- **Complete.** Every method an implementer will call must *already* have a signature. Walk each
  planned module and ask "what does it call across the boundary?" — every answer must resolve to
  something already in the contract. Gaps force invention, and inventions collide.
- **Precisely typed.** The type *is* the spec. Avoid `any` / untyped escape hatches; each one
  re-opens the divergence you're closing.
- **Semantics in comments.** Encode everything the type can't say: units, ranges, coordinate
  frames, ownership, lifecycle, formulas. Real examples from a shipped build: *"dt is in seconds,
  pre-scaled by game speed, 0 while paused"*, *"distance measured in the XZ plane"*,
  *"y = terrain height"*. These prevent a dozen subtle integration bugs each.
- **One wiring interface (the "context").** A single object exposing shared services, the live
  entity/state collections, and helper methods that every module talks *through*. This is how a
  module uses another module's capability without importing its concrete class — it keeps the
  dependency graph a star, not a web. (In the reference example this is `IGameCtx`.)
- **A message/event contract** if modules communicate indirectly: name every event and its payload
  type, so the emit side and the listen side cannot drift.

### Phase 3 — Decompose into non-overlapping file groups

- Partition the whole system into modules, each owning a **disjoint set of files**. Two agents
  writing the same file in parallel is the one thing a fan-out cannot tolerate — lost writes,
  conflicts, or silent clobbering.
- Dependencies flow **through the contract**, not through concrete imports. A module imports *types*
  from the contract freely, and concrete classes from other modules *only where the contract
  explicitly allows it*.
- Group by coherent layer (e.g. world, entities, systems, ui) so each module is something one agent
  can hold in its head. Five to ten modules is typical.
- **Name the integrator.** Exactly one module assembles the context object and runs the entry
  point / main loop. It is the only place broad concrete imports are allowed. Everything else is a
  leaf that the integrator wires together.
- Verify the partition is disjoint and total (every planned file owned exactly once). The bundled
  `scripts/check_plan.py` does this from a small JSON plan — use it rather than eyeballing.

### Phase 4 — Per-module specs and handoff

- For each module write: the **exact file list** it owns, and a **focused spec** — what to build,
  which contract pieces it implements, the quality bar, and the edge cases to handle. Specs are
  what each implementer reads *instead of* the others' code.
- Assemble the **handoff packet**: the contract (or a pointer to its files) + the module list +
  the specs + the shared rules ("contract is immutable", "create only your files", "trust the
  documented exports of modules you don't own").
- **Stop at the blueprint — do not implement module bodies.** Your deliverable is the scaffold +
  contract + config + shared helpers + `plan.json` + per-module specs, with each module's files left
  as empty stubs or signature-only placeholders. Implementing the modules yourself defeats the
  entire purpose: there is then nothing left to parallelize, the contract was never stress-tested
  against independent implementers, and you have burned the prep budget producing one *serial*
  version of exactly the work the contract exists to fan out. The pull to keep going is strongest
  when the request sounds like "build me the whole thing" — that phrasing is about the end goal, not
  about who writes the bodies or when. Resist it; the build is a separate phase with its own agents.
- **Present the blueprint and hand off.** Offer to run the fan-out next (e.g. via the Workflow tool
  or parallel Agent calls), but don't run it as part of this skill unless asked.

## Definition of done

Before declaring prep complete, confirm:

- [ ] Scaffold committed; the typecheck/compile gate runs **green on the contract files alone**.
- [ ] Contract is **complete** — spot-check that each module's cross-boundary calls already resolve
      to a contract signature.
- [ ] Contract file is **types-only** (no logic); config file is **pure data** (no logic).
- [ ] Decomposition is **disjoint** (no file in two modules) and **total** (every planned file
      owned) — verified with `scripts/check_plan.py`.
- [ ] Exactly one **integrator** is named.
- [ ] Module files are **stubs / signatures only** — the only fully-written files are the contract,
      config, shared helpers, scaffold, `plan.json`, and specs. If you wrote feature bodies across
      the modules, you overshot the skill and serialized work that was meant to fan out.
- [ ] Handoff packet assembled and presented to the user.

## Anti-patterns (stop if you see these)

- **`any` / untyped holes in the contract** — re-opens the divergence the contract exists to close.
- **A file listed under two modules** — a guaranteed parallel-write collision.
- **Concrete cross-module imports outside the integrator** — you can no longer build modules in
  isolation, which kills the parallelism.
- **Logic creeping into the data/config file** — turns a read-only shared constant into a merge
  conflict and hidden coupling.
- **No typecheck gate** — the downstream compile-fix loop has nothing to stand on.
- **Writing the contract "later" or alongside features to save time** — this defeats the whole
  technique. The contract must *precede and freeze* before any feature code is written.
- **Implementing the module bodies yourself** — stopping at the blueprint is the deliverable, not
  laziness. A solo agent that builds everything has produced one serial version and parallelized
  nothing, and the contract never got stress-tested by independent implementers.

## Worked example and language variants

`references/contract-guide.md` contains a full worked example (a 3D RTS prepped for an 8-module
fan-out — what each contract file held, the disjoint decomposition, sample module specs) and a table
mapping the three contract artifacts onto TypeScript, Python, Rust, Go, and Java/Kotlin. Read it when
you want a concrete template or you're working outside TypeScript.

## Handoff to the build

The blueprint you just produced *is* the work-list a fan-out consumes — this is scout-inline-then-
orchestrate, where the contract + decomposition are the scouting result that lets the build run blind
and parallel. The canonical downstream shape is:

1. **Implement each module** — one agent per module, in parallel, against the frozen contract.
   Optionally test-first per module (a tester agent writes the module's tests, a dev agent makes them
   pass, a reviewer agent checks — a TDD / tester–dev–reviewer split), with model tier chosen per
   module complexity.
2. **Compile-fix loop** — typecheck, group errors by file, fix until green.
3. **Review** — by dimension, then **adversarially verify** each finding before acting on it.

That execution phase is out of scope for this skill — hand the packet to a Workflow or to parallel
Agent calls. Tell the user the prep is done and offer to kick it off.
