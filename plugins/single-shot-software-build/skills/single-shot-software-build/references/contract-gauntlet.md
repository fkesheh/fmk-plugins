# The Contract Gauntlet — adversarially review the prep BEFORE you freeze

A pre-freeze adversarial review of the prep itself (scaffold + frozen contract + design system +
product direction + decomposition + workflow). It is the highest-leverage gate in the pipeline, for
one reason: **the contract is about to become immutable.** A flaw frozen in is inherited by every one
of the N implementers and can never be fixed during the build — the moment before freeze is the last
chance to catch it, and the cheapest place to fix it (one file, not N modules).

The typechecker polices the *mechanical* half of the contract (signatures compile). It cannot see the
*judgment* half — a service method whose documented semantics contradict the route that calls it, a
screen the module briefs direct that no design-system primitive can compose, an entity in the seed
that no module owns, an auth rule stated in prose but absent from the contract's error semantics.
Those are exactly the failures that sink a build, and exactly what an adversarial reviewer catches.

**Why independent + strong-tier:** the prep's author (you) has blind spots. Run a **panel of ≥3
independent reviewers on a strong tier** — judgment-heavy review is where weak models miss the most.
Consensus on the fatals gives reliability; the union of findings gives breadth (in practice each
reviewer surfaces distinct real defects). A `fatal` or `major` finding **blocks the fan-out** until
the contract is repaired; re-review if the contract changed materially; freeze and fan out only when
the panel returns no fatal/major.

(Validated on the game-build sibling of this skill: run blind against the prep of a real failed
build, a 3-reviewer panel returned 3/3 REJECT and independently surfaced every defect a human
post-mortem had found, plus one fatal it had missed. Prep flaws compile fine and then get inherited,
unfixably, by the whole fleet.)

## The eight refute-lenses

Each reviewer is told to **refute** the claim "this prep is sound and ready to freeze" — default
posture: assume something is broken and find it. The lenses, and the failure each is tuned to catch:

1. **Contract coherence & completeness** — a frontend data-hook or screen that needs a route the
   route table doesn't have; an untyped hole (`any`, bare `string` where a union was a decision);
   a service interface a route handler needs but that doesn't exist; an event with no typed payload.
   Does `shared/` typecheck on its own?
2. **Decomposition totality** — a file owned by two modules; a responsibility owned by NO module
   (who wires the session middleware? who owns the API client? who writes `package.json` scripts?);
   an entity in the seed with no screens and no routes; a non-integrator module doing broad concrete
   imports across the boundary.
3. **Doc↔code self-consistency** — any frozen artifact contradicting another: a config constant the
   validation prose disagrees with; a route whose response type doesn't match the service method it
   must call; error semantics documented on the interface but impossible given the error-shape union;
   seed data that violates the contract's own types or business rules.
4. **Screen buildability** — can the frozen design-system primitives actually compose **every screen
   the module briefs direct**? Find the gap: a brief demanding inline-editable tables when Table has
   no edit affordance; a dashboard direction with no chart primitive and no direction on what to use
   instead; dark-mode tokens with hardcoded-light EmptyState art. Are the briefs dense (per-screen
   states + micro-interactions) or did "make it nice" slip back in?
5. **Auth & security coherence** — does every route in the table have a stated authorization rule?
   Is ownership scoping expressible through the contract (do list/get methods take the requesting
   user)? Is the `unauthorized` vs `forbidden` vs `not_found` distinction consistently specified
   (information-leak surface)? Any secret, token, or credential in the seed/config that shouldn't be?
6. **Product coherence** — walk the Phase-0 "first three minutes" script and the verb list against
   the contract: does every verb resolve to a screen AND a route AND a service method? Is there a
   dead-end flow (a screen with no way to create the data it lists), a dominant shortcut that makes
   half the product pointless, or a core loop that can't complete with the seeded data?
7. **UX completeness** — does the contract expose everything the screens must show (every readable
   state has a route to fetch it)? Are empty/loading/error/success states specified per screen in the
   briefs? Validation messages defined in config rather than left to N agents to invent? Onboarding
   (what a fresh login sees) specified?
8. **Gate completeness** — does the workflow actually seed, boot, and **assert** (auth'd requests
   succeed, unauth'd get 401, core flows return contract-shaped data), and does it end in judge loops
   that look at the rendered product? Or does it stop at "it compiled" — letting a booting-but-hollow
   app pass green?

## Reviewer prompt (adapt; spawn ≥3 independent, strong-tier)

> You are an adversarial pre-freeze reviewer. A team has written the FROZEN PREP for `<project>` and
> is about to mark the contract IMMUTABLE and fan the build out to ~N parallel implementers. This is
> the LAST chance to fix the contract — once frozen, every downstream agent inherits its flaws. The
> build has NOT happened; review ONLY the prep (shared/contract.ts, shared/config.ts, seed, the
> design-system files, the module briefs + DIRECTION, plan.json, the workflow script) — do NOT expect
> built module code.
>
> Refute the claim "this prep is sound and ready to freeze." Apply all eight lenses (coherence,
> totality, consistency, screen-buildability, auth-security, product-coherence, ux-completeness,
> gate). Quote the offending lines. Report a ranked list (most build-sinking first); for each: lens,
> severity (fatal | major | minor), file + short quoted evidence, why it sinks the build if frozen
> as-is, and the fix. Be honest if a lens finds nothing. End with a one-line verdict:
> FREEZE / FIX-FIRST / REJECT.

Prep findings are usually cheap to just fix — favor fixing over litigating. Only pipe a finding
through a skeptic verifier if repairing it would ripple through the contract.

## Optional: a tracer-bullet screen

The strongest version of lens 4 is empirical: before the full fan-out, have one agent build a single
**hero screen** (the product's main list or dashboard) from the frozen primitives + tokens + a mocked
data shape from the contract, screenshot it headlessly, and judge that one shot against the design
direction. If the frozen kit can't make one screen look like the direction, it won't make twelve —
and you learn it for the cost of one screen, not the whole build.

## Finding schema (for structured output / aggregation)

```json
{
  "type": "object",
  "required": ["findings", "verdict"],
  "properties": {
    "findings": { "type": "array", "items": {
      "type": "object",
      "required": ["lens", "severity", "file", "issue", "fix"],
      "properties": {
        "lens": { "type": "string", "enum": ["coherence","totality","consistency","buildability","security","product","ux","gate"] },
        "severity": { "type": "string", "enum": ["fatal","major","minor"] },
        "file": { "type": "string" },
        "issue": { "type": "string" },
        "fix": { "type": "string" }
      }
    }},
    "verdict": { "type": "string", "enum": ["FREEZE","FIX-FIRST","REJECT"] }
  }
}
```
