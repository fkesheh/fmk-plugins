# The Art-Director Judge — close the loop on what it actually looks like

A correctness review cannot make a game beautiful — it checks that meshes attach and nothing leaks,
not whether the scene is well-composed. The thing that lets this pipeline *surpass* a one-shot
generation is a feedback loop on the **rendered result**: screenshot → judge against the style bible
→ fix → re-screenshot → re-judge, until it clears a bar. This file specifies that loop.

## Table of contents
- [Screenshot protocol](#protocol)
- [The 6-axis rubric](#rubric)
- [Judge prompt + output schema](#judge)
- [The fix loop and pass bar](#loop)
- [Common findings and their fixes](#common)

<a name="protocol"></a>
## Screenshot protocol

Capture a small, fixed **set** so the judge sees the game the way a player would, and so the set
doubles as a visual-regression baseline:

- **≥3 camera angles** — e.g. default RTS framing, a low hero angle, a top-down-ish overview.
- **≥2 times of day** — at minimum one daylight and one dusk/night, to exercise the lighting recipe.
- **1 hero close-up** — the most important asset (e.g. the town hall) filling the frame, to judge
  up-close charm.
- Drive capture through the real interface: headless browser screenshot (Playwright/Puppeteer) after
  the scene has populated and run a few seconds, or a canvas `toDataURL` dump triggered via the debug
  surface. Save as PNGs in a stable path (e.g. `verify/shots/`) so re-runs overwrite the baseline.
- Keep shadows and post-processing **on** for these shots even if you reduce resolution for speed —
  judging a shadow-less render defeats the purpose.

<a name="rubric"></a>
## The 6-axis rubric

Each axis scored 1–10 against the **style bible** (not generic taste — the judge is handed the bible
and scores conformance + execution).

1. **Composition & framing** — is the scene well-arranged and readable at the given camera, or empty/
   cluttered/awkwardly cropped?
2. **Color cohesion** — do colors look coordinated and on-palette, or clashing/muddy/ad-hoc? (A
   telltale of palette violations.)
3. **World density & life** — does the world look populated and lived-in (vegetation, props,
   clustering), or like objects scattered on a bare plane?
4. **Lighting & mood** — shadows present and grounding objects; time-of-day mood matches the bible;
   fog/sky coherent — or flat, floaty, ungrounded?
5. **Silhouette & detail** — are assets instantly recognizable in silhouette and charming up close
   (storytelling details present), or generic boxes?
6. **Programmer-art smells** — z-fighting, untextured flat grey, default-material plastic, clipping,
   harsh banding, missing ground shadows, billboard pop. (High score = few smells.)

<a name="judge"></a>
## Judge prompt + output schema

Spawn one **sonnet** judge per screenshot (pipeline them). Hand it the screenshot, the style bible,
and this rubric. Tell it to be a demanding art director and to return **file-targeted** fixes — vague
fixes ("make it prettier") are useless; the next phase needs to know which module to edit.

Output schema (validate it):

```json
{
  "type": "object",
  "required": ["shot", "scores", "overall", "findings"],
  "properties": {
    "shot": { "type": "string" },
    "scores": {
      "type": "object",
      "required": ["composition","color","density","lighting","silhouette","cleanliness"],
      "properties": {
        "composition": { "type": "integer" }, "color": { "type": "integer" },
        "density": { "type": "integer" }, "lighting": { "type": "integer" },
        "silhouette": { "type": "integer" }, "cleanliness": { "type": "integer" }
      }
    },
    "overall": { "type": "integer" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["axis", "issue", "file", "fix", "severity"],
        "properties": {
          "axis": { "type": "string" },
          "issue": { "type": "string" },
          "file": { "type": "string" },
          "fix": { "type": "string" },
          "severity": { "type": "string", "enum": ["major", "minor"] }
        }
      }
    }
  }
}
```

Then **adversarially verify** each finding (a skeptic told to refute it by quoting the code or
re-reading the shot — default real=false) exactly as in the gameplay gauntlet, so the fix loop only
acts on real problems.

<a name="loop"></a>
## The fix loop and pass bar

1. Capture the screenshot set.
2. Judge every shot (parallel sonnet) → findings.
3. Adversarially verify findings; keep the survivors.
4. Group confirmed findings by file; one sonnet fixer per file (the fixer may edit any file except
   the immutable contract — palette/primitives stay frozen; if a color is wrong, the *usage* changes,
   not the palette).
5. **Re-screenshot and re-judge.**
6. Repeat until the bar is met or you stop improving.

**Pass bar (tune to ambition):** every axis ≥ 8 on every shot, OR no `major` findings survive two
consecutive rounds. Bound the loop (e.g. ≤3 rounds) so it terminates; log what still falls short.
Keep the final screenshot set as the regression baseline.

<a name="common"></a>
## Common findings and their fixes

- **"Flat, floaty, no ground contact"** → shadows off or no contact shadow. Turn shadows on; add a
  soft ground shadow / SSAO. (Recurring regression when shadows were disabled "for test perf".)
- **"World looks empty / like a plane"** → worldgen density too low or absent. Increase scatter
  counts; cluster vegetation; add decorative props. Fix in the world/environment module.
- **"Colors clash / look muddy"** → ad-hoc hex instead of the palette, or too-wide hue range. Route
  all colors through the frozen palette; tighten the ramp.
- **"Plastic / inconsistent materials"** → PBR without IBL, or mixed material models. Add an
  environment map, or switch to the single flat/toon model from the bible.
- **"Generic boxes, not recognizable"** → per-asset spec was too thin. Raise the primitive budget and
  add the named storytelling details to that asset's factory.
- **"Banding / washed out"** → missing tone mapping / wrong color space. Set ACES tone mapping + sRGB
  output in the scene/lighting module.
