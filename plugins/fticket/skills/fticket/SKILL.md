---
name: fticket
description: Operate fticket (FTS, the Factory Ticket System) through its `fts` CLI — the SQLite-backed transactional control plane that coordinates concurrent agents in an AI software factory. Covers initializing a staged pipeline database, creating tickets, atomic claim/renew/start/complete/advance through stages, dependencies, resource leases with FIFO waitlists, the scheduler sweep, and diagnosing stuck work (board, why, triage, doctor, events, serve). TRIGGER whenever the user or task mentions fticket, FTS, `fts` commands, factory.db, factory tickets, ticket stages/queues, claiming or advancing a ticket, worker claims, resource leases, dead-letter or orphan triage, or wiring agents/workers to a ticket pipeline — even if they just say "check the board" or "why is ticket N stuck" in a factory context. SKIP for GitHub/Jira/Linear issues or generic project-management tickets that are not backed by an fticket database.
---

# fticket — drive the Factory Ticket System (`fts`)

fticket is the transactional coordination core for an AI software factory. It owns all
control-plane state for concurrent agents: task status, atomic claims, dependencies,
resource leases, and an immutable history/event stream — all in a single SQLite file
(WAL mode, single writer, one `BEGIN IMMEDIATE` transaction per operation, so claims are
race-free by construction). Task folders stay pure immutable artifact storage; FTS holds
who is working on what, what's blocked, and what's next.

- **CLI:** `fts` (also `python -m fticket`). Library: `from fticket import FTS, Mode`.
- **Requires:** Python >= 3.13. Zero runtime dependencies (stdlib only).
- **Run without installing:** `uvx fticket ...` (>= 0.1.1 ships both `fticket` and `fts`
  as the same CLI). Add `--python 3.13` if the default interpreter is older than the
  floor. On 0.1.0 only `fts` exists, so use `uvx --from fticket fts ...` there.
- **Install:** `uv tool install fticket` (puts `fts` and `fticket` on PATH) or
  `uv pip install fticket`; from a checkout, `uv sync` / `uv run fts ...`.
- **Database:** `--db PATH`, default `factory.db`. The flag works before or after the
  subcommand (`fts board --db f.db` is fine). Read commands open the DB read-only.
- **No env vars.** All configuration is CLI flags plus the durable `config` table.

## Quickstart — the happy path

```bash
fts init --stages code,review,qa,deploy        # last stage is terminal
fts create --title "build parser" --stage code --folder tasks/0001   # prints ticket id
fts claim --stage code --worker coder-1        # atomic: next ready ticket, or "nothing claimable in code"
fts start --ticket 1 --worker coder-1          # claimed -> in_progress
fts complete --ticket 1 --worker coder-1       # in_progress -> done (records reached_stage)
fts advance --ticket 1 --worker coder-1 --to-stage review   # done -> queued at next stage, unowned
fts board                                      # stages x status grid
```

Run `fts scheduler` (or periodic `fts tick`) somewhere so expired claims/leases get swept
and waitlists/blocked tickets get promoted — nothing else does this.

## Ticket lifecycle

Statuses: `queued`, `claimed`, `in_progress`, `done`, `rejected`, `blocked`, `dead_letter`.

Legal transitions:

- `queued` → claimed only via `fts claim` (never via `transition`)
- `claimed` → in_progress, queued, blocked, rejected, dead_letter
- `in_progress` → done, queued, blocked, rejected, dead_letter
- `done` → queued **and the stage must change** — that is `fts advance`
- `blocked` → in_progress, queued, dead_letter
- `rejected` → queued, dead_letter
- `queued` → dead_letter (operator kill); `dead_letter` → queued (`fts revive`)

Rejects bounce a ticket back; after `bounce_limit` bounces (default 3) it dead-letters.
Dead-lettering a producer orphans its downstream dependents — `fts triage` surfaces both.

## Command reference

Read-only: `board show why dag queues resources triage stats events doctor config get`.
Write: `init create claim renew start complete advance transition reject dead-letter
revive add-dep acquire release register-resource tick scheduler config set`.

### Setup & tickets

```bash
fts init [--stages CSV] [--bounce-limit INT] [--claim-ttl-ms INT] [--lease-ttl-ms INT]
fts create --title STR --stage STR --folder STR [--priority INT] [--epic INT] \
           [--kind task|epic] [--dep ID:STAGE ...]        # prints new ticket id on stdout
fts add-dep --ticket INT --depends-on INT --until STR     # errors print the cycle path
```

