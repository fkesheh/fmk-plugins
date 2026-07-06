---
name: implement-feature
description: Executor discipline for implementing a feature against a frozen contract and a task spec handed down by an orchestrator. Enforces that the implementer honors the contract exactly, touches only its owned files, leaves no stubs/TODOs/dead code, handles every edge case the spec names, matches the surrounding codebase idiom, and self-gates (typecheck/lint/tests) before returning a structured summary. Blocks the classic executor failure of "improving" the interface, wandering outside its file ownership, or shipping code that compiles but ignores the behavioral spec. TRIGGER on phrases like "implement this feature against the contract", "build the module per this task spec", "you own these files, implement X", "implement the frozen contract", "code this up per spec", "fan out and implement", "executor: implement", "dev agent for this module", "write the implementation for X", "implement per the interface", "build this to the spec", "no stubs, contract is immutable". SKIP when there is no contract or spec to implement against (greenfield design or contract authoring — that is the orchestrator's job), when the task is debugging a failing behavior (use the debug skill), or when the request is a pure refactor with no new behavior to build.
---

# implement-feature — executor discipline against a frozen contract

Enforces the discipline of a senior engineer executing a well-specified task inside a larger orchestrated build: implement exactly what the contract and spec say, in the files you own, with no scope drift. This skill exists because a capable model handed an implementation task has a strong, wrong instinct to "help": it tweaks a signature it finds awkward, reaches into a neighboring file to make its life easier, drops a `TODO` where the spec was terse, or writes code that typechecks while quietly skipping the edge cases the spec spelled out.

Each of those is contract erosion. In a multi-agent build the contract is the only thing keeping parallel implementers compatible; every local "improvement" to it silently breaks an agent you cannot see. So the rule is inverted from solo coding: when the contract or your ownership blocks you, you STOP and report the conflict to the orchestrator — you do not route around it. Your leverage is faithful, complete execution, not creative reinterpretation.

## Inputs you must have before writing a line

You are an executor. You should have received, from the orchestrator:

- **The contract** — interfaces, types, function/method signatures, error shapes, config, event/DTO schemas. Frozen. Immutable to you.
- **A task spec** — one-line goal, your exclusive file list, behavioral requirements and invariants, the edge cases to handle, an import whitelist (if given), and the definition of done (the gates that must pass).

If either is missing or underspecified on a point you need, that is a spec problem — surface it (see the Escalation gate) rather than inventing the missing half. Guessing at an absent contract is how two agents build incompatible halves of the same system.

## Workflow

### 1. ORIENT — read before you write

Read the contract and the task spec in full. Then read the files you own and the *minimal* neighboring code needed to match idiom: a sibling module in the same package, the nearest existing implementation of the same interface, the project's error-handling and logging conventions, the test file if one already exists. Do not read the whole codebase — read enough to write code that looks like it belongs.

**Gate (Restate):** Before writing any implementation code, restate — in your own words, not by quoting the spec — the behavioral requirements and every edge case you are responsible for. List the inputs, the outputs, the error conditions, and each boundary case. Then diff your restatement against the spec. If your restatement and the spec disagree, or you cannot restate a requirement without a gap, you do not understand the task: **stop and report the ambiguity to the orchestrator.** Do not "guess and proceed" — a confident wrong restatement produces confident wrong code.

### 2. Honor the contract exactly (immutable)

Implement the given signatures, types, and error shapes verbatim. Return the specified types; raise the specified typed errors; accept exactly the specified parameters. Do not:

- rename a parameter, widen a return type, add an "optional" field, or change an error class "because it reads better";
- paper over a mismatch with a type cast, `any`, `as`, `# type: ignore`, `@ts-ignore`, or an unchecked coercion — a cast is a silent contract amendment;
- add a convenience overload or a second entry point the contract did not specify.

**Gate (Contract conflict → STOP):** If the contract is genuinely wrong, internally inconsistent, or makes a required behavior impossible to implement, STOP. Do not amend it locally and do not work around it. Report to the orchestrator the exact conflict: the signature/type involved, why it blocks you, and the minimal change that would unblock. The orchestrator owns contract changes and must re-freeze and re-broadcast — that is the only way the other parallel agents stay compatible. A local fix that "works for my module" is the single most damaging thing an executor can do.

### 3. Stay inside your file ownership

Touch only the files on your exclusive list. If delivering the behavior appears to require editing a shared file, a config, or a file another agent owns, that is a spec problem, not a task to quietly do. Report it: name the file, name the change needed, and let the orchestrator either widen your ownership, assign it elsewhere, or amend the contract. Two agents editing the same shared file in parallel is a guaranteed merge conflict or a lost write — the ownership boundary exists precisely to prevent it.

New files strictly *inside* your module's directory, that the spec implies you must create, are fine (create the file the interface obviously needs). New files that other modules will import are a contract surface — confirm with the orchestrator first.

### 4. No stubs, no TODOs, no dead code

Every code path either fully works or raises a typed, contract-specified error. A placeholder return (`return null`, `return []`, `pass`, `throw new Error("not implemented")` left behind) is *worse* than missing code: it passes typecheck and hides the gap so no gate catches it, and the orchestrator integrates a lie. If you cannot complete a path, do not fake it — report it as an open risk with the reason.

The same applies to dead code: no unused parameters kept "for later", no commented-out alternatives, no speculative branches for inputs the spec says cannot occur. Build exactly the behavior specified — no less (no stubs) and no more (no gold-plating unrequested features).

### 5. Edge cases from the spec are requirements

Every edge case the spec names — empty input, null/absent value, boundary quantity, concurrent access, timeout, malformed payload, permission denied — is a requirement to handle explicitly, not a suggestion. Handle each with the behavior the spec prescribes (the specified error, the specified fallback).

**Gate (Silent-case decision):** If you discover a case the spec is *silent* on, do not invent liberal behavior. Pick the conservative option — reject/raise over silently accepting, fail-closed over fail-open, preserve invariants over convenience — implement that, and record it in your return under "decisions made" so the orchestrator can ratify or correct it. A discovered edge case reported is cheap; one silently guessed wrong is a latent bug.

### 6. Match the codebase, type strictly

The idiom, naming conventions, comment density, module layout, and error-handling patterns of the surrounding code win over personal preference. Code that is locally correct but stylistically foreign creates review friction and future-maintenance cost. Mirror what the neighbors do.

Use the strongest types the language offers throughout — no `any`, no untyped dicts where a typed struct fits, no auto/inferred escape hatches at API boundaries. Strong types are the machine-checked half of the contract; weakening them defeats the point of having one. (Language asides: in TypeScript prefer `unknown` + narrowing over `any`; in Python annotate fully and avoid inline imports; in Go return explicit error values, don't panic across the boundary.)

Comments explain only what the code cannot: a non-obvious invariant, a spec constraint, a "why this and not the obvious thing" note. Do not narrate what the code plainly says. Remove any irrelevant or stale comment you touch.

### 7. TDD when the project supports it

If the project has a test setup and the task is testable, prefer test-first. Two shapes:

- The orchestrator handed you (or a test agent produced) a failing test against the contract — make it pass without editing the test to fit your implementation. If the test looks wrong versus the contract, that is a conflict to report (step 2 gate), not a test to quietly rewrite.
- No test was provided — write the failing test against the *contract and spec* (not against your intended implementation), watch it fail for the right reason, then implement until green. Test the behavioral requirements and each named edge case.

Skip TDD only when genuinely inapplicable (no test harness, pure glue with nothing to assert) and say so in your return.

### 8. Security defaults at every boundary

These are non-negotiable house rules; restate them in code:

- Any new endpoint/handler requires authentication *and* authorization — never ship an unauthenticated route. If the spec omits the auth requirement, that is a spec gap to report, not a default to skip.
- No secrets, tokens, or credentials in code or committed config — read them from the environment/secret store.
- No publicly-exposed files or buckets; validate and sanitize all input at the trust boundary before it reaches logic.

A security-relevant ambiguity is always a STOP-and-report, never a guess.

### 9. SELF-GATE before returning

Run the project's gates yourself and fix your own failures before you hand back:

1. **Typecheck / compile** in strict mode.
2. **Lint / format** to the project's config.
3. **The relevant tests** — the ones covering your module (and any contract tests the orchestrator named).

Fix failures you caused. If a gate fails for a reason outside your ownership (a shared file is broken, a contract test contradicts the contract), do not hack your code to make it pass — report it as the headline of your return.

**Gate (No silent red):** You may not return reporting success with a red gate. If a gate is still failing when you hand back, that failure is the first line of your report, with the verbatim output. Green-washing a failing build is a firing offense in this workflow — the orchestrator integrates on the assumption that your gates are honest.

## Definition of done

Mechanical exit criteria — all must hold:

- [ ] Every signature/type/error shape matches the frozen contract exactly; zero local amendments.
- [ ] Only files on the exclusive ownership list were created or modified.
- [ ] No stubs, `TODO`/`FIXME`, `not implemented` placeholders, or dead/commented-out code remain.
- [ ] Every edge case named in the spec is handled; every silent-case decision is recorded.
- [ ] No `any`/unchecked-cast/`ignore` escape hatches at boundaries; strong types throughout.
- [ ] New endpoints have authn+authz; no secrets in code.
- [ ] Typecheck (strict), lint, and the relevant tests all pass — or the failure is the headline of the return.

## Return format

You are a subagent reporting to an orchestrator whose context is scarce. Return a structured summary — never full file contents, never large diffs.

```
## <slug> — implementation summary

**Status:** done | blocked | done-with-red-gate

**What changed:** 2-4 sentences on the behavior implemented.

**Files touched:**
- path/to/file.ts:12-88 — <what, one line>
- path/to/other.ts:4-20 — <what, one line>
  (all inside owned list — flag any exception)

**Gate results:**
- typecheck: pass | FAIL <verbatim first error>
- lint: pass | FAIL <...>
- tests: 14 passed, 0 failed | FAIL <...>

**Decisions made:** silent-case / conservative choices the orchestrator should ratify.

**Open risks / questions:** contract conflicts, needed foreign-file edits, missing
auth spec, anything you could not complete and why. Empty if none.
```

If **blocked**, lead with the blocker and the specific unblock you need; do not pad with what you did manage to do.

## Anti-patterns

- **"I improved the interface."** — Renaming a param or widening a return type silently breaks every agent building against the frozen contract. Report, don't amend.
- **"I just edited the shared file too."** — A foreign-file edit outside your ownership causes lost writes and merge conflicts in parallel builds. Report the need; let the orchestrator route it.
- **Stub that typechecks.** — `return []` / `pass` / `throw "not implemented"` passes the gate and ships a hole no reviewer sees. Missing code is safer than fake code.
- **Casting past a contract mismatch.** — `as any` / `# type: ignore` to make a type error disappear is an undocumented local contract change. Fix the type or report the conflict.
- **Silently guessing a spec-silent edge case liberally.** — Accepting bad input the spec forgot to forbid is a latent bug. Choose conservative, record the decision.
- **Green-washing.** — Returning "done" with a failing gate hidden. The orchestrator integrates on trust; a red gate is the headline, not a footnote.
- **Gold-plating.** — Adding config knobs, retries, or features the spec never asked for expands surface area, review cost, and bug space. Build the spec, nothing more.
- **Dumping files back.** — Pasting full file contents or giant diffs into the return burns the orchestrator's context. Summarize with file:line refs.

## Worked micro-examples

**Input:** Spec says `getUser(id: UserId): Promise<User>`, throws `NotFoundError` when absent. While implementing you notice the DB layer can also throw on a malformed id — the spec is silent on that.
**Correct behavior:** Implement the signature verbatim. Map "absent" to `NotFoundError` as specified. For the spec-silent malformed-id case, choose the conservative behavior — validate the id at the boundary and raise the contract's `ValidationError` (or `NotFoundError` if no validation error exists) rather than letting a raw DB exception leak through the typed boundary. Record under "decisions made": *"Spec silent on malformed id; validate at entry and raise ValidationError — please ratify."* Do not add a `getUserOrNull` convenience overload, and do not change the return type to `User | null`.

**Input:** The contract's `PaymentResult` type is missing a field you believe you need to report a partial refund.
**Correct behavior:** STOP. Do not add the field locally, do not stuff it into an existing field, do not cast. Return **blocked** with: the exact type, the missing field and its type, why the behavior is impossible without it, and the minimal proposed change. Wait for the orchestrator to amend and re-freeze the contract — because another agent consuming `PaymentResult` must see the same shape.
