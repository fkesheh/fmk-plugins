---
name: write-adr
description: Executor discipline for writing an architecture proposal or Architecture Decision Record (ADR). Enforces constraints-first (hunt and verify hard constraints before generating options), explicit non-goals, 2-4 real options at equal depth, trade-off framing on the axes that matter, one committed recommendation stated up front, reversibility classification with concrete tripwires, and a consequences section — in standard numbered ADR format. Blocks the single most common failure: the option-list essay — three alternatives described neutrally, a limp "it depends" ending, constraints discovered after the decision, and no record of what would make the decision wrong. Use when you must choose between architectural approaches and record the reasoning durably. TRIGGER on phrases like "write an ADR", "should we use X or Y", "propose an architecture for", "document this decision", "pick a database/queue/framework for", "architecture decision record", "compare these approaches and recommend one", "monolith vs microservices for", "which auth strategy should we use", "record why we chose X", "design doc for this component", "evaluate options and decide". SKIP when the user already decided and wants only the implementation (use the build/feature workflow); when it is a reversible, low-stakes pick they want made inline without ceremony (just recommend in a sentence); or when it is a pure bug fix or refactor with no branching choice (use fix-bug / the refactor workflow).
---

# write-adr — executor discipline for architecture proposals and ADRs

You have been asked to decide between architectural approaches and record the decision so it survives the people who made it. Your job is not to enumerate options and shrug — it is to surface the constraints that actually govern the choice, compare real alternatives on the axes that matter, commit to one recommendation with checkable reasoning, and write down what would prove the decision wrong. Do that with the judgment of a staff engineer, not the neutrality of a Wikipedia editor.

This skill exists to stop the **option-list essay**: the failure where a capable model lists three alternatives at equal, shallow depth, describes each neutrally so as not to be "opinionated," ends with "it depends on your priorities," discovers a hard constraint (the existing stack, a compliance rule, the budget) only after the analysis is written, and leaves no record of the conditions under which the decision should be revisited. That artifact is worthless in review and worse in two years. The gates below make the shortcut mechanically hard: they force constraints before options, equal depth across real alternatives, a committed recommendation on the first screen, and concrete tripwires.

You are usually a subagent reporting to an orchestrator, or an engineer producing a document a team will review. Respect the file boundary you were given, store the ADR where the project already keeps them, and report back a structured summary — never a file dump.

## The workflow (each step is a gate)

### 1. Constraints first — hunt them, verify each against reality

Before you generate a single option, enumerate the **hard constraints** that any acceptable answer must satisfy, and verify each one against the actual world — not your assumptions about it. Hard constraints are the ones that eliminate options outright:

- **Existing stack and interfaces** — the languages, datastores, runtimes, cloud, and services already in production. A "just use Postgres" option is dead on arrival in a shop that runs only DynamoDB, unless the ADR is explicitly about migrating. Verify by reading the codebase, dependency manifests, infra config, and CI — not by guessing.
- **Team skills and size** — what the people who will operate this actually know. A five-person team with no Kubernetes experience carries a different constraint than a platform org. Verify by asking, or by what the repo history reveals.
- **SLAs / performance / scale** — latency budgets, throughput, availability targets, data volume. Verify against real numbers (current p99, current row counts, current QPS) where they exist.
- **Budget and cost** — infra spend, license cost, and the human cost of operating the thing. Verify the order of magnitude; a decision that assumes a budget nobody approved is fiction.
- **Compliance / security / data residency** — regulatory regimes (GDPR, HIPAA, SOC2, PCI), audit requirements, where data may physically live, auth/authz obligations. These are almost always hard constraints and almost always eliminate options. Verify against the project's stated obligations.
- **Deadlines** — a decision that can only be delivered after the date it is needed is not an option.

