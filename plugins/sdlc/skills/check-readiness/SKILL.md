---
name: check-readiness
description: A Definition-of-Ready gate run on a task/ticket BEFORE decomposition or implementation begins. Restates the goal as observable behavior, walks a readiness checklist item by item, and classifies every gap as blocking (needs a human decision), resolvable-by-research (answer exists in the codebase/docs — go find it), or deferrable (a conservative default exists — propose it). Prevents the failure mode where a capable model receives a vague ticket, silently fills the gaps with plausible assumptions, and builds something that compiles and is confidently wrong in ways nobody decided. Moves ambiguity discovery to the cheapest point — before any agent is spawned. TRIGGER on phrases like "is this ticket ready", "definition of ready", "readiness check", "can we start on this", "is this ready to implement", "check this ticket before we build", "DoR gate", "is this well-specified enough", "ready for decomposition", "vet this ticket", "any blockers before we start", "/check-readiness". SKIP when the work is already in flight and you just need the next implementation step (that is decompose-task or the dev loop), when the user explicitly wants you to start building despite known gaps, or for a pure formatting/rename/config bump where there is no behavior to specify.
---

# check-readiness — Definition-of-Ready gate

Enforces a readiness gate on a task or ticket *before* any decomposition or implementation, so ambiguity is surfaced and resolved at the cheapest possible point — before a single agent is spawned or a line of code is written.

This skill exists because a capable model handed a vague ticket does not stop and ask. It does the opposite: it fills every gap with a plausible assumption and proceeds. The result *looks* like progress — it compiles, it has tests, it reads well — and it is wrong in ways nobody actually decided. An unspecified sort order becomes "probably descending by date." An unstated auth requirement becomes "probably behind the existing middleware." An undefined empty state becomes "probably just hide the component." Each guess is individually reasonable and collectively a product nobody signed off on. The cost of discovering these gaps rises with every step downstream: a question that costs one line to ask before decomposition costs a rewrite after review. This skill front-loads that discovery.

The discipline has two equal failure modes it must avoid, and naming both is the whole point. **Rubber-stamping** — declaring everything READY because the ticket has words in it — defeats the gate. **Bouncing** — returning twenty questions on every ticket, including ones you could answer yourself in thirty seconds — trains everyone to route around the gate. The tri-state gap classification in step 3 is what keeps the skill between those two ditches: you resolve what you can, defer what has a safe default, and escalate to a human *only* the decisions a human must actually make.

This runs one step before `decompose-task` in the SDLC pipeline. A `READY` (or `READY-WITH-DEFAULTS`) verdict is the input decomposition consumes; a `NOT-READY` verdict stops the pipeline and routes the blocking questions to a stakeholder. See "Pipeline handoff" below.

## Workflow

### 1. Restate the goal as observable behavior

Before touching the checklist, rewrite the ticket's goal as one or more sentences of the form **"Given `<precondition/input>`, the system `<observable action/output>`."** No implementation words — no "add a service," "refactor the handler," "use a queue." Only what an outside observer could watch happen.

- "Add password reset" → "Given a registered user submits their email on the reset form, the system sends a single-use reset link valid for 1 hour to that email; given the user opens a valid link and submits a new password, the system updates their credential and invalidates the link."
- "Improve the export" → *cannot be restated as observable behavior.* What changes for the observer? Faster? New format? More columns? This is a wish, not a task.

**Gate 1 — restatable as behavior.** If the ticket cannot be expressed as "given X, the system does Y," the verdict is **NOT-READY** regardless of how the checklist would score. A ticket you can't state as behavior is not a task yet; it is a topic. Return it with the one question that would make it statable ("What observable change should this produce?"). Do not proceed to the checklist to manufacture the appearance of thoroughness — a failed Gate 1 is a complete answer.

The restatement is also the seed for acceptance criteria: a crisp "given X, does Y" is a test waiting to be written. If you struggle to restate it, that struggle *is* the finding.

### 2. Walk the readiness checklist item by item

For **each** item below, record exactly one verdict: `ready`, `GAP`, or `n.a.` (with a one-line reason). "I didn't consider it" is not a verdict. Walking every row — including the ones that turn out `n.a.` — is what defeats assumption-filling: you cannot silently skip an item, you have to look and decide. A `GAP` verdict here is not yet a question for a human; step 3 decides what happens to it.

