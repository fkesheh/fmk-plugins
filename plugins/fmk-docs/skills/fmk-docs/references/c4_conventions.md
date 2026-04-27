# C4 folder conventions

`fmk-docs` organizes documentation in a 4-level hierarchy modeled on the C4 system (Context → Container → Component → Code). Each level has a fixed directory prefix and naming rule. Following the convention is what lets the diagnostic scripts find docs and lets the bottom-up update loop converge predictably.

## Tree shape

```
docs/
├── .fmk-docs.yml
├── .fmk-docs-ignore
├── 01-context/
│   └── README.md                                 # level 1, root
├── 02-containers/
│   ├── <container>/
│   │   ├── README.md                             # level 2
│   │   └── 03-components/
│   │       ├── <component>/
│   │       │   ├── README.md                     # level 3
│   │       │   └── 04-code/
│   │       │       ├── <unit>.md                 # leaves (level 4)
│   │       │       └── ...
│   │       └── ...
│   └── ...
```

## Levels

| Level | Folder | File | Role |
|---|---|---|---|
| 1 — Context | `01-context/` | `README.md` | The whole system: actors, external systems, top-level boundaries. Root of the doc tree. |
| 2 — Container | `02-containers/<container>/` | `README.md` | A deployable unit (web app, worker, CLI, mobile app). Lists its components. |
| 3 — Component | `02-containers/<container>/03-components/<component>/` | `README.md` | A logical module within a container (auth, billing, sync). Lists its leaves. |
| 4 — Code | `.../<component>/04-code/<unit>.md` | individual leaves | A curated logical unit. May reference one or many source files. |

Levels 2/3/4 are **optional**. A small project might stop at level 2 (just containers, no components, no leaves). Level 1 is mandatory — every project has a single context root.

## Naming rules

- **Aggregators** are always named `README.md`. There is exactly one aggregator per level-2/3 directory.
- **Leaves** under `04-code/` use `kebab-case.md`. The base filename should match the leaf's `id` slug suffix.
- **Container/component directory names** are also `kebab-case`. They appear in the `id` slug and in `path` references.
- **Numeric prefixes** (`01-`, `02-`, `03-`, `04-`) are mandatory and configurable via `docs/.fmk-docs.yml` `levels:` field if the project insists on different prefixes — but defaults are strongly recommended for tool interoperability.

## `id` slug

The `id` slug encodes the doc's place in the tree by joining directory names (skipping the level prefixes) with `/`:

| Doc | `id` |
|---|---|
| `docs/01-context/README.md` | `context` |
| `docs/02-containers/web-app/README.md` | `web-app` |
| `docs/02-containers/web-app/03-components/auth/README.md` | `web-app/auth` |
| `docs/02-containers/web-app/03-components/auth/04-code/middleware.md` | `web-app/auth/middleware` |

Slugs must be repo-unique. They appear in tool output and graph rendering.

## `parent` field

Every doc except the level-1 root has a `parent` field naming the path (relative to the doc's directory) of its parent's `README.md`:

| Doc | `parent` |
|---|---|
| `01-context/README.md` | `null` |
| `02-containers/<container>/README.md` | `../../01-context/README.md` |
| `.../03-components/<component>/README.md` | `../../README.md` |
| `.../04-code/<leaf>.md` | `../README.md` |

This redundancy with the directory structure is intentional: it makes the parent link explicit, machine-checkable, and survivable across moves.

## What goes in each level's body

| Level | Content cues |
|---|---|
| 1 — Context | Mission of the system. Who uses it. External systems it integrates with. List of containers (with `kind: child` references to each container's `README.md`). |
| 2 — Container | The container's responsibility. Tech stack. External dependencies (DB, queue). List of components. |
| 3 — Component | What the component does within its container. Public surface (exports, routes, handlers). List of leaves. |
| 4 — Code (leaf) | What the code unit does. Public API. Behavior notes (edge cases, side effects, perf). Cross-references to siblings or the parent component. |

## Tiny project (no components)

If your container is small enough that splitting into components is overkill, you can keep leaves directly under `02-containers/<container>/04-code/`:

```
docs/02-containers/cli/
├── README.md
└── 04-code/
    ├── parser.md
    └── runner.md
```

The schema doesn't enforce that an aggregator must have child aggregators — it can have child leaves directly. Just make sure each leaf's `parent` points at the container README, not at a missing component README.

## When to split a leaf vs. add another

- **Split** when one leaf would reference more than ~5 source files OR the source files have distinct responsibilities.
- **Combine** when the source files form a tight logical unit (e.g. a middleware + its types + its tests-helpers) and the doc would just repeat itself across leaves.

The schema permits multi-source leaves precisely so you can document by *responsibility*, not by file count.