**Gate: an option that violates a verified hard constraint never appears as an option.** It may appear in a one-line "rejected before analysis" note ("Kafka — rejected: no team has run it, and the 3-week deadline rules out the operational ramp"), but it does not get a full column in the comparison. The reason for this gate is the exact failure this skill prevents: **a constraint discovered after the decision invalidates the whole analysis.** If halfway through writing you uncover a constraint that kills your leading option, you did not do this step — go back and do it. Hunt constraints up front, on purpose, aggressively, because they are cheap to find now and catastrophic to find in review.

Separate **hard constraints** (violation = disqualified) from **soft preferences** (violation = a point against, weighed later). Be honest about which is which; inflating a preference into a constraint is how you rig the analysis toward a predetermined answer.

### 2. State the non-goals explicitly

Write down what this decision **deliberately does not solve**. This is not filler — it is the fence that stops the review from re-litigating scope. "This ADR chooses the message transport; it does **not** decide the event schema, the retry policy, or whether we adopt event sourcing" tells every reviewer which objections are in scope and which are a different document. Without stated non-goals, a decision about caching turns into an unbounded debate about the entire data layer, and the ADR never lands.

Name 2-5 non-goals. Prefer the ones a reasonable reviewer would otherwise assume are in scope.

### 3. Real options — 2 to 4, each at equal depth, each with its genuine best case

List the genuine contenders that survive the constraints. For each option, describe it **at the same depth as every other**, and articulate the case a smart advocate for that option would make — its real best case, not a setup for its rejection.

- **A strawman is lying with extra steps.** If you describe your preferred option in three paragraphs and the alternatives in one dismissive sentence each, you have not done an analysis — you have written a justification and disguised it as one. A reviewer can smell it, and it destroys the document's credibility. Give each option its strongest form; a recommendation that beats the alternatives at their best is trustworthy, one that beats a strawman is not.
- **Include "do nothing / status quo" whenever it is viable.** Keeping the current approach is almost always a real option, and it is the baseline every other option must beat. Omitting it hides the cost of change. Only drop it when the status quo provably violates a hard constraint (e.g. the current system cannot meet a newly-mandatory SLA).
- **2 to 4 options.** One option is not a decision, it is an announcement — if you truly have only one, the ADR is about ratifying a foregone conclusion, so say that. More than four usually means you have not applied the constraints yet; go filter.

### 4. Trade-off framing, not feature lists

Compare the options on the **axes that matter for this specific decision**, with evidence over vibes. A feature checklist ("supports X, has Y, offers Z") is not analysis — it does not tell the reader what they are giving up. Frame the comparison as trade-offs on axes such as:

- **Operational burden** — who runs this at 3am, what breaks, how much on-call load it adds.
- **Failure modes** — how it fails, how visibly, how recoverably; the blast radius when it does.
- **Migration / adoption cost** — the one-time cost to get there from the status quo, including data migration and retraining.
- **Reversibility** — how hard it is to back out if it goes wrong (feeds step 6).
- **Team familiarity** — the ramp cost and the error rate of a team that has not used it.
- **Cost at scale** — how the bill grows with load, not just the sticker price.
- Plus any axis unique to this decision (consistency model, latency floor, vendor lock-in, security surface).

Pick the 3-6 axes that genuinely discriminate between these options for this problem; do not pad with axes on which every option is identical. Back each judgment with **evidence** — a benchmark, a measurement, a `file:line` reference to the current code, a link to the vendor's docs or a published limit, a real cost figure. "Option B is faster" is a vibe; "Option B's published p99 is 4ms vs Option A's measured 40ms on our workload" is evidence. Where you genuinely lack evidence, say so and mark it as an open question (step 8) rather than asserting a guess as fact. A compact comparison table across axes is often the clearest form — but the table supplements prose that explains the trade-offs, it does not replace it.

### 5. One recommendation, committed, on the first screen — with checkable reasoning

**Commit to exactly one option and state it in the first screen of the document**, before the detailed analysis. A reader who stops after the first paragraph must know what you recommend and roughly why. Burying the recommendation under the option list, or ending on "it depends," is the option-list essay this skill exists to kill.

