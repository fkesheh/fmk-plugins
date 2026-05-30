---
name: to-slices
description: >-
  Break an assessment task into ordered VERTICAL slices (walking skeletons), each independently
  testable end-to-end, written to docs/slices/slice-1.md, slice-2.md, … The user sets the rough
  slice count by task complexity. Each slice touches every architectural layer (route → data →
  server call/stub → render → mutation) and ships with its own happy-path E2E. Reads the codebase
  map from docs/wiki/ (run /to-wiki first) to mirror real patterns and respect scope. Plan-first:
  proposes the slice breakdown for sign-off BEFORE writing the slice docs. Trigger: /to-slices.
---

# /to-slices — task → ordered vertical slices (walking skeletons)

Turn "build feature X" into a sequence of **walking skeletons**: each slice is a thin *vertical*
cut that works end-to-end and is provable by a happy-path E2E. Slice 1 is the thinnest thing that
*walks* through every layer; each later slice deepens it while keeping the whole E2E suite green.

This is step 3 of the assessment day-of script (get a thin slice working before polishing). A
simple working feature beats a half-done elaborate one — slices enforce that ordering.

## Core principle: vertical, not horizontal

A slice is bounded by **user-visible capability**, never by layer.

- ✅ Slice = "user sees the list of real (stubbed) items" → touches route + data + server + render + test.
- ❌ Slice = "build the whole data layer" then "build the whole UI" — that's horizontal; nothing
  *walks* until the end, and nothing is E2E-testable in between.

Every slice must satisfy the **walking-skeleton test**: it exercises the full pipeline top to
bottom (entry → data → server comm → render → mutation if any), and a happy-path E2E can drive it.
If a proposed slice can't be E2E-tested on its own, it isn't a slice — fold or re-cut it.

## Operating rules

1. **Plan first, human in the loop.** Produce the slice *breakdown* (titles + one-line goals +
   order) and get the user's sign-off / edits **before** writing any `slice-N.md`. Do not
   bulldoze the whole plan autonomously — this is a pair-with-AI session.
2. **User sets the count.** The rough number of slices is the user's call, scaled to task
   complexity. If they gave a number/range, hit it. If not, propose one (with a one-line
   rationale) and ask. More slices = thinner cuts = more checkpoints.
3. **Mirror the repo, assume nothing.** Read `docs/wiki/` for the real stack, the traced-feature
   template, the server-communication convention, the testing setup, and the scope boundaries.
   Every concrete name here (Playwright, server action, `app/`…) is **illustrative — confirm
   against the wiki / repo; yours will differ.**
4. **Respect scope on every slice.** Each slice's in-scope files must live inside the editable
   paths from the wiki's scope page; never touch the off-limits ones. Missing endpoint → **stub
   the server function** with typed mock data (the sanctioned pattern), never reach past scope.
5. **Each slice keeps the gate green.** "Done" for a slice = its new E2E passes **and** every
   pre-existing E2E still passes (regression gate) + typecheck/lint/unit green. Practically: run
   just the new spec while iterating; run the **full** suite at the slice's done-gate. The E2E
   suite grows one spec per slice — that's expected.

## Inputs

- **The task** — the feature to build (from the brief / the user).
- **`docs/wiki/`** — the codebase map from `/to-wiki`. If it's missing, recommend running
  `/to-wiki` first, or do a quick recon yourself; you specifically need the **traced-feature**,
  **server-communication**, **testing**, and **scope** pages.
- **Slice count** — the user's rough N (see rule 2).

---

## Phase 0 — Understand task + map (you, cheaply)

- Read the task and the wiki pages above. Lock onto: the editable scope, the server-comm
  convention, the **traced reference feature** (your vertical-path template), and how E2E tests
  are written and run in this repo.
