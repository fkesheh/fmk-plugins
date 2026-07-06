---
name: refactor
description: Executor discipline for behavior-preserving refactoring. Forces a written invariant list, a verified test safety net BEFORE any edit, small green steps that keep the build and tests passing after every commit-sized move, and strict no-scope-creep — behavior changes and bug fixes found mid-refactor are reported as findings, not smuggled in. Prevents "refactor" from becoming a euphemism for a risky rewrite where behavior drifts, scope bleeds into neighboring code, and the module sits red for hours. TRIGGER on phrases like "refactor this", "clean up this module", "extract a function/class/service", "rename X across the codebase", "restructure this code", "split this file", "decouple X from Y", "tidy up without changing behavior", "improve the structure of X", "make this more readable/maintainable", "move this logic into", "deduplicate this code". SKIP when the change intentionally alters public interfaces or observable behavior (that is a contract change to escalate, not a refactor), when the task is a greenfield feature with no existing code to preserve, or when the user is debugging a defect (use the debug skill — a refactor must never be the vehicle for a fix).
---

# refactor — behavior-preserving change under a safety net

Enforces the discipline of a senior engineer doing a refactor: the observable behavior of the code is a fixed point, and every move is proven to preserve it. Before touching anything you write down precisely what "behavior-preserving" means here, you confirm a test safety net exists and is green, and you sequence the work as small commit-sized steps that leave the build and tests green after each one.

This skill exists because "refactor" is the most abused word in engineering. In the hands of a capable but undisciplined model it becomes a euphemism for three failures: **behavior changes smuggled in** ("I improved the null handling while I was there"), **scope creep** into neighboring code that was never in the mandate, and **long red periods** where a working module is torn open and nothing compiles for an hour while a big-bang rewrite is assembled. Real refactoring is the opposite — a sequence of small, reversible, behavior-preserving transformations, each independently verified. This skill makes that the only path.

Refactoring is not: fixing bugs, adding features, changing APIs, or "modernizing" by rewriting. If behavior should change, that is a different task with a different contract. Keep them separate — mixing them means neither the refactor nor the change can be reviewed or reverted cleanly.

## The Hard Gate

You may NOT make the first structural edit until BOTH of the following exist in writing:

1. **The invariant list** (step 1) — the explicit, itemized statement of what behavior is being preserved.
2. **A green safety net** (step 2) — tests that cover the behavior you are about to refactor, confirmed passing on the current code. If that coverage is missing, you write characterization tests that pin current behavior and get them green FIRST.

Writing the invariant list and the characterization tests is allowed (and required) before the gate. Restructuring the production code under refactor is not, until the gate is satisfied. A refactor without a safety net is not a refactor; it is an unverified rewrite wearing the word as a disguise.

## Workflow

### 1. Define the invariant — what "behavior-preserving" means here

Before reading deep into the code to plan moves, write down the contract you are promising not to break. This is not boilerplate; it is the acceptance criterion for the whole task. Be specific to THIS code:

- **Observable outputs** — for the same inputs, the same return values / rendered output / written records. Note the input domain that matters (edge cases, empty, null, boundary, error inputs).
- **API / interface shape** — public function signatures, exported symbols, HTTP responses (status, body, headers), CLI flags, event payloads. If the refactor would change any of these, STOP — that is a contract change, not a refactor (see "When this is not a refactor").
- **Side effects and their ordering** — DB writes, file I/O, network calls, message emits, cache mutations. Ordering matters: `save(); notify()` is not the same as `notify(); save()`. List the side effects and the order guarantees callers depend on.
- **Error behavior** — which errors are thrown/returned, their types, messages if asserted on, and status codes. Swallowing or re-typing an error is a behavior change.
- **Performance envelope** — the complexity class and any latency/throughput budget the code lives under. A refactor must not turn an O(n) pass into O(n²), or add a round-trip inside a hot loop. For a *performance* refactor, the envelope IS the target — see the performance note below.
- **Observability contracts** — log lines, metrics, traces, and audit events that something downstream consumes (dashboards, alerts, log-scrapers, compliance). If a log line is part of a contract, preserve it; if unsure whether it is consumed, list it as a risk rather than silently changing it.
- **Concurrency and idempotency** — thread-safety, re-entrancy, and idempotency guarantees callers rely on.