The reasoning must **reference the constraints (step 1) and the axes (step 4)**, so a reader can check your logic rather than just accept your conclusion. "We recommend Option B because it is the only option that meets the HIPAA data-residency constraint while staying within the on-call capacity of a three-person team, at the cost of higher migration effort we accept because it is a one-time cost" is checkable — every clause maps to a constraint or an axis. "We recommend Option B because it is the best fit" is not; it is a vibe wearing a suit.

"It depends" is only acceptable when the dependency is a **decision only a human stakeholder can make** — and then you do not shrug, you name the question (step 8). You still recommend the option that is best under the most likely answer, and state how the recommendation changes if the answer differs.

### 6. Reversibility and tripwires — what makes this ADR useful in two years

Classify the decision as a **one-way door** (expensive or impossible to reverse — a public API contract, a data model everything depends on, a vendor with deep lock-in, a security posture) or a **two-way door** (cheaply reversible — an internal library choice, a config default, a swappable adapter). This classification governs how much ceremony the decision deserves (see "Right-size the ceremony") and how much caution the recommendation warrants. Amazon's framing applies: agonize over one-way doors, move fast on two-way doors.

Then, for the recommendation, write **concrete tripwires** — the observable conditions under which the team should revisit this decision:

> Revisit this ADR if: monthly write volume exceeds ~50M rows (the single-node ceiling we sized for); OR p99 write latency exceeds 100ms sustained; OR we add a hard multi-region-active requirement; OR the vendor's price-per-GB rises above $X.

Tripwires are what make an ADR alive instead of an archaeological artifact. A tripwire is specific, observable, and threshold-bearing — "if we get bigger" is not a tripwire, "if daily active users exceed 100k" is. They tell a future engineer, who has forgotten all the context, exactly when the decision has expired. Write them for the assumptions that were load-bearing in step 4.

### 7. Consequences — what you are signing the team up for

Write the **consequences** section honestly, in three parts:

- **What becomes easier** — the capabilities and simplifications this decision unlocks.
- **What becomes harder** — the things this decision makes more awkward, slower, or more constrained. Every real decision has these; an ADR with only upsides is untrustworthy.
- **New obligations the team accepts** — the ongoing costs: a service to operate, a dependency to keep patched, a runbook to maintain, a cost line that grows, a skill the team must acquire, an SLA now owed to a consumer. These are the debts the decision creates, and naming them is what lets a team consent to them with open eyes.

### 8. Surface the human-only questions — do not assume the answers

When the decision genuinely hinges on input only a stakeholder can give — **budget approval, risk appetite, a business priority, a compliance interpretation, a timeline trade-off** — do not silently pick a value and bury it in an assumption. **List those questions explicitly** as open questions, with the option each answer favors:

> Open questions for stakeholders:
> - Is a ~$2k/mo managed-service premium acceptable to avoid self-hosting? (Yes → Option B; No → Option A + on-call cost)
> - Can we tolerate eventual consistency on the read path? (Yes → Option C viable; No → C is out)

This is the difference between an analysis that empowers a decision and one that fakes authority it does not have. Recommend under the most likely answers, and state how the recommendation flips if an answer differs. Inventing a budget or a risk tolerance to make the ADR look complete is a failure, not a convenience.

## Standard ADR format

