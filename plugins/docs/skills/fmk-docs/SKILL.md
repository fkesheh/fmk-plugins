---
name: fmk-docs
description: Manage C4-model documentation hierarchies with SHA-tracked source-file references and bottom-up staleness propagation. Use this skill whenever the user wants to audit doc/code drift, find stale documentation, sync docs after a refactor, scaffold a docs tree with init, check doc coverage, find orphan source files (code that no doc references), add a new code-level doc, regenerate aggregator overviews from leaves, or wire a pre-commit/CI doc-staleness gate. TRIGGER on phrases like "are docs stale", "doc coverage", "docs drifted", "init docs", "C4 docs", "fmk docs", "doc audit", "which docs need updating", "regenerate the container overview", "find uncovered files", "fmk-docs check", "fmk-docs orphans", or any mention of `docs/.fmk-docs.yml`. SKIP for prose-only docs with no source-file linkage, generated API reference docs (typedoc/sphinx), or single-file READMEs that don't follow C4 hierarchy.
license: Complete terms in LICENSE.txt
---

# fmk-docs — C4 documentation tracker with SHA propagation

Keeps a project's `docs/` tree in sync with its source code by:
- organizing docs in a C4-model hierarchy (Context → Containers → Components → Code),
- requiring **YAML frontmatter on every doc** with a uniform schema,
- recording a `git hash-object` SHA-1 (same as GitHub's blob SHA) for every reference,
- detecting drift via a diagnostic script (`check`) and orphans via another (`orphans`),
- driving updates **bottom-up to a fixed point**: leaves first, then each aggregator level upward, re-running `check` between waves until the tree is clean.

**Scripts diagnose only.** All doc writes — re-syncing leaf bodies, regenerating aggregator overviews, bumping SHAs in frontmatter — are performed by you (Claude) following Phase 4 below.

The CLI is at `~/.claude/skills/fmk-docs/scripts/fmk_docs.py`. Install once: `pip3 install --user pyyaml`.

## When to invoke

- "Are my docs stale?" / "Do any docs need updating?" → run **Phase 3**, then **Phase 4** if drift exists.
- "Set up docs for this repo" / "Init a docs tree" → run **Phase 1**.
- "Add a doc for `<file>`" → **Phase 2**.
- "Find code with no docs" → run `orphans`.
- "Sync docs after refactor" → **Phase 3** then **Phase 4** loop.
- "Wire up a CI gate for docs" → **Phase 5**.

## Core model (read once, then reference)

Every doc has YAML frontmatter with a uniform schema. `type` discriminates `leaf` (level 4, references source code) vs `aggregator` (levels 1–3, references child docs and possibly source assets). Both types share one `references[]` array; each entry has `kind: source | child` and a `sha` recorded at last sync.

Drift detection is a one-rule check: for each reference, does the recorded `sha` match the current `git hash-object <path>`? If not → that doc is stale.

Cascade is **emergent**: when you update a leaf, its file content changes, so the leaf's own git-blob SHA changes; the parent aggregator's stored child-SHA no longer matches → next `check` flags the parent. This is why the update loop walks bottom-up and re-runs `check` between waves.

📋 Full schema → `references/frontmatter_schema.md`
🌲 Folder layout rules → `references/c4_conventions.md`
🔁 Loop math → `references/propagation_algorithm.md`
🔍 Orphan rules → `references/orphan_detection.md`
⚙️ Config fields → `references/config_reference.md`

---

## Phase 1 — Init

**When**: greenfield repo or one without a fmk-docs `docs/` tree.

```bash
python3 ~/.claude/skills/fmk-docs/scripts/fmk_docs.py init --root <repo>
```

Default scaffolds: `docs/01-context/`, `docs/02-containers/sample-container/`, one `03-components/sample-component/`, one `04-code/sample-leaf.md`. Plus `docs/.fmk-docs.yml` and `docs/.fmk-docs-ignore`.

`--minimal` scaffolds only level 1 (one root context doc); use this when the tree shape isn't yet decided.
`--force` overwrites an existing `docs/` (destructive — confirm with the user first).

Then:
1. Open `docs/.fmk-docs.yml` → set `include` globs to your real source roots (e.g. `src/**/*`, `app/**/*`).
2. Adjust `ignore` for tests, generated code, vendored deps.
3. Plan the actual containers/components on paper, rename the sample dirs to match.

Read `references/c4_conventions.md` before renaming the tree — there are rules for `id` slugs, the `01-`/`02-`/`03-`/`04-` prefixes, and `parent` paths.

---

## Phase 2 — Author

A doc gains real value once it lists `references[]`. Two paths:

### Authoring a **leaf**

Pick the source files this leaf documents (one or many — leaves are *curated logical units*, not 1:1 with files). For each:

```bash
git hash-object <path>     # record this in the leaf frontmatter
```

Edit the leaf to look like:

```yaml
---
type: leaf
id: <container>/<component>/<unit>
title: "Auth middleware"
level: 4
parent: ../README.md
status: fresh
last_synced: <today YYYY-MM-DD>
sha_method: git-blob-sha1
references:
  - path: src/lib/auth/middleware.ts    # repo-relative POSIX
    sha: <git-hash-object output>
    kind: source
    role: primary
  - path: src/lib/auth/permissions.ts
    sha: <git-hash-object output>
    kind: source
    role: primary
---
```

Then write the body: what it does, public API, behavior notes.

### Authoring an **aggregator** (level 1, 2, or 3)

Aggregators reference their **child docs** by path-relative-to-parent + child file SHA. They may also directly reference assets like architecture diagrams via `kind: source`.

```yaml
references:
  - path: ./04-code/middleware.md       # relative to parent dir
    sha: <git hash-object docs/.../04-code/middleware.md>
    kind: child
  - path: docs/diagrams/auth-flow.svg   # repo-relative
    sha: <git hash-object>
    kind: source
    role: referenced
```

After authoring, run `check` immediately to confirm SHAs validate.

📋 Schema details → `references/frontmatter_schema.md`

---

## Phase 3 — Diagnose

Run these whenever the user asks about doc health, before merging a PR, or as the first step of an update.

### `check` — find stale docs

```bash
python3 ~/.claude/skills/fmk-docs/scripts/fmk_docs.py check --root <repo> [--strict] [--format json]
```

Reports stale references sorted **deepest-first** (highest `level` first). Output groups by doc; each entry is `[kind] drift|missing: <path>` plus old/new SHA.

Exit codes:
- `0` clean (or stale found without `--strict`)
- `1` stale found (with `--strict`) — use this in CI
- `4` missing source files (with `strictness.fail_on_missing_source: true`)
- `7` YAML parse error in a doc
- `8` not in a git repo

### `orphans` — find uncovered code

```bash
python3 ~/.claude/skills/fmk-docs/scripts/fmk_docs.py orphans --root <repo> [--format json]
```

Walks `git ls-files`, applies include/ignore globs from `docs/.fmk-docs.yml`, subtracts paths covered by any leaf's `references[].path` (where `kind: source` and `role` ∈ `coverage_roles`). Groups remainder by directory.

🔍 Glob rules → `references/orphan_detection.md`

### `graph` and `stat` (optional)

`graph --format mermaid` emits a doc DAG.
`stat` prints per-doc summaries (refs counts, status, last_synced).

---

## Phase 4 — Update (bottom-up fixed-point loop)

This is the loop that converges the doc tree to a clean state. **You drive it. The scripts only diagnose.**

### Algorithm (apply literally)

```
loop:
    report = run("fmk_docs.py check --format json")
    if report.count == 0:
        break                                    # converged
    deepest = max(e.doc_level for e in report.entries)
    for each unique doc in report.entries where doc_level == deepest:
        if doc.type == "leaf":
            # 1. Read each source file at its current state.
            # 2. Rewrite the leaf body so it accurately reflects the source.
            # 3. For every reference[] with kind==source, update sha to
            #    `git hash-object <path>` of the current file content.
            # 4. Bump last_synced to today (YYYY-MM-DD).
            # 5. Set status: fresh.
            # 6. Save the doc.
        else:  # aggregator
            # 1. Read every child doc body listed in references[] kind==child.
            # 2. Re-synthesize the aggregator body so the overview reflects
            #    the current state of its children (and any kind==source
            #    assets it directly references).
            # 3. For every reference[] (kind==child OR kind==source),
            #    update sha to current `git hash-object <path>`.
            # 4. Bump last_synced; set status: fresh; save.
    # Re-run the loop. The just-updated docs' file SHAs have changed,
    # so their parents will now show drift (cascade). Each pass strictly
    # reduces the deepest stale level by 1.
```

### Why bottom-up

Re-stamping a parent before its children are stable would record a child-SHA that's about to change → parent flips stale on the next pass. Only the bottom-up direction monotonically shrinks the stale set. Termination is guaranteed at root in ≤ tree-depth waves (≤4 for C4).

### Worked example (4 waves)

```
Wave 1 (level 4):  fix all stale leaves; their file SHAs change.
Wave 2 (level 3):  components flip stale (their stored child-SHAs mismatch). Re-synthesize.
Wave 3 (level 2):  containers flip stale. Re-synthesize.
Wave 4 (level 1):  context root flips stale. Re-synthesize.
Final check:       count == 0. Done.
```

### Important

- **Re-run `check` between waves.** Don't batch updates across multiple levels in one shot — you'll record a wrong SHA on a parent if its child hasn't been saved yet.
- **For aggregators**, the body re-synthesis matters: do not just bump SHAs without rewriting the prose. The child docs' content has actually changed; the parent overview should reflect that.
- If `check` keeps reporting drift after a full pass, something is wrong — most often: (a) you re-stamped a parent before its child was saved, (b) the doc has a typo in the recorded SHA. Re-run `check`, look at the deepest entries, redo from there.

🔁 Edge cases & math → `references/propagation_algorithm.md`

---

## Phase 5 — CI gate

Add to a pre-commit hook or GitHub Actions job:

```bash
python3 ~/.claude/skills/fmk-docs/scripts/fmk_docs.py check --root . --strict --format text --no-color
```

Exit `1` blocks the commit/merge. If you also want orphans to fail CI, set `strictness.fail_on_orphan: true` in `docs/.fmk-docs.yml` and add an `orphans` invocation.

---

## Decision tree

```
user asks → ?
├─ "init / set up docs"       → Phase 1
├─ "are docs stale"           → Phase 3 (check); if drift → Phase 4 loop
├─ "find uncovered files"     → Phase 3 (orphans)
├─ "add a doc for <file>"     → Phase 2 (leaf) + run check
├─ "fix doc drift"            → Phase 4 loop (start with check)
├─ "regen container overview" → Phase 4 (limit to that subtree's deepest stale)
└─ "wire up CI"               → Phase 5
```

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `exit 8: not in a git repo` | `--root` points outside any git repo | Pass `--root <git-repo-root>`; the script needs `git hash-object`. |
| `exit 7: invalid YAML` | A doc has a malformed frontmatter block | Look at stderr — it lists the path + the YAML error. Fix and re-run. |
| `exit 4: missing source` | A leaf references a path that no longer exists | Either the file was renamed/deleted. If renamed: update `path`. If deleted: remove the entry; if `references` becomes empty, leaf gets `status: missing` (don't auto-delete the doc). |
| `check` keeps reporting drift after Phase 4 | Updates done out of order (top-down or batched) | Re-run `check`; act on the deepest level only; save before moving up. |
| New code never shows up in `orphans` | Not matched by `include` globs | Edit `docs/.fmk-docs.yml` `include`; remember `**` spans path segments. |

## Help

```bash
python3 ~/.claude/skills/fmk-docs/scripts/fmk_docs.py --help
python3 ~/.claude/skills/fmk-docs/scripts/fmk_docs.py <subcommand> --help
```
