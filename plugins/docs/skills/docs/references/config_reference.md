# `docs/.fmk-docs.yml` — configuration reference

Per-project config. Created by `fmk-docs init` from the bundled starter. All fields have defaults; the file may be omitted entirely (defaults will be used) but it's strongly recommended to keep it under version control with at least `include` set.

## Full schema

```yaml
version: 1
docs_root: docs                        # repo-relative root of the docs tree

levels:
  context: 01-context                  # level-1 dir name
  containers: 02-containers            # level-2
  components: 03-components            # level-3
  code: 04-code                        # level-4 (leaves)

sha:
  method: git-hash-object              # only option in v0
  algorithm: sha1                      # mirrors git's current default; tracks SHA-256 transition

include:                               # gitignore-style globs for orphan-coverage scope
  - "src/**/*"
  - "lib/**/*"

ignore:                                # globs to exclude from orphan checks
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__generated__/**"
  - "**/__pycache__/**"
  - "**/node_modules/**"
  - "**/dist/**"
  - "**/build/**"
  - "**/target/**"
  - "**/.next/**"
  - "**/.turbo/**"

coverage_roles:                        # which leaf source-roles count as "covered"
  - primary

strictness:
  fail_on_missing_source: true         # check exits 4 if any source file referenced by a leaf is missing
  fail_on_orphan: false                # orphans exits 6 if any orphan found (default off — advisory)

group_by: dir                          # orphan output grouping: dir | ext

recurse_submodules: false              # if true, git ls-files --recurse-submodules
```

## Field-by-field

### `version`

Currently `1`. Bumped on incompatible config schema changes; a future `fmk-docs migrate` would walk old configs forward.

### `docs_root`

Where the tree lives. Default `docs`. Repo-relative POSIX. Most projects should keep the default.

### `levels.{context,containers,components,code}`

Folder names per level. Defaults are `01-context`, `02-containers`, `03-components`, `04-code`. Override only if your project has a strict naming standard that conflicts. The numeric prefix is what makes the tree scan-friendly; keep some kind of ordering prefix.

### `sha.method` / `sha.algorithm`

`method` is `git-hash-object` (only option in v0). `algorithm` is `sha1` today. When git transitions to SHA-256, change to `sha256` after migration.

### `include`

Globs (gitignore-style) for which **source files** count toward orphan analysis. If empty/missing → `**/*` (every tracked file). Set to your real source roots to avoid noise from configs, fixtures, etc.

Glob semantics: `**` spans path segments; `*` is a single segment. See `references/orphan_detection.md` for full rules.

### `ignore`

Globs that **subtract** from `include`. Apply to test files, generated code, vendored deps, large bundles. Patterns from `docs/.fmk-docs-ignore` are appended to this list at runtime.

### `coverage_roles`

A leaf's `kind: source` reference counts toward orphan-coverage only if its `role` is in this list. Default: `[primary]`. Add `referenced` if you want secondary mentions to also count.

### `strictness.fail_on_missing_source`

Default `true`. When `check` finds a leaf referencing a path that no longer exists, exit code becomes `4`. CI gates should leave this on.

### `strictness.fail_on_orphan`

Default `false`. When `true`, `orphans` exits `6` if any orphan is found. Useful in CI once your tree is fully covered. Leave off until you've actually authored docs for everything.

### `group_by`

`dir` (default) — orphan output is grouped by parent directory.
`ext` — grouped by file extension. Useful when the tree has clusters of distinct file types.

### `recurse_submodules`

Default `false`. When `true`, `git ls-files --recurse-submodules` is used to enumerate tracked files; submodule files become eligible for orphan detection.

## Migration tip

Don't ship a near-empty `include` list to a brand-new repo — `orphans` will be unhelpful. Spend 10 minutes mapping your real source roots into `include` before running orphan analysis the first time.
