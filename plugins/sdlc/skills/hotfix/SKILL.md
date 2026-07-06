---
name: hotfix
description: Incident-mode discipline for a live production emergency — users are being hurt RIGHT NOW and every minute of impact counts. Enforces the emergency trade-offs that are the deliberate inverse of `fix-bug`'s root-cause rigor: assess impact first, mitigate before you fix (rollback > flag-off > failover > forward-fix), accept a symptom-level patch to stop the bleeding, verify with the same signal that fired the alert, keep a running timeline, and file a MANDATORY follow-up to root-cause it properly later. Blocks the two opposite emergency failures: bleeding users for an hour applying full 5-whys rigor when a rollback would have stopped it in minutes, AND shipping a sloppy speculative patch with no paper trail and no follow-up. Use when there is ACTIVE user-facing impact. TRIGGER on phrases like "prod is down", "production incident", "the site is throwing 500s for everyone", "we're paging", "SEV1", "sev-2 incident", "users can't log in right now", "checkout is broken in prod", "hotfix this now", "roll back the deploy", "error rate spiked after the release", "mitigate the outage", "the API is down for customers". SKIP when there is NO active user impact — a defect found in staging, a flaky test, a bug ticket with no live blast radius, or "this is wrong but nobody's affected yet": that is not an incident, route to `fix-bug` and do it properly. Also skip pure capacity planning or a post-incident write-up with the fire already out.
---

# hotfix — incident-mode discipline for a production emergency

Production is on fire and users are being hurt right now. Your job is not to understand the bug — it is to **stop the bleeding as fast as safely possible**, then hand off the real fix. Every minute you spend investigating is a minute users keep failing. This is the deliberate **inverse** of the `fix-bug` skill: there, premature convergence is the enemy and you must reproduce, hold multiple hypotheses, prove exactly one, and root-cause to the origin before touching code. Here, that same rigor **applied during an active incident is the failure mode** — an hour of impeccable investigation while checkout returns 500s is malpractice when a one-click rollback would have restored service in three minutes.

This skill exists to prevent a **double-sided** failure of a capable-but-undisciplined model under "prod is down" pressure:

- **(a) Over-rigor while users bleed** — running the full `fix-bug` gauntlet (repro, 5-whys, regression test) before doing anything that reduces impact. Correct in a bug ticket; catastrophic in an incident.
- **(b) Sloppy cowboy patch** — shipping a speculative forward-fix with no paper trail, no verification, and no follow-up, leaving a landmine that everyone mistakes for the real fix until it detonates again.

The gates below force the middle path: mitigate first with a reversible, verifiable action, and only then decide whether a forward-fix is even needed — while writing down what you did as you go.

You are usually a subagent (or on-call engineer) reporting to an incident commander or orchestrator. Report status at every state change (see Return format). Stay inside your file ownership; never widen a diff under pressure.

> **The prime rule.** A rollback is verified in minutes and its outcome is known. A forward-fix under incident pressure is a **new, untested deploy stacked on top of an active incident** — it can and does turn one incident into two. Default to the reversible action. "I can just fix it quickly" is the trap this skill is built to stop.

## The workflow (each step is a gate)

### 1. ASSESS impact first (target: ~2 minutes, not zero, not thirty)

Before you touch anything, answer four questions in writing. Severity drives every decision downstream, so you cannot skip this — but it is a two-minute triage, not an investigation.

- **What is broken?** The user-visible symptom, concretely (login fails, checkout 500s, data renders stale, latency 10×).
- **For whom / how many?** Blast radius: all users or a segment (region, plan, tenant, platform)? 100% or 2%? This sets severity.
- **How bad?** Data loss / security exposure / money moving wrong is top severity. A degraded-but-usable path is lower. Be honest — over-declaring burns the team, under-declaring loses time.
- **Since when?** The start time is your single most valuable clue. **Correlate "since when" with what changed** — the most recent change before the symptom onset is your prime suspect: deploys, feature-flag flips, config/env changes, dependency or infra updates, a data migration, a traffic spike, an expiring cert/credential. Pull the deploy log and the flag-change log for the window around the onset time.

**Gate: you have a one-line severity call and a prime suspect (or an explicit "no correlating change found") before moving on.** The prime suspect is a *lead for mitigation*, not a proven root cause — you do not need to prove it to roll it back.

### 2. MITIGATE before fixing — reduce impact with a reversible action

