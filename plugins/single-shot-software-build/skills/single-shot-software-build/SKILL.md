---
name: single-shot-software-build
description: End-to-end generator for a complete, running, product-quality software system (frontend + backend, or either alone) built from a short brief in one orchestrated multi-agent build. Use whenever the user gives a one-line or short product idea and wants working software — "build me a CRM", "make an expense tracker with an API", "create an internal dashboard for X", "single-shot this app" — especially when they want it done autonomously, in parallel, or "like the Fable game build". The architect expands the brief with taste, freezes a compiler-enforced contract, product-directs every screen and endpoint in prose, fans out parallel implementers with disjoint file ownership, then hardens through compile loop → multi-lens review → adversarial verification → mechanical gate. Trigger even if the user never says "contract", "workflow", or "agents". Do NOT use for small edits to an existing codebase, single features in an established repo, or games (use single-shot-game-generation for games).
---

# Single-Shot Software Build

You are about to turn a sentence into a finished system. This skill encodes a process that has repeatedly produced complete, polished, 10k+ line applications from one-line briefs in about 90 minutes of wall-clock time. The process works because of one insight, so internalize it before anything else:

**Implementer models faithfully execute the direction they are given and rarely exceed it. Quality is not added by review — review checks correctness, it does not supply taste. Everything that makes the result feel finished (UX polish, empty states, error rigor, visual coherence, sensible defaults) must be written into the prompts BEFORE any implementer runs.**

Your job as the architect is therefore not to write the application. It is to write the ~6% that governs the other 94%: the contract, the product direction, and the workflow. Then parallel implementer agents write the bulk, and an adversarial pipeline hardens it.

## Phase 0 — Expand the brief with ambition (you, in your head)

The user gave you one line. Do not ask clarifying questions and do not build the minimum thing the sentence technically requires. A one-line brief is a delegation of taste: the user is trusting you to imagine the finished product they would have described with a page of notes.

Expand the sentence into a concrete product definition:

- **Name the product.** A real name, not "the app". Names force coherence.
- **List the entities** the domain obviously needs — including the ones the user didn't say. "Expense tracker" implies accounts, categories, budgets, recurring rules, reports. Write the full noun list.
- **List every screen** a finished version would have, including the unglamorous ones: settings, empty-state onboarding, a detail view for every list, confirmation flows.
- **Decide the opinionated version of every ambiguity.** Multi-user or single-user? Pick one and make it good. Auth style? Pick one. Do not build configurable both-ways scaffolding — decisiveness reads as quality; hedging reads as a demo.
- **Define "finished".** Write 5–8 sentences of what a user does in their first three minutes with the product and what they see. This paragraph becomes your north star, the smoke-test script, and the driven task the UX judge replays in Phase 6.
- **Walk the verb list.** List every verb and every piece of feedback a user experiences in a full first session. Later (Phase 3½) each verb must resolve to a screen AND a route AND a service method in the contract — this walk is what catches the pretty-but-hollow failure mode where the core loop can't actually complete.

Scope calibration: aim for the product a strong small team would ship as a v1 — complete in its loop, polished in its core flows — not an enterprise suite. Every feature you list will be built; list what makes the loop whole, not everything imaginable.

## Phase 1 — Choose a boring, self-contained stack

A single-shot build dies on environmental friction, not on code difficulty. Choose the stack that minimizes moving parts:

- **TypeScript strict, end to end.** The type system is your enforcement mechanism for the contract; you cannot afford `any`. Named exports only, no default exports — it makes cross-module imports mechanical and greppable.
- **Zero external services.** SQLite (better-sqlite3 or Drizzle+SQLite) over Postgres. Session auth with a seeded demo user over OAuth. No Docker, no API keys, no cloud. The gate must pass on a fresh machine with `npm i && npm run dev`.
- **Boring frameworks the implementers know cold.** Vite + React for the front, Express or Hono for the back (or Next.js when a single app fits better). Novelty in the stack is variance you didn't budget for.
- **Seed data at startup.** The app must be non-blank the moment it boots — realistic seeded rows in every entity, a demo login that works. A blank first screen makes a finished product look like a stub and makes the smoke test meaningless.