**Gate: the invariant list is written first.** Record it as a checklist — each item becomes something you will prove held (step 5, return format). If you cannot articulate an invariant, you do not understand the code well enough to refactor it safely; read more (or spawn a reader agent) until you can.

### 2. Establish the test safety net

A behavior-preserving change is only meaningful if "behavior" is pinned by something executable. Tests are the net; without them, "it still works" is an opinion.

- **Verify coverage exists and is green.** Identify the tests that exercise the behavior in your invariant list. Run them. They must pass on the *current, unmodified* code — that green run is your baseline. A test suite you have not run is not a safety net.
- **If coverage is missing or thin, write characterization tests first.** These pin *current* behavior — even if that behavior is ugly, surprising, or arguably wrong. The point of a characterization test is to detect *change*, not to assert *correctness*. Capture what the code does today: feed representative and edge inputs, record the actual outputs/side effects, and lock them in. Pin it, then refactor, and — only if explicitly asked, as a separate task — change it.
- If you discover current behavior looks like a bug while writing characterization tests, pin the buggy behavior anyway and record it as a finding (step 4). Do not "fix" it inside the refactor; a fix changes behavior, which is exactly what this task forbids.
- Prefer characterization at the highest stable seam available (public API, module boundary) rather than pinning internal details you are about to move — you want tests that survive the restructuring, not tests you must rewrite at every step.

House rules apply to the tests you write: strong types, no stubs or TODOs, and use the project's real test framework and fixtures. Where the project uses a factory/fixture convention, use it.

### 3. Small green steps — never a big-bang rewrite

Sequence the refactor as a series of commit-sized transformations, each of which leaves the build compiling and the full relevant test suite green. This is the core of the method. A working module must never be red for more than one small, reversible step.

Favor the classic transformation vocabulary, each applied in isolation:

- **Rename** — symbol, file, or module. Mechanical, high-safety; do it as its own step so the diff is reviewable as "pure rename".
- **Extract** — pull a cohesive block into a named function / method / class / module. The extracted unit's behavior must be identical; the call site now delegates.
- **Inline** — the inverse, when an indirection earns nothing.
- **Move** — relocate a function/type/constant to where it belongs, updating imports.
- **Introduce / replace** — introduce a parameter object, replace a conditional with polymorphism, etc. — one pattern at a time.

Rules for stepping:

- **One kind of change per step.** Do not rename AND move AND extract in a single commit — if the tests break you cannot localize the cause, and the reviewer cannot verify the diff is behavior-preserving. Pure-rename diffs and pure-move diffs are trivially reviewable; mixed diffs are not.
- **Green after every step.** Compile + run the relevant tests after each transformation. If a step leaves red, revert it and re-slice smaller. Red-in-the-middle is only acceptable transiently within a single step you are actively completing, never across a stopping point.
- **If a step cannot stay green, use parallel-change (expand → migrate → contract).** When you cannot swap old for new atomically without a red window — e.g. changing a widely-used internal helper's shape — add the new implementation *alongside* the old, migrate callers to it incrementally (each migration a green step), then remove the old one once no caller remains. This keeps the tree green throughout what would otherwise be a big-bang cutover. Prove "no caller remains" before deleting (grep/usage search), do not assume.
- **Commit-sized means revertible.** Each step should be small enough that reverting it is a clean, obvious operation. If you cannot describe a step in one line ("rename `X` to `Y`", "extract `parseHeader` from `handle`"), it is too big.

### 4. No scope creep — findings, not fixes

Mid-refactor you will find things: a latent bug, a missing edge case, a poorly-named neighbor, an obvious optimization, dead-looking code two functions over. The disciplined response to almost all of these is **report, do not do**.

- **Behavior changes are out of scope, always.** A bug fix changes behavior — it belongs in a separate task (and, if it is a real defect, the `debug` skill). Record it as a finding with enough detail to action later (file:line, what is wrong, suggested fix), and move on.
- **Neighboring code you were not asked to touch is out of scope.** "While I'm here" is how a 20-line refactor becomes an unreviewable 800-line diff. Stay inside your mandate and your owned files.
- **The one house-rules exception:** trivially small, obviously-correct pre-existing issues *inside files you already own for this refactor* may be fixed (a broken import, an unused variable, a typo in a comment). When you do, list each such fix **separately** in the return under "Incidental fixes", so a reviewer can see exactly what was behavior-neutral cleanup versus refactor. Anything non-trivial, anything that changes behavior, or anything in a file outside your ownership → finding, not fix.