- Identify what already exists vs what must be built/stubbed (e.g. an endpoint that's ready to
  integrate vs one that's missing and needs a stub).

## Phase 1 — Cut the slices (plan, then checkpoint)

Decompose the task into ~N vertical slices, ordered so that:

- **Slice 1 = the thinnest end-to-end skeleton that walks** — the minimal path through every
  layer that renders *something real* and can be E2E-asserted (often: the primary view on a new
  route, wired through the **real** server-comm layer). **Prefer real endpoints first:** if the
  endpoint exists, integrate it in slice 1 — don't stub just to walk faster. Stubs are only for
  genuinely-missing endpoints.
- **Each later slice adds one user-visible capability** (filter/search → detail view → create
  mutation → edit/status → empty/error states → polish), still vertical, still E2E-provable,
  still shippable on its own.
- **Stub placement:** the stub rides the slice that *surfaces its data*, and that slice should
  come **late** — so earlier slices prove the real RPC path first and the stub isn't load-bearing
  for the skeleton. Never bolt the stub onto slice 1 unless the primary view itself has no real
  endpoint.
- **Dependencies flow forward only** — slice k builds on k-1; no slice needs a *later* slice to
  be testable.

Present the breakdown as a short table with exactly these columns:

| # | capability (user-visible) | what it makes walk (layers, one line) | its E2E proof (one line) | builds-on |

`capability` = what the user can now do; `what it makes walk` = the layers crossed as a single
line (the per-slice doc expands this into the full **Vertical path**); `E2E proof` = the happy
path the spec drives. Add the proposed count and a one-line rationale below the table. **Stop and
get sign-off / edits**, then adjust count and boundaries to the user's call.

> **Running headless / non-interactive?** Still do exactly this: propose the table + count, then
> **stop and surface it** rather than auto-writing the slice docs. The checkpoint is the point —
> never skip it just because no human is mid-loop.

## Phase 2 — Write the slice docs (parallelizable)

After sign-off, write `docs/slices/slice-1.md … slice-N.md` plus `docs/slices/README.md`. You may
**fan out one subagent per slice** (spawn them in a single message) to flesh out each doc from the
wiki + brief, each writing its own file and citing wiki pages / `:line` anchors. Use the
[`/to-wiki`]-style contract.

> **Fallback — no spawn tool** (e.g. you are yourself a subagent): write the docs sequentially
> with the same template. Identical output, longer wall-clock.

`README.md` (the index) holds: the ordered slice list with links, the ordering rationale, the
**shared Definition of Done**, a SCOPE reminder (editable vs off-limits, copied from the wiki),
and the cumulative E2E picture (the suite grows one spec per slice; the whole thing must stay
green).

## Phase 3 — Verify the plan is coherent

- Every slice passes the walking-skeleton test (full pipeline + own E2E).
- Ordering has no forward dependencies; slice 1 truly is the thinnest walking cut.
- Union of all slices == the task, with nothing out of scope and stubs called out where the API
  is missing.
- All in-scope paths are inside the editable scope. Report the plan + the path to `README.md`.

---

## Slice doc template (`slice-N.md`)

```markdown
# Slice N — <user-visible capability>

> **Goal:** <one sentence — what a user can now do, end to end.>
> **Walks:** <the layers this slice exercises, top to bottom.>
> **Builds on:** Slice N-1  (Slice 1: "baseline / nothing")

## Vertical path (what this slice makes walk)
- **Entry/route:** <…> — mirrors `traced-feature` step → `/abs/path:line`
- **Data:** <server fn / loader> — <real | ⚠ STUB>
- **Server comm:** <the repo's convention> — `/abs/path:line`
- **Render:** <components> — reuse <shared UI>
- **Mutation (if any):** <action> → <revalidate/refresh>

## In scope (create/modify — editable paths only)
- `create` <path> — <why>
- `modify` <path> — <why>

## Deferred (NOT this slice)
- <thing> → Slice M

## Server data
- ✅ real: <endpoint> exists, integrate it — `/abs/path:line`
- ⚠ STUB: <server fn> returns typed mock shaped by <type> (endpoint missing) — sanctioned pattern

## E2E proof (must pass before this slice is "done")
- **spec:** `e2e/<name>.spec.ts` — mirror the repo's E2E style (see Testing wiki page)
- **happy path:** <the click-through the test drives>
- **key assertions:** <what proves it actually works — URL state, rendered text, etc.>
- **run:** `<repo test:e2e command>`

## Definition of done
- [ ] works end-to-end (manual click-through)
- [ ] new E2E green
- [ ] ALL pre-existing E2E still green (regression gate)
- [ ] typecheck + lint + unit green
- [ ] atomic commit(s): `<conventional message(s)>`

## Patterns to mirror
- [Traced feature](../wiki/traced-feature-<name>.md) · [Server comm](../wiki/dimension-server-communication.md) · [Testing](../wiki/dimension-testing.md)
```

## Worked mini-example (the granularity to aim for)

A *good* slice 1 for a "build a Things list/detail/create feature" task — note it crosses every
layer yet stays thin, and links to the wiki's traced feature for each step:

> **Slice 1 — list view renders real things on `/things`.**
> Walks: nav link → `/things` route (server component) → `getThings()` server fn → real
> `client.listThings()` → render a card grid + empty state.
> E2E: navigate to `/things`, assert the heading and ≥1 card's name renders.
> In scope: `app/things/*`, `lib/<rpc-wiring>`, the nav component. Deferred: search (slice 2),
> detail (slice 3), create (slice 4), any stubbed extra (last slice).

That's the unit: one capability, full pipeline, one happy-path E2E, everything else explicitly
pushed to later rungs.

## Quality bar

- Reading `slice-1.md` alone, someone could build and E2E-prove the walking skeleton without
  re-reading the whole repo.
- No slice is a horizontal layer. No slice is untestable. No slice escapes scope.
- The slices are a *ladder*: stop after any rung and you still have a working, tested feature.

## Why this exists

The grade rewards a **thin slice working before polish** and a **passing E2E per task**. Cutting
the work into vertical, individually-testable skeletons makes that the path of least resistance:
build slice 1, prove it walks, commit, climb. Pairs with `/to-wiki` (the map) upstream and the
build/test/commit skills downstream.
