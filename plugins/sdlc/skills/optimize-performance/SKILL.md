---
name: optimize-performance
description: Executor discipline for making code measurably faster or lighter without breaking it. Forces a stated performance budget (target + workload) before any change, a recorded baseline benchmark on representative data, profiling to find the real bottleneck before hypothesizing, one change per measurement with a before/after table, structural wins before micro-optimization, and correctness held green throughout. Prevents optimization-by-intuition — the failure where a capable model "knows" what's slow (it is usually wrong), rewrites code for speed with no baseline, cannot prove any improvement, and trades away correctness or readability for wins that never existed. TRIGGER on phrases like "make this faster", "optimize this function/query/endpoint", "this is too slow", "reduce the latency of X", "speed up the build/job/pipeline", "cut memory usage", "the p99 is too high", "this query is slow", "profile and fix the hot path", "improve throughput of X", "reduce cold start / bundle size", "why is this taking so long". SKIP when the change intentionally alters observable behavior or trades correctness for speed (approximation, sampling, eventual consistency — that is a product decision to escalate, not a silent optimization), when the task is a pure structural cleanup with no speed target (use the refactor skill), or when the code is functionally broken (use the debug skill — fix correctness first, optimize after).
---

# optimize-performance — measured speed, not guessed speed

Enforces the discipline of a performance engineer: you do not change a line for speed until you have a stated target, a recorded baseline on representative data, and a profile that tells you where the time or memory actually goes. Every change is a single controlled experiment measured against that baseline, and correctness stays green the whole way.

This skill exists because performance work is where capable models are most confidently wrong. Handed "make this faster", an undisciplined model does the same four things every time: it **optimizes by intuition** — "I know this loop is the problem" — when the bottleneck is almost never where anyone thinks (it is an N+1 three call-frames away, a missing index, a serialization cost, a cold cache); it **rewrites without a baseline**, so it cannot prove the change helped and often cannot even tell it made things *worse*; it **changes five things at once**, making any result unattributable; and it **trades correctness and readability** for asymptotic wins on a workload that never occurs in production. The result is uglier code, unproven speed, and sometimes a latent bug with good-looking numbers. This skill replaces all of that with measurement.

The bottleneck is *found empirically, never deduced from reading code*. If the profiler contradicts your intuition, the profiler wins — every time, without exception.

## The Hard Gate

You may NOT make the first performance-motivated code change until ALL THREE of the following exist in writing:

1. **A budget** (step 1) — a concrete target and the workload it is measured on ("p99 of `GET /dashboard` under 200 ms at 500 rows per user", not "as fast as possible").
2. **A recorded baseline** (step 2) — the current numbers (median + tail) from a re-runnable benchmark on representative data, with the exact command, environment, and dataset noted.
3. **A profile** (step 3) — evidence of where the time/memory actually goes, with the top consumers named and quantified.

Writing the benchmark, capturing the baseline, and profiling are all allowed (and required) before the gate. Rewriting the production code for speed is not, until all three exist. An optimization without a baseline is not an optimization; it is a guess wearing a confidence costume — and half of confident perf guesses are regressions.

## Workflow

### 1. Define the budget — a target, not "as fast as possible"

Before anything, pin down what "fast enough" means as a number, and the workload it is measured against. Without a budget you cannot know when to *stop*, and unbounded optimization is negative-value: it burns readability and review time chasing asymptotic gains nobody asked for.

- **State the target metric and threshold.** "p99 latency < 200 ms", "job completes < 5 min", "peak RSS < 512 MB", "bundle < 250 KB gzipped", "throughput > 1000 req/s". A target is a specific percentile or bound, not a direction.
- **Name the workload it is measured on.** A latency budget is meaningless without the input it applies to: how many rows, what concurrency, what data distribution, what hardware. "Under 200 ms" for *what request shape at what scale* — 500 rows or 5 million? Cold cache or warm?
- **Decide which resource is constrained — and which you must NOT regress.** Latency, throughput, and memory are different, often opposing goals: batching improves throughput but can *raise* tail latency; caching cuts latency but *raises* memory; parallelism cuts wall-clock but *raises* peak memory and CPU. State explicitly which metric is the target and which others are constraints that may not get worse ("cut p99 latency, do not increase peak memory beyond current +10%").
- **If no budget is given, derive one and confirm it.** Reasonable defaults come from the user-facing requirement (a frame budget, an SLA, a queue drain rate). Propose the number and the workload; do not silently invent "twice as fast" as the goal.

