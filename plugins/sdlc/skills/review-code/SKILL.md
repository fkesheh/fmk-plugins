---
name: review-code
description: Independent code review discipline for a diff or PR. Forces reading the spec/contract/ticket BEFORE the diff, reviewing in a fixed severity order (correctness > security > contract conformance > boundary violations > edge cases > test quality > performance > style), verifying every non-style finding with a concrete failure scenario before reporting it, calibrating each finding as blocking/should-fix/nit/question, and explicitly hunting for what is MISSING (error paths, tests, authz, migrations). Prevents the two review failure modes: over-reporting (flooding the author with plausible-but-wrong findings and style nits while the one real correctness bug slips through) and self-review blindness. TRIGGER on phrases like "review this PR", "review this diff", "code review", "review my changes", "check this pull request", "look over this patch", "review the branch", "is this change safe to merge", "review before merge", "critique this code", "sanity-check this diff", "/review-code". SKIP when the user wants you to WRITE or fix code rather than assess it, when they ask only for a style/lint pass (linters own style), or when reviewing your OWN implementation from this same session — independence requires a different reviewer.
---

# review-code — independent, severity-ranked code review

Enforces a disciplined review pass over a diff or pull request: read the spec first, review in strict severity order, verify every finding before you report it, calibrate its severity, and check for what is absent. The only artifact you produce is a ranked findings report — you do not edit the code under review.

This skill exists because a capable model reviewing code has one dominant failure mode: **over-reporting**. It generates a long list of plausible-sounding concerns — style nits, "consider extracting this", "this might be slow", "did you mean to..." — that bury the single real correctness bug and train the author to ignore reviews. A review's value is inversely proportional to its false-positive rate. The second failure mode is **self-review blindness**: the author cannot see the bug they just wrote, because the same wrong mental model that produced it reads the diff as correct. This skill counters both with a fixed order of attention, a verification gate, and an independence rule.

## The two hard gates

**Gate A — Independence.** You may NOT review an implementation you wrote in this same session. The reviewer must be a different agent/context than the author. If you are asked to review your own diff, say so and require a fresh reviewer. Self-review is a lint pass at best; it cannot catch a logic error rooted in the author's own assumptions. (Reviewing code written by *others* — including past sessions whose reasoning you do not hold in context — is fine.)

**Gate B — Verify before reporting.** Every finding above `nit`/style level must be verified before it appears in the report: trace the actual code path, construct a concrete failure scenario (specific inputs/state → wrong output/effect), or run the code/test. A finding without a concrete failure scenario is NOT reportable as a bug — downgrade it to a `question`. "This looks wrong" is not a finding; "with `items=[]` this throws IndexError at `svc.py:88`" is.

If you cannot satisfy Gate B for a suspicion, you have two honest options: dig until you can (trace the path, write the scenario) or file it as a `question` for the author. You may not launder an unverified hunch as a `blocking` finding.

## Workflow

### 1. CONTEXT pass — read the intent before the diff

A review without the spec is a style check. Before you look at a single line of the diff, load what the change *claims to do*:

- The ticket / issue / PR description — what problem is being solved, acceptance criteria.
- The frozen contract / interface / spec the change implements — types, signatures, error shapes, config, the module's allowed import surface.
- Any design doc, ADR, or research doc referenced.

Write down, in one or two sentences, **what correct looks like** for this change. You are reviewing against that, not against your personal taste. If no spec exists, say so in the report — an intent-free review can only assess internal consistency, not correctness, and you should flag the missing spec as a `should-fix` on the process.

Gate: do not start reading the diff until you can state the change's intended behavior and its contract. If the diff is meaningless without a spec you cannot find, ask for it rather than guessing.

### 2. SIZE check — is this reviewable?

Estimate the review surface (files touched, lines changed, number of distinct concerns). A responsible line-by-line review has a ceiling. If the diff is too large to review with attention — hundreds of lines across many unrelated concerns, or a mechanical rename tangled with a behavior change — **say so and ask for a split** rather than skimming and rubber-stamping. Skimming a large diff produces a review that looks thorough and catches nothing; it is worse than no review because it grants false confidence.

Concretely, if you catch yourself about to write "LGTM" on a 900-line diff you read in one pass, stop. Request that behavior changes be separated from mechanical churn, or that the PR be split by concern, and review each part properly. A good escape hatch: review the load-bearing files at full depth and explicitly mark the rest as "not reviewed — please split."

### 3. SEVERITY passes — review in this order, budget attention accordingly

