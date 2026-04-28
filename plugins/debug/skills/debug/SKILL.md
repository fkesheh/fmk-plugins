---
name: debug
description: Proof-based bug investigation. Forces explicit hypothesis formation, empirical verification with concrete evidence, 5 Whys root cause chain, falsification check, and a written investigation log at docs/investigations/ BEFORE any code change. Blocks speculative fixes — every hypothesis must be either PROVEN (with log lines, reproductions, file:line references, command output, or test output) or REJECTED (with a counterexample). Requires at least 3 hypotheses, at least 1 rejected, and a regression test before declaring the bug fixed. TRIGGER on phrases like "debug X", "why is X failing", "investigate this bug", "find the root cause of", "fix this error", "fix this bug", "X is broken", "X isn't working", "troubleshoot X", "what's wrong with X", "this is a bug", "regression in X", "/debug". SKIP only when the user has already proven the root cause themselves and is asking for the fix verbatim, or when the defect is a typo / syntax error the user has already pinpointed.
---

# debug — proof-based bug investigation

Forces a rigorous, evidence-driven workflow on every bug investigation. No speculative fixes. No "try this and see if it works." Every hypothesis is either PROVEN with concrete evidence or REJECTED with a counterexample, recorded in a dated investigation log at `docs/investigations/`, BEFORE any code edit to the suspected buggy source.

This skill exists because the most common debugging failure is premature convergence: latch onto the first plausible cause, edit, and ship — leaving the real root cause to resurface later. Proof-based investigation makes that failure mode mechanically harder.

## Output location

```
docs/investigations/YYYY-MM-DD-<kebab-slug>.md
```

Filename: ISO date plus a kebab-case slug derived from the symptom, e.g. `2026-04-28-login-redirects-to-blank-page.md`. The file is the audit trail. It MUST exist and be filled to the gate criteria (see below) before the first `Edit`/`Write` to suspected source code.

## Investigation log frontmatter (authoritative)

```yaml
---
type: investigation
symptom: "One-line description of the observed bad behavior"
slug: kebab-case-slug
date: <ISO 8601 timestamp with timezone>
investigator: <git config user.name>
git_commit: <HEAD SHA at investigation start>
branch: <current branch>
repository: <owner/repo>
status: investigating | root-cause-proven | resolved
hypotheses_formed: <int>
hypotheses_rejected: <int>
hypotheses_proven: <int>
related:
  - docs/investigations/<other>.md
  - docs/research/<related-research>.md
---
```

Required: `type`, `symptom`, `slug`, `date`, `git_commit`, `branch`, `status`. The hypothesis counters are kept current as the investigation progresses.

## The Hard Gate

You may NOT call `Edit`, `Write`, `NotebookEdit`, or any code-mutating tool against the suspected buggy source until the investigation log shows ALL of the following:

1. The symptom is stated and a deterministic reproduction recipe is recorded.
2. At least 3 hypotheses are formed, spanning at least 2 different layers (see step 3).
3. At least 1 hypothesis is REJECTED with a counterexample.
4. Exactly 1 hypothesis is PROVEN with concrete evidence (verbatim log lines, command output, file:line excerpts, or test output).
5. A 5 Whys chain is documented for the proven hypothesis, terminating at an architectural or process root cause.
6. A falsification attempt against the proven hypothesis is recorded — and the hypothesis survived it.

If any of these is missing, do not edit code. Do more investigation.

This gate applies even when the bug "looks obvious." Most "obvious" bugs hide a deeper cause that gets buried by a quick patch. Editing a draft, scratch, or test file in service of running an experiment is allowed, but the experiment and its diff must be recorded under the relevant hypothesis.

## Workflow

### 1. State the symptom verbatim

Quote the user's report or paste the error/log byte-for-byte. No paraphrasing. No diagnosis. Distinguish three things:

- **Observed**: what actually happens (with reference to a log line, screenshot, stack trace, or test output).
- **Expected**: what the user, spec, contract, or test asserts should happen.
- **Delta**: the precise difference between Observed and Expected.

If you cannot articulate the delta, you cannot prove a fix. Stop and ask the user for clarification before continuing. A vague symptom guarantees a vague conclusion.

Write this into the log under `## Symptom`.

### 2. Reproduce

A bug you cannot reproduce on demand cannot be proven fixed; you can only prove it has not occurred *yet*. Spend disproportionate effort here.

- Document the exact steps, environment, inputs, seeds, time/locale, and version pins that produce the symptom.
- Confirm the recipe works by running it and observing the symptom yourself.
- If you cannot reproduce, treat reproduction as the investigation's first sub-problem. The first hypothesis becomes "the repro recipe is incomplete because of <missing variable>" and the subsequent verification narrows the variable down (more logs, smaller input, git bisect, data bisect).
- Record the recipe in the log under `## Reproduction`, including the verification that it triggers the symptom on demand.

A bug that "happens sometimes" is a symptom of a hidden variable; that variable is part of the bug.

### 3. Form at least 3 hypotheses across at least 2 layers

