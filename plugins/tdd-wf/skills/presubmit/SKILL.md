---
name: presubmit
description: >-
  Final pre-submission gate + grading panel. First runs ALL the repo's real checks (typecheck,
  lint, format, unit, build, and the full E2E suite incl. regression) with no masking. Then spins
  one subagent per EVALUATED ASPECT — the FULL set the brief names (functional completeness,
  frontend fluency, monorepo awareness, convention consistency/pattern fidelity, code quality,
  server-communication & state/data-flow, testing, commit hygiene & history, scope & regression
  discipline, AI-leveraged understanding) — to grade with file:line evidence. Produces a scorecard
  + prioritized fixes + a go/no-go. Run before declaring a task done. Trigger: /presubmit.
---

# /presubmit — run the gate, then grade every aspect

Two jobs, in order: **(1)** prove the work passes the repo's real checks, then **(2)** grade it
the way the assessment will — one independent grader per criterion, evidence-based, no inflation.
Run this before you say "done."

## Operating rules

1. **No masking, ever.** Run the repo's *actual* check commands and report *actual* results. Never
   skip, `|| true`, loosen a config, or weaken a test to get green. A real red is a finding.
2. **Root cause, not patch.** If a check fails, surface the real reason; don't paper over it.
3. **Grade with evidence.** Every grade cites `/abs/path:line` from the real diff. Graders are
   skeptical — unverified claims are penalized, not assumed. No grade inflation.
4. **Assume nothing about the stack.** Discover the check commands and the criteria from the repo
   and brief (below). Concrete names here are illustrative — confirm against the actual repo.

## Inputs

- **What to grade (the diff).** The feature work to evaluate. Determine the base: an explicit base
  ref if given; else the commit before the feature work began (e.g. the parent of the first
  `slice-*`/feature commit, or the branch fork-point); else the committed+uncommitted changes.
  Produce the changed-file list (`git diff --stat <base>..HEAD` + working tree).
- **The check commands.** From the repo's scripts + the wiki **build/testing/conventions** pages —
  the real typecheck / lint / format / unit / build / E2E commands and how they run.
- **The evaluated aspects (criteria).** From the **brief's grading rubric** if it lists them; else
  the standard assessment set (see Aspect catalog). Read `docs/wiki/scope-and-boundaries.md` and
  the brief so graders know the hard rules (scope, regression gate, stub pattern).
- **Reference:** `docs/wiki/` (the conventions to compare against) and `docs/slices/` (what was
  meant to be built).

## Phase 1 — The gate (objective, run it yourself)

> If the work came through the loop, the phases already enforced their subsets — `/red` (the test
> typechecks/lints/format-clean + fails right), `/green` (typecheck·lint·unit·slice-E2E), `/refactor`
> (the full gate incl. regression+format). So this gate should pass **by construction**. Run it
> anyway — it's the **authoritative** final re-run, and it catches drift, skipped phases, or
> cross-slice interactions no single phase saw.

Preflight: **kill stray dev/test servers / verify clean ports** (e.g. the app + API ports) so the
E2E suite doesn't reuse a broken server and lie.

Run each real check, capture pass/fail + the salient output:

- **typecheck** · **lint** · **format check** · **unit tests** · **build** (if the repo builds) ·
  **E2E — the FULL suite**, which includes the pre-existing specs (the **regression gate** that
  must stay green) plus any new ones.

> **Format-check scoping (matters):** run the repo's *own* format mechanism and respect its ignore
> rules — `.prettierignore`, `// @generated` files, the exact glob the repo's `format` script uses.
> A blanket `prettier --check "**/*"` over-reports: it flags generated code and docs the repo never
> formats. Also classify it: if the repo **enforces** a format check (CI / a `format:check` script),
> a fail is a hard ❌; if it only ships `prettier --write` with no enforced check, treat format
> drift as **advisory** (a real quality signal, but not a hard NO-GO) and scope it to source files.

Record a gate table: each check → ✅/❌ (or ⚠️ advisory) + one-line evidence. If anything is ❌,
that's a first-class finding — grading proceeds, but functional-completeness/testing grades must
reflect it.

## Phase 2 — Grading panel (one subagent per aspect, parallel)

Spawn **one subagent per evaluated aspect, all in a single message** so they grade concurrently.
Give each grader: its aspect + *what that aspect really tests*, the changed-file list, the Phase-1
gate results, the brief, the wiki conventions, and the slices. Each grader is **read-only**, reads
the actual diff, and returns a structured verdict.

### Aspect catalog (the full assessment criteria — override/extend from the brief if it differs)