## Phase 2 — Plan by writing the contract, not a document

Do not produce a plan document, a PRD, or a design doc for approval. The plan IS code: a small set of files you write personally, commit before any implementer runs, and then declare immutable. A type that fails to compile when violated is worth a thousand words of spec — eight agents writing blindly in parallel can only ever meet in one place, and that place must be machine-checked.

Author these yourself (this is the highest-leverage work in the entire build — do not delegate it):

1. **`shared/contract.ts` (or a small `shared/` package)** — every domain type, every service interface, the complete API route table with request/response/error shapes, and a single typed event/message map if the app has realtime or cross-cutting events. If a route or field isn't here, it doesn't exist; a mistyped name must fail to compile, not fail at runtime.
2. **`shared/config.ts` + `server/seed.ts`** — all product "balance" as data, not logic: constants, limits, category lists, copy strings, the seed dataset. Design-in-data means the product can be retuned without touching a code path.
3. **`web/src/ui/` design-system primitives** — theme tokens (palette, spacing, radii, type scale) and the base components every screen must compose from: Button, Input, Card, Table, Modal, EmptyState, Toast, Skeleton. This is the shared vocabulary that makes eight parallel-built screens look like one hand designed them. Without it you get eight ad-hoc styles; with it, coherence is structural.

Read `references/contract-authoring.md` before writing these — it covers the API error shape, the service-interface pattern, and the design-token specifics that make the contract enforce instead of suggest.

Target: roughly 500–900 lines total for the seed. Small enough to write carefully by hand, decisive enough to govern everything.

## Phase 3 — Product-direct every module in prose

This is where builds become either rich or flat, and the difference is entirely in what you write here. For each module you will fan out, write a brief that art-directs the work the way a demanding design lead would — specific, sensory, opinionated:

- **Per screen:** the layout, what the primary action is, what the empty state says and shows, what loading looks like (skeletons, not spinners on white), what happens on error, one micro-interaction that makes it feel alive (optimistic update, inline edit, keyboard shortcut, toast on success).
- **Per endpoint:** validation rules and their exact error messages, authorization rule, transactional boundaries, what a malicious or malformed request gets back.
- **Frame the job as a craft.** Tell the frontend-features agent "this is the product design department — every screen must be instantly navigable at a glance and pleasant up close" and it will behave like one. Tell it "implement the UI, make it look decent" and you will get a correct, generic, flat result from the exact same model. This is the single most reproducible finding from prior builds.

Direction thin enough to fit in one sentence produces a product thin enough to describe in one sentence.

## Phase 3½ — The freeze gate: adversarially review the prep BEFORE it becomes immutable

The contract is about to be frozen, which means any flaw in it is inherited by every implementer and can never be fixed mid-build — the moment before freeze is the last chance to catch it and the cheapest place to fix it (one file, not N modules). The typechecker proves the contract *compiles*; it cannot see the judgment failures that actually sink builds: a screen the design-system primitives can't compose, an entity no module owns, a route whose response type contradicts the service it must call, an auth rule stated in prose but absent from the error semantics.

So before any fan-out, run the **contract gauntlet**: a panel of ≥3 independent strong-tier reviewers, each told to *refute* the claim "this prep is sound and ready to freeze" across eight lenses (contract coherence, decomposition totality, doc↔code consistency, screen buildability, auth/security coherence, product coherence — the Phase-0 verb walk resolves fully — UX completeness, gate completeness). A `fatal`/`major` finding blocks the fan-out; fix, re-review if the change was material, then freeze. Reviewer prompt, lens definitions, finding schema, and an optional tracer-bullet (build ONE hero screen from the frozen kit and judge it before betting the whole build on the kit) are in `references/contract-gauntlet.md`.

This is also your safety net as the author: you have blind spots about your own prep by construction, and independent reviewers are the only mechanism in the pipeline that checks *your* work rather than the implementers'.

## Phase 4 — Decompose into disjoint modules and fan out

