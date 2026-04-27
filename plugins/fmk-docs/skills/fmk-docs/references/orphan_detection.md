# Orphan detection

`fmk-docs orphans` finds source files that are tracked by git but not referenced by any leaf or aggregator. The aim is to surface gaps in doc coverage.

## Algorithm

```
function find_orphans(repo_root, cfg):
    include_globs = cfg.include or ["**/*"]
    ignore_globs  = cfg.ignore + read_lines(repo_root / "docs/.fmk-docs-ignore")
    tracked_all   = git_ls_files(cwd=repo_root, recurse_submodules=cfg.recurse_submodules)

    tracked = [
        p for p in tracked_all
        if matches_any(p, include_globs)
        and not matches_any(p, ignore_globs)
    ]

    covered = set()
    for doc in walk_docs(...):
        for ref in doc.references:
            if ref.kind != "source":      continue
            if ref.role and ref.role not in cfg.coverage_roles: continue
            covered.add(canonicalize(ref.path, doc, repo_root))

    uncovered = sorted(set(tracked) - covered)
    return group(uncovered, by=cfg.group_by)
```

## Glob semantics

The matcher follows gitignore-ish rules but is not a 1:1 reimplementation. Rules:

| Pattern | Matches |
|---|---|
| `*.ts` | basename match (any depth). Equivalent to `**/*.ts`. |
| `src/*` | exactly one path segment under `src/`. |
| `src/**/*` | one or more segments under `src/` (any depth). |
| `**` (anywhere in pattern) | zero or more path segments. |
| `**/*.test.*` | any file with `.test.` in its name, at any depth. |

Patterns are POSIX-style. `\` is treated literally (Windows users should write `/`).

`include` defaults to `**/*` (everything tracked) when empty. `ignore` defaults to a builtin list (tests, generated, node_modules, dist, build, target, .next, .turbo, __pycache__) when the config omits the field.

## `coverage_roles`

A `kind: source` reference contributes to `covered` only if its `role` is in `cfg.coverage_roles` (default: `["primary"]`).

This lets you mark an `example` or `referenced` source — useful in a leaf body but not the file's primary documentation home — without claiming coverage. Set `coverage_roles: [primary, referenced]` in config to treat both as covering.

## `docs/.fmk-docs-ignore`

A gitignore-style file. One pattern per line. `#` comments allowed. Patterns are appended to `cfg.ignore`.

Example:
```
# big generated bundles
public/dist/**
# vendor copies
third_party/**
# fixture files we deliberately don't doc
**/__fixtures__/**
```

## Output formats

### Text (default)

```
ORPHANS (12 files, 3 groups)

src/lib/auth/                          (4)
  - src/lib/auth/refresh.ts
  - src/lib/auth/cookies.ts
  ...
src/workers/                           (3)
  - src/workers/billing.ts
  ...
```

Groups by `cfg.group_by`: `dir` (default) or `ext`.

### JSON

```json
{
  "total_files": 12,
  "total_groups": 3,
  "grouped": {
    "src/lib/auth": ["src/lib/auth/refresh.ts", "src/lib/auth/cookies.ts", ...],
    ...
  }
}
```

## Exit behavior

- `0` — no orphans, or orphans found but `strictness.fail_on_orphan: false` (default — orphans are advisory).
- `6` — orphans found AND `strictness.fail_on_orphan: true`. Use this to block CI on uncovered code.

## Tuning

- **Too noisy**: tighten `include` (only `src/**/*`, not `**/*`); add patterns to `.fmk-docs-ignore`.
- **Too quiet**: loosen `include` to add other source roots; broaden `coverage_roles`.
- **Wrong files counted as covered**: a leaf's `kind: source` `role` may be set wrong — `example` and `referenced` roles don't count toward coverage by default.

## Workflow recommendation

Run `orphans` weekly (CI nightly job, or manually before sprint planning). Use it to drive doc-coverage backlog: each orphan is either a leaf-to-write or an entry to add to `.fmk-docs-ignore`.
