---
name: fig-implement
description: Faithfully implement a Figma screen/frame as code (React Native, web, etc.) from a `.fig` file — pixel-accurate, not "close enough". Use this WHENEVER the user wants to build, recreate, port, or convert a specific Figma screen/frame/design into code: "implement this figma screen", "build the X screen from the figma", "turn this design into a React Native component", "make it match the figma", "recreate this frame in code", or when they point at a `.fig` file (or a figma.com link with a `node-id`) and want the UI built. The hard part this solves is fidelity: a Figma frame is fully described in the file (geometry, z-order, gradients, image crop modes, blur/shadow effects, vector paths, type), and the failure mode is eyeballing a visual impression and silently dropping or approximating that data. This skill extracts the COMPLETE spec from the decoded file and drives the implementation from it. Builds on the `open-fig` skill (which decodes the `.fig`). Trigger even if the user doesn't say "faithful" — implementing a real design from a file always wants this discipline.
---

# fig-implement — build a Figma frame in code, faithfully

A Figma frame is not a picture to approximate — it's a complete data structure. Every position, fill mode, gradient stop, image crop, blur radius, and vector path is in the file. The reliable way to reproduce it in code is to **extract that data in full and implement node-by-node from it**, never from a glance at a render.

This matters because the natural failure mode (for humans and LLMs alike) is to look at the design, form a visual impression, write approximate layout, and quietly drop the inconvenient parts (a blur layer, an image's crop transform, the exact z-order). The result looks ~right but is subtly wrong, and you can't tell which detail you lost. Driving from the extracted spec makes every detail explicit and checkable.

## Prerequisite: decode the `.fig` first

This skill works on the **decoded** file. If you only have a `.fig`, use the **`open-fig`** skill to produce `canvas.json` + extracted `images/`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/../open-fig/scripts/fig2json.js" "<file.fig>" <outDir>
```

## Workflow

### 1. Identify the target frame's node id
From a figma URL `…?node-id=54646-2561` the id is `54646:2561` (the scripts accept either form). Or list frames with open-fig: `node …/open-fig/scripts/query.js <canvas.json> screens`.

### 2. Extract the complete spec
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/frame_spec.js" <canvas.json> <frameId> <outDir>
```
Writes `frame-spec.json`: every visible node, **z-ordered bottom→top**, with scale-aware box (px + `% of artboard`), all fills (solid/gradient/image with `scaleMode` + `imageTransform`), strokes, effects (blur/shadow), corner radius, opacity/blend, text + full typography, and auto-layout. Vector-only subtrees (icons/logos) are collapsed to one node flagged for SVG export. **This file is your source of truth — read it and implement from it.**

### 3. Get the assets
- **Image fills:** the spec lists a `hash` per image fill; the matching file is in the extracted `images/<hash>` (rename with a `.png`/`.jpg` extension to use it).
- **Vectors (logos/icons):** they are real geometry stored in `blobs[]`, not images. Export crisp SVG:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/frame_svg.js" <canvas.json> <nodeId> out.svg --vector-only
  ```
  For RN, dump each path's `d`+`fill` into a `react-native-svg` component (`<Svg viewBox><Path/></Svg>`).

### 4. Implement from the spec — honoring these fidelity rules
These are exactly the details that get lost. Each is in `frame-spec.json`; use it.

- **Render in z-order.** `zOrderBottomToTop` is sorted (via each node's fractional-index `parentIndex.position`). Later = on top. Don't reorder by guesswork.
- **Use the scaled box.** `box`/`boxPct` already include accumulated transform scale — use them, not raw `size`.
- **Image `scaleMode` is not optional.** `STRETCH`→`resizeMode:"stretch"`, `FILL`→`cover`, `FIT`→`contain`. Defaulting everything to `cover` crops off margins and reframes the image — the single most common fidelity bug. Also apply `imageTransform` (the in-box scale/offset crop).
- **Don't drop effect or decorative layers.** Blur glows, drop shadows, ambient gradient blobs are deliberate. Reproduce the effect even if exact blur is hard (e.g. `expo-blur`, or layered `react-native-svg` `RadialGradient`s). Skipping them flattens the design.
- **Gradients:** read `stops` + `direction`/`gradientTransform`; map to your gradient API's start/end. `#rrggbb00` means that color fully transparent → `rgba(r,g,b,0)`.
- **Fonts:** check what the project bundles before referencing a family. If the design's font isn't available, substitute the closest weights and say so in a comment — don't invent a font dependency.
- **Positions:** when the frame's aspect ≈ the target device's, positioning by `% of artboard` reproduces it cleanly; otherwise use absolute px or the layout system. Don't hand-pick spacing.
- **Watch translucent / effect layers over opaque fills — this is the one a static spec can't predict.** A semi-transparent tint, gradient, or approximated blur/glow sitting above an opaque fill *shifts that fill's color*. If an opaque element (e.g. a photo) hides the same tint over an adjacent region, two areas that should be one color diverge into a visible seam. Keep brand/panel fills at their exact spec hex: scope or re-order the tint so it can't contaminate them. Approximated blur is the usual culprit — a hard `RadialGradient` tints harder than a soft Gaussian. You will not catch this by reading the spec; you catch it by measuring pixels (next step).

### 5. Verify by MEASURING pixels, not just eyeballing
A spec-match review (z-order + hex values agree with `frame-spec.json`) can pass while the *composited* result is wrong — translucent layers shift colors, approximated blurs bleed. So verify the rendered output, not the code:

- **Use a FULL-frame reference.** Compare against a full-height Figma export (or `thumbnail.png`), not a partial crop — bugs hide in the regions your reference doesn't show. (A cropped reference is how a lower-panel color seam once shipped: the reviewer literally couldn't see it.)
- **Render the build and sample pixels at every boundary** where a translucent/effect layer meets an opaque fill, or where an image fades into a fill:
  ```bash
  uv run --with pillow python3 "${CLAUDE_PLUGIN_ROOT}/scripts/probe_strip.py" <screenshot.png> --x 0.5 --from <topPct> --to <botPct>
  ```
  A value that should be continuous across a boundary but jumps (e.g. `#523dea` → `#5c5eed`) is a seam — trace it to the layer tinting one side, restore the exact spec hex, and re-measure until continuous. Sampling the design export the same way gives you the target hex to match.
- Only declare done when the measured colors at the boundaries match the design.

## Scaling up: spec → clean-room agents

For a complex screen, the spec lets you parallelize without losing fidelity: hand `frame-spec.json` + the assets + the target image to a fresh implementer agent (and separate test/review agents) instead of carrying a biased visual impression. Because the spec is complete, an agent with no prior context can build it faithfully. A review agent should diff the code's position/color/z-order literals against `frame-spec.json`.

## Honest limits
- Raster photos are pixels — you get the extracted image, not editable layers.
- Exact blur/effect rendering varies by platform; approximate and note it.
- `frame_spec.js` derives gradient direction heuristically — verify the axis on rotated gradients against `gradientTransform`.
- This reads designs to build code; it does not write `.fig` files.
