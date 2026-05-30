---
name: to-wiki
description: >-
  Map an unfamiliar codebase into a fast, navigable local wiki (docs/wiki/) using
  parallel subagents. Built for the start of a live coding assessment on an UNKNOWN
  monorepo: discovers the stack, workspaces, conventions, server-communication style,
  testing setup, scope boundaries, and traces one reference feature end-to-end — so you
  can read the repo fluently and mirror its patterns. Use at the very start, or whenever
  you are dropped into a strange repo and need a map before writing code. Trigger: /to-wiki.
---

# /to-wiki — codebase → navigable wiki

Turn an unfamiliar codebase into a cross-linked local wiki you can browse in seconds.
The job is **codebase fluency**: find the existing patterns and where they live so a new
feature can be made to look like it was always there.

This runs at the **front of an assessment** where you're dropped into a production-style
monorepo on an **unknown stack** and graded mostly on *monorepo awareness* and *consistency
with existing conventions*. The wiki is your map for both.

## Non-negotiable operating rules

1. **Zero stack assumptions.** You do **not** know the framework, language, package manager,
   or conventions until you read them. Every concrete name in this file (Next.js, pnpm, proto,
   Tailwind, Playwright…) is **illustrative only — confirm against the actual repo; yours will
   differ.** Never let a fixed taxonomy bound what you look for.
2. **Read-only on the target repo.** This skill **maps**, it does not edit. The *only* writes
   are to the wiki output directory. Do not modify, format, or "fix" the repo under study.
3. **Cite or omit.** Every claim points to a real `/abs/path/file.ext:line` or is explicitly
   marked `⚠ unverified`. No invented APIs, no guessed conventions presented as fact. **Flag
   generated vs hand-authored boundaries** (e.g. a `gen/` dir, or a hand-written stand-in for a
   codegen tool) — it changes the advice (don't hand-edit generated output; don't run a
   generator that isn't wired up).
4. **Parallel and fast.** Recon once, then fan out — one subagent per workspace and per
   cross-cutting dimension, all spawned in a single batch. Target a few minutes, not twenty.
5. **Generic by construction.** Spawn a dimension agent only for dimensions that *exist* in
   this repo (recon decides). No GraphQL page if there's no GraphQL; no "server actions" page
   if the repo talks to its backend some other way.

## Inputs

- **Target repo** = the codebase to map. Take it from the user's argument; otherwise ask, or
  use the current directory if it's clearly the repo. Resolve it to an **absolute path** — all
  citations use absolute paths so they stay clickable no matter the cwd.
- **Output dir** = the caller-provided path if given; otherwise `docs/wiki/` (relative to where
  you were invoked). If it already has content, start fresh — clear it (or use a timestamped
  subfolder). Only pause to ask when the destination is genuinely ambiguous; in an autonomous
  run, just clear and proceed.

### Page naming (fixed, so links are deterministic)

- `HOME.md` — the entry point. `open-questions.md` — the aggregated uncertainties.
- `workspace-<name>.md` — one per workspace (e.g. `workspace-<app-or-pkg-name>.md`).
- `dimension-<topic>.md` — one per cross-cutting dimension (e.g. `dimension-testing.md`).
- `traced-feature-<name>.md` — the traced reference feature.
- All lower-kebab-case, flat (no subfolders), `.md`. Tell each worker its exact filename so the
  index links never dangle.

---

## Phase 0 — Recon (one cheap pass, do this yourself)

Read only the breadcrumbs that exist in *any* repo, to build the work-list. Don't assume the
language — look for whatever is actually present:

- **Workspace/manifest roots:** `package.json` + `pnpm-workspace.yaml`/`workspaces`,
  `nx.json`, `turbo.json`, `lerna.json`, `Cargo.toml` workspace, `go.work`, `pyproject.toml`,
  `pom.xml`, etc. Enumerate **every app and package** from the workspace globs.
- **Package manager / build orchestrator:** infer from the lockfile and config present.
- **The repo's own words:** root `README`, `CONTRIBUTING`, `CLAUDE.md`/`AGENTS.md`, anything
  under `docs/`. These often hand you the conventions directly.
- **The assessment brief, if present** (e.g. a `docs/**` prep/brief file): extract **scope
  boundaries** — which folders are editable, which are off-limits, required test gates, and
  any "stub the server function for mock data" style sanctioned patterns. This is high-value;
  the grade depends on respecting it.
- **Tooling configs at root:** TS/JS config, linter, formatter, test runner, CI workflow.

Produce two lists:
- **Workspaces** — every app/package to document (one agent each).
- **Dimensions present** — choose from the catalog below, *include only those that apply.*

> Recon is a hint-gathering pass, not the analysis. Don't trust the silence of any single
> file; the subagents do the deep reading.

## Phase 1 — Fan out (parallel subagents, one batch)

Spawn all agents **in a single message** so they run concurrently. Use a read-capable agent
that can also write its own page (default/general-purpose) — each agent writes its page
directly to the output dir, so writes parallelize too. Use a fast model (e.g. sonnet) for the
breadth readers; reserve a stronger model for the **traced-feature** page (the deepest one).

> **Fallback — no spawn tool available.** If you're running somewhere without an agent-spawning
> tool (e.g. you are *yourself* a subagent), don't stall and don't fake parallelism: do each
> worker's job yourself, sequentially, honoring the same per-page contract (read-only, own page,
> `:line` cites). The wiki is identical; only the wall-clock is longer. Note this in your report.

