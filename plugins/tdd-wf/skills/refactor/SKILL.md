---
name: refactor
description: >-
  TDD REFACTOR phase for ONE slice. With tests GREEN, improves the slice's code WITHOUT changing
  behavior so it adheres to the assessment rules: strict TypeScript (no any), lint-clean, mirrors
  the repo's conventions and the traced feature, reuses shared packages, no new deps, stays in
  scope. Keeps tests green after each step, then runs the full gate incl. the regression E2E suite.
  Commits the cleanup (skipped if nothing changed). Final step of /red → /green → /refactor.
  Trigger: /refactor (optionally /refactor slice-X).
---

# /refactor — make it adhere to the rules (behavior unchanged)

You are in the **REFACTOR** phase. The slice is GREEN; now make the code look like it was always
part of this repo and obey every assessment rule — **without changing behavior**. Tests stay green
throughout. This is the convention-fidelity / pattern-mirror pass.

Loop: **/red → /green → /refactor**. This is step 3; finishing it closes the slice.

## Precondition

Tests must be **GREEN**. **Never refactor while red** — if any test fails, stop and send the user
back to `/green`. Refactoring on a red bar hides which change broke what.

## Inputs

- **Slice id** — the slice just made green.
- **`docs/slices/slice-X.md`** — its **Definition of Done**.
- **`docs/wiki/`** — the **traced feature** (the canonical patterns), **conventions & quality
  gates** (strictness, lint, formatting, commit style), **components** / **styling** /
  **server-communication** (the idioms to match), and **scope**.

## The adherence pass (assessment rules)

Work through these, running tests after each change:

- **Strict types, no `any`.** No implicit any, no non-null `!` hacks; use narrowing, discriminated
  unions, and the repo's shared types. The compiler should be satisfied honestly.
- **Lint clean.** Run the repo's actual linter — **zero warnings**. Don't disable rules to pass.
- **Format clean — a SEPARATE gate.** Run the repo's formatter check (e.g. `prettier --check`)
  too; it can fail even when lint passes. Don't fold it into the lint step or you'll miss it.
- **Mirror conventions vs the traced feature** (the last-10% fidelity diff):
  - import ordering and `import type` usage; file/dir **casing**; named vs default exports.
  - server/client component split; data-fetching location (server fn vs client) matches the repo.
  - the **server-communication** convention (client/transport usage) matches exactly.
  - **reuse the shared UI package** — replace any bespoke component that duplicates an existing
    primitive; match variant/prop conventions.
  - dependency versions via the repo's mechanism (e.g. catalog) — **no new dependencies**.
- **Remove duplication; deepen modules.** Extract only where natural (small interface, real
  implementation). Don't over-engineer or add speculative abstraction.
- **Naming matches the repo's vocabulary.** Functions/files/test names read like the codebase.

## Close the slice (the full gate — your subset of `/presubmit`)

REFACTOR owns the **widest** inner gate: the full Definition of Done, including the regression
suite and format check that `/red`/`/green` deliberately skipped. It's the same gate `/presubmit`
re-runs — so closing the slice green here means `/presubmit`'s gate passes **by construction**
(presubmit then re-runs it authoritatively and adds the grading panel).

After the cleanup, run the **complete** Definition of Done — not just the slice's own test:

1. typecheck · 2. lint · 3. **format check** (separate from lint) · 4. unit tests · 5. the slice's
E2E · 6. **ALL pre-existing E2E (regression gate) — must stay green.** Kill stray dev servers /
verify the app/API ports the E2E uses are clear first (whatever they are in this repo) if its E2E
reuses a running server.

If the regression gate goes red, you changed behavior — revert the offending refactor step (this
is why tests run after *each* step), don't paper over it.

## Commit policy (shared across the loop)

- **Reviewer-meaningful scope.** Scope by the **feature/area or workspace** the change serves —
  `refactor(<feature>): …`, `refactor(<shared-pkg>): …` — using **your repo's real names**.
  **Never scope by the internal slice number** (`slice-1` means nothing to a reviewer). Reference
  the slice in the *body* if you want it.
- **Granularity:** **one commit per distinct refactor** (extract / rename / dedupe) — e.g. (names
  illustrative) `refactor(<feature>): extract <X> mapping` separate from `refactor(<shared-pkg>):
  align card spacing`. Not one bundled "cleanup" commit, not per-file noise. **Skip entirely if
  nothing changed** (no empty/noise commits) and say so.
- Each commit stays **buildable and green** (tests pass after each refactor step).
- **Author email `foadmk@gmail.com` — set it explicitly, don't trust repo git config:**
  `git -c user.email=foadmk@gmail.com commit --author="<your name> <foadmk@gmail.com>" -m "…"`.
- No Claude as author/co-author. No ticket on the assessment.

## Hand-off

Slice closed. Point the user to the next rung: `/red slice-(X+1)`, or if it was the last slice,
note the feature is complete and the full suite is green.

## Do / don't

- ✅ Behavior-preserving cleanup · tests green after each step · mirrors the traced feature · full
  regression gate green · skip the commit when nothing changed.
- ❌ Refactoring while red · changing behavior · disabling lint/type rules to pass · new deps ·
  speculative abstraction · committing an empty refactor.