Store the ADR where the project already keeps them. Look for `docs/adr/`, `docs/decisions/`, `doc/adr/`, an `adr/` directory, or a link from `CONTEXT.md` / `README`; match the existing numbering and file-naming convention. **Default to `docs/adr/NNNN-title-in-kebab-case.md`** (zero-padded sequential number) only when no convention exists. If the project uses a known tooling convention (MADR, adr-tools, Nygard's template), match it rather than imposing yours.

Structure the document as:

- **Number and title** — sequential number; title in the **imperative** ("Use Postgres for the event store", "Adopt hexagonal architecture for the billing module"), not a topic ("Database options"). The title states the decision, not the question.
- **Status** — `proposed` | `accepted` | `superseded by ADR-NNNN` | `deprecated`. A proposal starts `proposed`; it becomes `accepted` when the team agrees. When a later ADR overrides this one, set `superseded` and cross-link both ways.
- **Context** — the forces at play: the problem, the **constraints** (step 1), the **non-goals** (step 2), and the relevant background. This is where a future reader reconstructs why the decision was even necessary.
- **Decision** — the committed recommendation (step 5) stated plainly, with the reasoning that references constraints and axes, and the **options considered** with their trade-offs (steps 3-4). The recommendation appears before or at the top of this section.
- **Consequences** — easier / harder / new obligations (step 7).
- **Reversibility and tripwires** — one-way vs two-way door, and the concrete revisit conditions (step 6). Some templates fold this into Consequences; keep the tripwires findable either way.

**Link it up.** When the project has a `CONTEXT.md`, an architecture doc, or the code the decision governs, add a reference from there to the ADR (and note the code path in the ADR), so the decision is discoverable from the thing it constrains — not orphaned in a folder nobody opens.

## Right-size the ceremony

Match the depth of treatment to the stakes, governed by the reversibility classification (step 6):

- **One-way door, high blast radius** (public API shape, core data model, primary datastore, security architecture, vendor with lock-in): full treatment — every step above, evidence-backed axes, explicit tripwires, stakeholder questions surfaced. Spend the effort; the cost of getting it wrong dwarfs the cost of the analysis.
- **Two-way door, low blast radius** (an internal library pick, a lint config, a swappable adapter behind an interface): a **paragraph**, not an epic. State the choice, the one or two reasons, and "reversible — behind interface X, swap cost is low." Writing a ten-section ADR for a decision you can undo in an afternoon is its own anti-pattern: it burns reviewer attention and trains the team to ignore ADRs.

The skill's discipline scales down, it does not disappear: even the one-paragraph version states the choice and why. What you drop for a two-way door is the exhaustive option comparison and the stakeholder ceremony — not the commitment to a recommendation.

## Definition of done

Mechanical exit criteria — all must hold for a full-treatment ADR (relax proportionally for a right-sized two-way-door note):

1. Hard constraints are enumerated and each is verified against reality (codebase/config/stakeholder), with hard constraints separated from soft preferences.
2. No option in the comparison violates a verified hard constraint; disqualified options appear only as one-line rejected notes.
3. Non-goals are stated explicitly (2-5).
4. 2-4 real options are compared at equal depth, each with its genuine best case; "do nothing / status quo" is included or its omission justified.
5. Options are compared on 3-6 discriminating axes with evidence (measurements, `file:line`, doc links, cost figures) — not feature lists or vibes.
6. Exactly one recommendation is committed and stated in the first screen, with reasoning that references the constraints and axes.
7. The decision is classified one-way vs two-way door, and the recommendation carries concrete, threshold-bearing tripwires.
8. A consequences section states what becomes easier, harder, and the new obligations accepted.
9. Human-only questions (budget, risk appetite, priorities) are listed as open questions, not silently assumed.
10. The ADR uses standard format (number, imperative title, status, context, decision, consequences), is stored in the project's ADR location, and is linked from the relevant code / CONTEXT.md where those exist.

## Return format

Report back to the orchestrator a structured summary — never the full document:

```
ADR: <number> — <imperative title>
Status: proposed | accepted
File: <path> (linked from <CONTEXT.md / code path / none>)

Recommendation: <the chosen option, one line>
  Reasoning: <the 1-2 constraints/axes that decided it>
Options considered: <A / B / C — one phrase each>; rejected up front: <opt — reason>
Decision type: one-way | two-way door
Key tripwires: <the 1-3 revisit thresholds>

Open questions for stakeholders: <the human-only decisions still needed, or "none">
Risks / assumptions: <load-bearing assumptions or evidence gaps>
```

Keep it tight. The orchestrator needs the decision, the reasoning hooks, the file location, and the questions still owed to a human — not the prose you wrote.

## Anti-patterns (do not do these)

- **The option-list essay.** Neutral descriptions of every option and an "it depends" ending. This is the failure this skill exists to prevent — a document that decides nothing wastes everyone's review time.
- **Constraints discovered after the decision.** Writing the analysis, then realizing your leading option violates the existing stack or a compliance rule. Hunt constraints first; a late one invalidates everything above it.
- **Strawman alternatives.** Describing the non-preferred options shallowly or unfairly so the recommendation looks obvious. A reviewer sees through it and stops trusting the whole document.
- **Feature-list comparison.** "Supports X, has Y" tells no one what they are giving up. Frame trade-offs on discriminating axes with evidence.
- **Buried or hedged recommendation.** No committed choice, or one hidden below the analysis. Commit, and put it on the first screen.
- **Vibes over evidence.** "Faster / more scalable / more modern" with no measurement, reference, or figure behind it. Cite the benchmark, the `file:line`, the doc, the cost.
- **No tripwires.** An ADR with no revisit conditions is dead the day the context is forgotten. Write specific, threshold-bearing tripwires for the load-bearing assumptions.
- **Consequences with only upsides.** Every real decision makes something harder and creates an obligation. An all-benefits ADR is not honest.
- **Assuming a stakeholder's answer.** Silently inventing a budget or risk tolerance to make the ADR look finished. List the human-only questions instead.
- **Over-ceremony on a two-way door.** A ten-section ADR for a reversible library pick trains the team to ignore ADRs. Right-size to a paragraph.

## Worked micro-examples

**Input:** "Write an ADR: should we move our background jobs from an in-process scheduler to a dedicated queue?"
**Correct behavior:** Hunt constraints first — read the codebase to find the current stack (e.g. it already runs Redis and Postgres; the team is three engineers with no Kafka experience; there is a compliance requirement that job payloads stay in the EU region) and verify each (step 1). Disqualify up front anything that violates them: Kafka is a one-line rejected note (no team experience, operational ramp exceeds the deadline). State non-goals: this ADR does not decide the job-retry policy or whether to adopt workflow orchestration (step 2). Real options at equal depth: (A) status quo in-process scheduler; (B) Redis-backed queue (Sidekiq/BullMQ-style) on the Redis they already run; (C) managed cloud queue (SQS-style) (step 3). Compare on operational burden, failure modes (what happens to in-flight jobs on deploy/crash), migration cost, EU-residency fit, team familiarity, cost at scale — with evidence: current job volume from the code/metrics, the residency guarantee from each vendor's docs (step 4). Commit on the first screen: "Recommend Option B — the only option that reuses infra the team already operates and keeps payloads in-region, at the cost of Redis persistence tuning we accept" (step 5). Classify two-way-ish (behind a job-enqueue interface) and write tripwires: "revisit if job volume exceeds ~1M/day or if we need cross-region active-active" (step 6). Consequences: easier — jobs survive deploys; harder — a Redis persistence concern to operate; new obligation — a dead-letter runbook (step 7). Open question for stakeholders: "is the managed-queue premium acceptable? if yes, reconsider C" (step 8). Store at `docs/adr/0007-use-redis-backed-queue-for-background-jobs.md`, status `proposed`, linked from CONTEXT.md.

**Input:** "Should we use `date-fns` or `dayjs` for date handling in the web app?"
**Correct behavior:** Recognize this as a two-way door, low blast radius — do not write a ten-section ADR. Right-size to a paragraph (or a tiny ADR if the project files even small ones): state the choice, one or two real reasons (bundle size and tree-shaking vs. a familiar Moment-like API), note "reversible — both wrap `Date`, swap cost is a day", and pick one. No stakeholder questions, no elaborate axis table. The discipline scales down to "choice + why + reversibility"; the ceremony does not appear.
