---
name: upgrade-dependency
description: Executor discipline for upgrading or adding a single dependency — read every changelog across the version range, map each breaking change to actual codebase usage, regenerate and review the lockfile, vet new packages against the registry, adapt code to the new API properly, and verify by behavior. Blocks the "bump and hope" failure where you change the version number, see it install and the build go green, and ship — silently inheriting runtime breaking changes, changed defaults, transitive-dependency shifts, and supply-chain risk. TRIGGER on phrases like "upgrade this dependency", "bump the version of X", "update X to the latest", "add package Y", "install this library", "upgrade the framework", "move to X v3", "update our dependencies", "apply this security patch / CVE fix", "migrate to the new major version", "add a new dependency for X", "npm update / pip upgrade this". SKIP when the task is implementing app behavior with no manifest change (use implement-feature), debugging a failure whose cause is not a known version bump (use debug), or a broad "update everything" sweep with no single package in scope — split that into one-dependency changes first.
---

# upgrade-dependency — discipline for moving a dependency safely

Enforces how a careful engineer moves a dependency version — or introduces a new one — instead of the default reflex a capable model reaches for: edit the version string in the manifest, run the installer, watch the build compile and the suite pass, and declare victory. That reflex is "bump and hope." It catches only the breaks the compiler and existing tests happen to see, and misses the whole class of failures that a dependency upgrade actually carries: behavioral breaking changes announced in a changelog nobody read, defaults that silently changed under the same API, sixty transitive packages that moved in the lockfile unreviewed, and — when adding a package — a typosquatted or abandoned dependency pulled straight into the trust boundary.

This skill exists because "it installed and the build is green" is the single most dangerous false signal in dependency work. A major-version bump that compiles clean can still change serialization format, timezone handling, retry behavior, or connection-pool defaults at runtime — none of which the type system or a partial test suite will catch. The discipline below turns "hopefully we don't use the thing that broke" into a written, checked verdict table before any code is touched.

## Scope this change first

**Gate (One dependency per change):** A change moves exactly one dependency, or one tightly-coupled group that must move together (a framework and its own plugins, a client and its required codec, peer-dependency-locked siblings). A 40-package bump in one PR is unreviewable and — the reason that matters — unbisectable: when something breaks in staging next week, nobody can tell which of the forty did it, and `git bisect` lands on a commit that changed everything at once.

If handed a "update all our dependencies" task, do not execute it as one change. Split it into one-dependency (or one-group) units and do them in sequence, each independently reviewable and revertable. Report the split back to the orchestrator rather than silently bundling.

The one exception to *scope*, never to *rigor*: a security patch (see the security section) may be fast-tracked as a minimal-scope bump — but it still gets the changed-defaults check.

## Workflow

### 1. ORIENT — establish the exact from → to and the reason

Record, in writing, before anything else: the package's exact registry name, the current pinned version (from the lockfile, not the manifest range), the target version, and *why* now (feature needed, security fix, unblock another upgrade, routine maintenance). The current version is the one actually installed — a manifest that says `^2.1.0` may have `2.7.3` resolved; the changelog range you must read starts at what is installed, not at the caret.

Identify the project's package manager and its conventions by inspection, not assumption: the lockfile format present (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`, `Gemfile.lock`), how the project pins (exact vs. range), and where dev vs. runtime dependencies live. You will regenerate the lockfile with *this* tool, never by hand-editing it.

### 2. READ THE CHANGELOG FOR EVERY VERSION JUMPED

Read the changelog / release notes for **every** version between current and target — not just the target release. This is the rule most "bump and hope" upgrades skip and the one that catches the most. Breaking changes are announced across the range you are skipping over: a deprecation lands in 2.3, the removal lands in 3.0, and if you jump 2.1 → 3.1 reading only the 3.1 notes you will never see the deprecation that explains the removal. Read the CHANGELOG/HISTORY/NEWS file, the GitHub Releases for each tag, and any `UPGRADING`/`MIGRATION` guide the project ships.

Pay specific attention to a "Changed defaults" / "Behavior changes" section if one exists — these are the silent runtime landmines (a default timeout that dropped, a serialization format that flipped, a retry count that changed). They do not show up as compile errors.

