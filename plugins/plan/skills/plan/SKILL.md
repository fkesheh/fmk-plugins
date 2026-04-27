---
name: plan
description: Create detailed implementation plans backed by research. Reviews existing research docs (docs/research/), spawns parallel sub-agents to fill knowledge gaps, then produces a phased implementation plan at docs/plans/ with SHA-tracked references. Interactive — validates understanding before writing. TRIGGER on "create a plan", "plan the implementation", "write an implementation plan", "/plan", "plan this feature", "how should we implement".
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

### 3. Identify knowledge gaps

Compare what the task requires against what existing research covers. List gaps explicitly:

```
Knowledge gaps to fill:
1. How does the current <component> handle <scenario>? (codebase research)
2. What's the <dependency> API surface? (external docs or code)
3. Has a similar feature been built before? (pattern search)
```

### 4. Spawn parallel research agents

For each gap, spawn a focused agent. Send all agents in **one message** for concurrency:

- **Codebase analysis**: Use `subagent_type: "Explore"` to find relevant files, trace data flow, identify integration points.
- **Pattern search**: Find similar implementations to model after.
- **External docs**: Use `ctx_fetch_and_index` for API references, then `ctx_search`.

Each agent prompt must include:
- The specific question to answer (not the full task).
- Instruction to return `path:line` references.
- Context from existing research docs (quote relevant sections).

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
- **Verify before planning** — spawn agents to fill knowledge gaps; don't guess.
- **Get alignment on approach** — present findings and design before writing the plan.
- **Phases are self-contained** — each phase succeeds or fails independently.
- **No open questions in final plan** — resolve all uncertainties before writing.
- **Scope explicitly** — "What We're NOT Doing" is as important as what we ARE doing.
- **Success criteria are testable** — every criterion has a concrete verification step.
