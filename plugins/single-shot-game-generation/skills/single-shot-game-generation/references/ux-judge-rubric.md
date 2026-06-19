# The UX-Director Judge — close the loop on whether the interface is actually usable

This is the interface sibling of the art-director judge (`visual-judge-rubric.md`). The static review
lens (3c) and the gauntlet (2.5) bake the UX requirements in up front and catch UX *bugs against the
spec*. But one property can't be verified statically — **is the rendered interface actually usable?**
Can a first-time player read the state, find the controls, understand the threat, and complete the core
tasks? That needs a look at the running UI, so it gets a full closed loop: capture → UX-director judge →
fix → re-capture → re-judge, exactly like visuals.

The art director owns how it *looks*; the UX director owns how it *reads and controls*. Run both in
parallel in Phase 4.

## Table of contents
- [Capture protocol (states + a real task)](#protocol)
- [The 8-axis rubric](#rubric)
- [Judge prompt + output schema](#judge)
- [The fix loop and pass bar](#loop)
- [Common findings and their fixes](#common)

<a name="protocol"></a>
## Capture protocol — interface states AND a driven task

Two kinds of evidence, because UX is about comprehension *and* control:

1. **State screenshots** — the UI in each state it must handle, so the judge can read legibility and
   coverage: HUD mid-play (resources/population/threat all visible), build/tech menus open, the
   selection panel with something selected, a build-placement/ghost state, the first-run/onboarding
   screen, and the **win** and **lose** screens. Capture at the real gameplay resolution(s), including
   one small/awkward viewport if multiple are targeted.
2. **A driven first-time-player task** — drive the *real* interface (debug API + synthetic
   input/clicks) through a core task a new player must do — e.g. "build a house and assign a worker",
   "train a soldier and survive the first wave". Log a short trace: did it succeed, how many
   steps/misclicks, where it stalled, and the latency between an action and its on-screen feedback.
   Success-with-friction is the signal the static lens can't see.

<a name="rubric"></a>
## The 8-axis rubric

Each axis 1–10 against the **UX bible** (conformance + execution — the judge is handed the bible).

1. **Information hierarchy & glanceability** — can the player read the critical state (resources,
   population, current threat, what's selected) in a glance, or is it buried/cluttered/missing?
2. **Legibility** — text/icons readable at the real gameplay zoom and resolution: contrast, size,
   overlap, never illegible over a busy 3D scene.
3. **Affordance & discoverability** — do interactive things look interactive; can a new player find the
   build menu, the train buttons, the controls, without a manual?
4. **Feedback & latency** — does every action produce immediate, legible feedback (selection, hover,
   invalid placement, can't-afford, damage), within the bible's latency budget?
5. **State coverage** — are empty / loading / error / win / lose / paused states all present and clear,
   not blank or stuck?
6. **Onboarding** — does the first run teach the core loop (build → gather → fight → survive) without a
   wall of text; is the first goal obvious?
7. **Accessibility** — meaning never encoded by color alone; keyboard reachable; reduced-motion respected;
   text not clipped when scaled.
8. **Task success** — did the driven first-time-player task complete, and how much friction (misclicks,
   stalls, dead ends) did it hit?

<a name="judge"></a>
## Judge prompt + output schema

Spawn one UX-director judge per state screenshot + one over the task trace (pipeline them); use a
capable model per the skill's model policy. Hand it the screenshot(s)/trace, the UX bible, and this
rubric. Tell it to be a demanding UX director and to return **file-targeted** fixes (which UI module +
the concrete change) — "make it clearer" is useless.

```json
{
  "type": "object",
  "required": ["surface", "scores", "overall", "taskSucceeded", "findings"],
  "properties": {
    "surface": { "type": "string" },
    "scores": {
      "type": "object",
      "required": ["hierarchy","legibility","affordance","feedback","stateCoverage","onboarding","accessibility","taskSuccess"],
      "properties": {
        "hierarchy": { "type": "integer" }, "legibility": { "type": "integer" },
        "affordance": { "type": "integer" }, "feedback": { "type": "integer" },
        "stateCoverage": { "type": "integer" }, "onboarding": { "type": "integer" },
        "accessibility": { "type": "integer" }, "taskSuccess": { "type": "integer" }
      }
    },
    "overall": { "type": "integer" },
    "taskSucceeded": { "type": "boolean" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["axis", "issue", "file", "fix", "severity"],
        "properties": {
          "axis": { "type": "string" }, "issue": { "type": "string" },
          "file": { "type": "string" }, "fix": { "type": "string" },
          "severity": { "type": "string", "enum": ["major", "minor"] }
        }
      }
    }
  }
}
```

Adversarially verify each `major` finding (a skeptic told to refute it from the shot/trace; default
real=false) before acting — same as the art-director loop.

<a name="loop"></a>
## The fix loop and pass bar

1. Capture the state set + run the driven task.
2. Judge every surface + the task trace (parallel).
3. Adversarially verify `major` findings; keep survivors.
4. Group by file; one fixer per UI file (may edit any file except the immutable contract — if the HUD
   needs a value the contract doesn't expose, that's a *contract* gap the gauntlet should have caught,
   not a freeze-time edit).
5. **Re-capture and re-judge.**
6. Repeat until every axis ≥ bar (e.g. ≥8) and `taskSucceeded` is true, or no `major` survives two
   rounds. Bound the loop (≤3 rounds); log what still falls short. Keep the state set as a regression
   baseline.

<a name="common"></a>
## Common findings and their fixes

- **"Can't tell what's selected / what the threat is"** → weak hierarchy. Add a selection panel,
  a prominent threat/next-wave indicator; raise contrast/size of critical readouts.
- **"New player doesn't know what to do"** → onboarding gap. Add a first-goal prompt / minimal tutorial
  step; make the first actionable building obvious.
- **"Clicked and nothing happened"** → missing feedback or latency over budget. Add hover/active/invalid
  states, immediate click feedback, can't-afford signalling.
- **"Text unreadable over the scene"** → legibility. Add a panel backing/scrim, raise contrast, increase
  size, cap against the busy 3D background.
- **"Win/lose/empty state is blank or stuck"** → state coverage. Implement the missing state screen with
  a clear message + next action (restart/continue).
- **"Meaning is color-only"** → accessibility. Add an icon/label/shape alongside the color encoding.
- **"Task stalled at step N"** → the driven trace pinpoints the exact dead end; fix that control's
  discoverability or wiring.
