---
name: decompose-task
description: Executor discipline for splitting a feature or change into parallelizable tasks for multiple agents. Enforces disjoint file ownership (a verified zero-intersection ownership table), explicit dependency edges between every pair of tasks, an independently-completable bar (each task finishable and gate-passable with only its contract, spec, and file list), right-sizing into vertical slices, per-task specs in the standard template, a contract frozen FIRST when tasks share an interface, and an explicit integration task at the end. Prevents the two agents editing the same file / task B silently needing task A's output failure that causes collisions, merge conflicts, and integration failure. TRIGGER on phrases like "decompose this task", "break this into parallel tasks", "split this feature for multiple agents", "how do I fan this out", "plan the parallel work", "divide this across agents", "who owns which files", "make a task breakdown", "parallelize this change", "carve this into tasks", "assign work to subagents", "/decompose". SKIP when the change is a single-file edit with no fan-out, when the user wants sequential step-by-step instructions rather than parallel ownership (that is planning, not decomposition), or when they have already produced a task breakdown and only want one task executed.
---

# decompose-task — parallel decomposition with disjoint ownership

Forces a change to be split into tasks that can run concurrently WITHOUT collision. Every task gets an exclusive, verified-disjoint file list; every pair of tasks has an explicit dependency verdict; every task is finishable by an agent holding only the contract, its spec, and its files. No task is emitted until the ownership table has zero intersection and the dependency graph is acyclic.

This skill exists because the most common fan-out failure is invisible coupling: two tasks are handed overlapping files, or task B is quietly written assuming task A's output already exists. Both are silent at planning time and explode at integration — merge conflicts, half-built interfaces, "works only when everything lands at once." Capable models decompose optimistically ("these feel independent") and skip the mechanical check that proves it. This skill replaces the feeling with a table.

## The core failure this prevents

Two concrete disasters, both preventable mechanically:

- **Ownership collision.** Task A and Task B both list `src/api/routes.ts`. Two agents edit it in parallel; one overwrites the other, or the merge conflicts and a human untangles it. Root cause: no one built the union-of-files table and checked for intersection.
- **Hidden dependency.** Task B's spec says "call the new `PaymentGateway` client" but that client is Task A's deliverable and does not exist yet. Task B's agent either stubs it (violating no-stubs) or blocks. Root cause: the shared interface was never extracted into a frozen contract and handed to both.

Everything below is machinery to make these two failures impossible to reach by accident.

## Workflow

### 1. UNDERSTAND before splitting

Decomposition without a codebase map is guessing. Before you draw a single task boundary, you must know: which modules the change touches, what the seams between them are (function signatures, module boundaries, API/DB/queue edges), and which files are shared infrastructure (config, DI wiring, route tables, schema, type barrels).

- If the codebase is known to you, write the map from knowledge.
- If it is unknown or large, **delegate a reader/researcher agent** (SMALL or MEDIUM tier) to return: the affected files, the public seams between them, and the shared/wiring files. Consume its summary, not the files themselves — protect your context.
- Prefer semantic search (`semble search "<what it does>"`) over grep to locate the seams.

Output a short `## Module map`: modules touched, seams between them, shared files flagged.

**GATE 1 — map exists.** You may not draw task boundaries until the module map lists the affected modules, their seams, and the shared/wiring files. A boundary drawn over an unmapped seam is a guess and will surface as a hidden dependency later.

### 2. Draft the task slices

Cut the work into candidate tasks. Bias hard toward **vertical slices** — a thin end-to-end path (data → logic → surface) that can be smoke-tested on its own — over **horizontal layers** (all the models, then all the services, then all the controllers) which only work once every layer lands and give you nothing testable until the end.

For each candidate task, name: its one-line goal, the concern it owns, and the files it will touch. Keep this rough; the next steps harden it.

### 3. DISJOINT FILE OWNERSHIP — build the table and verify

Every task lists its **exclusive** files as exact paths. Avoid globs; a glob hides which files actually intersect. If you must scope a directory, enumerate the files you expect to touch and mark the directory "owned for new files only."

Build the full ownership table — one row per file, one column per task — and check that **no file is owned by two tasks**.

