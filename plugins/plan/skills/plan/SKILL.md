---
name: plan
description: Create detailed implementation plans backed by research AND a mandatory clarification dialog. Before writing any plan content, every open question, undefined term, ambiguity, missing constraint, or scope edge must be resolved with a citation — an explicit user answer (recorded verbatim) or codebase/external evidence (file:line or doc URL). Plans built on assumptions or "reasonable defaults" are forbidden. The skill iterates a Q&A loop with the user until the open-question table has zero OPEN rows; in parallel, sub-agents research code- and external-answerable items. Produces a phased plan at docs/plans/ with SHA-tracked references and embeds the resolved questions table in the plan body as a permanent audit trail. TRIGGER on "create a plan", "plan the implementation", "write an implementation plan", "/plan", "plan this feature", "how should we implement". SKIP for trivial single-file edits, plans the user explicitly opts out of clarification on, or when the user provides a fully-specified plan and only asks for execution.
---

# plan — research-backed implementation planning

Produces phased implementation plans at `docs/plans/` that reference source code and research docs by `path + git hash-object SHA`. Every plan is grounded in existing research and real code, not speculation.

## Output location

```
docs/plans/YYYY-MM-DD-<slug>.md
docs/plans/YYYY-MM-DD-<TICKET>-<slug>.md   # if a ticket id is provided
```

- `slug`: short kebab-case from the feature/task description (≤6 words).
- Date: `date +%Y-%m-%d` in the user's local time.
- If a ticket exists, include the ticket ID before the slug.

## Frontmatter schema

```yaml
---
type: plan
topic: "Free-form description of what we're building"
slug: kebab-case-slug
date: 2026-04-27T14:32:00-03:00
planner: <git config user.name>
git_commit: <HEAD SHA at time of planning>
branch: <current branch>
repository: <repo name>
ticket: "ENG-1234"           # optional
status: draft | ready | in-progress | done
tags: [plan, <component-tags>]
last_updated: 2026-04-27
last_updated_by: <name>
references:
  - path: src/auth/handler.ts
    sha: <git hash-object SHA-1>
    lines: "12-45"
    note: "Auth middleware we'll modify"
  - path: docs/research/2026-04-20-auth-flow.md
    sha: <git hash-object SHA-1>
    kind: research
    note: "Prior research on auth flow"
related:
  - docs/research/2026-04-20-auth-flow.md
  - docs/plans/2026-04-15-previous-feature.md
---
```

Required: `type`, `topic`, `slug`, `date`, `git_commit`, `branch`, `status`. The rest are recommended.

## Workflow

Follow these steps **in order**.

### 1. Understand the task

Read any provided ticket files, issue descriptions, or feature requests FULLY. Parse the scope, constraints, and success criteria. If the user provided a file path, read it with Read (no offset/limit).

If no parameters were provided, ask:

```
What should we plan? Please provide:
1. The feature/task description (or a ticket reference)
2. Any constraints, deadlines, or specific requirements
3. Related work or context I should know about
```

### 2. Survey existing research

Before any new investigation, check what's already known:

```bash
ls docs/research/ 2>/dev/null | head -20
```

Read any research docs whose topics overlap with the planned feature. Also scan `docs/plans/` for prior plans on related components — they may contain decisions this plan must respect.

Surface relevant existing research to the user:
```
Found relevant prior research:
- docs/research/2026-04-20-auth-flow.md — covers current auth middleware
- docs/research/2026-04-15-database-schema.md — documents existing schema

I'll use these as foundation for the plan.
```

### 3. Identify and classify open questions

Compare the task against existing research and any explicit context the user provided. Enumerate every:

- **Undefined term** — a word in the task whose meaning is not fixed by codebase or user statement (e.g., "audit" — security review, log trail, or billing trail?).
- **Ambiguity** — multi-interpretation requirement (e.g., "real-time" — < 1s, < 1min, streaming?).
- **Missing constraint** — non-functional requirement not stated (auth model, perf budget, target environment, deployment surface).
- **Scope edge** — what is in / out of scope for this task.
- **External assumption** — third-party API, infra, or other team's plans you would otherwise have to guess at.

