---
description: Check staleness of research docs at docs/research/. Reports refs whose source git hash-object SHA has changed.
argument-hint: [path/to/doc.md or empty for all]
---

Run the staleness checker on $ARGUMENTS (empty = scan all `docs/research/*.md`).

Steps:

1. Invoke the script:
   ```bash
   python3 ${CLAUDE_PLUGIN_ROOT}/scripts/stale.py $ARGUMENTS
   ```
   (with no args, it walks `docs/research/`).

2. Parse the JSON output. For each doc, surface:
   - `doc` path + `topic`.
   - Count of `stale`, `missing`, `fresh` refs.
   - List the stale refs with `path`, `lines`, `stored_sha → current_sha` (short SHAs).
   - List missing refs.

3. Suggest `/research-update <path>` for any doc with `is_stale: true`.

4. If no docs exist or none are stale, say so plainly.

Keep the output compact: one block per doc, drift entries as bullet lines.