1. **Acceptance criteria testable** — is "done" defined as observable, checkable conditions? Each criterion should map to something you could assert. "Works correctly" is a GAP; "returns 403 for a non-owner" is ready.
2. **Edge cases & error behavior** — what happens on empty input, the maximum size, a duplicate, a concurrent write, a downstream timeout, a malformed request? Unstated error behavior is a GAP, because the model *will* invent one.
3. **Inputs/outputs typed or typeable** — can every input and output be given a concrete type (shape, fields, units, nullability)? If a field's type or allowed set is unknowable from the ticket, that is a GAP. Strong types are a house rule; an untypeable interface can't be built to one.
4. **Dependencies & touched systems identified** — which existing modules, services, APIs, or jobs does this read from or write to? Unknown blast radius is a GAP (often a resolvable-by-research one).
5. **Data / schema impact** — does this add/alter columns, indexes, events, or stored shapes? Is a migration implied? Silence on a schema change that the behavior clearly requires is a GAP.
6. **Security requirements stated** — for **any** new or changed surface (endpoint, action, file access, job): is authentication required, and is authorization (who may do this, to which object) specified? A missing auth spec is **always** a GAP — never default it to "probably fine" or "handled upstream." Unauthenticated surfaces and unstated authz are the most expensive things to discover late. (House rule: no unauthenticated endpoints, no unauthorized object access.)
7. **UX states covered (UI work only)** — are loading, empty, error, partial, and success states specified, and do designs/mocks exist for them? "Show the list" with no empty or error state is a GAP. Mark `n.a.` with a reason for non-UI work.
8. **Non-goals stated** — does the ticket say what is explicitly out of scope? Absent non-goals invite scope creep and gold-plating; if the boundary is genuinely obvious, note it `ready` with the boundary named, otherwise GAP.
9. **Rollout / flag / migration needs** — does this need a feature flag, a phased rollout, a backfill, or a coordinated deploy? If the change is risky or user-visible and the ticket is silent, GAP.
10. **Small enough to estimate** — can you see the whole thing well enough to size it (say, under a few days)? If not, the finding is **not** "write more spec" — it is "this needs decomposition first." A ticket too big to estimate is not made ready by answering questions; mark it GAP and recommend it be split before it re-enters this gate.

Adapt the list to the ticket's actual surface — a backend-only change legitimately marks item 7 `n.a.` — but *mark* it, don't drop it. Item 6 is the one exception: it is never `n.a.` for anything that introduces or changes a reachable surface.

**Gate 2 — checklist complete.** Every item carries a verdict before you move on. The completed checklist ships *with* the verdict; it is the proof the gate was actually walked, and it is as useful to the reader as the verdict itself.

### 3. Classify every gap (tri-state) — the heart of the skill

For each item marked `GAP`, assign exactly one class. This classification is what separates a useful gate from both rubber-stamping and question-spraying.

- **(a) BLOCKING** — resolving it requires a *product or stakeholder decision* that an agent must not make. There is no single correct answer derivable from code or convention; someone with authority has to choose. Examples: "should deleting an account also delete their published posts, or orphan them?", "is this feature free-tier or paid-only?", "which of two conflicting requirements wins?" An agent guessing here manufactures a decision nobody made — exactly the failure this skill prevents. Blocking gaps become the questions in a NOT-READY verdict.

- **(b) RESOLVABLE-BY-RESEARCH** — the answer *already exists* in the codebase, docs, config, schema, or an existing convention; it is unknown to you, not undecided by the org. Examples: "what type is the `status` field?" (read the model), "does an auth middleware already wrap this route group?" (read the router), "what's the existing pagination convention?" (read a sibling endpoint). These do **not** go to a human. You resolve them yourself in step 4. Bouncing a research gap to a stakeholder is the lazy failure mode — it makes the human do your reading.

- **(c) DEFERRABLE** — a conservative, low-regret default exists and the cost of guessing wrong is small and reversible. Examples: "sort order unspecified → default newest-first, note it", "page size unspecified → default 20, note it", "log level for the new warning → default `warn`." You do not block on these; you pick the safe default, state it **explicitly** for ratification, and proceed. The rule is *propose, don't presume*: the default is written down where a stakeholder can veto it in one line, which is the difference between a ratified default and a silent assumption.

When a gap could be read two ways, the tie-breaker is **cost of a wrong guess**: irreversible, user-visible, or security-relevant → BLOCKING; cheap and reversible → DEFERRABLE; knowable from the code → RESOLVABLE. A security gap (item 6) is never DEFERRABLE — an unstated auth requirement is either resolvable ("the convention is every route under `/api` requires a bearer token — confirmed in the router") or blocking ("is this endpoint intended to be public?"), never a default-to-skip.

### 4. Resolve what you can