Tag each item with one of:

| Tag | Meaning |
|---|---|
| **U** | User-answerable only (business decision, scope, preference, deadline). |
| **C** | Codebase-researchable (an implementation detail discoverable in this repo). |
| **E** | External-doc-researchable (third-party API or infra documented elsewhere). |
| **U+C** | Needs both — user gives intent, code gives feasibility. |

Render the result as a table the user can see and amend:

```
| # | Question | Tag | Status |
|---|---|---|---|
| 1 | What does "audit" mean here — security review, logging trail, or billing? | U | OPEN |
| 2 | Where does the current rate limiter live? | C | OPEN |
| 3 | Does Stripe support tiered usage on Connect accounts? | E | OPEN |
| 4 | Should the new flow be opt-in or default? | U | OPEN |
```

If you cannot enumerate at least 3 questions for a non-trivial task, you have not analyzed the request — re-read it more carefully. Most real features surface 5-10 open questions before clarification.

### 4. Resolve every open question (mandatory dialog + research)

Run two paths concurrently until every row in the table moves from OPEN to ANSWERED. The plan body is NOT written until that is true.

#### 4a. User dialog (for U / U+C rows)

Ask the user. One focused turn per round:

- Group related questions; no more than 5 per turn.
- Quote each question. When possible, propose 2-3 candidate answers — forcing a choice yields decisions faster than an open-ended prompt.
- Wait for the user's reply before continuing.
- After each reply, update the table: mark answered rows ANSWERED with the verbatim user statement; if the reply surfaces new questions, add them as new OPEN rows.
- Loop until every U or U+C row is ANSWERED.

Forbidden during this loop: inventing an answer, "I'll assume X", "reasonable default of Y", or proceeding with a TBD. The point of this skill is to refuse to plan on guesses.

#### 4b. Codebase / external research (for C / E / U+C rows)

In parallel with 4a, spawn focused sub-agents. Send all agents in **one message** for concurrency:

- **Codebase analysis**: `subagent_type: "Explore"` — find relevant files, trace data flow, identify integration points.
- **Pattern search**: similar implementations to model after.
- **External docs**: `ctx_fetch_and_index` for API references, then `ctx_search`.

Each agent prompt must include:
- The exact open question, verbatim from the table.
- Instruction to return `path:line` references (codebase) or `source: <url>` (external).
- Constraint: if the answer is "not present in this codebase / not documented", say that explicitly rather than guessing.

An answer counts as ANSWERED only when it has a citation (user statement, file:line, or doc URL). "It probably works like X" is not an answer.

#### Gate — before any plan content is written

Verify the table satisfies ALL of the following:

- Every row is ANSWERED with a citation.
- No answer reads "TBD", "we'll figure that out later", or "I'll guess".
- The table is preserved verbatim and will be embedded in the plan body under `## Open Questions Resolved` (see step 6).

If any row is still OPEN, return to step 4a or 4b. Do not skip to step 5.

### 5. Synthesize findings

Wait for all agents. Compile:

- Current state of relevant code (file:line references)
- Patterns and conventions to follow
- Integration points and dependencies
- Constraints discovered

Present findings to the user before writing the plan:

```
**Current State:**
- <component> at `path/file.ext:45-80` handles <behavior>
- Pattern: <existing feature> uses <approach>

**Key Constraints:**
- Must work within <existing system>
- Cannot break <dependent feature>

**Design Approach:**
I propose <approach> because <reasoning>.

Shall I proceed with this approach?
```

### 6. Write the plan

After user confirms the approach, write the plan to `docs/plans/YYYY-MM-DD-<slug>.md`.

#### Plan body structure