```
file                          | T1 | T2 | T3 | owner
------------------------------|----|----|----|--------------------
src/payments/gateway.ts       | ✔  |    |    | T1
src/payments/gateway.test.ts  | ✔  |    |    | T1
src/orders/checkout.ts        |    | ✔  |    | T2
src/orders/checkout.test.ts   |    | ✔  |    | T2
src/webhooks/handler.ts       |    |    | ✔  | T3
------------------------------|----|----|----|--------------------
src/contract/payments.d.ts    |    |    |    | ORCHESTRATOR (frozen)
src/app/wiring.ts             |    |    |    | INTEGRATOR
src/config/index.ts           |    |    |    | ORCHESTRATOR
```

- **Shared files are never owned by a task.** Contracts (types/interfaces/signatures/error shapes), config, DI/wiring, route tables, DB schema/migrations, and type barrels are owned by the **orchestrator** (write + freeze first) or the **integrator** (final wiring). If two tasks both need to touch a shared file, that is the signal to extract a contract (step 4), not to let both edit it.
- A test file belongs to exactly one task — the task whose behavior it exercises — unless it is a cross-cutting suite, which then belongs to a dedicated test task (step 6).

**GATE 2 — zero intersection.** Compute the union of all task file lists and confirm no file appears under two task columns. Any shared-but-unavoidable file is reassigned to orchestrator/integrator, or the tasks are re-sliced so the shared file falls entirely inside one owner. If you cannot achieve zero intersection, the decomposition is wrong — merge the colliding tasks or push the shared surface into a frozen contract. Do not proceed with a known collision "to fix at merge time."

### 4. DEPENDENCY EDGES EXPLICIT

For **every pair** of tasks, state one verdict:

- **independent** — no shared interface, no ordering constraint. Can run fully concurrently.
- **needs-shared-contract** — both touch the same interface/type/error shape. This forces the contract to be written and **frozen FIRST** by you, then handed to both tasks as an immutable input. Once the contract is frozen, the two tasks become independent and run in parallel against it.
- **A-before-B** — task B genuinely consumes task A's runtime output or a file A produces that B builds on. This serializes them. Serialize ONLY here — an A-before-B edge you cannot justify with a concrete consumed artifact is usually a `needs-shared-contract` in disguise; converting it unblocks parallelism.

Record the verdicts as a small matrix or edge list. Then check the graph is **acyclic** — a cycle (A-before-B and B-before-A) means you sliced along the wrong seam; re-cut so the shared surface becomes a contract owned by you.

The default target is: contracts frozen up front, then a wide parallel fan-out with the fewest possible A-before-B edges, closed by one integration task.

**GATE 3 — every pair classified, graph acyclic, contracts frozen.** No pair may be left unclassified. Every `needs-shared-contract` edge must point at a contract file you have written and frozen before any dependent task starts. The dependency graph must have no cycle.

### 5. INDEPENDENTLY COMPLETABLE bar

Each task must be finishable AND gate-passable (typecheck/compile strict, lint, its own tests) by an agent holding **only**: the frozen contract, its own spec, and its exclusive file list. Nothing else.

Apply the test literally: read each task spec and ask "could an agent finish this and pass its gates with zero knowledge of what any other agent is doing?" If a spec contains — explicitly or implicitly — "look at what task X produced", "match whatever agent Y did", or "use the client the other task is building", the decomposition is broken. Fix it one of two ways:

- **Extract the shared surface into the frozen contract** so the dependency is satisfied by an immutable artifact, not by another agent's in-flight work; or
- **Merge or re-slice** the coupled tasks into one, or re-cut the boundary so each side is self-contained.

A task that cannot be specified without referencing another agent's live output is not a task — it is half of a task that was cut in the wrong place.

### 6. RIGHT-SIZE, and add test + review tasks

**Right-size each task:**

- **Too big** if it spans two distinct concerns, or its spec exceeds what one agent can hold precisely (rough ceiling: more behavioral requirements than fit on one screen, or more than a handful of exclusive files across unrelated seams). Split along the concern boundary.
- **Too small** if its spec is longer than the diff it will produce — the coordination overhead exceeds the work. Merge it into its neighbor.
- Prefer the vertical slice that can be smoke-tested to the horizontal layer that cannot.

