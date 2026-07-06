---
name: plan-migration
description: Executor discipline for schema and data migrations. Forces you to classify the change (additive vs destructive vs data-transforming), plan expand-migrate-contract for anything non-additive, state deploy-window compatibility at every step, name the lock behavior and scale class of each DDL statement, batch large backfills, write a rollback story per step, and verify data integrity against a pre-written expected result. Exists to stop the migration that runs fine on a laptop and takes down prod — a table lock on a hot table, old code crashing against new schema mid-deploy, no rollback, or silent data loss on a rename or backfill. TRIGGER on phrases like "write a migration", "add a column", "drop this column", "rename this field", "change the column type", "backfill this data", "add an index", "add a NOT NULL constraint", "alter this table", "schema migration", "database migration", "reshape this table", "split this table". SKIP when the change is a pure application-code edit with no schema or data reshape, a read-only ad-hoc query, or a brand-new table in a greenfield database with no live traffic and no dependent running code.
---

# plan-migration — deploy-safe schema and data migrations

Forces a disciplined protocol on every schema or data migration so the change that passed on a dev laptop does not take down production. Before any migration file is written, you classify the change, choose the multi-deploy protocol it requires, state which code versions must coexist with each step, name the lock behavior and scale of every DDL statement, and write down a rollback story and a verification query with its expected result.

This skill exists because the most common migration failure is treating prod like the dev database: a single migration that adds and drops in one shot, a `NOT NULL DEFAULT` on a 200M-row hot table that locks it for minutes, an `ALTER` that the currently-running old app version cannot tolerate, a rename mistaken for an additive change that quietly drops a column of data, or a `UPDATE users SET ...` with no `WHERE` batching that pins a replica for an hour. Each is invisible on a small local database and catastrophic under production scale and rollout timing. This protocol makes those failure modes mechanically hard to reach.

## The Hard Gate

You may NOT write, finalize, or apply a migration until the migration plan (a `## Migration plan` block you produce first) shows ALL of the following:

1. **Classification** of every logical change as `additive`, `destructive`, or `data-transforming` (definitions below). A change touching multiple columns/tables is classified per logical change, not once for the file.
2. For every non-additive change: an **expand → migrate → contract sequence split across separate deploys**, with the contract (removal) step explicitly deferred to a later deploy — never the same one as the expand.
3. **Deploy-window compatibility** stated per step: which app code versions run against the schema this step produces, and that each named version tolerates it (including the rollback direction).
4. **Lock behavior + scale class** named for every DDL statement, on the target engine, against the target table's size and traffic.
5. A **rollback story** per step: `reversible` (down-migration written and tested) or `forward-only` (declared, with a mitigation plan). No step may be "irreversible and undeclared." Destructive steps additionally name a verified backup/snapshot point.
6. For every backfill/transform: a **verification query with its expected result written down before the backfill runs**.

If any of these is missing, do not write the migration. Plan more. This gate applies even when the change "looks trivial" — the trivial-looking ones (a rename, a `NOT NULL`, an unbatched `UPDATE`) are exactly the ones that take prod down.

## 1. Classify the change first

Misclassification is how data gets lost. Classify each logical change into exactly one bucket:

- **Additive** — introduces new schema that nothing yet depends on and that no running code can break against: a new *nullable* column (no default rewrite), a new table, a new index, a new nullable-friendly enum value. Additive changes are the only ones that may ship as a single migration in a single deploy, because old code ignores what it does not know about.
- **Destructive** — removes or narrows: drop column/table/index, rename (see below), change a column type, tighten a constraint (add `NOT NULL`, add a `CHECK`, add a unique constraint, shrink a varchar). Destructive changes can break running code and can lose data. They are never single-shot.
- **Data-transforming** — the schema shape may be stable but row *contents* move or reshape: backfill a new column, split one column into two, merge tables, normalize/denormalize, recompute a derived value. Risk is data correctness and long-running locks, not just structure.

The rename trap: **a rename is not additive.** `ALTER TABLE ... RENAME COLUMN a TO b` looks like a one-liner but it is destructive *and* data-transforming — every reader/writer of `a` breaks the instant it runs, and if you instead "rename" by adding `b` and dropping `a` in one migration you have silently discarded `a`'s data for any code still writing it. Treat every rename as expand-migrate-contract: add `b`, dual-write/backfill from `a`, switch reads to `b`, verify, then drop `a` in a later deploy.

