---
name: research
description: Research codebase comprehensively and emit SHA-tracked, line-referenced research docs at docs/research/. Decomposes the user's question, spawns parallel sub-agents to investigate, synthesizes findings with concrete file:line references, computes git hash-object SHA for every referenced source file, and writes a YAML-frontmatter doc. If a doc with the same topic/slug already exists, UPDATES that doc instead of duplicating (refreshes SHAs, appends a Follow-up Research section). Companion to the `docs` plugin (C4 docs). TRIGGER on phrases like "research X", "investigate Y", "deep dive into Z", "how does X work in this codebase", "audit X", "explore the codebase for X", "/research". SKIP if the user only wants a quick answer with no doc artifact, or for non-codebase questions.
---

# research — incremental, SHA-tracked codebase research

Produces durable research docs at `docs/research/` that reference source code by `path + git hash-object SHA + line ranges`. Designed to grow incrementally and stay coherent with `docs/` (C4 hierarchy from the `docs` plugin) — research is the per-demand, narrower companion.

## Output location

```
docs/research/YYYY-MM-DD-<slug>.md
docs/research/YYYY-MM-DD-<TICKET>-<slug>.md   # if a ticket id is provided
```

- `slug`: short kebab-case derived from the user's query (≤6 words).
- Date: `date +%Y-%m-%d` in the user's local time.

## Frontmatter schema (authoritative)

```yaml
---
type: research
topic: "Free-form question or research target"
slug: kebab-case-slug
date: 2026-04-27T14:32:00-03:00
researcher: <git config user.name>
git_commit: <HEAD SHA at time of research>
branch: <current branch>
repository: <repo name, e.g. owner/repo>
status: complete | partial
tags: [research, <component-tags>]
last_updated: 2026-04-27
last_updated_by: <name>
last_updated_note: ""        # short why-changed string when updating
references:
  - path: src/auth/handler.py
    sha: <git hash-object SHA-1>
    lines: "12-45"
    note: "Defines the auth middleware entry point"
  - path: src/auth/tokens.ts
    sha: <git hash-object SHA-1>
    lines: "100-130,200"
    note: "Token expiry logic"
related:
  - docs/research/2026-04-20-other-topic.md
---
```

Required: `type`, `topic`, `slug`, `date`, `git_commit`, `branch`, `references`. The rest are recommended.

## Workflow

Follow these steps **in order**.

### 1. Read explicitly mentioned files first

If the user references specific files, tickets, or docs, read them FULLY in the main context (no offset/limit). This grounds the decomposition.

### 2. Dedupe — look for an existing research doc on the same topic

Before doing any new work:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/find_existing.py --topic "<user query verbatim or close paraphrase>"
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/find_existing.py --slug "<derived-slug>"
```

If either prints a path, prefer **updating** that doc (jump to step 7b — Update existing). Otherwise continue with a new doc.

Also scan `docs/` (the C4 docs from the `docs` plugin) for related context — list candidate paths, but do not block on reading them. Surface relevant ones to sub-agents in step 4.

### 3. Decompose — ultrathink the question

Break the query into independent investigation lanes. Examples of useful lanes:
- **Locator**: where does feature X live? entry points, modules, files.
- **Dataflow**: how does data move through X? upstream callers, downstream consumers.
- **Persistence/storage**: schemas, migrations, queries.
- **Tests**: what coverage exists? what's missing?
- **History**: relevant commits, CHANGELOG entries.
- **External boundary**: API surface, MCP tools, CLI entrypoints.

Track lanes in TaskCreate so progress is visible.

### 4. Spawn parallel sub-agents

Use the `Agent` tool with `subagent_type: "Explore"` for codebase searches and `subagent_type: "general-purpose"` for synthesis-heavy lanes. Send all independent lanes in **one message with multiple Agent tool calls** so they run concurrently.

Each agent prompt should include:
- The specific lane question (not the full user query).
- Any pre-read files from step 1 quoted as context.
- Instruction to return concrete `path:line` references and short quoted snippets.
- Read-only stance (no edits).

### 5. Synthesize

Wait for all agents to finish. Compile findings:
- Live code is the source of truth.
- Connect findings across lanes.
- Note patterns, conventions, surprising decisions.
- Resolve contradictions by re-reading the relevant file (or spawning a focused agent).
- Keep the main agent for synthesis, not deep file-reading.

### 6. Compute SHAs for every referenced file

For every file you cite in the doc:

```bash
git hash-object <path>
```

Batch where convenient. Record each result as a `references[]` entry with `path`, `sha`, `lines`, `note`. Use precise line ranges (`"12-45"`) or comma-joined ranges (`"12-45,80,120-130"`).

Also capture:
```bash
git rev-parse HEAD              # git_commit
git branch --show-current       # branch
git config user.name            # researcher
basename "$(git rev-parse --show-toplevel)"  # repository (or use owner/repo from `gh repo view`)
date +%Y-%m-%dT%H:%M:%S%z       # ISO date
```

### 7a. Write a new research doc

Filename: `docs/research/YYYY-MM-DD-<slug>.md`. Use the Write tool. Body sections:

```markdown
# Research: <topic>