Cut the codebase into 6–9 file groups such that **no two agents ever touch the same file**. Every cross-module reference resolves through the frozen contract; agents import from paths they cannot see yet and trust the documented exports, because the contract guarantees they exist. A typical cut for a full-stack app:

- **server-core** — db setup, migrations runner, auth middleware, session handling
- **server-domain** — service classes implementing the contract's service interfaces (business logic, transactions)
- **server-api** — route handlers: parse → validate → call service → shape response per contract
- **web-shell** — app frame, routing, layout, nav, typed API client, auth pages, global state
- **web-features-A / web-features-B** — the screens, split by domain area so each group is one agent's exclusive territory
- **web-data** — query/mutation hooks wrapping the API client, cache invalidation
- **integrator** — entry points, wiring, `package.json` scripts, seed invocation, README

Every implementer receives the same two preambles — a RULES block and the full CONTRACT direction — plus its own module brief. The verbatim RULES template and module-brief patterns are in `references/prompt-templates.md`; use them, they are tuned. Key rules that must survive any adaptation: contract files are FINAL and never modified; create only your assigned files; never run npm/tsc/dev servers (a later phase compiles); zero TODOs and zero stubs — this is a finished product, so handle the edge cases (empty lists, failed requests, unauthorized access, concurrent edits).

No git worktrees needed: disjoint ownership plus a frozen contract makes collisions structurally impossible at the file level — but don't just assert disjointness, verify it mechanically. Write the decomposition as a `plan.json` and run `scripts/check_plan.py` before fanning out: it proves no file is owned by two modules, no contract file is module-owned, the integrator exists, and the contract files are actually on disk. A collision caught here costs one JSON edit; caught during the build it costs a lost write.

## Phase 5 — Run the six-phase workflow

Encode the build as one orchestration script and run it. If the Workflow tool is available, use it (it gives you deterministic fan-out, pipelining, and a resumable journal); otherwise fan out with parallel Agent calls per phase. The full phase-by-phase spec, including reviewer lens definitions and the verifier's burden-of-proof framing, is in `references/workflow-phases.md`. The shape:

1. **Implement** — all module agents build simultaneously against the frozen contract (medium-tier model, e.g. Sonnet).
2. **Compile loop** — `tsc --noEmit`; a cheap model groups errors by file; parallel fixers repair them, one fixer per file so edits never collide. Loop ≤ 6 rounds until silent.
3. **Review** — 5 reviewers with deliberately diverse lenses (contract-conformance, data-integrity, auth/security, ux-wiring, state-lifecycle) hunt for integration and runtime bugs.
4. **Verify** — every serious finding goes to an independent skeptic whose default verdict is "not a real bug"; the verifier must quote the exact misbehaving code path to confirm it. This kills the false positives that would otherwise flood the fix phase. Pipeline review→verify per lens; don't let the slowest reviewer stall the fastest one's verification.
5. **Fix** — confirmed bugs grouped by file, one fixer per file.
6. **Gate** — mechanical, no judgment: typecheck + lint + production build + `seed && boot && smoke` (curl the core endpoints, or a minimal Playwright pass through the three-minute script from Phase 0). Not done until the gate is green.

**Model tiering:** you (the architect) are the expensive model doing the 6%; implementers, reviewers, verifiers and fixers run on a mid-tier model; error-grouping and mechanical reporting run on a cheap one. More expensive everywhere is not more correct — prior head-to-heads showed a top-tier model implementing everything took 2× the time and produced a worse product than mid-tier implementers driven by a well-directed contract. The lever is the brief, not the brawn. Never route implementer roles to a top-tier/frontier model.

## Phase 6 — Judge the rendered product in a closed loop, then save the workflow

The gate proves it compiles and boots; it does not prove it's good. Two properties can only be seen in the rendered result — does it *look designed*, and can a first-time user *actually use it* — so they get a closed loop, not a one-time inspection:

1. **Capture** with a small Playwright script (commit it — it doubles as the regression harness): every primary screen with seeded data, the reachable edge states (filtered-empty, validation errors, 404), a narrow viewport of the key screens, and a **driven first-time-user task** — the three-minute script from Phase 0 executed through the real UI, with a trace of where it stalled.
2. **Judge** with two parallel judges: a product-design judge (hierarchy, token discipline, density, state craft, micro-polish, responsive integrity) and a UX judge (glanceability, affordance, feedback, state coverage, onboarding, task success). Scored 1–10 per axis against the direction you wrote in Phase 3; findings must be file-targeted.
3. **Verify, fix, re-capture, re-judge.** Skeptic-verify the major findings, one fixer per file, then capture again and judge again. Iterate until every axis clears the bar (≥8) and the driven task succeeds, bounded at 3 rounds. Rubrics, capture protocol, schemas, and the loop protocol are in `references/judge-rubrics.md`.

The judges are the last implementers, working in the only medium the others couldn't see. This loop is the difference between shipping the first generation and exceeding it. Walk the product yourself at the end — the judges raise the floor; your own three minutes in the app is still the final read.

Finally: **the most valuable artifact is not the code.** Commit the orchestration script, the contract, the module briefs, and the capture baseline alongside the app. They are the replayable asset — the difference between lightning striking once and owning the weather.

## Definition of done

- [ ] Contract committed and frozen; `shared/` typechecks on its own; config is pure data; design-system tokens + primitives cover every screen the briefs direct.
- [ ] Phase-0 verb walk resolves completely: every verb → a screen AND a route AND a service method.
- [ ] **Gauntlet passed before freeze** — ≥3 independent reviewers, no unresolved `fatal`/`major`.
- [ ] Decomposition verified disjoint + total with `check_plan.py`; integrator named.
- [ ] Compile loop silent; all five review lenses run; findings skeptic-verified before fixing.
- [ ] Gate green: typecheck + build + seed + boot + smoke (auth'd 200s, unauth'd 401, contract-shaped errors).
- [ ] **Both judges clear the bar on every axis**; the driven first-time-user task succeeds through the real UI.
- [ ] Capture script + screenshot baseline committed as the regression harness; workflow script + briefs committed alongside the app.

## Anti-patterns (stop if you see these)

- **"Implement the UI, make it look clean and modern" as the only frontend direction** — the textbook cause of generic output. Write the per-screen prose; thin direction cannot be compensated later.
- **Freezing the contract without the gauntlet** — type-clean ≠ sound. The judgment flaws (unowned entity, uncomposable screen, contradictory semantics) compile fine and get inherited by the whole fleet.
- **Skipping the judge loop** — then nothing with taste ever looks at the output, and "finished-feeling" is left to luck. The gate cannot see a blank-div empty state or a dead-end flow.
- **Asking the user clarifying questions in Phase 0** — the one-line brief delegated taste to you; hedging with configurable both-ways scaffolding reads as a demo.
- **Routing implementation to a top-tier model** — measured: ~2× wall-clock for a worse product. Architect strong, implementers mid-tier, reporters cheap.
- **An endpoint without auth, an unscoped query, `any` in the contract, a file owned by two modules, logic in the config file** — the standard hazards; each one breaks a guarantee the whole pipeline leans on.
- **Fixers "improving" beyond the confirmed finding** — minimal correct fix only; refactors during the fix phase reintroduce the collisions the decomposition prevented.

## Reference files

- `references/contract-authoring.md` — read before Phase 2: contract/config/design-system specifics that make the seed enforce instead of suggest.
- `references/contract-gauntlet.md` — read before Phase 3½: the eight refute-lenses, reviewer prompt, finding schema, and the tracer-bullet screen.
- `references/prompt-templates.md` — read before Phase 4: verbatim RULES block, module-brief templates, reviewer and verifier prompts.
- `references/workflow-phases.md` — read before Phase 5: the six phases in executable detail, including a Workflow-tool script skeleton and the no-Workflow fallback.
- `references/judge-rubrics.md` — read before Phase 6: capture protocol, both judge rubrics, output schemas, and the bounded fix loop.
- `scripts/check_plan.py` — run before fan-out: proves the decomposition is disjoint + total, contract separate, integrator named.