Make one pass per tier, most-severe first. Spend your attention where the damage is. Do not start the style pass until the correctness and security passes are done — reversing this order is exactly how the real bug gets missed while three nits get filed.

1. **Correctness bugs** — the code does the wrong thing. Wrong branch, off-by-one, inverted condition, missing case, mutation through aliasing, wrong operator, race, incorrect state transition, resource leak, null/undefined deref, wrong error swallowed. For each: trace the path and construct the failing input (Gate B).
2. **Security** — authn/authz (is every new endpoint/handler both authenticated AND authorized? is authz checked on the *object*, not just "is logged in"?), injection (SQL/command/template/path traversal), secrets in code or logs, unsafe deserialization, SSRF, missing output encoding, permission escalation, tenant isolation. Security-first house rule: no unauthenticated endpoints, no secrets in code — flag any violation as `blocking`.
3. **Contract conformance** — does the change match the frozen interface/spec? Signatures, types, return shapes, error types, status codes, config keys, event names. A deviation from a frozen contract is `blocking` even if the code "works", because it breaks callers built against the contract. Strong-types house rule: flag `any`/untyped/loosely-typed public surfaces where the contract specified a type.
4. **Boundary violations** — imports, dependencies, or calls outside the module's allowed surface. A module reaching into another's internals, a layering violation (domain importing infra), a new dependency not on the whitelist. These are architectural debt that compiles cleanly, so only a reviewer catches them.
5. **Missing edge cases & error handling** — empty/null/boundary inputs, unhandled error paths, unawaited async, uncaught rejections, partial-failure states, timeouts, retries, idempotency. See the ABSENCE CHECK (step 4).
6. **Test quality** — reviewing the tests is part of the review, not optional. Do the tests assert the *contract* (behavior the spec promises) or do they mirror the *implementation* (asserting what the code happens to do, so they pass by construction and catch nothing)? Are the changed behaviors actually covered? Do tests test the failure paths, not just the happy path? A test that would still pass if the bug were present is worthless — flag it.
7. **Performance on hot paths** — only where it matters: N+1 queries, unbounded loops over user-controlled input, O(n²) on large n, missing index on a queried column, sync I/O in a request path, allocation in a tight loop. Do not speculate about micro-optimizations off the hot path.
8. **Style** — mention ONLY if egregious (genuinely confusing naming, dead code shipped, a 200-line function). Linters and formatters own style. Nits here are the single biggest source of over-reporting; default to silence.

### 4. ABSENCE CHECK — review what is NOT in the diff

Bugs of omission are invisible in a line-by-line read because there is no line to react to. Explicitly ask, for this change:

- **Unhandled error paths** — the happy path is coded; what about the failure return, the thrown exception, the rejected promise, the non-200 response? Is the error swallowed, logged-and-continued, or correctly propagated?
- **Missing tests for changed behavior** — every behavior the diff changes should have a test that would fail without the change. Which changed lines have no covering test?
- **Missing authz on new surface** — every new endpoint, handler, mutation, or RPC: is authorization present? New surface silently ships unprotected far more often than existing surface loses its guard.
- **Missing migration / backfill** — does the change touch a schema, a persisted shape, an enum, a serialized format? Is there a migration? A backfill for existing rows? A read-compat path for old data?
- **Missing config / feature-flag / rollback** — new behavior behind a flag? A way to turn it off?

An omission you verify (e.g. "the `DELETE /orders/{id}` handler added at `routes.py:140` has no ownership check — any authenticated user can delete any order") is a real finding, and usually a high-severity one.

### 5. CALIBRATE — label every finding

Every finding carries exactly one label. A review that marks everything `blocking` is as useless as one that blocks nothing — the labels are how the author triages, and miscalibration destroys their signal value.

- **blocking** — must fix before merge. Correctness bug with a concrete failure scenario, security hole, contract violation, missing authz. You are asserting the code is wrong, not that you dislike it.
- **should-fix** — real issue, should be addressed but not a merge-blocker on its own: a missing edge case that is unlikely-but-possible, a weak test, a boundary violation that is contained.
- **nit** — minor, optional, author's discretion. Style, naming, small clarity. Keep these rare; if you have more than a couple, you are over-reporting.
- **question** — you are not sure this is wrong; you need the author to confirm intent. This is where unverified suspicions go (Gate B). Phrase it as a genuine question, not a veiled accusation.

Calibration honesty: if you would not personally block the merge over it, it is not `blocking`. If you are not certain it is a defect, it is a `question`, not a `should-fix`.