**Test-writing as parallel tasks.** Tests are written against the **contract/spec, not the implementation**. Because of that, a test task for module M can run **in parallel** with the dev task for M the moment the contract is frozen — the test agent never reads the dev agent's code. Give the test task the same exclusive-ownership treatment: it owns the test files, the dev task does not. (When TDD is in play and the project supports it, the test task lands first and the dev task's definition of done includes making those tests pass.)

**Review tasks go to non-authors.** A review task is a real task in the plan, assigned to an agent that did **not** write the code under review. Independent review tasks (reviewing disjoint modules) run in parallel. Reviewer tier ≥ implementer tier for risky changes.

### 7. RISK-ORDER — fire the tracer bullet first

Order the fan-out so the **riskiest / most-unknown slice runs first as a tracer bullet** — a thin vertical slice through the scariest seam (the new integration, the ambiguous requirement, the unfamiliar subsystem). If the plan is going to fail, it should fail here, cheaply, before you have spent the parallel budget on the easy slices.

If the tracer bullet invalidates an assumption (the seam is not where you thought, the contract is wrong), you re-slice with real information instead of discovering the flaw at integration. Do not schedule five easy parallel tasks and leave the one genuinely unknown slice for last.

### 8. INTEGRATION is its own explicit task

Wiring, entry points, DI/composition, and the end-to-end smoke test are a **named task at the end of the plan**, owned by you or a single integrator agent. Never assume integration "just happens" once the slices land — that assumption is where disjoint-but-unwired modules go to die.

The integration task owns the shared wiring files (from the ownership table), depends (A-before-B) on all the slices it wires, and its definition of done is an end-to-end smoke test that exercises the assembled path — not just "it compiles."

## Per-task spec output (the standard template)

Emit each task in exactly this shape. This is the artifact handed to the executor agent.

```
Task: <one-line goal>
Model tier: <SMALL | MEDIUM | LARGE> — <one-line justification>
Owns (exclusive files): <exact path list — no globs where avoidable>
Depends on: <none | frozen contract at <path> | task <id> (A-before-B, consumes <artifact>)>
Inputs: contract at <path>, spec below. Do NOT modify the contract, config, or any shared/wiring file.
Requirements: <behavioral invariants, edge cases, error handling, security constraints>
Definition of done: <gates: typecheck/compile strict, lint, this task's tests green; no stubs, no TODOs>
Return: summary of changes, files touched with file:line refs, gate output, open risks. NOT full file contents.
```

**Model-tier routing** (use the cheapest tier that reliably does the job):

- **SMALL** — mechanical, fully-specified, low-ambiguity: boilerplate from a template, CRUD against a frozen contract, straightforward unit tests with given cases, renames, docstrings.
- **MEDIUM** (default) — standard engineering: feature implementation against a contract, meaningful test design, code review, in-module refactors.
- **LARGE** — high-leverage, high-ambiguity only: contract/architecture design, decomposition of a fuzzy sub-problem, cross-cutting refactors, security-sensitive review. The better your spec, the cheaper the tier that can execute it — invest in the spec to push work down the table.

House rules to restate in every relevant spec: strong types (no `any` / untyped), no stubs or TODOs, the contract is immutable, and security-first — no unauthenticated/unauthorized endpoints, no secrets in code, no public file exposure.

## Definition of done

The decomposition is complete only when ALL hold:

1. `## Module map` exists: modules touched, seams, shared/wiring files flagged (GATE 1).
2. Full ownership table built; union of task file lists has **zero intersection**; shared files assigned to orchestrator/integrator (GATE 2).
3. Every pair of tasks has a dependency verdict; graph is acyclic; every `needs-shared-contract` edge points at a contract you have written and frozen (GATE 3).
4. Every task passes the independently-completable bar — finishable and gate-passable with only contract + spec + file list.
5. Every task is right-sized (no two-concern giants, no spec-longer-than-diff dust).
6. Test tasks and review-by-non-author tasks are present where applicable, with their own exclusive ownership.
7. Fan-out is risk-ordered; the tracer-bullet slice runs first.
8. An explicit integration task exists at the end, owning the wiring files, with an end-to-end smoke test as its done criterion.
9. Every task is emitted in the standard spec template with a justified model tier.

## Return format

You are usually a subagent reporting to an orchestrator. Return a structured summary — never file dumps:

```
Decomposition summary
- Change: <one line>
- Module map: <modules + seams, 3-6 lines; file:line refs to key seams>
- Ownership table: <the table, or "zero intersection verified across N tasks / M files">
- Dependency graph: <edge list: T1 independent, T2 needs-contract(payments.d.ts), T3 A-before-T4(consumes X); acyclic: yes>
- Frozen contracts: <path(s) written + frozen, or "none needed">
- Tasks: <ordered list — id, one-line goal, tier, owner files count; tracer bullet marked>
- Integration task: <id + smoke-test done criterion>
- Open risks / assumptions: <what the tracer bullet must validate; unresolved ambiguities>
```

Attach the per-task specs (standard template) as the deliverable. Do not paste implementation code or full file contents into the summary.

## Anti-patterns

- **Splitting before mapping.** Drawing task boundaries without the module map — you will slice across a seam you did not know existed and create a hidden dependency.
- **Glob ownership.** `src/api/**` as a task's file list hides intersections; two "disjoint" globs can share files. Enumerate exact paths.
- **Two tasks, one file.** Any file under two task columns is a guaranteed collision, not a merge to sort out later. Reassign to orchestrator/integrator or re-slice.
- **Unclassified pair.** Leaving a task pair without a dependency verdict means an ordering constraint you have not seen — it will surface as B blocking on A at run time.
- **A-before-B without a consumed artifact.** A serialization you cannot justify with a concrete output B consumes is usually a shared contract in disguise; it needlessly kills parallelism.
- **"Match what the other agent did."** A spec that references another agent's in-flight work fails the independently-completable bar — extract a contract or merge the tasks.
- **Horizontal layers.** All-models-then-all-services gives nothing testable until everything lands; prefer vertical slices that smoke-test alone.
- **Dev agent reviews its own work.** Review is a separate task assigned to a non-author; self-review misses the boundary violations the author is blind to.
- **Assumed integration.** No named integration task means disjoint modules that never get wired or end-to-end smoke-tested — the classic "each part works, the whole doesn't."
- **Easy slices first.** Scheduling the safe parallel work before the unknown seam wastes the parallel budget before you learn whether the plan holds; fire the tracer bullet first.

## Worked micro-examples

**Input:** "Add Stripe payments to checkout — new gateway client, wire it into the order flow, handle the webhook."

Correct decomposition:
- **Contract first (you, LARGE):** freeze `src/contract/payments.d.ts` — `PaymentGateway` interface, `PaymentResult`/`PaymentError` shapes, webhook event types. Frozen before any task starts.
- **T1 tracer bullet (MEDIUM):** implement `PaymentGateway` against the frozen contract. Owns `src/payments/gateway.ts` + test. Riskiest slice (new external integration) → runs first; if the Stripe seam differs from the contract, we re-freeze now, not at integration.
- **T2 (MEDIUM):** checkout consumes `PaymentGateway` *type* from the contract (not T1's code). Owns `src/orders/checkout.ts` + test. `needs-shared-contract` with T1 → parallel once frozen.
- **T3 (MEDIUM):** webhook handler against the contract's event types. Owns `src/webhooks/handler.ts` + test. Independent → parallel.
- **T4 test task (SMALL):** contract-level integration tests written against `payments.d.ts`. Parallel with T1–T3.
- **T5 review (MEDIUM, non-author):** reviews T1–T3 diffs against the contract.
- **T6 integration (you/integrator):** wire gateway + checkout + webhook in `src/app/wiring.ts` and `src/config/index.ts` (orchestrator-owned files), run end-to-end smoke: place order → charge → webhook → order marked paid. A-before-B on T1/T2/T3.

Ownership table verified zero-intersection; only shared files (`payments.d.ts`, `wiring.ts`, `config`) are orchestrator/integrator-owned.

**Input:** "Split: T1 builds the `User` model, T2 builds the service that returns `User`, T3 builds the controller."

Wrong as stated — these are horizontal layers with a chain of hidden dependencies (T2 needs T1's type, T3 needs T2's method), nothing is smoke-testable until all three land, and any shared type file collides. Correct fix: freeze the `User` type + service signature in a contract first, then either (a) re-cut into a vertical slice "list users end-to-end" owned by one task if it is small, or (b) keep three tasks but make each depend only on the frozen contract (`needs-shared-contract`, now parallel) with an explicit T4 integration task wiring model→service→controller and smoke-testing the route.
