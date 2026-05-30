---
name: to-c4
description: >-
  Generate a C4-model architecture map of a codebase as Structurizr DSL (docs/c4/workspace.dsl) —
  Context / Container / Component levels — so the system is graspable at a glance. Reuses docs/wiki
  (workspaces → containers, server-communication → relationships) if present; bundles a Docker
  helper (c4.sh) to validate the DSL, view it live in the Structurizr UI, and export Mermaid to
  embed in the wiki or a PR. Stack-agnostic. Trigger: /to-c4.
---

# /to-c4 — codebase → C4 architecture diagrams (Structurizr DSL)

Produce a layered **C4** view of the system so anyone can understand the architecture fast:

- **L1 Context** — the system, its **people/actors**, and the **external systems** it talks to.
- **L2 Container** — the **runnable/deployable units** (apps, services, SPAs, databases, brokers,
  workers) and the relationships + protocols between them. *This is the most valuable level.*
- **L3 Component** — inside the **focus container** (the one you'll work in), the major
  components/modules/layers and how they relate.
- **L4 Code** — **skipped by default** (use the IDE; C4 treats it as optional/auto-generated).

The output is **Structurizr DSL** (`workspace.dsl`) — text, diffable, version-controllable — plus a
helper to validate/view/export.

## Operating rules

1. **Stack-agnostic.** C4 is architecture-level; it maps to any language/framework. Discover the
   containers from the repo — don't assume.
2. **Don't over-model.** Containers = separately **runnable/deployable** things. A shared library
   or package is **not** a container — it's a component of the container that uses it (or omit it at
   container level). Keep L1/L2 to a readable handful of boxes.
3. **Ground every element.** Each person/container/component/relationship comes from real evidence
   (a manifest, an entrypoint, a server-comms call site). Reuse the wiki's citations where possible.
4. **Validate before declaring done.** The DSL must pass `c4.sh validate`.

## Inputs

- **Target repo** — arg, else the current repo.
- **`docs/wiki/`** *(big head start if present)* — its **workspace** pages are candidate
  containers, **dimension-server-communication** gives the relationships + protocols, **app
  structure** + the **traced feature** give the focus container's components, **scope** tells you
  which container you'll work in. If there's no wiki, do a quick recon (manifests, entrypoints,
  how services talk).
- **Focus container** *(optional)* — the container to expand at L3 (default: the editable app from
  the scope page, or the primary app).
- **Output dir** — `docs/c4/` (holds `workspace.dsl`, `c4.sh`, and `exports/`).

## Phase 0 — Gather the architecture facts (reuse the wiki)

Identify, with evidence:
- **People / actors** — end users, admins, external callers.
- **Software system(s)** — the product boundary (usually one).
- **Containers** — every runnable/deployable unit: each app/service, the SPA/web app, datastores,
  message brokers/realtime servers, background workers, plus **external systems** it integrates
  with. Note each one's **technology** (from its manifest) and **purpose**.
- **Relationships** — who calls whom, in which **direction**, over which **protocol** (HTTP/REST,
  RPC/gRPC, WebSocket, queue, SQL…). The server-communication dimension is the source of truth.
- **Components of the focus container** — its major modules/layers (routing, data layer, server
  comms client, UI, state) and their relationships.

## Phase 1 — Author `docs/c4/workspace.dsl`

Write valid Structurizr DSL: a `model {}` (people, system, containers, components, relationships)
and `views {}` (a context view, a container view, and a component view for the focus container) plus
`styles`. You may fan out **one subagent per container** to enumerate its components, then merge —
but the DSL is one coherent artifact, so synthesize centrally. Skeleton (names illustrative):

```dsl
workspace "<System>" "<one-line purpose>" {
  model {
    user = person "User" "<who they are>"

    sys = softwareSystem "<System>" "<what it does>" {
      web = container "Web App" "<purpose>" "<tech, e.g. from manifest>" {
        routing = component "Routing / entrypoints" "<…>"
        data    = component "Data layer" "<…>"
        client  = component "Server-comms client" "<protocol>"
        ui      = component "UI components" "<…>"
        routing -> data "loads via"
        data -> client "calls"
      }
      api = container "API" "<purpose>" "<tech>"
      db  = container "Database" "<purpose>" "<engine>"
    }

    ext = softwareSystem "<External Service>" "<why>" {
      tags "External"
    }

    user -> web "Uses"
    web  -> api "Calls" "<HTTP/RPC/WS>"
    api  -> db  "Reads/writes" "<SQL/driver>"
    api  -> ext "Integrates" "<protocol>"
  }

  views {
    systemContext sys "Context" { include *; autolayout lr }
    container     sys "Containers" { include *; autolayout lr }
    component     web "Components" { include *; autolayout lr }

    styles {
      element "Person"   { shape person }
      element "Database" { shape cylinder }
      element "External" { background #888888 }
    }
    theme default
  }
}
```

Keep it honest: model only containers that exist; mark anything inferred-not-confirmed in a `#`
comment so it's reviewable.

## Phase 2 — Drop in the helper + a README

- Copy this skill's asset **`assets/c4.sh`** → `docs/c4/c4.sh` (chmod +x).
- Write `docs/c4/README.md`: the three views, what each container is, and the commands below.

## Phase 3 — Validate, export, view

From `docs/c4/` (Docker required — the helper runs Structurizr in containers):

- **Validate:** `./c4.sh validate` — must pass before you call it done. Fix DSL errors at the source.
- **Export Mermaid** (to embed in the wiki / a PR): `./c4.sh export mermaid` → `exports/*.mmd`.
  Optionally drop the context + container diagrams into a wiki page (e.g.
  `docs/wiki/dimension-architecture.md`) or link them from `HOME.md` — Mermaid renders on GitHub and
  most viewers.
- **View live (interactive):** `./c4.sh view` → Structurizr UI at `http://localhost:9010` (browse
  all levels, drill down). `./c4.sh stop` when done.

If Docker isn't available, still write + hand off the DSL (it's the artifact); note that
validate/view/export need Docker.

## Relationship to the rest of the pipeline

`/to-wiki` gives the **prose** map (conventions, traced feature, scope); `/to-c4` gives the
**visual structural** map (boxes-and-arrows across levels). Run `/to-c4` after `/to-wiki` to reuse
its facts. The exported Mermaid can live inside the wiki so the two stay together. Like the wiki,
the C4 model can drift as the code changes — re-run `/to-c4` (or just re-export) after structural
edits.

## Why this exists

Prose explains *how a feature flows*; C4 explains *how the system is shaped*. For understanding an
unfamiliar codebase fast — especially the container boundaries and who-talks-to-whom — a validated
diagram you can view and drill into beats paragraphs.
