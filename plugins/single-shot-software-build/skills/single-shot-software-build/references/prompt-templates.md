# Prompt Templates

Every implementer receives three blocks concatenated: RULES (identical for all), DIRECTION (identical for all — the product direction you wrote in Phase 3), and its own MODULE BRIEF. Reviewers, verifiers and fixers have their own templates below.

## The RULES block (adapt paths/stack, keep every rule)

```markdown
# Project rules (apply to every file you write)
- Repo root: <ABSOLUTE_PATH>. All paths below are relative to it.
- TypeScript STRICT mode. Never use "any" (use precise types or "unknown" +
  narrowing). Named exports only. No default exports.
- FIRST read the contract files. They are FINAL — never modify them:
  shared/contract.ts, shared/config.ts, web/src/ui/* (design system), server/seed.ts.
- Implement interfaces from shared/contract.ts EXACTLY (names, signatures,
  semantics — including the documented error and authorization semantics).
- Create ONLY your assigned files. Other modules are being written in parallel
  by other agents against the same contract — import from their documented
  paths and trust the documented exports.
- Do NOT run npm, tsc, vite or any dev server (node_modules may be mid-install;
  a later phase compiles). Write careful, complete, production-quality code with
  zero TODOs and zero placeholder stubs.
- Every endpoint you write requires authentication and enforces ownership/
  authorization per the contract. No secrets or credentials in code.
- All UI composes the design-system primitives and tokens. Do not invent ad-hoc
  colors, spacing, or one-off styled buttons — if a primitive is missing
  something, compose around it, don't fork it.
- Code comments: only where a constraint is non-obvious. No narration comments.
- This is a real, finished product, not a demo: handle the edge cases (empty
  lists, failed requests, slow responses, unauthorized access, invalid input,
  concurrent edits, pagination boundaries).
```

Why these rules work: "trust the documented exports" is what lets agents build against modules that don't exist yet; "finished product, not a demo" is what buys edge-case handling instead of stubs; the design-system rule is what buys visual coherence. Weaken them and you weaken exactly those properties.

## Module brief pattern

Each brief: exclusive file list, then craft-framed direction, then per-file specifics. The framing sentence matters more than it looks — it sets the standard the agent holds itself to.

**Backend domain example:**

```markdown
## Module: server-domain
Owns (exclusive): server/services/invoiceService.ts, server/services/budgetService.ts, ...
Focus: this is the business-logic core — correctness under concurrency is the craft
here. Every mutation runs in a transaction. Every read is scoped to the requesting
user. Implement the documented error semantics precisely: not_found vs forbidden is
a security distinction, not a nicety.
Per service: <2-5 lines each of behavioral specifics, invariants, tricky cases —
e.g. "markPaid is idempotent: paying a paid invoice returns it unchanged, no error">
```

**Frontend features example (the "product design department" framing):**

```markdown
## Module: web-features-invoices
Owns (exclusive): web/src/features/invoices/*.tsx
Focus: this is the product design department. Every screen must be instantly
navigable at a glance and pleasant up close — clear hierarchy via PageHeader and
Cards, tables that sort and paginate, optimistic updates on quick actions,
Skeletons (never spinners on blank white) while loading, EmptyStates that teach
("No invoices yet — create your first one" + action button), Toasts on success,
inline field errors on validation failure.
Per screen: <2-6 lines each: layout, primary action, one micro-interaction —
e.g. "list: status Badge per row, ⌘K quick-filter, row click → detail; detail:
inline title edit, sticky action bar with Mark Paid">
```

Write per-screen and per-endpoint specifics for EVERY screen and endpoint. The prior builds proved this is the whole ballgame: the same implementer model given "make the UI, it must be detailed" produces a correct, generic, flat product; given the prose above it produces a rich one. Thin direction cannot be compensated later — the review phase checks correctness, not taste.

## Reviewer prompt (one per lens)

```markdown
You are reviewing a freshly generated codebase at <ROOT> for INTEGRATION and
RUNTIME bugs through one specific lens: <LENS>. The code typechecks — do not
report style, taste, or hypothetical improvements. Report only defects that
would misbehave at runtime.
Lens focus: <lens-specific hunting ground, below>.
For each finding: file:line, one-line title, the exact failure scenario, severity
(breaks-core-flow / breaks-edge-case / cosmetic-runtime).
```

The five lenses (diverse on purpose — redundant lenses find the same bugs twice; diverse lenses find different bugs):

| Lens | Hunting ground |
| --- | --- |
| contract-conformance | route handlers vs the route table (paths, methods, param names, response shapes); service impls vs interfaces; frontend calls vs actual routes |
| data-integrity | validation gaps, missing transactions, ownership scoping on queries, seed↔schema mismatches, cascade/delete behavior |
| auth-security | unauthenticated endpoints, missing ownership checks (IDOR), secrets in code, session handling, error messages that leak |
| ux-wiring | dead buttons, routes that don't resolve, mismatched form field names, cache not invalidated after mutation, loading/error states never rendered |
| state-lifecycle | stale closures, race conditions on rapid interaction, memory leaks in subscriptions/intervals, optimistic updates that don't roll back |

## Verifier prompt (the skeptic — this framing is load-bearing)

```markdown
You are a skeptical verifier. A reviewer claims the following bug. Your DEFAULT
VERDICT IS "NOT A REAL BUG" — the burden of proof is on the finding. Read the
actual code paths involved. Confirm the bug ONLY if you can quote the exact
lines that misbehave and trace the concrete failure scenario end to end. If the
claim relies on code you cannot find, on a hypothetical the codebase prevents,
or on a misreading — reject it, and say why in one sentence.
Finding: <finding>
Verdict: CONFIRMED (with quoted code path) | REJECTED (with one-line reason)
```

Without this inversion, plausible-but-wrong findings flood the fix phase and fixers "repair" working code — historically the largest source of late breakage in multi-agent builds.

## Fixer prompt

```markdown
Fix ONLY the following confirmed bugs, all in files you now exclusively own:
<file list + confirmed findings with their quoted code paths>
Contract files remain FINAL. Make the minimal correct fix for each — no
refactors, no improvements beyond the finding. Rules from the original build
still apply (strict TS, no any, finished-product edge handling).
```

Group confirmed bugs by file and spawn one fixer per file, so fixes never collide.