The test: "Does this change alter observable behavior, or does it live outside the files I own?" If yes to either, it is a finding. When in doubt, it is a finding.

### 5. Mechanical verification after every step and at the end

Trust the machine, not your reading. After each step, and again at the end of the whole refactor:

- **Typecheck / compile in strict mode.** No new type errors, no loosened types, no `any`/`interface{}`/`Object` introduced to make a move "work". Strong types are a house rule; a refactor must not erode them.
- **Lint.** No new lint violations. Fix formatting as its own concern, not woven into logic diffs.
- **Full relevant test suite green** — the safety net from step 2 plus any broader suite that could catch a regression from your changes. Same tests, same assertions as the baseline; you did not edit tests to make them pass (editing a test to accommodate a "refactor" is the loudest possible signal that behavior changed).
- **Self-review your own diff for accidental semantic edits.** Read the diff — not the file — hunting specifically for the silent behavior changes that hide inside a restructuring: a changed default value, a dropped or inverted condition, `<=` became `<`, a reordered pair of side effects, a swallowed exception, a removed `await`, an early-return deleted, a mutation that used to be a copy. These are exactly what the tests might miss and what the word "refactor" is used to excuse. Every hunk should be justifiable as "same behavior, different shape".

If any check fails, the step is not done. Fix or revert before proceeding — never accumulate red.

### 6. Leave it better (within your owned files)

A refactor is licensed to improve the *structure* of the code it touches, as long as behavior is preserved:

- **Remove dead code you can prove is dead.** Before deleting, produce usage-proof: a repository-wide search showing no references (accounting for dynamic dispatch, reflection, string-keyed lookups, and public exports that external callers might use). Dead code deleted without usage-proof is a bug waiting to happen — treat "I think this is unused" as a finding, not a deletion.
- **Delete irrelevant, stale, or misleading comments** in the code you are restructuring. Keep only comments that explain *why*.
- **Make naming consistent** with the surrounding, agreed conventions — but a rename is a step (step 3), verified like any other, not a careless find-replace.

"Leave it better" is bounded by every other rule here: better structure, same behavior, inside your files, each improvement a verified step.

## When this is NOT a refactor (escalate instead)

- **Changing a public interface** — a signature, an exported type, an HTTP contract, an event schema, a CLI surface — is a *contract change*, not a refactor. Callers you do not own are affected. Stop and escalate to the orchestrator/user: describe the desired change and its blast radius; let the contract be re-frozen deliberately. Do not quietly change an interface and call it cleanup.
- **A performance refactor needs measurement, not intuition.** If the goal is speed/memory, the invariant list still holds (same outputs, same behavior) and additionally you must **measure before and after** with a real benchmark or profile on representative input. Record baseline numbers before the first change and post-change numbers at the end; an unmeasured "this should be faster" is not a result and may well be a regression. Guessing at performance is how refactors make things slower while feeling productive.
- **A defect to fix** → the `debug` skill. A refactor must never be the delivery vehicle for a behavior fix.

## Definition of done

- The invariant list exists, and each item is checked off with evidence that it held (test coverage, diff review, or measurement).
- The test safety net is green on the final code, using the same tests/assertions as the pre-refactor baseline (characterization tests added where coverage was missing).
- Typecheck (strict) and lint pass with no new violations and no loosened types.
- The refactor landed as a sequence of small, individually-green, commit-sized steps — no big-bang cutover, no sustained red period.
- Observable behavior is unchanged: no public interface altered, no side-effect ordering changed, no error behavior changed (or, if the task was a performance refactor, before/after measurements are recorded and the behavior invariants still hold).
- Scope was held: behavior changes and out-of-file issues are reported as findings, not done. Any incidental in-file fixes are listed separately.
- Dead code removed only with usage-proof.

## Return format