**Gate: the budget and its workload are written down first.** They are the acceptance criterion and the stop condition for the entire task.

### 2. Reproduce the slowness — record a baseline on representative data

You cannot improve what you have not measured, and you cannot measure on toy data. A 100-row benchmark of a 100-million-row problem measures nothing — it exercises none of the cache misses, allocation pressure, index behavior, or algorithmic blow-up that make production slow.

- **Build a benchmark on REPRESENTATIVE data.** Match production in the dimensions that drive cost: realistic *sizes* (row counts, payload bytes, collection lengths), realistic *distributions* (skew, duplicates, null density, key cardinality — a uniform synthetic set hides the hot-partition problem), and realistic *edge shapes* (the pathological largest tenant, the deepest nesting, the worst-case query). If you must use synthetic data, shape it like production and say so as a known divergence.
- **Record the baseline: median AND tail, not just mean.** The mean hides everything that matters in performance — report at minimum median (p50) and tail (p95/p99), plus max for latency work and peak (not average) for memory. A mean that looks fine with a p99 that is 20× worse is the actual problem, and averaging erases it.
- **Make it re-runnable.** Write down the exact command, the environment (hardware, runtime version, relevant config/flags, warm vs cold), and the dataset (or the seed/script that generates it). "It was slow on my machine" is not a baseline. Someone else — including future-you checking for a regression — must be able to reproduce these numbers.
- **Run it enough times to be stable.** One sample is noise. Take enough iterations (and enough warm-up on JIT/cached runtimes) that the numbers are repeatable; note the variance. If the measurement itself is noisy, fix that before trusting any before/after delta.

**Gate: the baseline numbers are recorded, with command + environment + dataset, before any code change.** This is the number every later change is judged against.

### 3. Profile before hypothesizing — find the bottleneck, don't deduce it

This is the rule that separates real perf work from theater. You measure *where* the cost is before forming any theory about it. Reading the code and reasoning "this nested loop must be the hot spot" is exactly the intuition that is reliably wrong.

