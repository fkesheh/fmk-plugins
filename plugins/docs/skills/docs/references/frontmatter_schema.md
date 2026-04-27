# Frontmatter schema

Every doc in `docs/` has a YAML frontmatter block at the top, fenced by `---`. The schema is uniform across all 4 levels — `type` discriminates `leaf` (level 4) from `aggregator` (levels 1–3).

## Required fields (both types)

| Field | Type | Notes |
|---|---|---|
| `type` | `"leaf"` \| `"aggregator"` | Discriminator. |
| `id` | string | Stable, repo-unique slug. Convention: directory chain joined by `/`, e.g. `web-app/auth/middleware`. |
| `title` | string | Human-readable; shown in tools and graphs. |
| `level` | int 1–4 | Matches the C4 layer (1 = context, 2 = container, 3 = component, 4 = code/leaf). |
| `parent` | string \| null | Path (relative to this doc's dir) to the parent's `README.md`. Root level-1 doc is `null`. |
| `status` | `"fresh"` \| `"stale"` \| `"missing"` | Self-reported state. `check` ignores this and computes truth from SHAs. |
| `last_synced` | string `YYYY-MM-DD` | Bumped by every Phase-4 update. Informational. |
| `sha_method` | `"git-blob-sha1"` | Mirrors the project config; future-proofing for SHA-256 transition. |
| `references` | list of Reference (see below) | Empty list `[]` is valid for a stub doc. |

## Reference entry

```yaml
- path: <string>            # see "Path resolution" below
  sha:  <40-hex-SHA-1>      # output of `git hash-object <path>`
  kind: source | child
  role: primary | referenced | example   # only meaningful when kind == source
```

| Field | Notes |
|---|---|
| `path` | Required. POSIX-style. Resolution rules below. |
| `sha` | Required. 40 lowercase hex chars. Empty string `""` allowed only for placeholder stubs (will fail validation; treat as drift on next `check`). |
| `kind` | Required. `source` = points at code/asset file; `child` = points at a child doc's `.md` file. |
| `role` | Optional, only honored when `kind: source`. Drives `coverage_roles` in `orphans`. Default behavior: only `primary` roles count toward coverage. |

## Path resolution

- `kind: source`, no leading `./` or `../` → **resolved against repo root** (e.g. `src/lib/foo.ts`).
- `kind: source`, leading `./` or `../` → resolved against doc's directory (escape hatch for assets sitting next to the doc, e.g. `./diagrams/flow.svg`).
- `kind: child` → **always** resolved against doc's directory (e.g. `./04-code/foo.md`, `../03-components/auth/README.md`).

This split keeps source paths short and consistent across the tree, while letting parent→child links stay relative and survive directory renames within the docs subtree.

## Leaf example

```yaml
---
type: leaf
id: web-app/auth/middleware
title: "Auth middleware"
level: 4
parent: ../README.md
status: fresh
last_synced: 2026-04-26
sha_method: git-blob-sha1
references:
  - path: src/lib/auth/middleware.ts
    sha: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
    kind: source
    role: primary
  - path: src/lib/auth/permissions.ts
    sha: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b1
    kind: source
    role: primary
---
```

## Aggregator example (level 3 component)

```yaml
---
type: aggregator
id: web-app/auth
title: "Component: Auth"
level: 3
parent: ../README.md
status: fresh
last_synced: 2026-04-26
sha_method: git-blob-sha1
references:
  - path: ./04-code/middleware.md
    sha: 11aa22bb33cc44dd55ee66ff77889900aabbccdd
    kind: child
  - path: ./04-code/login.md
    sha: 33cc44dd55ee66ff77889900aabbccdd11223344
    kind: child
  - path: docs/diagrams/auth-flow.svg
    sha: 55ee66ff77889900aabbccdd1122334455667788
    kind: source
    role: referenced
---
```

## Validation rules enforced by the parser

- Required fields present; types correct.
- `type ∈ {leaf, aggregator}`.
- `level ∈ {1, 2, 3, 4}`.
- Each `references[].sha` is empty or matches `^[0-9a-f]{40}$`.
- Each `references[].kind ∈ {source, child}`.

A YAML parse error or any rule violation aborts `check`/`orphans` with exit code `7` and a stderr diagnostic listing all offending docs.