**Gate (Breaking-change inventory):** Produce a written list of every breaking change, removal, and deprecation across the whole jumped range before touching code. If the project publishes no changelog, do not treat that as a green light — reconstruct the delta another way: diff the two release tags (`git diff v2.1.0 v3.0.0` on the upstream, or compare the published tarballs), read the migration guide, scan the commit log between tags for `BREAKING` markers. "No changelog found" is a **risk to report**, not permission to proceed blind — record it explicitly so the reviewer knows the inventory is best-effort.

### 3. MAP EACH BREAKING CHANGE TO ACTUAL USAGE

For every entry in the breaking-change inventory, search the codebase for the affected API and record a verdict: **used** (at `file:line` — must adapt, note how) or **not used** (safe). This is the step that converts "I hope we don't touch that" into a checked table. A removed method you never call is a non-event; a changed default on a function you call in forty places is the whole risk of the upgrade.

Search widely — the affected API is not only in `src/`. Include configuration files (the package may read a config whose schema changed), CI/pipeline definitions, build scripts, Dockerfiles, infrastructure-as-code, and test files. A breaking change to a config key or a CLI flag lives outside application source and is the classic thing a source-only grep misses.

**Gate (Every change has a verdict):** No breaking-change inventory entry may be left unadjudicated. Each is either mapped to a usage site you will adapt, or marked not-used with the search that establishes it. An entry with no verdict means the upgrade is not understood yet — do not proceed to code changes.

### 4. VET the package when ADDING (not just upgrading)

When *introducing* a dependency rather than moving one, run supply-chain diligence before it enters the manifest — because a new dependency is new code running with your process's privileges, and the attack surface here is real:

- **It exists and is the right name.** Verify the exact spelling against the registry itself (npm/PyPI/crates.io/pkg.go.dev), not from memory. Typosquats (`crossenv` for `cross-env`) and outright hallucinated package names are active supply-chain attacks — an LLM-suggested name that is one character off, or that sounds plausible but was never published, is exactly the bait. Confirm meaningful adoption (download counts, dependents, a real repository).
- **It is maintained.** Recent releases, a responsive issue tracker, no wall of unanswered critical issues. An abandoned package is a latent vulnerability you now own.
- **Its license is compatible** with the project's license and distribution model. A copyleft license pulled into a proprietary product is a legal problem, not a technical one — flag it, don't just install.
- **No known advisories on the chosen version.** Run the ecosystem auditor (`npm audit`, `pip-audit`, `osv-scanner`, `cargo audit`, `govulncheck`) and check the specific version you intend to pin.
- **It is proportionate.** Prefer the smaller tool. A package that drags in fifty transitive dependencies or far more capability than the task needs is a bigger surface to secure, audit, and maintain than the one-function utility the task actually called for.

Record these findings; a new-package add without vetting notes is incomplete.

### 5. APPLY the bump and regenerate the lockfile with the project's tool

Edit the manifest to the target version following the project's pinning convention (exact vs. range — match what the neighbors do; do not switch a project from ranges to pins or vice versa unprompted). Then regenerate the lockfile by running the package manager's install/update command — never by hand-editing the lockfile, which desynchronizes it from the resolver's actual graph.

**Gate (Transitive diff reviewed):** After regeneration, review the lockfile diff — specifically what *else* moved. A one-line manifest bump routinely drags a dozen transitive packages to new versions; each of those is an unreviewed upgrade riding in on your change. Summarize the transitive movement (which packages, roughly how many, any that themselves crossed a major version) and pin what the project's convention pins. If the transitive set includes a major-version jump in something load-bearing, treat it as its own risk line — a silent transitive major is precisely what makes a "simple patch bump" break in production.

### 6. ADAPT the code to the new API — properly

For each **used** verdict from step 3, change the code to the new API following the library's own migration idiom — the way the migration guide says to do it — not the minimal edit that silences the error. The two diverge constantly: the guide says "replace `client.fetch(x)` with `client.request({ resource: x })`"; the minimal edit casts the old call's result to make the type checker stop complaining. The cast ships the old (now-wrong) behavior under a green build.

