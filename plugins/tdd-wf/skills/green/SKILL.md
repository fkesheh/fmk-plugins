---
name: green
description: >-
  TDD GREEN phase for ONE slice. With a failing test already in place (from /red), writes the
  MINIMAL implementation — the vertical walking skeleton (route → data → server/stub → render →
  mutation) — to make the slice's E2E pass, mirroring the repo's patterns and staying inside the
  editable scope. Does inner unit red→green cycles for pure logic. Commits the working feature.
  Second step of /red → /green → /refactor. Trigger: /green (optionally /green slice-X).
---

# /green — make the slice walk (minimal code to pass)

You are in the **GREEN** phase. A failing acceptance test exists; write the **least code** that
makes it pass by building the slice's vertical walking skeleton, then commit and hand to
`/refactor`. **Do not polish here** — clean-up is `/refactor`'s job.

Loop: **/red → /green → /refactor**. This is step 2.

## Precondition

There must be a **failing test** for this slice — either **committed** (`test(slice-X): …` from
`/red`) **or uncommitted in the working tree** (the green-only toggle). Check both. If there is no
failing test either way, **stop** and tell the user to run `/red` first — never write feature code
without a red test driving it.

## Inputs

- **Slice id** — the slice currently in RED (argument, else infer).
- **`docs/slices/slice-X.md`** — the **vertical path** (the layers to wire) and **in-scope files**.
- **`docs/wiki/`** — the **traced feature** (the exact shape to mirror, file:line), **server
  communication** (the convention for talking to the backend), and **scope** (editable paths +
  the sanctioned stub pattern).

## Steps

1. **Build the vertical skeleton, outside-in.** To satisfy the acceptance test, wire each layer
   the slice names — route/entry → data/server fn → server call (or **stub**) → render →
   mutation — copying the traced feature's shape. Keep it the *thinnest* path that makes the test
   pass.
2. **Inner loop for logic & collaborators you build here.** For any logic or seam the slice needs
   — a pure util (parse/format/map) **or an integration boundary you're now creating** — do a
   tight inner cycle: write **one** failing test (unit or integration, in the repo's style) →
   minimal code to pass → repeat. One test at a time; only enough code for the current test; don't
   anticipate future tests. These are the tests that did NOT belong in `/red` because their
   contract only became known as you built — each lands here, ideally committed with (or just
   before) the code it drives.
3. **Stay in scope.** Only edit the editable paths from the scope page. If an endpoint is
   missing, **stub the server function** with typed mock data shaped by the real type (the
   sanctioned pattern) — never reach past scope, never call an off-limits service directly.
4. **No new dependencies, no new paradigms.** Reuse the shared UI package and existing utilities.
   Strong types as you go (no `any`), but heavy cleanup is deferred to `/refactor`.
5. **Confirm GREEN — the inner gate (your subset of `/presubmit`).** Run the relevant subset:
   **typecheck · lint · unit (all, incl. new) · the slice's E2E** — all pass. This verifies the
   slice as a whole (every commit was already buildable). **Defer the FULL regression E2E suite and
   the format-check pass to `/refactor`** — they're its subset; running the whole E2E suite every
   green micro-commit is wasteful. Don't gold-plate: extra states, styling, and edge cases belong
   to `/refactor` or a later slice.
6. **Commit as you go** (see policy): **one or more small `feat` commits** along natural seams,
   each with a **feature-scoped** message, built **bottom-up so every commit compiles** — not one
   bundled commit. Under the green-only toggle, the first commit also includes the test from
   `/red`. Then hand to `/refactor`.

## Minimal-code discipline (from the TDD loop)

- Only enough code to pass the current test. No speculative features. No "while I'm here."
- Mirror, don't invent — match the traced feature's data-flow and component split so the diff
  reads native even before refactor.
- If you find yourself building something no test demands, stop — it's either a later slice or
  out of scope.

## Commit policy (shared across the loop)

- **Reviewer-meaningful scope.** Scope each commit by the **feature/area or workspace** it serves —
  `feat(<feature>): …`, `feat(<shared-pkg>): …` — using **your repo's real names** (discover them;
  don't assume). **Never scope by the internal slice number** (`slice-1` means nothing to a
  reviewer; the feature does). Want internal traceability? Reference the slice in the commit *body*.
- **Granularity — one commit per coherent, self-consistent piece, built bottom-up so each commit
  compiles.** Not one mega-commit, not per-file noise. For GREEN, the *shape* is (names illustrative
  — use your repo's): `feat(<shared-pkg>): add <Thing>Card` → `feat(<feature>): list route + data`
  → `feat(<feature>): add nav link` (+ `feat`/`test(<feature>):` for any inner-loop util). Commit
  when a thought is complete; a genuinely indivisible thin skeleton can still be one commit.
- Each commit leaves the tree **buildable** (typecheck/lint green). The new E2E may stay red until
  GREEN's final commit; the **pre-existing** E2E stays green at every commit.
- **Author email `foadmk@gmail.com` — set it explicitly, don't trust repo git config:**
  `git -c user.email=foadmk@gmail.com commit --author="<your name> <foadmk@gmail.com>" -m "…"`.
- No Claude as author/co-author. No ticket on the assessment.

## Do / don't

- ✅ Thinnest vertical path · mirrors traced feature · stub for missing endpoints · tests pass.
- ❌ Writing code with no red test · gold-plating · new deps/libraries · touching off-limits
  scope · weakening the test to get green (fix the code, not the test).