Brainstorm broadly. Do not converge early. Force diversity by considering each layer below and pushing yourself to generate at least one hypothesis from a layer that does not feel "obvious":

- **Code logic** — off-by-one, wrong branch, missing case, incorrect operator, mutation through aliasing.
- **State / data** — stale cache, malformed input, race condition, ordering, idempotency violation, duplicate processing.
- **Configuration / environment** — env var, feature flag, version skew, time zone, locale, machine clock drift, file system case sensitivity.
- **Dependency / integration** — downstream API change, schema drift, transport error, retry/backoff misbehavior, SDK version mismatch.
- **Tooling / build** — compiler/runtime version, transpilation, bundling, minifier, source map drift, hot-reload artifact.
- **Test / observation artifact** — the bug is real, but the symptom you see is a downstream side-effect of a different real bug; or the test itself is wrong.

Premature convergence — picking one hypothesis and rationalizing — is the most common failure mode. If you only have one hypothesis, you have not investigated; you have guessed. If two hypotheses are minor variants of the same idea, count them as one.

Write each hypothesis as a single, falsifiable claim. "Could be the cache" is not a hypothesis. "The user-profile cache returns a stale value because the invalidation hook is registered after the first read" is a hypothesis.

### 4. For each hypothesis: Prediction → Verification → Evidence → Verdict

Use this exact structure per hypothesis in the log:

```markdown
#### H<n>: <one-sentence falsifiable claim>

- **Layer**: <code-logic | state-data | config-env | dependency | tooling-build | observation>
- **Prediction**: If H<n> is true, we should observe <Y> when we <do X>.
  Conversely, if H<n> is false, <Y> will not appear (or <Z> will appear instead).
- **Verification method**: <read code at file:line | run command | inspect log | write minimal repro | git bisect | binary-search input | strace/profile | toggle the suspected condition>
- **Evidence**:
  ```
  <exact log lines, command output, file:line excerpt, or test output —
   pasted verbatim, not paraphrased>
  ```
- **Verdict**: PROVEN | REJECTED | INCONCLUSIVE
- **Rationale**: <one or two sentences explaining how the evidence forces this verdict>
```

Rules:

- **PROVEN** requires the predicted observation to actually occur AND the falsification step (step 6) to fail to break it.
- **REJECTED** requires either evidence that the predicted observation does not occur, or a direct counterexample (the supposed cause is absent yet the bug still manifests; or the supposed cause is present yet the bug does not manifest).
- **INCONCLUSIVE** is allowed mid-investigation but cannot remain at the end. Either gather more evidence to flip it to PROVEN/REJECTED, or replace the hypothesis with a better-formed one.

Verbal claims like "I think this is it", "this looks suspicious", or "the code seems wrong here" are not evidence. Paste the bytes. If the bytes are not available, the verdict is INCONCLUSIVE.

If a hypothesis turns out to require more sub-investigation (e.g., "to verify H2 I need to know whether the cache key includes tenant_id"), you may spawn child hypotheses H2.1, H2.2, etc. Resolve children before declaring the parent.

### 5. Apply the 5 Whys to the surviving hypothesis

Once exactly one hypothesis is PROVEN at the immediate-cause level, drill upward to find the root cause:

```
Symptom:    <observed bad behavior>
Why 1?      Because <immediate cause / proven hypothesis>.
Why 2?      Because <the layer or condition that allowed the immediate cause>.
Why 3?      Because <the policy, default, or assumption behind that layer>.
Why 4?      Because <the design or process gap that produced that policy>.
Why 5?      Because <the architectural or organizational root cause>.
```

Stop when:

- The next "why" leaves the scope of what you can fix in this codebase or this team's process; OR
- You reach a bedrock architectural or organizational cause where the answer is a deliberate trade-off rather than a defect.

If you stop at Why 1 or Why 2 you have a proximate cause, not a root cause. Fixes at that level tend to recur because the conditions that allowed the bug are still in place. Drilling does not always yield five levels — three is acceptable when the chain truly bottoms out — but stopping early because it is convenient is not.

Write the chain into the log under `## 5 Whys`.

### 6. Counter-hypothesis check (falsification)

Before declaring root cause, actively try to break your own conclusion. This is the Popper move: a hypothesis you have only tried to confirm is a hypothesis you do not understand.

Pick at least one of the following:

- **Absence test**: construct or find a scenario where the proven cause is absent. Does the bug still occur? If yes, your "cause" is at best partial.
- **Isolation test**: construct or find a scenario where the proven cause is present but isolated from the rest of the system. Does the bug still occur? If no, you may have correlation rather than causation.
- **Counterfactual edit**: revert the suspected cause in a scratch branch or sandbox. Does the symptom go away? If no, you have not found the cause.
- **Adjacent-cause search**: list at least one alternative cause that would also produce the same symptom and explain (with evidence) why your hypothesis explains the evidence better than the alternative.

If any check contradicts your conclusion, demote it to INCONCLUSIVE and keep investigating.

Document the falsification attempt and its result in the log under `## Falsification`.

### 7. Declare the proven root cause

Write a `## Root Cause` section that contains:

- The proven immediate cause with explicit evidence references (file:line, log line, command output).
- The 5 Whys chain ending at the architectural/process root.
- Why each rejected hypothesis was rejected (one line each, citing the counterexample).
- The falsification check performed and the reason the conclusion survived it.

Update the frontmatter: `status: root-cause-proven`. Update `hypotheses_*` counters.

Only at this point is the gate satisfied.

### 8. Propose and apply the fix

Now you may write code. The fix proposal must:

- Address the **root cause** (the final line of the 5 Whys), not only the immediate symptom — UNLESS you explicitly justify a symptom-level patch in writing (e.g., "root cause is in a vendor library outside our control; we are mitigating at our boundary because <reason>; a follow-up issue is filed").
- Map each change back to a specific clause of the proven cause: "Edit `path/to/file.ts:42` because <root-cause clause>".
- Include a **regression test** that fails on the unpatched code and passes on the patched code. The test is the durable proof that the bug existed and that the fix discriminates. A fix without a regression test is a fix you cannot prove and cannot keep — the bug will recur silently.

After applying the fix:

- Re-run the reproduction recipe from step 2. The symptom must be gone.
- Run the regression test on the unpatched code (e.g., temporarily revert) and on the patched code. It must fail in the first case and pass in the second.
- Run the full local test suite (or the relevant subset) to verify no regressions elsewhere.
- Update the frontmatter: `status: resolved`.
- Append a `## Resolution` section: diff summary, regression test path, verification results, and any follow-up tickets filed for deeper architectural fixes.

## Investigation log body template

```markdown
# <Symptom one-liner>

## Symptom
- **Observed**: ...
- **Expected**: ...
- **Delta**: ...

## Reproduction
1. <step>
2. <step>
   ```
   <exact command, input, or trigger>
   ```
   Verified: <date/time> — symptom reproduced.

## Hypotheses

#### H1: <falsifiable claim>
- Layer: ...
- Prediction: ...
- Verification method: ...
- Evidence:
  ```
  <verbatim>
  ```
- Verdict: ...
- Rationale: ...

#### H2: ...

#### H3: ...

## 5 Whys
Symptom:  ...
Why 1?    ...
Why 2?    ...
Why 3?    ...
Why 4?    ...
Why 5?    ...

## Falsification
- Check performed: <absence | isolation | counterfactual | adjacent-cause>
- Result: <what happened, with evidence>
- Conclusion: hypothesis survived / hypothesis broken (demoted)

## Root Cause
- Immediate cause: ... (evidence: `path:line`, log line)
- Architectural root: ... (from 5 Whys)
- Rejected H<n>: <one-line reason per rejected hypothesis>

## Fix
- File `path:line` — change description, traced to root-cause clause.
- Regression test: `path/to/test.ext` — fails before, passes after.
- Justification (if symptom-level only): ...

## Resolution
- Diff summary: ...
- Verification: reproduction no longer triggers; regression test passes; full suite green.
- Follow-up: <ticket / doc reference for deeper architectural follow-ups, if any>
```

## Discipline (forbidden patterns)

The following behaviors disqualify an investigation. If you catch yourself doing any of these, stop and restart the relevant step.

- **Speculative editing.** Modifying source "to see if it fixes it" without a recorded hypothesis and evidence. Acceptable form: a documented experiment recorded under a hypothesis, with the diff captured in the log.
- **Single-hypothesis investigation.** If the log has fewer than 3 hypotheses, the investigation has not happened; only a guess.
- **Same-layer hypotheses only.** Three hypotheses that are all "maybe the cache, maybe the cache differently, maybe the cache another way" do not satisfy step 3. Force diversity across layers.
- **Skipping reproduction.** "I think I know what it is" before reliable repro = guess. Repro first.
- **Verbal evidence.** "It looks like this is the issue", "this seems suspicious" — not evidence. Paste log lines, command output, or file:line excerpts.
- **Stopping at Why 1.** A proximate cause is not a root cause. Drill until the chain bottoms out at architecture or process.
- **Skipping falsification.** Confirmation bias guarantees false positives. Always try to break your conclusion before committing to a fix.
- **Symptom patches without justification.** Fixing the visible symptom while leaving the root cause is allowed only with an explicit, written justification (vendor code, scope, blast radius, time-pressure rollback). Otherwise, fix the root cause.
- **No regression test.** A fix without a discriminating test is unprovable and unmaintainable.
- **Editing code before the gate.** No source edits to the suspected buggy code before the investigation log shows all six gate criteria satisfied.
- **Investigation log written after the fact.** The log is the working artifact during investigation, not a post-hoc justification document. If you find yourself writing it after the diff, you skipped the method.

## When to skip this skill

- The user has explicitly stated the root cause and is asking for the fix verbatim. (Even then, if the stated cause turns out to be wrong on first read, switch to this skill.)
- The defect is a typo, syntax error, or import the user has already pinpointed in their message.
- Greenfield work, feature requests, or refactors with no observed defect.
- The user explicitly opts out in writing — for example, accepts a quick patch under time pressure with a documented follow-up ticket.

In all other cases, follow the workflow.
