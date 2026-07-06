---
name: fix-bug
description: Executor discipline for fixing a bug as a delegated task. Enforces reproduce-first, multi-hypothesis, prove-exactly-one, root-cause (5 whys), minimal fix, and a permanent regression test before the bug is called fixed. Blocks the single most common failure: premature convergence — latching onto the first plausible cause, applying a speculative patch, and shipping a symptom fix that lets the real bug resurface. Use when you are the engineer assigned to fix a specific defect against a known symptom or failing behavior. TRIGGER on phrases like "fix this bug", "fix the failing test", "this is broken, make it work", "the endpoint returns 500", "resolve this defect", "the calc is off by one", "users see stale data", "patch this crash", "the job hangs intermittently", "root-cause and fix X", "assigned bug ticket CET-1234", "make the repro pass". SKIP when the user already proved the root cause and wants only the verbatim edit; when it is a typo/syntax/import error already pinpointed; or when there is no observed defect (greenfield feature, refactor, or design work — use the build/feature workflow instead).
---

# fix-bug — executor discipline for fixing a bug

You have been handed one bug to fix. Your job is not "make the error go away" — it is to find the causal origin, fix it at the root, and leave behind a test that proves the bug existed and can never silently return. Do that with the discipline of a specialist engineer, not the reflex of an autocomplete.

This skill exists to stop **premature convergence**: the failure where a capable model reads the symptom, forms one plausible theory, edits the first suspicious line, sees the error disappear, and declares victory — having patched a symptom while the real cause waits to resurface under a slightly different input. The gates below make that shortcut mechanically hard. They force you to reproduce before you theorize, to hold several theories at once, to prove exactly one with evidence, and to bake the reproduction into a permanent test.

You are usually a subagent reporting to an orchestrator that owns the plan and the file boundaries. Respect your file ownership, stay inside your assigned scope, and report back structured findings — never file dumps.

## The workflow (each step is a gate)

### 1. Reproduce first

Before you read implementation code beyond a quick orientation pass, produce a **failing command or test that demonstrates the bug on demand**. This is the anchor for everything after it: a bug you cannot trigger, you cannot prove fixed — you can only prove it "hasn't happened yet."

- Capture the exact command, input, seed, environment, and version that produces the symptom, and run it yourself to confirm you see the failure.
- Record the symptom as three things: **Observed** (what happens, with the verbatim error/log/output), **Expected** (what the spec/contract/test says should happen), **Delta** (the precise difference). If you cannot state the delta, you cannot prove a fix — go get clarification.

**Gate: no code reading beyond orientation until a repro exists.** Orientation means locating the entry point and the failing module — not tracing logic to guess a cause. If reproduction is genuinely impossible (a prod-only race, a load-dependent timeout, data you cannot obtain), do not skip this step — replace it: document *why* repro is impossible in one or two sentences, then **instrument** instead (add targeted logging/metrics/assertions at the suspected boundary) so the next occurrence produces the evidence a repro would have. Instrumentation-in-lieu-of-repro is the only sanctioned exception, and it must be written down.

### 2. Hypothesize — at least 2-3 distinct causes

Before you touch code, write down **at least two, preferably three, distinct hypotheses** about the root cause, each a single falsifiable claim. "Might be the cache" is not a hypothesis; "the profile cache returns a stale value because the invalidation hook is registered after the first read" is.

Force diversity — three variants of the same idea count as one. Reach across layers: code logic (off-by-one, wrong branch, missing case, aliasing); state/data (stale cache, malformed input, ordering, race, duplicate processing); config/environment (env var, flag, version skew, timezone, locale); dependency/integration (upstream schema drift, transport error, retry misbehavior); tooling/build (runtime version, bundling, source-map drift); or observation artifact (the symptom you see is a side-effect of a *different* real bug, or the test itself is wrong). If you can only produce one hypothesis, you have guessed, not investigated.

### 3. Prove exactly one

Work each hypothesis to a verdict backed by **concrete evidence**, not adjectives:

- **PROVEN** — the predicted observation actually occurs: a verbatim log line, debugger/inspector output, minimal repro result, test output, or a `file:line` trace pasted as evidence. "This looks wrong" is not evidence; paste the bytes.
- **REJECTED** — a counterexample: the supposed cause is absent yet the bug still manifests, or present yet the bug does not. A rejection is as valuable as a proof; it removes a whole branch.

For each hypothesis state a **Prediction** ("if H2 is true, doing X yields Y"), the **verification method** (read code at `file:line`, run command, inspect log, toggle the condition, bisect the input/history), the **evidence** verbatim, and the **verdict**.

**Gate: no fix until exactly one hypothesis is PROVEN and the others are REJECTED or explicitly deferred with reason.** If two survive, you have not finished — design a discriminating experiment that only one can pass. If none survive, your hypotheses were wrong; generate a fresh set. Do not edit source to "see if it helps" — that is speculative patching, the exact failure this skill prevents. (Editing a scratch/test file to *run an experiment* is fine, as long as the experiment and its result are recorded under a hypothesis.)