## Research Question
<verbatim or close paraphrase of user's query>

## Summary
<2–6 sentences answering the question>

## Detailed Findings

### <Component / lane 1>
- <claim> (`path/to/file.ext:LINE`)
- <claim> (`other/file.ext:RANGE`)

### <Component / lane 2>
...

## Code References
- `path/to/file.py:123` — <what's there>
- `another/file.ts:45-67` — <what's there>

## Architecture Insights
<patterns, conventions, design decisions>

## Related Docs
- `docs/<C4 path>` — <relation>
- `docs/research/<other>.md` — <relation>

## Open Questions
- <unresolved item>
```

If the current commit is pushed to a remote, you MAY also include GitHub permalinks (`https://github.com/<owner>/<repo>/blob/<commit>/<file>#L<line>`) alongside local refs. Always keep the local refs too.

### 7b. Update an existing research doc (same-topic match)

When step 2 found a match, do NOT create a new doc. Instead:

1. Read the existing doc fully.
2. Run the staleness check on it:
   ```bash
   python3 ${CLAUDE_PLUGIN_ROOT}/scripts/stale.py <path>
   ```
3. Re-investigate the drifted refs (reuse step 4's parallel-agent pattern, scoped to changed files).
4. Update prior claims that are now wrong.
5. Recompute `git hash-object` for every reference (drifted + still-fresh, in case the doc had outdated SHAs from prior work). Update `references[].sha`.
6. Append:
   ```markdown
   ## Follow-up Research <ISO timestamp>
   <what triggered the update; what changed; new findings>
   ```
7. Update frontmatter: `last_updated`, `last_updated_by`, `last_updated_note`. Bump `git_commit` to current HEAD. Keep original `date` and filename.

### 8. Present a summary

Reply to the user with:
- Path of the doc written/updated.
- 3–5 bullet key findings.
- Any open questions or follow-up suggestions.

## Companion commands

| Command | Purpose |
|---|---|
| `/research <query>` | Run this skill on a query. |
| `/research-check [path]` | Staleness report. Empty arg → scans all of `docs/research/`. |
| `/research-update <path>` | Refresh a stale research doc; appends a Follow-up section. |

## Staleness algorithm

`scripts/stale.py` reads each doc's frontmatter and, for every `references[]` entry, runs `git hash-object` on the current file. Output JSON list per doc:

```json
{
  "doc": "docs/research/...",
  "topic": "...",
  "slug": "...",
  "stale":   [{"path": "src/foo.py", "stored_sha": "...", "current_sha": "...", "lines": "1-30", "status": "stale"}],
  "missing": [{"path": "src/gone.py", "stored_sha": "...", "current_sha": null, "status": "missing"}],
  "fresh":   [{"path": "src/ok.py", "stored_sha": "...", "current_sha": "...", "status": "fresh"}],
  "is_stale": true
}
```

A doc is stale if any reference is `stale` or `missing`. Use `is_stale` to triage at a glance.

## Same-topic detection rules

`scripts/find_existing.py` matches in this order:
1. Exact `slug` match (case-insensitive).
2. Exact `topic` match (case-insensitive).
3. `topic` substring match in either direction.

Slug match is preferred — keep slugs stable across updates so dedupe works.

## Discipline

- Always run fresh codebase research on update; do not trust prior conclusions.
- Reference precise line numbers, not whole files.
- Keep `references[]` minimal but exhaustive — every claim that cites code must trace back to a referenced file.
- Tag thoroughly (`tags`) so future research can find this one via `related`.
- Never write placeholder values (e.g. `<commit>`); compute them before writing.