`--folder` is the ticket's immutable artifact path (UNIQUE — folders never move).
`--dep 7:review` means "blocked until ticket 7 has reached stage review".

### Worker loop (each agent = one `--worker` id)

```bash
fts claim --stage STR --worker STR [--ttl-ms INT]
fts renew --ticket INT --worker STR [--ttl-ms INT] [--epoch INT]   # heartbeat the claim
fts start --ticket INT --worker STR [--epoch INT]
fts complete --ticket INT --worker STR [--epoch INT] [--note STR]
fts advance --ticket INT --worker STR --to-stage STR [--note STR]
fts reject --ticket INT --worker STR --reason STR [--to-stage STR] [--epoch INT]
fts release --ticket INT --worker STR                    # give the claim back to the queue
```

Claims expire after `claim_ttl_ms` (default 5 min) unless renewed; the scheduler sweep
requeues expired work. `--epoch` is an optional fencing token: pass the epoch you got at
claim time so a stale worker (whose claim expired and was re-issued) cannot write.

### Escape hatches & operator actions

```bash
fts transition --ticket INT --to STATUS --actor STR [--stage STR] [--worker STR] [--epoch INT] [--note STR]
fts dead-letter --ticket INT --actor STR --reason STR
fts revive --ticket INT --actor STR [--to-stage STR]
```

`transition` walks any legal edge except into `claimed`. Prefer the specific verbs.

### Resources (leases with FIFO waitlists)

```bash
fts register-resource --name STR [--policy both|exclusive_only|shared_only]
fts acquire --resource STR --ticket INT --worker STR [--mode exclusive|shared] [--ttl-ms INT]
fts release --ticket INT --resource STR
fts resources [--json]                                   # leases + waitlists
```

Use for contended things like a staging environment or deploy slot. If the resource is
taken, `acquire` waitlists the ticket FIFO; the scheduler grants it when freed. Leases
expire after `lease_ttl_ms` (default 10 min).

**`fts release` is overloaded:** pass exactly one of `--worker` (release a claim) or
`--resource` (release a lease). Both or neither exits 2.

### Scheduler

```bash
fts tick [--verbose]              # one sweep: expire TTLs, promote waitlists, unblock
fts scheduler [--interval-ms INT] # loop tick until Ctrl-C (default 1000ms)
```

### Observability & diagnosis

```bash
fts board [--json]                # stages x status grid — first stop
fts show TICKET [--json]          # detail + claim + deps + leases + history
fts why TICKET                    # one-screen root cause of non-progress
fts dag [--epic INT] [--format ascii|dot|json]
fts queues [--json]               # queue depth per stage
fts triage [--json]               # dead-letters (with reason) + orphans with root ids
fts stats queue|blocked|bounce|cycletime
fts events [--after CURSOR] [--limit INT] [--type T ...] [--follow]
fts doctor                        # invariant/health report
fts serve [--port INT]            # read-only dashboard, loopback-only (default port 8787)
fts config get KEY | fts config set KEY VALUE
```

Diagnosing a stuck ticket: `fts why <id>` first, then `fts show <id>` for full state,
`fts triage` for dead-letters/orphans, `fts doctor` for systemic invariant violations.

The append-only `events` stream (monotonic `cursor`) is the integration hook for external
orchestrators: poll `fts events --after <last-cursor>` or tail with `--follow` (1s poll).

## Config tunables

Durable in the `config` table, live-reloaded by running processes on the next write tx:
`bounce_limit=3`, `claim_ttl_ms=300000`, `lease_ttl_ms=600000`, `tick_interval_ms=1000`,
`sweep_batch=500`, `synchronous=NORMAL` (OFF|NORMAL|FULL|EXTRA).

## Gotchas

- `claimed` is reachable only via `claim` — `transition --to claimed` is rejected.
- `advance` must change the stage; done→queued at the same stage is illegal.
- Stages are display/ordering metadata, not enforced routing — `advance --to-stage` can
  target any stage; the seeded order is convention. Last `--stages` entry is terminal.
- `history`, `events`, and `reached_stages` are immutable/append-only (SQLite triggers) —
  the audit trail cannot be edited, so don't try to "fix" history rows.
- `fts serve --interval` is accepted but currently a no-op (refresh is baked into the JS).
- All timestamps are integer epoch-milliseconds.
- One `FTS` instance = one connection, single writer. Many workers = many processes each
  running `fts` commands; SQLite + `BEGIN IMMEDIATE` serializes them safely.