- **Use the right instrument for the layer.** A CPU/wall profiler or flame graph for code hot paths; `EXPLAIN ANALYZE` and the query log for databases; an allocation/heap profiler for memory; a bundle analyzer for asset size; distributed traces for cross-service latency; the network tab / waterfall for a page load. Pick the instrument that attributes cost to a line, query, allocation, or span.
- **Name the top consumers with numbers.** "62% of wall time is in `serialize_response`, of which 48% is one `json.dumps` over the full result set" — quantified and ranked. Not "the loop looks expensive". You are looking for the few places that dominate; most code is not on the hot path and optimizing it is wasted effort (Amdahl's law: speeding up 5% of the runtime by 2× saves 2.5%).
- **The profile overrides intuition — always.** If profiling contradicts what you were sure was slow, the profile is right and you were wrong. Discard the theory, follow the data. A model that "already knows" the answer and skips this step is the exact failure this skill prevents.
- **Profile the representative workload from step 2**, not a trivial input — the bottleneck at n=100 is frequently not the bottleneck at n=10M (a hash build that dominates small inputs is noise at scale; an O(n²) scan that is invisible small is everything at scale).

**Gate: the top cost consumers are named and quantified from a profile, before any optimization hypothesis is committed to.**

### 4. One change per measurement — attributable experiments only

Each optimization is a controlled experiment: change ONE thing, re-run the *same* benchmark from step 2, record before/after. Two changes at once means you cannot attribute the win — and, just as important, cannot see the regression when one of the two made things *slower* and the other hid it.

- **Apply a single optimization, then re-measure.** Same benchmark, same data, same environment. Compare against the baseline (and against the previous best).
- **Keep a results table across attempts.** One row per change: what you changed, the metric before, the metric after, kept or reverted. This table is the proof of work and the audit trail — it shows what actually moved the number and what didn't.

  | # | Change | p50 | p99 | Peak mem | Verdict |
  |---|--------|-----|-----|----------|---------|
  | 0 | baseline | 340 ms | 1240 ms | 210 MB | — |
  | 1 | batch N+1 user lookup | 90 ms | 260 ms | 215 MB | keep |
  | 2 | add index on `orders.user_id` | 70 ms | 180 ms | 215 MB | keep |
  | 3 | cache serialized header | 71 ms | 179 ms | 240 MB | revert (no win, +mem) |

- **A change that does not help gets reverted.** If the number does not move (or a constrained metric regresses), revert it — do not keep a speculative "it might help under load" change that costs readability for no measured benefit. Optimizations that don't optimize are just complexity.
- **Sometimes the "optimization" is slower.** Caches with poor hit rates, parallelism whose coordination overhead exceeds the work, "clever" data structures with bad constants on real sizes — all can regress. The one-change discipline is what lets you *see* that and back it out cleanly.

### 5. Order of leverage — structural wins before micro-optimization

Attack the cost in order of leverage. Micro-optimizing a hot line before fixing the N+1 query above it is polishing a doorknob on a burning house — you can double the speed of 3% of the runtime and feel busy while the real 10× sits untouched. The hierarchy, highest leverage first:

1. **Don't do the work at all.** The fastest work is work you skip. Cache the result, precompute/memoize, deduplicate redundant calls, early-exit and short-circuit, lazy-load what may never be needed, drop columns/fields you don't use. Eliminating the work beats speeding it up.
2. **Do it once instead of N times.** Collapse the N+1 into a single batched query or bulk call; hoist invariant work out of the loop; reuse a connection/buffer instead of re-creating it per iteration; compute-once and reference. This is the single most common real bottleneck — a per-item round-trip (DB, network, syscall) inside a loop.
3. **Do it with a better algorithm or data structure.** O(n²) → O(n log n) or O(n); a linear scan → a hash lookup or an index on the query; the right container for the access pattern (set membership, not list scan). Add the database index, choose the structure whose constants and complexity fit the real workload.
4. **Do it in parallel or concurrently.** Once the work is minimal and algorithmically sound, spread it across cores/workers or overlap I/O. Parallelism multiplies throughput but adds coordination cost, memory, and complexity — and cannot fix an O(n²) algorithm, only run it on more cores. It comes *after* the structural fixes, not instead of them.
5. **Micro-optimize the hot line.** Only now, and only on a line the profile proved dominant: tighter allocation, avoiding a copy, a cheaper call, vectorizing, better cache locality. Highest effort and readability cost per unit of gain — reserved for the genuinely hot path under a budget you have not yet met.

Work top-down: exhaust the cheap, high-leverage tiers before descending into the expensive, low-leverage ones. Most performance problems are solved in tiers 1–3 and never need 4 or 5.

### 6. Correctness is an invariant — the suite stays green

An optimization that changes observable behavior is a bug with good latency numbers. Speed is never a license to alter what the code *does*. The behavior-preserving invariants from the `refactor` skill apply in full: same outputs for the same inputs, same error behavior (types, messages, status codes), same side effects in the same order.

- **Run the full relevant test suite after every change** (the same green-after-every-step discipline as a refactor). A faster function that returns subtly different results, drops an edge case, reorders side effects, or swallows an error has not been optimized — it has been broken.
- **Do not edit tests to accommodate a speedup.** If a test needs changing to pass after your optimization, behavior changed — stop and reassess. Editing the test to match the new output is the loudest possible signal you introduced a bug.
- **Watch specifically for the correctness traps perf changes hide:** a cache that goes stale or ignores an invalidation key; a batch that changes result ordering a caller depended on; parallelism that introduces a data race or nondeterminism; a floating-point reassociation that changes rounding; an early-exit that skips a required side effect; an index or query rewrite that changes NULL/collation/duplicate handling. Diff-review for these, do not trust that the tests cover them.
- **If the fast path REQUIRES relaxing behavior, that is a product decision — escalate, never decide silently.** Eventual consistency instead of strong, an approximate/probabilistic result (HyperLogLog, sampling, bloom filter), dropping precision, serving slightly stale cache — each changes the contract. Surface the trade-off and the numbers to the orchestrator/user and let them choose. Silently trading correctness for latency is the worst outcome this skill exists to prevent.

Security-first still holds: an optimization must not remove an authorization check, widen data exposure, or introduce a cache that leaks one user's data to another. A shared cache keyed without the tenant/user is a data-leak, not a speedup.

### 7. Stop at the budget

When the target from step 1 is met on the representative workload, STOP. Record the final numbers against baseline and budget. Optimizing *past* the budget is negative-value work: every further millisecond costs readability, complexity, and reviewer time for a win nobody requested and no user perceives.

- **Declare done at the target, not at exhaustion.** "p99 is 180 ms, budget was 200 ms — met, stopping" is the correct ending. Grinding to 150 ms with a cache layer and a hand-rolled data structure is scope creep in disguise.
- **If the budget is NOT reachable within the current approach, that is a finding, not a mandate to mutilate the code.** Report what you achieved, what the profile says the remaining cost is, and what a bigger structural change (different architecture, denormalization, a different store, moving work offline) would require. Let that be a deliberate decision, not a pile of micro-optimizations that half-get-there while destroying readability.
- **Diminishing returns are a stop signal.** When each new change buys single-digit-percent gains at rising complexity cost and you are already inside budget, you are done.

### 8. Guard the win — leave a repeatable artifact and record the trade-offs

A performance win that cannot be re-verified will silently rot; the next refactor "cleans up" your ugly-but-fast code back to slow, or a data-volume change quietly blows the budget and nobody notices until production does.

- **Leave the benchmark as a repeatable artifact** where the project supports it: commit the benchmark script, add a CI performance test or regression guard, or — at minimum — record the exact procedure (command + data + environment) so the number is reproducible on demand. A guarded win is one a future regression trips over.
- **Comment every readability trade-off with its measured justification.** Where you kept code uglier or less obvious *because* it is faster, leave a comment stating the measured win and pointing at the benchmark: `// batched to one query — saves 800 ms p99 on the dashboard load, see bench/dashboard_bench.py`. This is what stops a future refactorer from "simplifying" it straight back to the N+1. An unexplained optimization is an optimization that gets reverted by someone trying to help.
- **Record the load-bearing assumptions as tripwires.** Note what the win depends on — data volume, key cardinality, cache hit rate, concurrency level, hardware. "This holds while the table is under ~1M rows / the cache hit rate stays above ~90%" tells the next engineer exactly which change invalidates the optimization and re-opens the budget.
- **State the measurement environment vs production.** If you measured on dev hardware, in a container with different CPU/memory/network than prod, or against a synthetic dataset, say so explicitly. Numbers from a divergent environment are indicative, not authoritative — flag the divergence so no one over-trusts them.

## Definition of done

- A budget exists (target metric + threshold + the workload it is measured on) and was confirmed, not invented.
- A baseline was recorded on representative data — median and tail, with re-runnable command + environment + dataset — before the first code change.
- A profile identified and quantified the real top consumers; every optimization traces to a profiled bottleneck, not an intuition.
- Each change was measured in isolation against the same benchmark; a results table records before/after per change, with reverts for changes that did not help or regressed a constrained metric.
- Structural wins (tiers 1–3) were exhausted before parallelism or micro-optimization.
- The full relevant test suite is green on the final code, with the same assertions as baseline — no behavior change, no edited tests. Any required behavior relaxation was escalated, not decided silently.
- The budget is met on the representative workload (or the shortfall is reported as a finding with the remaining-cost analysis). Optimization stopped at the target.
- The win is guarded: benchmark left as a re-runnable artifact (or procedure recorded), readability trade-offs commented with their measured justification, and load-bearing assumptions noted as tripwires.

## Return format

You are typically a subagent reporting to an orchestrator. Return a structured summary, never full file contents.

```markdown
## Optimization summary
<2-3 sentences: what was slow, where the real bottleneck turned out to be, what changed, budget met or not>

## Budget
- Target: <metric + threshold> on <workload: sizes, distribution, concurrency, hardware>
- Constrained (must-not-regress): <e.g. peak memory, throughput>

## Baseline (recorded before any change)
- <metric>: p50 <x> / p99 <x> / max <x>  |  peak mem <x>
- Command: <exact benchmark command>
- Environment: <hardware, runtime version, config, warm/cold>
- Dataset: <representative data / seed / script, and any divergence from prod>

## Profile — where the cost actually was
- <consumer> — <N%> of <time/memory> — <one-line note; and whether it matched or contradicted intuition>

## Changes (each measured in isolation)
| # | Change (leverage tier) | p50 | p99 | Peak mem | Verdict |
|---|------------------------|-----|-----|----------|---------|
| 0 | baseline | ... | ... | ... | — |
| 1 | <change> (tier N) | ... | ... | ... | keep/revert |

## Result vs budget
- Final: <numbers>  |  Budget: <target>  |  <MET / NOT MET>
- <if not met: remaining bottleneck from profile + what a bigger change would require>

## Files touched
- `path/to/file.ext:LINE-LINE` — <what changed, and the leverage tier>

## Correctness
- Tests: <N passed> — baseline <N passed> (same assertions, unedited)
- Behavior relaxations escalated: <none | describe the product decision surfaced>

## Guarding the win
- Benchmark artifact: <path to committed bench / CI perf test / "procedure recorded only">
- Readability trade-offs commented: <file:line refs, or none>
- Load-bearing assumptions (tripwires): <data volume / cache hit rate / cardinality / hardware>

## Findings (reported, NOT done)
- <file:line> — <other slow path found but out of scope, latent bug, correctness smell> — suggested action

## Open risks / questions
- <measurement env divergence from prod; a constraint you were unsure of; a relaxation needing sign-off>
```

## Anti-patterns (hard NO)

- **Optimizing by intuition.** Rewriting the loop you "know" is slow without a profile. The bottleneck is almost never where you think — measure first, every time.
- **No baseline.** Changing code for speed with no recorded before-number. You cannot prove a win you did not measure, and you cannot see the regression you caused.
- **Toy-data benchmarks.** Measuring a 100M-row problem on 100 rows. It exercises none of the real cost and validates nothing.
- **Mean-only numbers.** Reporting average latency and hiding the p99. The tail is usually the actual problem; the mean erases it.
- **Multiple changes per measurement.** Batching five optimizations into one commit — unattributable wins, invisible regressions. One change, one measurement.
- **Micro-optimizing before the structural fix.** Hand-tuning a line while an N+1 query or O(n²) scan sits untouched above it. Fix the high-leverage tier first.
- **Trading correctness for speed silently.** Introducing approximation, staleness, or reordering that changes observable behavior without escalating. That is a bug with good latency, or a product decision made by the wrong party.
- **Editing tests to make the "faster" code pass.** If the test must change, behavior changed — you broke it, you didn't optimize it.
- **Optimizing past the budget.** Grinding for gains nobody asked for, past the target, at rising readability cost. Stop when the number is met.
- **Uncommented ugly-for-speed code.** Leaving a non-obvious optimization with no note of its measured win, so the next refactor reverts it straight back to slow.

## Worked micro-examples

**Input:** "The `/dashboard` endpoint is slow, make it faster."

Correct behavior: (1) Set a budget with the user — "p99 < 200 ms at the median tenant's ~500 rows, peak memory must not rise more than 10%". (2) Write a benchmark hitting the endpoint against a representative dataset (a realistic tenant, warm cache), run it 50×: baseline p50 340 ms / p99 1240 ms / peak 210 MB — record the command, the seeded dataset, the runtime version. (3) Profile with a request tracer + `EXPLAIN ANALYZE`, *don't* guess: it turns out only 8% is in the template render everyone blamed — 71% is a per-row `SELECT` on `users` (an N+1, 500 queries) and a full-table scan on `orders`. (4) Fix one thing at a time: batch the N+1 into one query → re-run → p99 260 ms (keep, row in the table); add index on `orders.user_id` → re-run → p99 180 ms (keep). Budget met. Try caching the serialized header → no latency win, +30 MB → revert. (5) Structural tiers (do-once, then index) got there; never needed parallelism or micro-tuning. (6) Full test suite green, unedited, outputs identical. (7) Stop at 180 ms < 200 ms. Commit the benchmark, comment the batched query (`// one query, not per-row — saves ~1s p99, see bench/dashboard_bench.py`), note the tripwire "holds while tenants stay under ~5k orders". Return the structured summary.

**Input:** "Speed up this aggregation job and use less memory — it OOMs on big customers."

Correct behavior: recognize two possibly-opposing goals (wall-clock vs peak memory) and state both in the budget — "complete under 5 min AND peak RSS under 2 GB on the largest customer's ~40M events". Baseline on that customer's real data shape (skewed, one giant partition), reporting *peak* not average memory. Profile the allocator: if it is materializing the full result set in memory before writing, the memory fix is a streaming/chunked pass (tier 1 — don't hold the work), which may also change output ordering — if any consumer depends on order, that is a behavior change to escalate, not a silent switch. Measure each change against both metrics; a change that cuts time but blows the memory constraint gets reverted. If hitting both budgets needs an approximate distinct-count (HyperLogLog) instead of exact, that relaxes correctness — surface it as a product decision with the numbers, do not just swap it in. Stop when both budgets are met; guard with a committed benchmark and a note that the streaming assumption holds regardless of customer size.