Before returning a verdict, actually perform the research for every **RESOLVABLE-BY-RESEARCH** gap. Read the model, grep the router, check the sibling implementation, look at the migration history, read the ADR. A readiness check that returns "unknown — go look in the codebase" did half its job and pushed the other half onto the reader.

For a deep or multi-file resolution, dispatch a targeted reader/research subagent (medium tier) with a precise question rather than loading files into your own context — but the gap is not resolved until an answer comes back and you record it. Each resolved gap flips from `GAP` to `ready` in the checklist, with a one-line note of what you found and where (`file:line`). If research *fails* to find the answer, the gap is not deferrable by default — reclassify it: it becomes BLOCKING if the missing answer needs a decision, or DEFERRABLE only if a genuine safe default exists.

**Gate 3 — research done, not deferred.** No gap is still sitting in RESOLVABLE-BY-RESEARCH when you return. Each one has either been answered (now `ready`) or reclassified. Returning a "readiness check" with open research items is not done.

### 5. Emit the verdict

Exactly one of three:

- **READY** — Gate 1 passed, every checklist item is `ready` or justified `n.a.`, and there are no blocking or deferred gaps. Decomposition can start immediately.
- **READY-WITH-DEFAULTS** — no blocking gaps, but one or more deferrable defaults were assumed. List **each** default as a single ratifiable line ("Assuming page size = 20 unless told otherwise"). Decomposition may proceed in parallel with ratification, since defaults are low-regret by construction — but the list must be visible so a stakeholder can veto any line cheaply.
- **NOT-READY** — Gate 1 failed, *or* at least one BLOCKING gap remains. List each blocking question phrased so a stakeholder can answer it in **one line**, and — where possible — name the option each answer favors ("Delete posts too, or orphan them? (orphaning is safer/reversible)"). The pipeline stops here until these are answered.

### 6. Right-size the ceremony

The discipline scales down, not off. A one-line bug ticket with a stack trace does not need the full ten-row walk. State which rows are trivially `n.a.` and move on: for a clear-repro bug, items 3–9 are usually `n.a.` because the fix is defined by "stop doing the wrong thing the trace shows," and Gate 1 restatement is just "given the repro steps, the system no longer throws `<error>`." Do the same for a config bump or a copy change. The test is honesty, not brevity: mark the rows `n.a.` *with a reason*, don't silently skip them, and never inflate a trivial ticket into a twenty-question interrogation to look rigorous. Conversely, don't collapse a genuinely ambiguous feature into "looks fine" to save effort — the ceremony you skip is the ambiguity you ship.

## Pipeline handoff

`check-readiness` is the gate *before* `decompose-task`. The handoff is concrete:

- **READY / READY-WITH-DEFAULTS** → feed the restated behavior (step 1), the resolved facts (step 4, with `file:line` refs), the non-goals, and the ratified defaults directly into decomposition. Those artifacts are exactly the inputs decomposition needs to draw disjoint file-ownership boundaries — you have already identified touched systems (item 4) and data impact (item 5). Don't make decomposition rediscover them.
- **NOT-READY** → do **not** decompose. Return the blocking questions to the stakeholder. The pipeline resumes at this gate once answered — re-running the check is cheap and confirms the answers actually closed the gaps.

This ordering is the entire economic argument for the skill: every gap caught here is caught before fan-out multiplies it across parallel agents.

## Definition of done

- Goal restated as "given X, the system does Y," or Gate 1 explicitly failed with the one unblocking question (Gate 1).
- Every checklist item carries a verdict: `ready` / `GAP` / `n.a.`+reason (Gate 2).
- Every `GAP` carries a tri-state class: BLOCKING / RESOLVABLE-BY-RESEARCH / DEFERRABLE.
- Every RESOLVABLE gap was actually researched and is now `ready` or reclassified — none left open (Gate 3).
- Exactly one verdict emitted: READY / READY-WITH-DEFAULTS (defaults listed) / NOT-READY (one-line blocking questions listed).
- Security item (6) is `ready` or a stated GAP — never silently `n.a.` for a change with a reachable surface.
- Ceremony right-sized: trivial rows marked `n.a.` with a reason, not skipped.

## Return format

The executor is usually a subagent reporting to an orchestrator. Return a structured summary, never full file dumps:

