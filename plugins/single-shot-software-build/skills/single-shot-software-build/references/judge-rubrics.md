# The Judge Loops — close the loop on what the product actually looks and feels like

The gate proves the app compiles, seeds, boots, and answers requests. Two properties can never be
verified statically: **does the rendered product look designed**, and **is it actually usable by a
first-time user**? Both get a full closed loop — capture → judge → verify → fix → **re-capture →
re-judge** — because an unlooped inspection only reports problems; a looped one removes them. This
loop is what lets the build *exceed* a first generation instead of just shipping it.

Run two judges in parallel; they are siblings with different mandates:

- the **product-design judge** owns how it *looks* (hierarchy, cohesion, density, polish),
- the **UX judge** owns how it *reads and controls* (comprehension, affordance, feedback, task success).

Both feed file-targeted fixes back into fixers. Neither is a pass/fail gate — they are the last
implementers, working in the only medium the others couldn't see: the rendered result.

## Capture protocol (Playwright or any headless browser)

Write one small capture script (commit it — it becomes the regression harness) that logs in with the
seeded credentials and captures:

1. **Every primary screen with seeded data** — the states a real user sees most.
2. **The reachable edge states** — an empty state (apply a filter that matches nothing), a form
   mid-validation-error (submit invalid input), a loading state if capturable, the 404/error page.
3. **One narrow viewport** (~390px) of the two most important screens — layout collapse is the most
   common uncaught defect in generated UIs.
4. **A driven first-time-user task** — drive the *real* UI through the product's core loop from the
   Phase-0 three-minute script (e.g. "log in → create an invoice → mark it paid → see it reflected in
   the dashboard total"). Log a trace: did it succeed, how many steps, where it stalled, whether every
   action produced visible feedback. Success-with-friction is the signal no static lens can see.

## Product-design judge — 6 axes, 1–10 each, judged against the design direction

Hand it the screenshots, the design-token file (the one-sentence aesthetic + palette), and the
per-screen direction from the module briefs. Tell it to be a demanding design director.

1. **Hierarchy & composition** — does each screen have an obvious primary action and reading order,
   or is everything the same weight?
2. **Token discipline & cohesion** — do all screens look like one product? Ad-hoc colors, off-scale
   spacing, or a screen that visibly came from a different hand are failures.
3. **Density & purpose** — does the screen feel like a living product (seeded data doing real work,
   informative secondary detail) or a wireframe with labels?
4. **State craft** — are empty states designed (icon + guidance + action) rather than blank? Are
   skeletons/loading states shaped like the content they replace?
5. **Micro-polish** — hover/focus states, spacing rhythm, alignment, truncation handling, table
   number alignment. The 2% that separates finished from generated.
6. **Responsive integrity** — do the narrow-viewport shots hold up, or do tables shear and toolbars
   wrap into soup?

## UX judge — 7 axes, 1–10 each, judged against the product direction

Hand it the screenshots AND the driven-task trace.

1. **Glanceability** — can a user read the critical state of the product (what needs attention, key
   totals, current context) without hunting?
2. **Legibility** — contrast, sizes, label clarity at real resolution; readable on the narrow viewport.
3. **Affordance & discoverability** — do interactive things look interactive; can a new user find
   create/edit/delete without a manual?
4. **Feedback & latency** — does every action visibly respond (button loading states, optimistic
   updates, toasts, inline errors)? Silent success and silent failure are both failures.
5. **State coverage** — empty/loading/error/success all present and designed; no dead ends (every
   empty state offers the way out; errors say what to do).
6. **Onboarding** — does a fresh login orient the user? Is the first useful action obvious within
   seconds (the seeded demo helps; the judge checks the screens teach, not just display)?
7. **Task success** — did the driven first-time-user task complete, and with how much friction
   (stalls, misclicks, dead ends, missing feedback)?

## Judge output schema (both judges)

```json
{
  "type": "object",
  "required": ["surface", "scores", "overall", "findings"],
  "properties": {
    "surface": { "type": "string" },
    "scores": { "type": "object" },
    "overall": { "type": "integer" },
    "taskSucceeded": { "type": "boolean" },
    "findings": { "type": "array", "items": {
      "type": "object",
      "required": ["axis", "issue", "file", "fix", "severity"],
      "properties": {
        "axis": { "type": "string" }, "issue": { "type": "string" },
        "file": { "type": "string" }, "fix": { "type": "string" },
        "severity": { "type": "string", "enum": ["major", "minor"] }
      }
    }}
  }
}
```

Findings must be **file-targeted** ("hierarchy: InvoiceList.tsx — the Delete button carries the same
visual weight as Create; demote to ghost variant") — "make it cleaner" is useless to a fixer.

## The fix loop and pass bar

1. Capture the screen set + run the driven task.
2. Judge every surface with both judges (parallel).
3. Adversarially verify `major` findings (skeptic told to refute from the screenshot/trace; default
   real=false); keep survivors.
4. Group by file; one fixer per file. Fixers may edit any file **except the immutable contract** —
   if a screen needs data the contract doesn't expose, that's a contract gap the gauntlet should have
   caught; log it, don't hot-edit the contract.
5. **Re-capture and re-judge.**
6. Repeat until every axis ≥ the bar (default ≥8) and `taskSucceeded` is true, or no `major` survives
   two rounds. Bound the loop (≤3 rounds); log honestly what still falls short.
7. Keep the capture script + final screenshots as the regression baseline, committed with the app.

## Common findings and their fixes

- **"Everything has the same visual weight"** → hierarchy. One primary action per screen; demote the
  rest to secondary/ghost.
- **"Screen came from a different product"** → token discipline. Trace every color/spacing to the
  tokens; replace ad-hoc values.
- **"Empty state is a blank div"** → state craft. EmptyState primitive with guidance + action.
- **"Clicked and nothing happened"** → feedback. Button loading state, toast on success, inline error
  on failure.
- **"Task stalled at step N"** → the trace pinpoints the dead end; fix that control's discoverability
  or wiring — this is the single highest-value finding a judge produces.
- **"Table unusable at 390px"** → responsive integrity. Collapse to cards or add purposeful
  horizontal scroll with pinned key column.