This is the heart of incident response. Stop the bleeding with the fastest **reversible, verifiable** action available. Work the priority order top-down and take the first one that is available and safe:

1. **Rollback the suspect deploy.** If the symptom started right after a release, revert to the last known-good build. Fastest, safest, most verifiable — the previous version was working minutes ago.
2. **Flag / config off the broken path.** Kill-switch the feature, disable the offending code path, revert the config or flag flip. Precise and instant when the blast radius maps to a toggle.
3. **Scale / failover.** If it's saturation or a bad node/region/dependency, add capacity, drain the bad instance, fail over to a healthy replica or region.
4. **Forward-fix.** Write new code to stop the bleeding — **only when 1–3 are genuinely unavailable** (nothing to roll back to, no flag exists, it's not capacity). See step 3.

**Gate: before you write a single line of forward-fix code, you must explicitly consider and rule out rollback AND flag-off, in writing.** One line each is enough: "Rollback: N/A — bug shipped 3 releases ago, no known-good build isolates it. Flag-off: N/A — path is not behind a flag." If you *can* roll back or flag off, do that instead of forward-fixing — it is faster to safety and trivially reversible. Skipping this gate to "just fix it" is failure mode (b).

Every mitigation must be **reversible-documented** the moment you take it: what exactly you changed (which deploy SHA reverted to which, which flag set to which value) and what restoring it will require. You will need this to un-revert once the real fix lands.

### 3. FORWARD-FIX rules (only when mitigation is unavailable)

If and only if steps 1–3 of the priority order are ruled out, write the minimal patch to stop the bleeding. The trade-offs here are the **inverse of `fix-bug`** — and that inversion is intentional, not an excuse for sloppiness:

- **Minimal, reviewable diff.** The smallest change that stops the impact. A big diff under pressure is unreviewable and risky.
- **Symptom-level is ACCEPTABLE here.** Unlike `fix-bug`, you do **not** need the architectural root cause now. Clamp the null, short-circuit the bad branch, cap the runaway query — whatever safely stops user impact. The real root-cause fix is the follow-up (step 6), done later with `fix-bug` discipline.
- **No refactoring, no cleanup, no "while I'm here."** Same rule as `fix-bug`, doubly so under pressure: a mixed diff is slower to review and more likely to introduce a second failure.
- **Understand only enough to be confident it's safe.** You need enough certainty that the change won't make things worse — not the full 5-whys. If you cannot convince yourself the patch is safe, it is not a hotfix; escalate (step 7 of `fix-bug` territory) or fall back to a blunter mitigation.
- **Get a second pair of eyes if at all possible.** A 5-minute review of a hotfix diff beats a second incident. If a reviewer is reachable, use them — even a quick "does this look safe?" Do not let "it's urgent" mean "unreviewed."
- **Test the specific broken path before deploying — even manually.** Exercise the exact user path that was failing and confirm it now works. Deploying an **unverified** hotfix onto a live incident is precisely how one incident becomes two. A manual click-through counts; a green typecheck does not.
- **Security is not relaxed** (see Scope guard). No disabling auth to "move fast."

### 4. VERIFY the mitigation actually worked

A deploy going out is **not** verification. Confirm recovery with **the same signal that detected the incident**: the alert clears, the error rate drops back to baseline, the p99 latency recovers, the user path succeeds end-to-end. Watch the metric actually move, and state your observation window.

- **Gate: "the deploy/rollback completed" is not "the incident is mitigated."** You must observe recovery in the detecting signal. Restart/rollback can complete while the symptom persists (cache warmup, stuck connections, a second cause).
- State the window explicitly: "Error rate fell from 40% to <0.1% and held for 10 minutes; checkout succeeds for the three test accounts." Watch long enough to trust it, not a single green data point.
- If the signal does **not** recover, your prime suspect was wrong or there's a second factor. Do not stack another guess — go back to step 1 with the new information (the mitigation you tried and its non-effect is itself evidence).

### 5. PAPER TRAIL — timeline as you go, not reconstructed after

Keep a running timeline **during** the incident. Three lines typed while it happens beats an hour of archaeology afterward, and it is what makes the incident reviewable and the mitigation reversible.

- Log each observation and action with a timestamp: what you saw, what you changed, when. "14:02 error rate 40% on /checkout, started 13:58, correlates with deploy abc123. 14:05 rolled back to def456. 14:11 error rate <0.1%, holding."
- Every mitigation entry records **what it takes to reverse it** — which is also what the follow-up must undo once the real fix lands.
- This trail is the raw material for the post-incident review and the follow-up ticket. Don't rely on memory; memory under adrenaline is unreliable.

### 6. MANDATORY follow-up — the incident is NOT closed at mitigation

Mitigation stopped the bleeding; it did not fix the defect. A symptom patch or a rollback that is never followed up **will** be forgotten and mistaken for the fix — and the bug resurfaces, often worse. Closing the loop is not optional.

**Gate: a hotfix is not done until a follow-up task is filed.** The follow-up must capture:

- **Root-cause it properly** — hand the defect to the `fix-bug` discipline: reproduce, form multiple hypotheses, prove exactly one, 5-whys to the architectural root, minimal fix at the root, and a permanent regression test that fails before / passes after. All the rigor you correctly *skipped* during the fire happens here.
- **Un-revert / re-enable with the real fix** — if you rolled back or flagged off, the follow-up carries the explicit action to restore the reverted change *once the real fix lands* (referencing the reversible-documented note from step 2/5). A permanently rolled-back deploy is lost work; a permanently disabled flag is a silent feature outage.
- **Detection / guardrail gap** — note what alert, test, canary, or guardrail would have caught this earlier or smaller, and recommend adding it. The best incident review output is "this class can't page us at this severity again."

Link the follow-up to the incident timeline. Do not mark the incident resolved in your report until the follow-up exists.

### 7. SCOPE guard — security does NOT relax under pressure

Speed is never a license to open a second, worse incident. Under the fire, these remain hard NOs:

- **No disabling auth/authz "temporarily."** A publicly exposed endpoint is a bigger incident than the one you're fixing, and "temporary" becomes permanent.
- **No committing secrets** to move fast — no hardcoded tokens, keys, or passwords, not even "we'll rotate later."
- **No exposing internal surfaces** as a workaround — admin routes, debug endpoints, internal services opened to unblock a user path.
- Strong types and existing security invariants hold; a hotfix that weakens a boundary is not a hotfix, it's a breach vector. If the only way you can see to mitigate crosses one of these lines, it isn't a valid mitigation — escalate instead (below).

## Escalation honesty

If you cannot identify a **safe** mitigation — no known-good rollback target, no flag, no failover, and no forward-fix you're confident is safe — **say so immediately and loudly**. Fast escalation beats a guess: "No safe self-serve mitigation found; suspect is deploy abc123 but rollback is blocked by migration X. Need a human with DB access / the service owner." Guessing under pressure is how failure mode (b) happens. An honest "I'm stuck, here's what I know and what I need" is a *successful* incident action, not a failure — it routes the incident to someone who can move it, minutes faster than a wrong patch would.

## Not an emergency? Route to fix-bug.

This skill applies **only** to active production impact. If you got here for a defect with no live blast radius — found in staging, a failing test, a bug ticket, "this is wrong but nobody's hitting it" — **stop and use `fix-bug` instead**. There is nothing to mitigate and no clock; skipping root-cause rigor there is exactly the premature-convergence failure `fix-bug` prevents. The whole point of `hotfix` is the emergency trade-off; without the emergency, the trade-off is just corner-cutting.

## Definition of done

Mechanical exit criteria — all must hold:

1. Impact assessed: severity call + blast radius + start time + prime suspect (or explicit "no correlating change") written down.
2. Rollback and flag-off explicitly considered and either taken or ruled out **in writing** before any forward-fix code.
3. A mitigation is in place and is **reversible-documented** (what changed, how to restore).
4. If a forward-fix was used: minimal diff, symptom-level ok, the specific broken path tested (manually is fine), second pair of eyes if reachable, no security regression.
5. Mitigation **verified** via the detecting signal recovering (alert cleared / error rate at baseline / user path works), with a stated observation window — not "the deploy went out."
6. A timeline exists (observations + actions + timestamps).
7. A follow-up task is filed: proper root-cause via `fix-bug`, un-revert/re-enable-with-real-fix, and the detection/guardrail gap.
8. No security invariant was relaxed (auth, secrets, exposed surfaces).

## Return format

Report to the incident commander / orchestrator a structured status — never full file contents. **Send an updated report at each state change**: mitigated → verified → follow-up filed, so the commander always knows the current state.

```
Incident: <one-line symptom> — SEV<n>
State: assessing | mitigating | MITIGATED | VERIFIED | follow-up-filed | ESCALATING(blocked)

Impact: <what breaks> for <who / how many> since <start time>
Prime suspect: <most recent correlating change — deploy/flag/config/dep> (or: none found)

Mitigation: <rollback def456 | flag X off | failover to region B | forward-fix @file:line>
  Ruled out: rollback <why/na> | flag-off <why/na>   (required if forward-fix)
  Reversible by: <exact action to undo this mitigation later>
Verification: <detecting signal recovery + observation window>  (e.g. error rate 40%→<0.1%, held 10m)

Forward-fix (if any): <file:line, one-line change, symptom-level rationale> — path tested: <how> — reviewed by: <who / none>

Timeline: <3-6 timestamped lines: observed / changed / result>

Follow-up: <ticket ref> — root-cause via fix-bug + un-revert-with-real-fix + detection gap
Security: no invariant relaxed (auth / secrets / exposure)
Open risks: <second-factor suspicion, incomplete recovery, anything uncertain>
```

Keep it tight and current. The commander needs the state, the impact, what you changed, whether the signal recovered, and the follow-up — not the code.

## Anti-patterns (do not do these)

- **Full root-cause rigor during the fire.** Running the `fix-bug` gauntlet — repro, multi-hypothesis, 5-whys, regression test — before mitigating, while users keep failing. That's the right process at the wrong time; mitigate first, root-cause in the follow-up.
- **Forward-fixing when a rollback was available.** A new untested deploy stacked on an incident when reverting to the known-good build would have been faster and reversible. Rule out rollback in writing first.
- **"The deploy went out" as verification.** Declaring victory without watching the detecting signal recover. Restart/rollback can complete while the symptom lives on.
- **Cowboy patch, no paper trail.** A speculative fix with no timeline, no reversible note, no review. This is the sloppy half of the failure this skill prevents.
- **No follow-up filed.** Treating mitigation as resolution. The symptom patch or rollback gets forgotten, mistaken for the real fix, and the bug returns — often worse.
- **"While I'm here" cleanup / refactor in a hotfix.** Every extra line is unreviewed risk deployed onto a live incident. Minimal diff only.
- **Relaxing security to move fast.** Disabling auth, committing a secret, exposing an internal endpoint. This opens a second, worse incident.
- **Guessing instead of escalating.** Stacking speculative changes when no safe mitigation is known. Fast honest escalation beats a wrong patch.
- **Deploying an unverified hotfix.** Not exercising the specific broken path before shipping. Unverified fix onto an incident = one incident becomes two.

## Worked micro-examples

**Input:** "Checkout is throwing 500s for everyone, started ~10 minutes ago."
**Correct behavior:** Assess (step 1): all users, checkout down, money-blocking → SEV1; start time ~10 min ago. Pull the deploy/flag log for that window — a release went out 12 minutes ago (prime suspect). **Do not** start reading the serializer to find the root cause. Mitigate (step 2): rollback is available and top-priority → revert to the previous build; write the reversible note (rolled back `abc123` → `def456`). Verify (step 4): watch the checkout error rate — it falls from 38% to <0.1% and holds for 10 minutes; run a test purchase end-to-end and it succeeds. Timeline logged throughout (step 5). File the follow-up (step 6): root-cause the 500 via `fix-bug` (reproduce, hypotheses, 5-whys, regression test), then re-land the reverted release with the real fix; note that a canary on checkout error rate would have caught this pre-full-rollout. Report state transitions: MITIGATED → VERIFIED → follow-up-filed.

**Input:** "Error rate spiked after the flag rollout, but the bug is actually in code that shipped three releases ago — rolling back the release won't help."
**Correct behavior:** Assess: the flag flip *exposed* an old latent bug; prime suspect is the flag, not the latest deploy. Mitigate (step 2): rollback of the release is N/A (bug predates it) — write that down; flag-off IS available and precise → turn the flag off, restoring the pre-exposure behavior instantly, reversible-documented. Verify the error rate returns to baseline and holds. Only if the flag could *not* be turned off would a forward-fix be on the table — and then it'd be the minimal symptom-level clamp, path-tested, reviewed if possible. Follow-up: root-cause the latent defect via `fix-bug`, fix it at the root, then re-enable the flag safely; note the guardrail gap (the flag had no canary / no gradual ramp that would have surfaced the spike at 1% instead of 100%).
