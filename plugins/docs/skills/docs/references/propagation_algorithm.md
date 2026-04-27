# Propagation algorithm

This file specifies how staleness is detected (`check`) and how it should be resolved (Phase 4 update loop). Read this when:
- a `check` run produces output you don't understand,
- the update loop won't converge after several waves,
- you're implementing or modifying the staleness logic.

## Single rule for staleness

For every doc, for every entry in `references[]`:

```
recorded_sha == git hash-object(resolved_path)  ?  fresh  :  drift
```

If `resolved_path` does not exist on disk → `missing`.

**No transitive-staleness pass is performed.** Staleness is computed independently per-reference. Cascade emerges from the fact that updating a doc changes the file's own git-blob SHA, which mismatches the parent aggregator's stored child-SHA on the next `check` run.

## Path resolution rules

- `kind: source`, no leading `./` or `../` → resolved against repo root.
- `kind: source` with leading `./` or `../` → resolved against the doc's directory.
- `kind: child` → always resolved against the doc's directory.

## `check` algorithm (pseudocode)

```
function check(repo_root, cfg):
    docs_root = repo_root / cfg.docs_root
    docs = walk_docs(docs_root, repo_root)        # parses every .md w/ frontmatter
    entries = []
    cache = {}                                    # path -> sha (memoize per run)
    for doc in docs:
        for ref in doc.references:
            target = resolve(ref, doc, repo_root)
            if not exists(target):
                entries.append(StaleEntry(
                    doc, ref, status="missing", was=ref.sha, now=None))
                continue
            cur = cache.get(target) or git_hash_object(target)
            cache[target] = cur
            if cur != ref.sha:
                entries.append(StaleEntry(
                    doc, ref, status="drift", was=ref.sha, now=cur))
    # sort by depth desc, then doc path, then ref path
    return sorted(entries, key=lambda e: (-e.doc_level, e.doc_path, e.ref_path))
```

## Why bottom-up converges

Claim: the update loop, applied bottom-up, terminates in at most `D` waves where `D` is the depth of the doc tree (max 4 for C4).

**Argument**:
1. After wave `w`, every doc at level `D - w + 1` is fresh (we just rewrote them and re-stamped their `references[]` SHAs against current targets).
2. The act of saving a fresh doc changes its own file's git-blob SHA.
3. The parent at level `D - w` had a stored child-SHA pointing at the *old* file SHA → mismatch → parent shows drift on the next `check`.
4. Levels above `D - w + 1` that were not stale before remain unchanged in this wave (we limited the wave to the deepest level only).
5. So after wave `w`, the deepest stale level is at most `D - w`. After wave `D`, the deepest stale level is `0`, i.e. the report is empty.

The strict-decrease property (deepest stale level shrinks by ≥ 1 per wave) is what guarantees termination.

## Why top-down does NOT converge

If you tried to update a parent before its child:
1. Re-stamp parent's `references[].sha` for the child.
2. The recorded SHA equals the child's *current* file SHA — but the child is still stale (its own source-SHAs don't match current code).
3. You then update the child. Child's body changes. Child's file SHA changes.
4. Parent's stored child-SHA no longer matches → parent flips stale on next `check`.
5. You're back to step 1. No fixed point.

Bottom-up avoids this because by the time you stamp a parent's child-SHA, the child has already been saved with its final body.

## Why batching across levels in one pass is unsafe

Same argument: if you write a parent before its child has been saved in this pass, the parent's recorded child-SHA is stale-on-arrival.

**Always re-run `check` between waves.** It's cheap, and it prevents this whole class of bugs.

## Edge cases

### Renamed source file (path missing, content unchanged)

`check` flags `status=missing` for the affected reference because the resolved path doesn't exist.

To detect a rename without manual intervention, scan `git ls-files` for any file whose current `git hash-object` equals the recorded SHA. If found and unique, propose the rename to the user (don't auto-rewrite). If multiple matches, list them and ask which is the new home.

### Deleted source file

`status=missing`. Remove the reference from the leaf. If `references` becomes empty after removal:
- Set `status: missing` on the leaf (it's documented but the code is gone).
- Do **not** auto-delete the leaf — it's a useful tombstone and the user may want to migrate the prose into a sibling.

### Multiple leaves reference the same file

Allowed and supported. `check` memoizes `git hash-object` per run, so each path is hashed once regardless of how many leaves reference it.

### File renamed AND content changed

`check` reports `missing` (path gone). The user must manually pick the new path; SHA-match detection won't help. Update the `path` and re-stamp the SHA.

### Body edited but `references[]` untouched

The doc's full-file SHA changes → its parent aggregator's stored child-SHA flips stale on next `check`. The cascade is automatic. No `body_hash` field is needed because file SHA already covers it.

### Cosmetic frontmatter edit (e.g., `last_synced: 2026-04-27`)

Same as above — file SHA changes, parent flips stale. Acceptable signal: a frontmatter bump is an event worth noting upward. The update loop still converges (each wave strictly reduces deepest stale level).

### YAML parse error

Exit code `7`. The script lists every offending doc with its YAML error. Fix all of them before running again — partial-tree analysis would produce misleading results.

### Submodules

Disabled by default. Enable with `recurse_submodules: true` in `docs/.fmk-docs.yml`. When enabled, `git ls-files --recurse-submodules` returns submodule files; `git hash-object` works the same way.

## Performance

- `walk_docs` is O(number of docs).
- Per-run `git hash-object` cache is O(number of distinct referenced paths).
- For repos with thousands of source files, prefer batching: `git hash-object --stdin-paths` (the `git.py` library exposes `hash_object_batch`). The `check` algorithm currently calls one-at-a-time but caches; if the doc tree gets large enough that this matters, switch to batched hashing across all references seen in `walk_docs`.

## Diagnosing "loop won't converge"

If after Phase-4 you keep seeing drift:

1. Re-run `check --format json`. Look at the **deepest** entries.
2. For each: did you actually save the file, or did you write it elsewhere?
3. Check `git status` — did the doc's content change at all?
4. Re-compute `git hash-object` of the referenced child (or source) by hand and compare to the recorded SHA. They must equal.
5. If you batched updates across two levels in one wave, redo: update only the deepest level in this wave, then re-run `check`.
