---
description: Refresh a stale research doc. Re-investigates drifted refs, refreshes SHAs, appends a Follow-up Research section.
argument-hint: <path/to/research.md>
model: opus
---

Refresh research at: $ARGUMENTS

Steps:

1. Read the research doc fully (Read with no offset/limit) so you have the original findings, slug, topic, and references.

2. Run the staleness check:
   ```bash
   python3 ${CLAUDE_PLUGIN_ROOT}/scripts/stale.py $ARGUMENTS
   ```

3. For each ref under `stale[]` or `missing[]`:
   - If `stale`: re-read the file (or spawn a focused Explore agent) to learn what changed in the relevant line range. Update prior claims that are now wrong.
   - If `missing`: investigate where the code moved (renames, splits, deletions). Either remove the ref or replace with the new file.

4. For every ref still in the doc (drifted + previously-fresh), recompute `git hash-object <path>` and update `references[].sha`. Update `lines` if the relevant range moved.

5. Append a new section at the bottom of the doc:
   ```markdown
   ## Follow-up Research <ISO timestamp>

   <what triggered this update; what changed in the code; new findings; references to the new claims>
   ```

6. Update frontmatter:
   - `last_updated`: today (`YYYY-MM-DD`).
   - `last_updated_by`: `git config user.name`.
   - `last_updated_note`: short string describing the trigger ("post-refactor refresh", "follow-up on auth tokens", etc.).
   - `git_commit`: current `git rev-parse HEAD`.
   - Keep `date`, `slug`, `topic`, and the filename unchanged.

7. Reply with:
   - The doc path.
   - Bullet list of refs that changed, with old vs new short SHAs.
   - Bullet list of new findings introduced in the Follow-up section.