You are typically a subagent reporting to an orchestrator. Return a structured summary, never full file contents.

```markdown
## Refactor summary
<2-3 sentences: what was restructured and the shape of the change>

## Invariants preserved
- [x] <invariant> — evidence it held (test name / diff review note / measurement)
- [x] <invariant> — ...
(one line per item from the step-1 list)

## Steps taken (each green)
1. <rename/extract/move/inline …> — files touched — result: build+tests green
2. ...

## Files touched
- `path/to/file.ext:LINE-LINE` — <what changed, structurally>

## Gate results
- Typecheck (strict): pass/fail
- Lint: pass/fail
- Tests: <N passed> — baseline <N passed> (same assertions)
- Characterization tests added: <paths, or "none needed">
- Perf (if applicable): before <metric> → after <metric>

## Findings (reported, NOT done)
- <file:line> — <behavior bug / missing edge case / out-of-scope improvement> — suggested action

## Incidental fixes (in-file, behavior-neutral, house-rules exception)
- <file:line> — <trivial pre-existing issue fixed>

## Open risks / questions
- <observability contract you were unsure was consumed; interface change that needs escalation; etc.>
```

## Anti-patterns (hard NO)

- **Refactor as a euphemism for rewrite.** Tearing a working module open and reassembling it big-bang. If it is red for an hour, it is not a refactor. Small green steps only.
- **Behavior changes smuggled in.** "I also fixed the null case / improved the error message / changed the default while I was there." That is a different task; it is a finding, not a move.
- **Editing tests to make them pass.** The safety net is fixed. If a test needs changing to accommodate your "refactor", behavior changed — stop and reassess.
- **No safety net.** Restructuring code with no tests covering the behavior. Write characterization tests first; do not refactor blind.
- **Scope creep into neighboring code.** "While I'm here" on files or functions outside your mandate. Stay in your owned files; report the rest.
- **Loosening types to make a move compile.** Introducing `any`/`unknown`/`interface{}`/casts to route around a type the restructuring exposed. Strong types are preserved through a refactor, not sacrificed to it.
- **Deleting "dead" code without usage-proof.** Reflection, dynamic dispatch, string-keyed lookups, and public exports make code that *looks* dead very much alive. Prove it, or file it as a finding.
- **Silent interface change.** Altering a signature/response/event shape and calling it cleanup. That is a contract change — escalate it.
- **Performance refactor by intuition.** Restructuring "for speed" with no before/after measurement. Unmeasured perf work is as likely a regression as an improvement.
- **Combining transformations in one step.** Rename + move + extract in one commit — unlocalizable when tests break, unreviewable as behavior-preserving. One kind of change per step.

## Worked micro-examples

**Input:** "Refactor `OrderService.process()` — it's a 200-line method, break it up."

Correct behavior: (1) Write the invariant list — `process()`'s return value for each order status, the exact sequence of side effects (`chargePayment` → `persistOrder` → `emitOrderPlaced` → `sendReceipt`), the errors it throws per failure mode, and the two `audit.log` lines a compliance dashboard consumes. (2) Find and run the existing `OrderService` tests — green baseline; note the receipt-email path is uncovered, write a characterization test pinning current behavior (including that it currently sends the receipt even when persistence emits a warning — looks wrong, pin it anyway, record as finding). (3) Extract in green steps: `validateOrder()` (commit, green), `chargePayment()` (commit, green), `buildReceipt()` (commit, green) — each a pure extraction, side-effect order preserved. (4) The "receipt sent despite persistence warning" smell → finding, not fixed. (5) Typecheck/lint/tests green after each step; diff-review confirms the four side effects still fire in the same order. (6) Delete two stale `// TODO: refactor this` comments in the method. Return the structured summary.

**Input:** "Clean up this parser and make it faster while you're at it."

Correct behavior: split the ask. The "clean up" is a behavior-preserving refactor (invariant list, safety net, small steps). "Make it faster" is a performance refactor: record a baseline benchmark on representative input *before* touching anything, keep the same behavior invariants, and report before/after numbers. If any structural change would alter parse output for some input, that is out of scope — finding, not done. If speeding it up requires changing the public parse API, stop and escalate — that is a contract change, not a refactor.
