# The Contract Gauntlet — adversarially review the prep BEFORE you freeze

The contract gauntlet is a pre-freeze adversarial review of the prep itself (scaffold + frozen
contract + style bible + decomposition + workflow). It is the highest-leverage gate in the whole
pipeline, for one reason: **the contract is about to become immutable.** A flaw frozen in is inherited
by every one of the N implementers and can never be fixed during the build — so the moment just before
freeze is the last chance to catch it, and the cheapest place to fix it (one file, not N modules).

A type-checker polices the *mechanical* half of the contract (signatures compile). It cannot see the
*judgment* half — a helper whose name lies about its body, a style bible whose mood the frozen kit
can't produce, a decomposition that leaves an asset category unowned, a "gate" that scores nothing.
Those are exactly the failures that sink a build, and exactly what an adversarial reviewer catches.

**Why independent + strong-tier:** the prep's author has blind spots (and may be a weaker model). The
gauntlet must be run by **independent agents** (not the author) on a **strong tier** — judgment-heavy
review is where weak models miss the most. Run a **panel (≥3)**: consensus on the fatals gives
reliability, and the union of findings gives breadth (in practice each reviewer surfaces distinct real
defects). A finding of `fatal` or `major` **blocks the fan-out** until the contract is repaired; then
re-review if the contract changed materially, and only freeze + fan out when the panel returns no
fatal/major.

## The five refute-lenses

Each reviewer is told to **refute** "this prep is sound and ready to freeze" — default posture: assume
something is broken and find it. The lenses, and the real failure each is tuned to catch:

1. **Contract coherence & completeness** — a cross-boundary call with no signature; an untyped hole; an
   incomplete shared context handle (a module can't reach what it needs through the frozen surface); an
   event with no typed payload. Does the contract typecheck on its own?
2. **Decomposition totality** — a file owned by two modules; a responsibility or **asset category owned
   by NO module** (the factory map requires it but no module builds it); a non-integrator doing broad
   concrete imports.
3. **Doc↔code self-consistency** — any frozen artifact that contradicts another: a helper whose **name
   or docstring disagrees with what its code does**; a style-bible material/lighting mandate the frozen
   helpers can't honor; a palette named but not type-enforced; options accepted then silently dropped.
4. **Visual buildability** — can the frozen primitive kit + palette + material model **actually produce
   the mood the style bible states**? Find the gap (e.g. a photoreal/PBR mood on an untextured
   flat-shaded kit). Are per-asset primitive budgets present and reachable? Do bake vs. animate rules
   coexist (a baked single mesh can't have independently animated sub-parts)?
5. **Gate completeness** — does the workflow actually **run the game and assert**, and is there an
   **aesthetic gate that scores rendered output against the style bible**? Or does it stop at "it
   compiled / it ran once / one number went up" — letting a blank or off-mood scene pass green?
6. **Gameplay coherence** — can the **frozen config + systems actually produce the design bible's
   intended curve**? Is balance expressed as checkable intent (targets/relationships), not just loose
   numbers? Find the obvious dominant strategy, dead/stalling economy, or trivially-easy/unwinnable
   state baked into the numbers before any of it is built.
7. **UX completeness** — does the contract **expose everything the HUD must show** (every resource/
   state the player reads), and are **all states** (empty/loading/error/win/lose), **input modes**,
   the **feedback-latency budget**, **onboarding**, and **accessible encodings** specified — or will
   the UI agent have to invent them?
8. **Non-functional budgets** — are the **performance** (FPS/frame-time/memory), **load/bundle**, and
   **viewport/DPI** budgets present *and achievable with the frozen kit*? Do the RULES carry the
   implied constraints (pool/bake, no hot-path allocation, capability-guard, blur/resize handling)?

(Lenses 1–5 are the structural/visual core; 6–8 bake the gameplay, UX, and non-functional quality bar
into the freeze gate so it's enforced up front, not inspected after the build.)

## Reviewer prompt (adapt; spawn ≥3 independent, strong-tier)

> You are an adversarial pre-freeze reviewer. A team has written the FROZEN PREP for `<project>` and is
> about to mark the contract IMMUTABLE and fan the build out to ~N parallel implementers. This is the
> LAST chance to fix the contract — once frozen, every downstream agent inherits its flaws. The build
> has NOT happened; review ONLY the prep (contract files, config, primitives, style bible, plan, the
> workflow/verify scripts) — do NOT read built module code.
>
> Refute the claim "this prep is sound and ready to freeze." Apply all the lenses above (coherence,
> totality, consistency, buildability, gate, gameplay-coherence, UX-completeness, non-functional
> budgets). Quote the offending lines. Report a ranked list (most build-sinking first); for each: lens, severity
> (fatal | major | minor), file + short quoted evidence, why it sinks the build if frozen as-is, and
> the fix. Be honest if a lens finds nothing. End with a one-line verdict: FREEZE / FIX-FIRST / REJECT.

Optionally pipe each `fatal`/`major` finding through an independent skeptic (default real=false) before
acting, exactly like the build-phase adversarial verify — but prep findings are usually cheap to just
fix, so favor fixing over litigating.

## Optional: a visual tracer-bullet

The strongest version of lens 4 is empirical: before the full fan-out, have one agent build a single
**hero asset** (e.g. the town hall) from the frozen primitives + palette + material model, screenshot
it, and judge that one shot against the style bible. If the frozen kit can't make one asset look
on-mood, it won't make forty — and you've learned it for the cost of one asset, not the whole build.

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
        "lens": { "type": "string", "enum": ["coherence","totality","consistency","buildability","gate","gameplay","ux","nonfunctional"] },
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

## Why this earns its place (validated)

Run blind against the frozen prep of a real failed build (a low-model run whose finished game looked
broken), a 3-reviewer panel returned **3/3 REJECT** and independently surfaced every defect a manual
post-mortem had found — a `pbrMaterial()` helper that returned a non-PBR `MeshLambertMaterial`, a
resource-mesh asset category owned by no module, and a "gate" that screenshotted but scored nothing —
**plus a fourth fatal the post-mortem missed** (a geometry-bake helper that corrupts material indices).
Every one of those would have been inherited, unfixably, by the whole fan-out. The gauntlet is also the
best compensation available when the orchestrator was a weaker model: independent strong-tier reviewers
catch the contradictions the author couldn't see.