Derive the aspect list from the brief's rubric. The brief is usually a short table, but the
**playbook and framing name more evaluated signals than the table** — grade all of them. The full
assessment set:

- **Functional completeness** — does it work end-to-end, clickable live? Are the slices' happy
  paths actually delivered? (Cross-check the gate's E2E results.)
- **Frontend fluency** — polished, well-structured UI built with the project's existing tools
  (components, styling, states: loading/empty/error, pending/optimistic UI, a11y).
- **Monorepo awareness** ★ — correct use of workspaces, shared packages, and build orchestration;
  changes land in the right workspace; nothing reinvented that the monorepo already provides.
- **Convention consistency / pattern fidelity** ★ — **does the new code read like it was always
  there?** Mirrors the traced feature (imports, casing, file layout, server/client split, naming);
  **no new libraries, no new paradigms**. *(Called out separately as a top-weighted signal — keep
  it distinct from raw code quality.)*
- **Code quality** — strict types (no `any`, honest narrowing/discriminated unions), lint clean,
  format clean, no duplication, sensible modules.
- **Server communication & state/data flow** — follows the repo's **server-communication**
  convention and **state** handling; correct data loading / mutations / caching; the
  stub-for-missing-API pattern used where the endpoint doesn't exist (not a reach past scope).
- **Testing** — meaningful tests (behavior not shape), unit for logic + E2E for the happy path,
  in the repo's style; assertions are strict and not weakened.
- **Commit hygiene & history** — atomic, conventional commits, **one per distinct coherent piece**
  (not a single mega-commit, not per-file noise), each buildable; scoped by a **reviewer-meaningful
  feature/area** (`feat(<feature>): …`, real repo names) — **penalize internal slice-number scopes** (`slice-1`)
  that mean nothing to a reviewer. The history **reads as a thinking signal** (test→feat→refactor
  narrative).
- **Scope & regression discipline** — changes stay inside the **editable paths only** (off-limits
  workspaces untouched, e.g. the API); **no unnecessary new dependencies**; the **pre-existing
  E2E still pass** (regression gate). A scope violation is a serious finding regardless of polish.
- **AI-leveraged understanding** *(process proxy)* — evidence the author understood, not blind-
  generated: coherent incremental commits, thin-slice-first ordering, no copy-paste incoherence or
  dead/unused scaffolding. Assessed from the history + diff artifacts; note it's a proxy.

★ = the two most-weighted in practice (**monorepo awareness** + **convention consistency**). Weight
them higher in synthesis. Scale the panel to the rubric — one subagent per aspect that applies;
skip an aspect only if it genuinely can't apply (e.g. no commits yet → skip commit hygiene).

### Grader contract (give each one this)

- Score **0–100** + a band (`Strong ≥85 · Adequate 70–84 · Weak 50–69 · Poor <50`).
- **Evidence:** 2–5 `/abs/path:line` citations backing the score. **Strengths**, **Gaps**, and
  **concrete fixes** (each fix actionable, ideally with the file to change).
- Be a skeptical reviewer: hunt for what's missing or off-convention; don't reward intent, reward
  the diff. Return `{ aspect, score, band, evidence[], strengths[], gaps[], fixes[] }`.

> **Fallback — no spawn tool** (e.g. you are yourself a subagent): grade each aspect sequentially
> with the same contract. Same scorecard, longer wall-clock.

## Phase 3 — Synthesize the scorecard

- **Scorecard table:** aspect · score · band · one-line why.
- **Overall:** a weighted roll-up (lean on the two ★ differentiators) + an explicit verdict:
  **GO** · **CONDITIONAL GO** · **NO-GO**. NO-GO if an *enforced* gate is red or any aspect is
  Poor; CONDITIONAL GO if the only failures are advisory/trivially-fixable (e.g. format drift) —
  name the must-fix-first items.
- **Top fixes:** the prioritized, highest-leverage actions (differentiator gaps first, then
  quick wins), each pointing at a file.
- Write the report to `docs/presubmit-report.md` and print the scorecard + GO/NO-GO inline.

## Quality bar

- The gate result is **real** — a reader could re-run the exact commands and reproduce it.
- Every grade is defensible from the diff (evidence, not vibes).
- The top-fixes list is short, ordered by impact, and actually closes the gaps the graders found.

## Why this exists

It's the dress-rehearsal of the actual scoring: catch a red gate or an off-convention drift while
you can still fix it, and turn the rubric into a concrete punch-list. Runs at the end of the
pipeline — after `/red → /green → /refactor` — as the last check before "done."