### 4. Root cause — drill to the causal origin

A proven immediate cause is usually a symptom of something deeper. Apply **5-whys**: keep asking why the previous answer was allowed to happen until you reach the causal origin — an architectural or process gap — rather than an intermediate link in the chain.

```
Symptom:  <observed bad behavior>
Why 1?    Because <proven immediate cause>.
Why 2?    Because <the condition that allowed it>.
Why 3?    Because <the default/assumption behind that condition>.
Why 4?    Because <the design or process gap that produced it>.
Why 5?    Because <the architectural / organizational root>.
```

Stop when the next "why" leaves what you can fix in this codebase, or when you hit a deliberate trade-off rather than a defect. Three levels is acceptable when the chain genuinely bottoms out; stopping at Why 1 because it is convenient is not — fixes at the proximate level recur, because the conditions that produced the bug are still in place. **Prefer the architecturally correct fix over a patch.** If the correct fix is out of scope for your file ownership, say so in your report rather than forcing a local workaround that entrenches the bad shape.

### 5. Fix minimally at the root

Make the smallest change that removes the proven root cause. Map each edit back to a specific clause of the proven cause: "Edit `path/to/file:42` because <root-cause clause>."

- **No drive-by refactors.** Do not reorganize, rename, reformat, or "improve while I'm here." A mixed diff hides which line fixed the bug, defeats the regression test's purpose, and expands the review surface. If you spot adjacent problems, note them as open risks (see step 8) — do not fix them in this diff.
- Keep the fix inside your assigned file ownership. If the root cause lives outside it, stop and report to the orchestrator rather than reaching across the boundary.
- Honor the house rules: strong types (no `any`, no untyped escape hatches), no stubs or TODOs left behind, and never introduce a security regression — no unauthenticated/unauthorized endpoints, no secrets in code, no files made public — even under time pressure.

### 6. Regression test — the repro becomes permanent

The reproduction from step 1 is now a **permanent, checked-in test**. It must **fail on the unpatched code and pass on the patched code** — that discrimination is what proves the test actually guards this bug and not something incidental.

- Verify the discrimination explicitly: run the test against the pre-fix code (temporarily revert, or stash the fix) and watch it fail; run it against the fixed code and watch it pass. A test that passes on the buggy code guards nothing.
- Name and place it so its intent is obvious (reference the ticket/symptom). Prefer the narrowest level that reliably reproduces — a unit test over an integration test over an e2e test — but it must genuinely exercise the bug's path.

**Gate: the bug is not "fixed" without this test.** If the reproduction was impossible and you instrumented instead, the equivalent artifact is a monitoring assertion or a test against the newly-captured evidence; state which, and why a conventional test is not possible.

### 7. Verify