Write the classification into the plan under `## Classification`, one line per logical change.

## 2. Expand → Migrate → Contract (the default for anything non-additive)

Non-additive changes ship as a sequence of small migrations across multiple deploys:

1. **Expand** — add the new shape *alongside* the old. New column is nullable or has a safe non-rewriting default; new table coexists with old; both old and new indexes present. Nothing is removed. Old code still works because the old shape is untouched.
2. **Migrate** — populate the new shape: dual-write from application code (writes go to both old and new) and/or backfill existing rows (see §4 for batching). Reads still come from the old shape.
3. **Switch reads** — flip the application to read from the new shape. Old shape is now write-only (kept in sync) but no longer authoritative.
4. **Verify** — confirm new and old agree (see §6). Soak: let it run in prod long enough to trust, and long enough that a rollback to the previous code version is still safe.
5. **Contract** — in a *later deploy*, remove the old shape (drop the old column/table/index, stop dual-writing). Only do this once no deployed or rollback-reachable code version references the old shape.

**Gate: a single migration that both adds and removes the same logical data is wrong — split it.** Adding `full_name` and dropping `first_name`/`last_name` in one migration destroys the ability to roll back and destroys any concurrent writes to the old columns. The expand and the contract belong to different deploys with a migrate-and-verify window between them.

Additive changes skip this — they are already just an "expand" with no matching contract.

## 3. Deploy-order compatibility

At every instant of a rollout, code and schema versions are mismatched: the migration lands, then instances restart one at a time, so **old code runs against new schema** for a window. On rollback, the reverse: **new-ish data flows through old code**. A migration is only safe if it tolerates every code version it can coexist with during its window.

For each step, state explicitly: *"After this step, schema is at Sₙ; app versions {V_prev, V_curr} both run against Sₙ during rollout, and V_prev on rollback. Both tolerate Sₙ because …"*. Concretely this means:

- An **expand** step must be tolerated by the *current* (pre-deploy) code — that code will run against the new schema before it is replaced. New columns must be nullable or default-safe; new constraints must not reject writes the old code still makes.
- A **contract** step must not run until no code version that could be live — including one you might roll back to — still references the old shape.
- Adding a `NOT NULL` column that old code does not populate will make old code's `INSERT`s fail the moment the migration lands. That is a deploy-window break even though the final state is fine.

This is **deploy-window compatibility**, not the banned "backwards compatibility by default." You are not carrying old shapes forever — you are keeping old and new coexisting only across the rollout window, and the contract step deliberately ends that window. State when the window closes.

Write this into the plan under `## Deploy compatibility`, per step.

## 4. Locking and scale

A statement that is instant on a 1k-row dev table can lock a 200M-row prod table for minutes and stall every request behind it. For each DDL statement, name two things in the plan: its **lock behavior on the target engine** and the **table's size/traffic class** (e.g. "cold, <10k rows" vs "hot, 200M rows, ~5k writes/s").

