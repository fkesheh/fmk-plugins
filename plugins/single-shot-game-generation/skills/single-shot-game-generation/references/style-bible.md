# The Style Bible — author the look before any art agent runs

The style bible is a one-page art-direction document you (the orchestrator) write during Phase 2 and
embed **verbatim** in every visual implementer prompt. It is the single biggest lever on how the game
looks. Five independent sonnet art agents will read it instead of each other's code; it is the only
thing making their output cohere into one art-directed game.

This guide has three parts: the **style bible template**, the **per-asset model-sheet spec** (the
dense visual contract), and a **worked low-poly example**.

## Table of contents
- [Style bible template](#template)
- [Per-asset model-sheet spec](#model-sheet)
- [World population & atmosphere spec](#world)
- [Worked example — cozy low-poly medieval](#example)
- [Why each section earns its place](#why)

<a name="template"></a>
## Style bible template

Fill every field. Keep it to ~one page — it's direction, not a novel.

```
# STYLE BIBLE — <game name>

## Mood & references
One or two sentences of intent + 2–4 reference touchstones.
e.g. "Cozy golden-hour storybook low-poly; hand-crafted, warm, slightly stylized.
Touchstones: Townscaper, Bad North, Monument Valley lighting."

## Material model  (pick ONE — never mix)
- [ ] Flat-shaded / toon: flat or lightly-ramped shading, crisp facets, no specular.
- [ ] PBR: physically-based — REQUIRES an environment map / IBL (PBR with no IBL looks flat/plastic),
      plus consistent roughness/metalness conventions stated here.
Chosen: <flat | toon | PBR+IBL>. Renderer notes: <tone mapping, antialias, output color space>.

## Palette  (the named ramp — ALL colors trace to this; ad-hoc hex is a violation)
A small harmonious set, named. e.g.
  wood #8b5a2b · woodDark #5d3a1a · stone #8d8d83 · thatch #c9a227 · leaf #3e7c2f ·
  grass #5d9141 · water #3a6ea5 · skin #e0ac69 · clothRed #9b3d3d · gold #d4af37 ...
Rules: cohesive hues, limited count (~20–32), enough range for material reads at distance.

## Lighting recipe
Key + fill + ambient; shadows ON (soft). Day/night with mood palettes (dawn warm / noon neutral /
dusk golden / night deep-blue + stars), fog color always matched to sky. Post-processing if the
stack allows: tone mapping, subtle bloom, contact shadows/SSAO, gentle vignette + color grade.

## Camera & framing
e.g. "RTS 3/4 orbit, ~50° down, dolly zoom 25–110; assets read clearly at default distance."

## Silhouette language
The shared shape rules so assets feel like one set.
e.g. "Chunky low-poly, ~1.8u humans, gently tapered forms, roofs steeper than real, props read as
single bold silhouettes; no thin spindly geometry that disappears at distance."
```

<a name="model-sheet"></a>
## Per-asset model-sheet spec  (goes in the CONTRACT text, not the bible page)

This is the dense part that prevents generic output. For **every** building / unit / creature / prop,
write one line in the CONTRACT describing it like a model sheet: **silhouette + part budget +
storytelling details**, all colors named from the palette. Vague briefs ("detailed, distinctive")
reliably produce boxes; named specifics produce charm.

Format and examples:

```
makeTownHall — grand two-story timber-framed hall (20–40 prims): stone base platform, PALETTE.wood
  walls with PALETTE.woodDark cross-beams, steep PALETTE.thatch roof, 2 banners (PALETTE.clothRed),
  torch posts at the door, a small bell gable. Origin = footprint center, ground level.
makeHouse — cottage (12–20 prims): plaster walls, thatch roof, leaning chimney with PALETTE.stone
  stack, a door + 2 shuttered windows, a woodpile prop against one wall.
makeWindmill — stone tower + conical cap + 4-blade rotor; rotor NOT baked: group.userData.animate
  spins it. Reads as a windmill in silhouette alone.
makeVillager — blocky humanoid (~1.8u): tunic (clothBrown), straw hat, visible hands; limbs are
  pivot groups at shoulder/hip so walk/idle/attack are pure functions of phase.
makeTree — 4–6u: tapered trunk + 2–3 stacked foliage blobs, per-variant jitter via rng(variant);
  baked to one mesh. Pine variant = stacked cones.
```

Repeat for the whole asset list. The budget numbers matter: "20–50 primitives each" is what turns a
box into a building. Name the storytelling props explicitly — they are what makes it charming up
close.

<a name="world"></a>
## World population & atmosphere spec

An empty plane reads as a tech demo. Specify, in the CONTRACT:

- **Density & clustering** — scatter vegetation/rocks/decorative props in **organic clusters with
  clearings**, with target counts (e.g. "260 trees in clusters of 8–20, pines favor high ground; 26
  rock outcrops; 140 decorative props: flowers/bushes/mushrooms/logs"). The world must look lived-in
  before the player does anything.
- **Terrain** — biome vertex-tinting (sand near water, grass with dirt patches, rock on slopes),
  smooth color blending, a gentle heightfield (not a flat plane).
- **Atmosphere** — real-time shadows ON; day/night with the mood palettes from the bible; fog matched
  to sky; ambient motion (water ripple, foliage/flag sway).

<a name="example"></a>
## Worked example — "cozy low-poly medieval"

```
# STYLE BIBLE — Hearthhold (medieval survivors RTS)

## Mood & references
Cozy golden-hour storybook low-poly; warm, hand-crafted, readable from an RTS camera. Touchstones:
Bad North silhouettes, Townscaper warmth, Three.js flat-shaded low-poly.

## Material model
Flat-shaded Lambert (one cohesive model, no PBR mixing). Renderer: ACES tone mapping, antialias on,
sRGB output, PCFSoft shadows, capped pixel ratio.

## Palette (28 named colors)
wood #8b5a2b · woodDark #5d3a1a · woodLight #a97142 · plank #b08d57 · thatch #c9a227 ·
stone #8d8d83 · stoneDark #6e6e66 · slate #5c6670 · leaf #3e7c2f · leafDark #2d5e23 · pine #2f5d3a ·
grass #5d9141 · dirt #7a5a39 · sand #cbb678 · wheat #d9b13b · skin #e0ac69 · clothRed #9b3d3d ·
clothBlue #3d5a9b · clothGreen #4a7a3d · clothBrown #6e5232 · iron #9aa3ad · gold #d4af37 ·
berry #b03060 · enemy #4a3328 · water #3a6ea5 · fire #ff7733 · bone #e8e0c9 · thatchDark #a07d18

## Lighting recipe
Hemisphere ambient + warm key (sun, castShadow, 2048 map, frustum follows camera) + cool fill. Day
starts mid-morning; dawn warm → noon neutral → dusk golden → night deep-blue with a Points starfield;
scene.fog color always tracks the sky. Glowing sun/moon spheres orbit far out.

## Camera & framing
RTS 3/4 orbit ~52° down, zoom 25–110 via wheel, q/e yaw. Buildings read clearly at default zoom.

## Silhouette language
Chunky low-poly; ~1.8u humans with pivot-anchored limbs; roofs steeper than real; props are single
bold shapes; nothing thin enough to vanish at distance.
```

Then the CONTRACT carries ~15 building model-sheet lines, ~8 unit lines, the props catalog, and the
"260 trees / 140 props / biome-tinted terrain / day-night" world spec. That density — not the model —
is what produced a game that looked hand-crafted.

<a name="why"></a>
## Why each section earns its place

- **Mood + references** give every art agent the same target so five outputs share a vibe.
- **One material model** prevents the most common incoherence (flat here, shiny-plastic there).
- **The palette** is the cohesion engine: when all five agents pull from the same named ramp, their
  independent output looks color-coordinated automatically. This is why the palette lives in the
  *immutable* primitives file, not in prose.
- **The per-asset model sheet** is the difference between "a box" and "a charming cottage" — it
  removes the implementer's need to invent, and inventions are generic.
- **World density + atmosphere** are what separate "a populated world" from "objects on a plane" —
  usually the single biggest perceptual difference between a polished and an unpolished build.