Two families of agents:

**A. Per-workspace cartographers** — one per app/package. Each answers: what is this workspace,
what does it export / what's its public surface, how is it built/dev'd/tested, what are its
3–8 most important files (with `:line`), and what depends on it. **Judgment call:** fold
trivial config-only packages (shared eslint/tsconfig/prettier presets with no real logic) into
the *Conventions & quality gates* page rather than giving each its own thin page — spend agents
on workspaces that carry behavior.

**B. Per-dimension specialists** — cross-cutting concerns. Catalog (include only what exists):

- **Build & workspace orchestration** — how `install` / `build` / `dev` / `test` / `lint` /
  `typecheck` actually run; task graph, caching, ports. *This is the monorepo-awareness page.*
- **App structure & routing** — how the editable app is organized; routes/entrypoints; how a
  URL/request reaches rendered output.
- **Server communication / data flow** — *the* convention for talking to the backend, **whatever
  it is** (typed RPC/proto, server actions, loaders/mutations, REST fetch wrappers, GraphQL,
  a generated client…). Discover and name it; show the canonical call site `:line`.
- **State management** — local vs shared state, the chosen library or pattern (or "none").
- **Styling system** — how UI is styled and themed; design tokens; the component primitives.
- **Component conventions** — shared UI package vs local components; naming, composition,
  client/server split if any.
- **Shared types / contracts** — where the domain model and cross-workspace types live.
- **Testing** — unit + E2E frameworks, where tests live, how to run them, fixtures/conventions,
  and **which suite is the regression gate** that must stay green.
- **Conventions & quality gates** — type strictness, lint/format rules, commit conventions,
  any pre-commit/CI gates.
- **Scope & boundaries** — editable vs off-limits paths, sanctioned stub patterns, "don't touch"
  zones. Pull straight from the brief if there is one. *Mirror this exactly in the wiki.*

**C. The traced reference feature (one agent, deepest).** Pick one real, representative
existing feature and trace it **end-to-end through every layer**: entry/route → data load →
server call/mutation → component tree → rendered UI → its test. This single page is the
highest-leverage artifact: it's the template you copy when you build. Emit a layer-by-layer
walkthrough, each step with a `:line` citation, plus a "to build a sibling feature, touch
these files" checklist.

### Subagent contract (give each agent this)

- Target repo absolute path; your assigned workspace/dimension; the **exact output file path**
  to write; and the page template below.
- Be **read-only** on the target repo. Cite `/abs/path:line` for every claim; mark anything
  unconfirmed `⚠ unverified`. No invented APIs.
- Write your page, then **return a short summary**: `{ title, page_path, one_liner,
  key_links: [...], open_questions: [...] }` so the orchestrator can build the index.

## Phase 2 — Synthesize the wiki

After agents return, **you** write the connective tissue:

- **`HOME.md`** (the entry point) — open it after building. Contains:
  - One-paragraph "what is this repo" + the detected stack (named, with confidence).
  - A **command cheatsheet** (install/dev/build/test/lint/typecheck) copied from real scripts.
  - A prominent **SCOPE banner**: editable vs off-limits paths and any required test gate.
  - A **map**: links to every workspace page and every dimension page, grouped.
  - A **"Start here for the task"** pointer to the traced-feature page.
- **`open-questions.md`** — aggregate every `open_question` / `⚠ unverified` from the agents,
  so you know what to confirm before relying on it.
- **Cross-link** pages with relative Markdown links so the wiki is navigable from `HOME.md`.

## Phase 3 — Verify & hand off

- Quick coherence pass: no dead links; every dimension that exists has a page; commands in the
  cheatsheet actually appear in the manifests; scope banner matches the brief verbatim.
- Print the absolute path to `HOME.md` and a 3–5 line orientation so the user can dive in.

---

## Page template (every wiki page)

```markdown
# <Title>

> **TL;DR:** one or two sentences a tired reader can act on.

## What & where
- <claim> — `/abs/path/file.ext:line`

## How it works
<concise explanation, each non-obvious claim cited with :line>

## Conventions to mirror
- <the pattern to copy when building, so new code matches>

## Gotchas / open questions
- ⚠ <anything unverified or surprising>

## See also
- [<related page>](./related.md)
```

## Quality bar

- A reader should reach any fact in **≤2 clicks** from `HOME.md`.
- Pages are **skimmable** (TL;DR + bullets), not essays.
- The traced-feature page alone should let someone build a convincing sibling feature.
- If the repo is git-tracked and the wiki lands inside it, keep the repo's `git status` clean —
  prefer the configured `docs/wiki/` output (which is outside the target repo) and never commit
  wiki files into the assessment repo.

## Why this exists (don't lose the thread)

The assessment is won by **reading fast and mirroring conventions**, not by writing clever React.
The wiki externalizes the repo's mental model so the rest of the session is spent building a
feature that looks native — same server-communication style, same components, same tests, inside
the allowed scope. Build the map first; then build the feature.