```markdown
# <Feature/Task Name> — Implementation Plan

## Overview
<1-3 sentences: what, why, desired outcome>

## Current State
<What exists now. Key files, patterns, constraints. With `path:line` references.>

## Desired End State
<What the system looks like after implementation. Concrete and verifiable.>

## What We're NOT Doing
<Explicit scope boundaries to prevent creep.>

## Open Questions Resolved
| # | Question | Answer | Source |
|---|---|---|---|
| 1 | <verbatim from step 3 table> | <verbatim user statement OR concrete answer> | user / `path:line` / <url> |
| 2 | ... | ... | ... |

This table is the permanent audit trail of the assumptions baked into the plan. If any answer turns out to be wrong, this is where to retrace.

## Implementation Phases

### Phase 1: <Name>
**Goal**: <What this phase accomplishes>

**Changes**:

#### <Component/File>
- `path/to/file.ext` — <what changes and why>
- `path/to/other.ts:30-50` — <specific modification>

**Success Criteria**:
- [ ] Automated: <command to verify, e.g. `pnpm test`>
- [ ] Manual: <what a human verifies>

### Phase 2: <Name>
...

## Risks & Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| <risk> | <high/medium/low> | <how we handle it> |

## Testing Strategy

- **Unit tests**: <what to cover>
- **Integration tests**: <end-to-end scenarios>
- **Manual testing**: <steps a human follows>

## References
- `docs/research/<relevant>.md` — <relation>
- `path/to/code.ts:LINE` — <why referenced>
```

Phases should be:
- **Independent** — each phase can be verified standalone
- **Incremental** — builds on prior phases
- **Reversible** — can roll back a phase without losing prior work

### 7. Compute SHAs

For every file referenced in the plan:

```bash
git hash-object <path>
```

Record each in `references[]` frontmatter with `path`, `sha`, `lines`, `note`.

Also capture:
```bash
git rev-parse HEAD              # git_commit
git branch --show-current       # branch
git config user.name            # planner
date +%Y-%m-%dT%H:%M:%S%z      # ISO date
```

### 8. Present the plan

```
Plan written to docs/plans/YYYY-MM-DD-<slug>.md

Phases: 3
Files to modify: 8
Key risks: <top risk>

Review the plan and let me know if anything needs adjustment.
```

## Companion commands

| Command | Purpose |
|---|---|
| `/plan <description>` | Create a new implementation plan |
| `/plan <ticket-file>` | Plan from a ticket file |

## Discipline

- **Ground in research** — every claim references a research doc or source file with SHA.
- **No plan until the clarification gate is closed** — the open-question table must have zero OPEN rows before any plan body is written. Returning to clarification mid-plan is allowed and expected; pretending an unanswered question is "obvious" is not.
- **Citations only** — every answer is backed by a user statement, `path:line`, or doc URL. "I'll assume…", "it probably works like…", or silent assumption is forbidden.
- **No invented answers** — when the user is the only valid source for a question, ask them. Do not proceed with a "reasonable default" — the user's actual answer is rarely what you would default to.
- **Get alignment on approach** — after the table is closed and findings synthesized, present the design before writing the plan body.
- **Phases are self-contained** — each phase succeeds or fails independently.
- **Open Questions Resolved table is permanent** — it lives in the plan body as the audit trail of the assumptions baked in. Don't strip it after writing.
- **Scope explicitly** — "What We're NOT Doing" is as important as what we ARE doing.
- **Success criteria are testable** — every criterion has a concrete verification step.

## When to skip the clarification dialog

- **Trivial edits** — a one-line typo fix, an explicit "rename foo to bar in this file" — skip the dialog and just do it.
- **User opt-out** — the user explicitly says "skip clarification, just plan with reasonable defaults". Acknowledge in writing and proceed; the resulting plan must still include an `## Open Questions Resolved` section listing the assumptions the user accepted.
- **Fully-specified plan from the user** — if the user supplies a complete plan and only asks for execution, treat the user's spec as the answers and verify nothing is left ambiguous before executing. Re-engage clarification if you find an ambiguity mid-execution.

In all other cases, run the dialog.