### 6. REPORT — ranked most-severe-first

Emit findings ordered by severity (all `blocking` first, then `should-fix`, then `question`, then `nit`). Each finding carries a `file:line` anchor and, for everything above nit, the concrete failure scenario that satisfies Gate B. Lead with a one-line verdict so the author knows the outcome before reading the list. See Return format.

## Definition of done

- CONTEXT pass complete: the change's intended behavior and contract are stated (or the missing spec is flagged).
- SIZE check done: either the diff was reviewable and reviewed at depth, or a split was requested with the reason.
- All eight severity passes performed in order; correctness and security passes completed before any style consideration.
- ABSENCE CHECK performed: error paths, tests-for-changed-behavior, authz-on-new-surface, and migration-for-schema-changes each explicitly considered.
- Every reported finding above `nit` has a `file:line` anchor AND a concrete failure scenario (Gate B satisfied); unverified suspicions are filed as `question`, not upgraded.
- Every finding carries exactly one calibration label; the report is ranked most-severe-first with a leading verdict.
- Independence honored (Gate A): you did not review your own same-session implementation.

## Return format

You are usually a review subagent reporting to an orchestrator. Return a structured summary — never a full file dump, never the diff pasted back.

```markdown
## Review verdict: <APPROVE | APPROVE WITH NITS | CHANGES REQUESTED | NEEDS SPLIT>

Change reviewed: <one line — what it claims to do>
Spec/contract: <path or "none found — flagged below">
Review surface: <N files, ~M lines> — <fully reviewed | partially, see split request>

### Blocking (N)
1. `path/to/file.ext:LINE` — <what is wrong>.
   Failure scenario: <concrete inputs/state → wrong output/effect>.
2. ...

### Should-fix (N)
1. `path:LINE` — <issue> — <why it matters>.

### Questions (N)
1. `path:LINE` — <what you need the author to confirm>.

### Nits (N)
1. `path:LINE` — <minor, optional>.

### Absence check
- Error paths: <covered | gap at path:LINE>
- Tests for changed behavior: <covered | uncovered change at path:LINE>
- Authz on new surface: <n/a | present | MISSING at path:LINE>
- Migration for schema change: <n/a | present | MISSING>

### Open risks / not reviewed
<anything you could not verify, or files skipped with reason>
```

If nothing above `nit` was found, say so plainly — a clean review is a valid, valuable result. Do not manufacture `should-fix` findings to look diligent.

## Anti-patterns

- **Nit flooding.** A wall of style/naming/"consider extracting" comments. It buries the real bug and trains the author to skim reviews. Linters own style; stay silent unless egregious.
- **Unverified accusations.** Reporting "this looks buggy" without tracing the path or constructing the failing input. Violates Gate B — downgrade to a `question` or verify it.
- **Reviewing the diff without the spec.** You end up checking style and vibes because you have no definition of correct to check against. Read the intent first.
- **Everything is blocking.** Miscalibration that makes the author unable to triage. Reserve `blocking` for things you would actually block the merge over.
- **Skipping the tests.** Tests are part of the diff and part of the review. A test that mirrors the implementation passes by construction and proves nothing.
- **Reviewing only what changed lines say, never what they omit.** The missing authz check, the absent migration, the untested new branch — bugs of omission are the ones a line-by-line read structurally cannot see.
- **Rubber-stamping a huge diff.** "LGTM" on 900 lines read in one pass is negligence dressed as approval. Request a split or review the load-bearing parts at depth and mark the rest unreviewed.
- **Reviewing your own same-session code.** The assumption that produced the bug also reads it as correct. Require an independent reviewer (Gate A).

## Worked micro-examples

**Input:** PR adds `GET /users/{id}/invoices`. Diff is clean, well-typed, tests pass.
**Correct behavior:** Correctness pass finds no logic bug. Security pass (tier 2) + absence check ask: is there authz? The handler checks `is_authenticated` but never checks that `id == current_user.id` or that the caller has an admin role. Concrete scenario: user A calls `GET /users/B/invoices` and receives user B's invoices. Report as **blocking**, `routes/invoices.py:34`, with that scenario — not as a nit about the missing docstring three lines down (which you do not even mention).

**Input:** You are asked to "review the diff" for a feature you implemented earlier in this same session.
**Correct behavior:** Invoke Gate A. Respond that self-review cannot catch assumption-level logic errors and request a fresh reviewer with the contract and diff. If forced to proceed, explicitly label the output "self-review — independence not satisfied, treat as a lint pass only" so no one mistakes it for a real review.
