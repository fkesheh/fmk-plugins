---
description: Research codebase comprehensively, emit SHA-tracked research doc at docs/research/. Updates existing doc if same topic.
argument-hint: <research-query>
model: opus
---

Run the `research` skill from this plugin to investigate:

$ARGUMENTS

Follow the skill's full workflow:

1. Read any explicitly mentioned files first (no offset/limit).
2. Dedupe via `${CLAUDE_PLUGIN_ROOT}/scripts/find_existing.py` (slug + topic) — if a match exists, UPDATE that doc instead of creating a new one.
3. Ultrathink and decompose the query into independent investigation lanes.
4. Spawn parallel sub-agents (Explore / general-purpose) — one message, multiple Agent calls.
5. Synthesize findings; resolve contradictions by re-reading code.
6. Compute `git hash-object` for every referenced file; capture HEAD SHA, branch, repo, researcher, ISO date.
7. Write `docs/research/YYYY-MM-DD-<slug>.md` with the exact frontmatter schema in the skill, OR append a `## Follow-up Research <ts>` section to the matched existing doc and bump `last_updated*` fields.
8. Reply with the doc path and 3–5 bullet key findings.

If no `$ARGUMENTS` were provided, ask the user for their research question, then proceed.