- Re-run the original repro command from step 1 — the symptom must be gone.
- Run the full relevant test suite (the module's suite plus anything touching the changed path), not just your new test, to confirm you did not move the bug somewhere else.
- Run the mechanical gates the project uses: typecheck/compile in strict mode, lint, format. A fix is not done until these pass. If a gate fails, that is your feedback loop — fix it before reporting done.

## The second-iteration signal (stop and re-examine assumptions)

If you find yourself iterating on the **same** issue a second time — a fix that didn't hold, a test still red after your change, a symptom that moved rather than vanished — treat it as a hard signal that **one of your assumptions is wrong**. Do not reach for another tweak. Stop, and:

1. List every assumption the failed attempt rested on (what you believed about the data flow, the API contract, the framework's behavior, the environment).
2. Re-verify each against **source or documentation**, not memory — read the actual function, the actual config, the actual library docs. Propose a search if the answer isn't local.
3. Return to step 2/3 with the corrected assumption and re-prove.

Two rounds of guessing on the same bug is the loudest possible evidence that you converged prematurely. The cost of re-examining assumptions is always lower than the cost of a third wrong patch.

## Flaky vs. real failures

Before you trust a failure, establish whether it is deterministic. Run the repro several times.

- **Real**: fails every time under the same inputs. Proceed normally.
- **Flaky**: fails only sometimes. This is *not* a reason to dismiss it — intermittency is a symptom of a hidden variable (a race, ordering dependency, shared state, clock/timezone, network, test-isolation leak, resource limit). That hidden variable **is part of the bug**. Your first hypothesis becomes "the failure is nondeterministic because of `<variable>`," and your job is to pin the variable down (seed control, forced ordering, added logging, running in isolation vs. in-suite) until the failure becomes reproducible on demand. Only then can you prove a fix.
- Never "fix" a flaky test by adding a sleep, a retry, or a broadened assertion to make it pass — that hides the hidden variable instead of resolving it. If the flakiness is in the test harness rather than the product code, say so with evidence.

## When the bug reveals a class of bugs

Sometimes the proven root cause is an instance of a pattern that recurs elsewhere — the same unchecked null, the same missing tenant scoping, the same off-by-one across sibling call sites. **Do not silently fix the siblings, especially outside your file ownership.** Fanning your diff across files you were not assigned breaks the orchestrator's parallelism, collides with other agents, and turns a reviewable fix into a sprawling one.

Instead: fix the instance you own, and **report the class as an explicit open risk** — name the pattern, list the sibling locations you found (with `file:line`), and recommend a follow-up task. That lets the orchestrator schedule the systemic fix deliberately, with proper ownership, rather than absorbing an unreviewable surprise.

## Definition of done

Mechanical exit criteria — all must hold:

1. A reproduction exists (a failing command/test) — or a documented reason repro was impossible plus instrumentation in its place.
2. At least 2-3 distinct hypotheses were formed and worked to verdicts; exactly one is PROVEN with concrete evidence; the rest REJECTED or explicitly deferred.
3. A 5-whys chain reaches an architectural/process root cause, and the fix addresses that root (or a symptom-level fix is explicitly justified in writing).
4. The fix is minimal, inside assigned file ownership, with no drive-by refactors, strong types, no stubs/TODOs, and no security regression.
5. A permanent regression test fails before the fix and passes after — discrimination verified by running both ways.
6. The original repro is green, the relevant test suite is green, and typecheck/lint/format gates pass.

## Return format

Report back to the orchestrator a structured summary — never full file contents:

```
Bug: <one-line symptom>
Status: fixed | blocked | root-cause-outside-ownership

Reproduction: <command/test that demonstrated it> (or: impossible — instrumented at <file:line>, reason)
Root cause: <proven immediate cause> → <architectural root from 5 whys>
  Evidence: <file:line, log line, or test output that proved it — one or two refs>
Rejected hypotheses: H<n> — <one-line counterexample> (each)

Fix: <files touched with file:line refs and one-line change rationale each>
Regression test: <path> — fails before, passes after (verified)
Gates: repro green | suite <n passed> | typecheck | lint | format

Open risks:
  - <class-of-bug pattern + sibling file:line locations, recommended follow-up>
  - <anything deferred, uncertain, or outside file ownership>
```

Keep it tight. The orchestrator needs the causal story, the evidence pointers, the exact files you touched, and the risks — not the code you read or wrote.

## Anti-patterns (do not do these)

- **Speculative patch.** Editing a suspicious line before a hypothesis is proven, then checking if the error vanished. This is the failure mode this skill exists to prevent — the disappeared error often just moved.
- **Reading code before reproducing.** Tracing logic to guess a cause before you can trigger the bug wastes context on theories you cannot test. Repro first.
- **Single hypothesis.** One theory is a guess. Fewer than two distinct hypotheses means you converged before investigating.
- **Verbal evidence.** "This seems wrong / looks suspicious" proves nothing. Paste the log line, the output, the `file:line`.
- **Stopping at Why 1.** A proximate cause left in place lets the bug recur under a new input. Drill to the origin.
- **Drive-by refactor in the fix.** Mixing cleanup into the bug fix hides the causal line and bloats review. Note cleanups as risks; keep the diff surgical.
- **No regression test, or a test that passes on the buggy code.** Then you cannot prove the bug existed or that your fix discriminates — it will recur silently.
- **Papering over flakiness.** Sleeps, retries, or loosened assertions to make an intermittent failure "pass" hide the real variable. Pin the variable instead.
- **Silently fixing siblings across the codebase.** Fanning out beyond your file ownership breaks parallelism and review. Report the class; fix only what you own.
- **Third tweak on the same bug.** Iterating twice without re-examining assumptions is thrashing. Stop, re-verify assumptions against source/docs.

## Worked micro-examples

**Input:** "The `/orders` endpoint returns 500 for some users."
**Correct behavior:** Reproduce first — find or construct a user that triggers the 500 and capture the stack trace verbatim (step 1). Note "some users" = a hidden variable; that variable is part of the bug (flaky-vs-real). Form hypotheses across layers: null field on certain accounts (data), a missing migration on a shard (env), an N+1 that times out at scale (code) (step 2). Prove one with the trace — e.g. the log shows `KeyError: 'shipping_addr'` only for guest accounts; construct a guest account and reproduce deterministically; reject the others with counterexamples (step 3). 5-whys: guest accounts skip address creation → the serializer assumes the field is always present → the type was declared optional at the boundary but read as required (architectural root) (step 4). Fix minimally at the serializer/type boundary (step 5). Add a test that serializes a guest order and asserts 200, failing before the fix (step 6). Verify: repro green, orders suite green, typecheck/lint pass (step 7).

**Input:** "The retry test fails on CI but passes locally."
**Correct behavior:** Do not rerun until it passes and move on. Classify: flaky failure driven by a hidden variable — likely timing, ordering, or test isolation. Hypotheses: shared fixture leaking state between tests, a real race in the retry backoff, a CI-only clock/timezone difference. Pin the variable — run the test in isolation vs. in-suite, control the seed/clock — until the failure reproduces on demand, then prove which hypothesis holds. If it is a real product race, fix the race and add a deterministic regression test; if it is a fixture leak in the harness, report that with evidence rather than editing product code. Never add a `sleep` to make CI green.