```markdown
## Readiness check — <ticket id / title>

### Verdict: READY | READY-WITH-DEFAULTS | NOT-READY

### Restated as behavior
Given <X>, the system <Y>. [+ additional given/does lines as needed]
<or: "Gate 1 FAILED — cannot restate as behavior. Unblocking question: <one line>">

### Blocking questions (only if NOT-READY)
1. <one-line question> — favored option: <which answer is safer/default and why>
2. ...

### Assumed defaults (only if READY-WITH-DEFAULTS) — ratify or veto
- <default assumed> — <one-line rationale>

### Resolved by research
- <gap> → <answer found> (`path/to/file.ext:42`)

### Readiness checklist
| # | Item | Verdict | Class (if GAP) | Note |
|---|------|---------|----------------|------|
| 1 | Acceptance criteria testable | ready / GAP / n.a. | BLOCKING/RESOLVABLE/DEFERRABLE | ... |
| ... | ... | ... | ... | ... |

### Handoff
<READY → "feeds decompose-task; touched systems: …" | NOT-READY → "stop; route blocking questions to <stakeholder>">
```

Report the completed checklist even when it is mostly clean — the walk is the evidence the gate ran.

## Anti-patterns

- **Rubber-stamp READY.** Declaring a ticket ready because it has prose, without walking the checklist or restating the behavior. The gate that passes everything protects nothing.
- **Question-spray.** Bouncing every ticket with a long list of questions, including ones you could answer by reading one file. This trains the team to route around the gate. Research the resolvable ones yourself.
- **Bouncing a research gap to a human.** "What type is `status`? Please advise." — that answer is in the model. Category (b) gaps are yours to resolve, not a stakeholder's to look up.
- **Silent default.** Guessing an unstated sort order / page size / retry count and building it without writing the assumption down. A default is only legitimate when it is stated for ratification — otherwise it is exactly the assumption-filling this skill exists to stop.
- **Defaulting a security gap.** Treating a missing auth/authz spec as `n.a.` or "probably handled upstream." Item 6 is never DEFERRABLE; resolve it from the routing convention or make it a blocking question.
- **Compound / essay questions.** "Can you clarify the requirements around export, including format, columns, permissions, and error handling?" is un-answerable in one line. Split it into atomic one-line questions, each of which changes what gets built — and drop any that don't.
- **Padding the question list.** Adding questions to look thorough. Every blocking question must change an implementation decision; if the answer wouldn't alter what's built, delete it.
- **Skipping Gate 1 to score the checklist.** Running the ten-row walk on a ticket that isn't a task yet, producing a false-precise verdict on a topic. If it can't be restated as behavior, that's the answer.
- **Full-ceremony on a one-line bug.** Interrogating a stack-trace ticket with ten rows of spec questions. Right-size: mark the trivial rows `n.a.` and move on.

## Worked micro-examples

**Input:** Ticket "Add a favorites feature so users can bookmark products."

**Correct behavior:** Gate 1 restates: "Given an authenticated user taps favorite on a product, the system records it and the product appears in their favorites list; given they un-favorite it, the system removes it." Checklist walk surfaces gaps and classifies them:
- Item 6 (security): the ticket never says who can favorite. GAP → **RESOLVABLE**: read the router — all `/api/user/*` routes require a bearer token (`routes/api.ts:40`); favoriting is user-scoped. Resolved → `ready`.
- Item 3 (types): is a favorite scoped per-user or global? GAP → **RESOLVABLE**: existing `likes` table is `(user_id, product_id)` unique (`schema/likes.sql:1`); follow the convention. Resolved.
- Item 2 (edge case): favoriting an already-favorited product — error or idempotent no-op? GAP → **DEFERRABLE**: default to idempotent (safe, reversible). Stated for ratification.
- Item 7 (UX): empty favorites-list state — no design provided. GAP → **BLOCKING** if product cares about the empty-state copy/CTA; here a simple "No favorites yet" is low-regret → **DEFERRABLE**, note it.
- Item 5 (schema): implies a new `favorites` table + migration. GAP → not really a gap, just an implementation fact → note under handoff for decomposition.
Verdict: **READY-WITH-DEFAULTS** — defaults: idempotent re-favorite; simple empty state. Handoff: feeds decompose-task; touched systems: user API, new `favorites` table.

**Input:** Ticket "When a user is deleted, clean up their data."

**Correct behavior:** Gate 1 restates partially: "Given an admin deletes a user, the system removes the user's `<?>`." The `<?>` is the problem. Checklist item 8 (non-goals) and item 5 (data impact) both GAP on the same thing: *which* data — sessions and tokens (clearly yes), but their published reviews and their team's shared documents? That is **BLOCKING**: deleting another user's visible content or orphaning shared team data is an irreversible product decision, not a code lookup and not a safe default. Verdict: **NOT-READY**. Blocking question, one line: "On user deletion, delete their published reviews too, or orphan them to 'deleted user'? (orphaning is reversible and safer)." Do not proceed to decomposition; a guess here silently makes a data-loss decision nobody approved.