Guidance (verify against your engine's version docs — locking semantics change between versions):

- **Index creation** must use the engine's online/concurrent variant on any non-trivial table: Postgres `CREATE INDEX CONCURRENTLY` (cannot run inside a transaction block; can leave an `INVALID` index that must be dropped and retried on failure), MySQL/InnoDB online DDL (`ALGORITHM=INPLACE, LOCK=NONE`), etc. A plain `CREATE INDEX` takes a write lock for the whole build.
- **Adding a column**: on modern Postgres a nullable column, or a column with a *constant* default, is metadata-only and fast; a `volatile` default forces a full table rewrite. On MySQL, behavior depends on version and `INSTANT`/`INPLACE` algorithm support. Name which path yours takes.
- **Adding `NOT NULL` with a default on a huge table** is the classic footgun. On older engines it rewrites and long-locks the whole table. Safe pattern: add the column nullable → backfill in batches → add the `NOT NULL`/`CHECK` constraint as `NOT VALID` then `VALIDATE CONSTRAINT` in a separate, lighter-locking step. State the exact path for your engine and version.
- **Long-running backfills go in batches, never one giant statement.** A single `UPDATE ... SET` over millions of rows holds locks and bloats the transaction/undo log for its entire duration and cannot be interrupted cleanly. Batch by primary-key range or a `LIMIT` loop, commit each batch, record progress (last processed key) so the job is **resumable** after a crash or deploy, and pace batches so replica lag and lock contention stay bounded. Track progress and expose it (log every N batches).
- Take the shortest lock possible and take it late: set a `lock_timeout`/`statement_timeout` so a blocked migration fails fast instead of queueing every request behind it.

Write this into the plan under `## Locking & scale`, one line per DDL statement.

## 5. Rollback story per step

Every step declares one of exactly two rollback dispositions — no step may be silently irreversible:

- **`reversible`** — a down-migration is written and tested (§7 exercises it). Most expand steps are trivially reversible (drop the thing you added). Prefer reversible.
- **`forward-only`** — declared explicitly, with a written mitigation plan (how you recover if this step is bad: fix-forward migration, restore from the snapshot named below, feature-flag the read path). A dropped column's data is gone; a lossy type change cannot be un-narrowed. Own that in writing.

**Gate: "irreversible and undeclared" is not allowed.** If you cannot write a down-migration, you must write "forward-only because <reason>" plus the mitigation.

**Destructive and lossy steps require a verified backup/snapshot point** named in the plan: a snapshot taken and confirmed restorable immediately before the contract step, or a proven point-in-time-recovery window covering it. "We have backups somewhere" is not a snapshot point.

Migration files are **immutable once merged**: never edit a migration that has run in any shared environment — other databases have already applied the old version and will never re-run it. Fix forward with a *new* migration. Editing a merged migration guarantees divergent schemas across environments.

Write this into the plan under `## Rollback`, per step.

## 6. Data integrity verification

Every backfill or transform ends with a **verification query whose expected result you wrote down before running the backfill.** Deciding what "correct" means only after seeing the numbers is how you rationalize a silent loss. Pick checks that would actually catch the failure:

- **Row counts / null counts**: e.g. "after backfill, `SELECT count(*) FROM users WHERE new_col IS NULL` must be 0" — written before the run.
- **Checksums / aggregates**: `sum`, `count`, or a hash over old vs new columns must agree (e.g. `sum(old_cents) == sum(new_amount*100)`).
- **Spot invariants**: sample N rows and assert the transform holds (`new_full = old_first || ' ' || old_last`), and assert boundary rows (nulls, empty strings, unicode, max values) transformed correctly.
- **Dual-write drift**: while dual-writing, a periodic query comparing old vs new must report zero divergence before you switch reads.

Write the expected result next to the query in the plan under `## Verification`, then record the actual result after running. A mismatch blocks the switch-reads and contract steps.

## 7. Test the migration itself

The migration is code; test it like code, at production-relevant scale:

- Run it against a **realistic-scale copy or seeded fixture** (a prod-shaped clone or a fixture with representative row counts, null distributions, and edge-case rows), not just an empty dev schema. A migration that is correct and fast on 10 rows can be wrong or catastrophically slow on 10M.
- Run it **up AND down**: apply, then roll back, then re-apply. A down-migration that was never executed is not a rollback plan — it is a hope.
- **Test the application code at both schema versions**: old code against post-expand schema (deploy-window), new code against post-contract schema. Both must pass their suites.
- For backfills, run the §6 verification query on the test data and confirm it matches the pre-written expected result.

## Separation of concerns

Never mix application-logic changes and a migration in the same deploy step. A deploy that both alters the schema and changes how code uses it has two things that can fail and no clean rollback: rolling back the code leaves the schema changed, rolling back the schema leaves the code broken. Ship the migration (expand) first, deploy code that uses the new shape second, contract third. Each deploy changes one thing.

Additive-only exception: a purely additive migration plus the code that first reads the new column can sometimes ship together *if* the code tolerates the column being absent (mid-rollout), but the safe default remains: migration first, code second.

## Definition of done

- The `## Migration plan` block exists and satisfies all six Hard Gate criteria.
- Every logical change is classified; every non-additive change has an expand/migrate/contract split across deploys, with the contract deferred.
- Every DDL statement names its lock behavior and the table's scale class; backfills are batched, progress-tracked, and resumable.
- Every step has a `reversible` or declared `forward-only` rollback disposition; destructive steps name a verified snapshot point.
- Every backfill has a verification query with a pre-written expected result, and the recorded actual result matches.
- The migration ran up and down against a realistic-scale fixture; app suites pass at both schema versions.
- No migration file mixes add-and-remove of the same logical data, and no deploy step mixes app-logic changes with the migration.
- No secrets in migration files; migrations that touch permissions/RLS/row ownership preserve authorization invariants (never widen access as a side effect).

## Return format

Return to the orchestrator ONLY a structured summary — never full file contents:

- **Change summary**: one line per logical change with its classification.
- **Migration steps**: ordered list of migration files created, each with `file:line` ref, its EMC role (expand/migrate/contract), and the deploy it belongs to.
- **Deploy-window statement**: which code versions coexist with each step.
- **Lock & scale**: per DDL statement, lock behavior and table scale class.
- **Backfill**: batch strategy, resumability mechanism, and the verification query with expected vs actual result.
- **Rollback**: per step disposition (reversible/forward-only) and snapshot point for destructive steps.
- **Gate results**: up/down test result at realistic scale; app-suite result at both schema versions.
- **Open risks**: anything that needs a human decision (soak duration, when to schedule the contract deploy, prod snapshot ownership).

## Anti-patterns

- **Add-and-drop in one migration** — destroys rollback and any concurrent writes to the old shape. Split into expand and a later contract.
- **Treating a rename as additive** — a rename is destructive + transforming; the "add new, drop old" shortcut silently loses data. Always EMC it.
- **`NOT NULL DEFAULT` on a hot, huge table in one shot** — long table-lock and/or full rewrite that stalls prod. Add nullable → batch-backfill → validate constraint separately.
- **One giant `UPDATE` for a backfill** — holds locks and bloats the transaction log for its whole duration and cannot resume. Batch, commit, track progress.
- **Plain `CREATE INDEX` on a large table** — write-locks the table for the whole build. Use the engine's concurrent/online variant.
- **Migration that only the new code tolerates** — breaks old instances during the rollout window. State deploy-window compatibility per step.
- **Editing a merged migration** — other environments already ran the old version and will never re-run it; schemas diverge. Fix forward with a new migration.
- **Verifying after deciding it "looks right"** — write the expected result before the backfill; a post-hoc "looks fine" rationalizes silent loss.
- **Testing only on an empty dev schema** — masks lock duration, slow backfills, and edge-case rows. Test at realistic scale, up and down.
- **Migration + app-logic change in one deploy** — two failure modes, no clean rollback. One thing per deploy.

## Worked micro-examples

**Input:** "Rename `users.email` to `users.email_address`."

Correct behavior: classify as destructive + data-transforming, NOT additive. Reject the one-migration rename.
- Deploy 1 (expand): add nullable `email_address`; app dual-writes to both `email` and `email_address`. Old code unaffected (still reads/writes `email`). Reversible: drop `email_address`.
- Deploy 2 (migrate): batched backfill `email_address = email` where null, in PK ranges of 10k, progress-tracked. Verify (pre-written): `count(*) WHERE email_address IS NULL` must be 0 and `count(*) WHERE email_address <> email` must be 0.
- Deploy 3 (switch reads): app reads `email_address`; still writes both. Verify zero drift for a soak window.
- Deploy 4 (contract, later): stop dual-writing, drop `email`. Forward-only; snapshot taken and verified before drop. Only ships once no rollback-reachable version reads `email`.

**Input:** "Add a `status NOT NULL DEFAULT 'active'` column to `orders` (180M rows, hot)."

Correct behavior: do not add `NOT NULL DEFAULT` in one statement on a hot 180M-row table. Classify additive-column-but-constraint-tightening.
- Step 1 (expand): add `status` nullable, no default (metadata-only on modern Postgres; name the engine/version path). Deploy-window: current code ignores the unknown column — safe.
- Step 2 (migrate): batched backfill `status='active'` where null; verify `count(*) WHERE status IS NULL == 0`.
- Step 3: add the default for new rows and add the `NOT NULL` as `NOT VALID` then `VALIDATE CONSTRAINT` in a separate lighter-locking step, after app writes `status` explicitly.
- Each step: lock behavior and rollback disposition named. Never the single one-line `ALTER`.