Do not paper over new-version type errors with `any`, `as`, `# type: ignore`, `@ts-ignore`, `!`, or an unchecked coercion. A type error that appears *after* an upgrade is the library telling you, through the type system, about a breaking change — it is signal, not noise. Silencing it discards the one automatic check you got for free. Adapt the code so the types genuinely hold.

Deprecation warnings the new version now emits are recorded as follow-up work (an issue, a note in the return) — not silenced with a suppression, and not fixed inside this change unless they are trivial and in-scope. Silencing a deprecation warning hides the next upgrade's breaking change from your future self.

### 7. VERIFY BY BEHAVIOR — not just "it compiled"

Green build ≠ working. Run, in order, and fix what you caused:

1. **Typecheck / compile strict** and **lint** — these catch the API-shape breaks.
2. **The full test suite** — catches the behavior your tests happen to cover.
3. **A targeted exercise of the features this dependency powers** — this is the step "bump and hope" omits and the one that catches changed defaults. The suite frequently does not assert on the library's *runtime* behavior: the exact serialization format it writes, timezone/DST handling, connection-pool and timeout defaults, retry and backoff behavior, floating-point/locale formatting. Go back to the "changed defaults" notes from step 2 and actively exercise each changed default against the real behavior — drive the code path and observe the output, don't infer it from a passing unit test that never checked that property.

**Gate (Changed-defaults verified):** Every "changed default" you inventoried in step 2 is either confirmed not-used (step 3 verdict) or exercised and observed under the new version. A changed default that is used but only assumed-fine is an unverified runtime landmine — verify it or report it as an open risk, never quietly assume.

### 8. Establish the ROLLBACK story

State how to undo this. For a pure version+code change the answer is clean: the previous lockfile and manifest are one `git revert` away, and reverting the code restores the old behavior. Say so.

But identify and flag anything a code rollback does **not** undo — these make the upgrade effectively forward-only and must be surfaced *before* merge, not discovered during an incident:

- a data migration the new version ran on first start,
- a persisted data/serialization format the new version wrote that the old version cannot read,
- a schema or on-disk index the new version upgraded in place,
- an external side effect (a remote resource created, a config pushed).

If any of these exist, the rollback is not "just revert the commit" — say exactly what else must be done, and whether it is even possible. An upgrade that cannot be cleanly rolled back is a materially riskier change and the reviewer must know.

## Security updates get priority routing

A CVE / advisory fix is fast-tracked: it is allowed to be a minimal-scope, single-package bump aimed only at reaching a patched version, and it may skip the "is this upgrade worth it" deliberation — the answer is yes. What it does **not** skip: the changed-defaults check (step 2's behavior-change notes and step 7's gate still apply, because a security patch backported into a new release can still ship behavior changes), the transitive-diff review (step 5), and the rollback note (step 8). Route it ahead of routine upgrades, keep its scope tight, but keep the runtime-behavior verification. A security fix that silently breaks a changed default is still an outage.

## Definition of done

Mechanical exit criteria — all must hold:

- [ ] Exactly one dependency (or one coupled group) moved; a multi-package request was split.
- [ ] Changelogs/release notes read for **every** version across the jumped range; breaking-change + deprecation inventory written (or the missing-changelog risk explicitly recorded).
- [ ] Every inventory entry has a **used (`file:line`) / not-used** verdict, including config, CI, and scripts.
- [ ] New packages (if adding) vetted: exact name verified against registry, maintenance, license, advisories, proportionality.
- [ ] Lockfile regenerated with the project's tool (never hand-edited); transitive diff reviewed and summarized.
- [ ] Code adapted to the new API per the migration idiom; zero `any`/`ignore`/cast suppressions papering over version type errors.
- [ ] Typecheck (strict), lint, and full test suite pass; features the dependency powers exercised by behavior; every changed default verified or flagged.
- [ ] Rollback story stated, including any non-revertable side effect flagged before merge.
- [ ] New deprecation warnings recorded as follow-up, not silenced.

## Return format

You are a subagent reporting to an orchestrator whose context is scarce. Return a structured summary — never full changelogs, never full file dumps or the lockfile diff verbatim.

