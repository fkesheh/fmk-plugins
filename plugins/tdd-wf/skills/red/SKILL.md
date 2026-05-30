---
name: red
description: >-
  TDD RED phase for ONE slice. Writes the failing acceptance test (the slice's happy-path E2E)
  for docs/slices/slice-X.md, meeting the assessment's test criteria (meaningful, mirrors repo
  conventions, strict assertions), and confirms it fails for the RIGHT reason before any code is
  written. Commits the failing test. First step of the controllable /red → /green → /refactor
  loop. Use to start a slice test-first. Trigger: /red (optionally /red slice-X).
---

# /red — write the failing test for a slice

You are in the **RED** phase of an outside-in TDD loop on one assessment slice. Write the test
that defines "done" for this slice, watch it fail for the right reason, commit it, and hand off
to `/green`. **Write no implementation here.**

Loop: **/red → /green → /refactor**, one slice at a time, user-driven. This is step 1.

## What goes in RED — and what you must NOT front-load

The rule isn't "E2E only." It's: **write the tests you can honestly specify now — from a known
contract, without imagining the implementation.** The discriminator for every candidate test:

> *Can I write this test against a known contract without guessing the implementation?*
> **Yes → it belongs in RED. No → it's a `/green` inner-loop test.**

- **Always — the happy-path acceptance test (E2E).** It encodes the one user-visible behavior the
  slice delivers; it's the spec, so it's legitimately written first and stays red while you build.
- **When applicable — a unit test for a pure-logic unit** whose contract you already know
  (parser/formatter/mapper/validator): signature and expected outputs are knowable up front.
- **Likewise an integration/contract test** *only if* the boundary it pins already exists or its
  contract is known (e.g. the repo's RPC/proto types) — not one for a module you'll shape later.

**Do NOT front-load** tests for collaborators you haven't built yet. An inner unit/integration test
for a module whose shape you'll only discover *while* implementing tests **imagined** behavior —
the horizontal-slicing anti-pattern. Those are written **one-at-a-time during `/green`**,
interleaved with the code they drive.

So RED is usually the E2E (± one pure-logic unit). If you find yourself writing three speculative
test files here, **stop** — you're horizontal-slicing, or the slice is too big and should be
re-sliced (`/to-slices`).

## Inputs

- **Slice id** — from the argument (`slice-3`); else the lowest-numbered slice in `docs/slices/`
  not yet green; if ambiguous, ask.
- **`docs/slices/slice-X.md`** — especially its **E2E proof** (the happy path + key assertions)
  and its **vertical path** (so you assert the right end-to-end outcome).
- **`docs/wiki/`** — the **Testing** page (how E2E/unit tests are written and RUN here, fixtures,
  selectors, naming), the **Scope** page (editable paths + stub pattern), and the **traced
  feature**'s test as the style to mirror.

## Steps

1. **Read** the slice doc + the wiki testing page. Find the repo's E2E test command, file
   location/naming, and selector conventions. You will mirror them exactly.
2. **Write the failing acceptance test** for this slice's happy path, in the repo's E2E style and
   location. Drive it against the slice's **stub** if its endpoint is missing (per the slice doc).
3. **Meet the test-quality bar (graded):**
   - Asserts **observable behavior** through the UI / public interface — not implementation,
     not internal structure.
   - **Strict, specific assertions** (URL state, visible text, counts). No snapshot-as-a-crutch,
     no `.toBeTruthy()` filler, no asserting the *shape* of data.
   - **Mirrors repo conventions** — same selectors (role/test-id as the repo uses), fixtures,
     naming, imports. A reviewer should not be able to tell it from an existing spec.
   - **Does not weaken** anything — never loosen an assertion to get green later; the impl moves,
     not the test.
   - **Well-formed — the RED inner gate (your subset of `/presubmit`).** The new test must
     **typecheck, lint, and format clean** — run all three on it before committing (format is often
     a *separate* gate from lint: `prettier --check` can fail while `eslint` passes). A test with a
     type/lint/format issue isn't a clean red — it's noise that resurfaces in `/green`/`/refactor`.
     Fix it here. *(You don't run unit/E2E suites or the regression gate in RED — those are
     `/green`'s and `/refactor`'s subsets.)*
4. **Run it and confirm a clean RED:** run **only the new spec** while iterating (e.g. the test
   runner pointed at the single file) — not the whole suite — and **free the app/API ports the
   E2E harness uses first** (whatever they are in this repo) if it reuses a running server (a stale
   server causes false greens or boot timeouts). It must **fail**, and fail **for the right reason** (the feature/assertion, not a
   typo, bad import, missing selector, or harness/setup error). A test that *errors* is not a
   clean red — fix the test until it fails on the assertion you care about.
5. **Do not write implementation. Do not refactor.**
6. **Commit the failing test(s)** (see Commit policy): **one feature-scoped commit per distinct
   up-front test** — usually just `test(<feature>): failing e2e for <capability>`, plus
   `test(<feature>): unit for <util>` if you pinned a pure-logic unit. Then tell the user RED is
   green-barred and ready for `/green`.

## Commit policy (shared across the loop)

- **Reviewer-meaningful scope.** Scope by the **feature/area or workspace** the change serves —
  `test(<feature>): …`, `feat(<shared-pkg>): …` — using **your repo's real feature/workspace
  names** (discover them; don't assume). **Never scope by the internal slice number** (`slice-1`
  means nothing to a reviewer; the feature does). Reference the slice in the commit *body* if you
  want internal traceability.
- **Granularity — one commit per coherent piece, built bottom-up so each compiles.** RED is **one
  commit per distinct up-front test** (usually just the acceptance E2E; + a unit for a known
  pure-logic contract) — *not* a pile of speculative test files. GREEN is one-or-more small
  feature-scoped `feat` commits along natural seams. REFACTOR is one commit per distinct cleanup.
  Not one mega-commit; not per-file noise.
- **Author email `foadmk@gmail.com` — set it explicitly, don't trust repo git config:**
  `git -c user.email=foadmk@gmail.com commit --author="<your name> <foadmk@gmail.com>" -m "…"`.
- No Claude as author/co-author. No ticket on the assessment.
- A red SHA having a failing test is intentional and fine here — the enforced gate is the final
  state, and a visible test-first commit is a positive grading signal.
- **Green-only toggle:** if the user prefers every commit to be green/bisectable, *don't* commit
  in RED — leave the failing test in the working tree and let `/green`'s first `feat(<feature>): …`
  commit include both test and implementation.

## Do / don't

- ✅ One acceptance test, real assertions, clean red, repo-native style.
- ❌ All the slice's tests at once · implementation code · weakened assertions · committing a red
  that errors instead of asserting · touching off-limits scope.