```
## upgrade-dependency — <package> <from> → <to>

**Status:** done | blocked | done-with-open-risk
**Reason for upgrade:** feature | security(CVE-…) | maintenance | unblock

**Breaking-change verdict table:**
| change (version) | in codebase? | verdict |
|---|---|---|
| removed client.fetch() (3.0) | src/api.ts:44 | ADAPTED → client.request() |
| default timeout 30s→5s (2.8) | used, src/http.ts:12 | VERIFIED — raised explicitly |
| dropped Node 16 (3.0) | CI matrix | not used (already on 20) |

**Transitive diff:** N packages moved; notable: <pkg a.b→x.y major>, … | none

**New-package vetting:** (only if adding) name verified ✓ | maintained ✓ |
  license <spdx> compatible ✓ | advisories: none on <ver> | size: proportionate

**Gate results:**
- typecheck: pass | FAIL <verbatim first error>
- lint: pass | FAIL <…>
- tests: 214 passed, 0 failed | FAIL <…>
- behavior check: <what was exercised> — <observed result>

**Rollback:** clean revert | forward-only because <migration/format written>

**Follow-up / open risks:** new deprecation warnings, missing-changelog gaps,
  unverified changed default, license flag. Empty if none.
```

If **blocked**, lead with the blocker (contract/behavior conflict, an incompatible peer dependency, a missing patched version) and the specific decision you need; do not pad.

## Anti-patterns

- **Bump and hope.** — Editing the version and shipping because it installed and the build is green. The build is green catches API shape, not runtime behavior; the changelog and the behavior check catch the rest.
- **Reading only the target release's notes.** — Skips every breaking change announced in the versions you jumped over. Read the whole range.
- **"Hopefully we don't use that."** — An unadjudicated breaking change is an unknown, not a safe assumption. Every entry gets a searched verdict.
- **The 40-package mega-bump.** — Unreviewable and unbisectable; when it breaks, no one can name the culprit. One dependency per change.
- **Casting past a new type error.** — `as any` / `# type: ignore` on a post-upgrade error silences the exact signal the library sent you about a breaking change, and ships the old behavior under a green build.
- **Hand-editing the lockfile.** — Desyncs it from the resolver's real graph and hides the transitive movement you were supposed to review. Regenerate with the tool.
- **Ignoring the transitive diff.** — A one-line manifest bump that quietly moves sixty transitive packages is sixty unreviewed upgrades. Review what else moved.
- **Installing a name from memory.** — Typosquats and hallucinated package names are supply-chain attacks. Verify the exact spelling against the registry before it enters the manifest.
- **Silencing the new deprecation warning.** — Suppressing it hides the next major's removal from your future self. Record it as follow-up.
- **Assuming a clean rollback.** — If the new version wrote a data format or ran a migration, a code revert does not undo it. Flag forward-only upgrades before merge.

## Worked micro-examples

**Input:** "Upgrade our HTTP client from 2.1 to 3.0." The 3.0 notes mention a rename; you check installed version and it is actually 2.4.
**Correct behavior:** Read the notes for 2.5, 2.6, 2.7, 2.8, 2.9, and 3.0 — not just 3.0. In 2.8 you find "default request timeout changed from 30s to 5s." That is a changed default with no compile error. Grep: the timeout is relied on in `src/http.ts:12` where a slow upstream takes ~12s. Verdict: **used — must adapt** (set the timeout explicitly to 30s rather than inherit the new 5s default). The 3.0 method rename is used at two call sites → adapt both to the new API per the migration guide, not a cast. In the return, the changed-timeout default appears in the verdict table as VERIFIED with the exercise you ran. Had you read only the 3.0 notes, the 5s default would have shipped silently and every slow request would time out in production.

**Input:** "Add a library to parse CSV — use `csv-parserr`."
**Correct behavior:** Before touching the manifest, verify the name against the registry — `csv-parserr` (double r) is not the real package; the maintained one is `csv-parser`. Do not install the name as given. Confirm the correct package: recent releases, real dependents, MIT license (compatible), `npm audit` clean on the target version, and it is a focused parser rather than a whole data-framework. Install the verified name, pin per convention, review the (small) transitive diff, and record the vetting in the return. Installing `csv-parserr` as typed would have pulled a potential typosquat straight into the build.
