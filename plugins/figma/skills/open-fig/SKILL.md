---
name: open-fig
description: Open, decode, and inspect a Figma `.fig` file locally — no Figma app, account, login, or network needed. Use this WHENEVER the user wants to look inside, read, open, decode, convert, or extract anything from a `.fig` file (or a Figma export sitting on disk): listing the screens/frames, pulling the text content of a screen, extracting design tokens (color/spacing variables), grabbing the embedded images, or turning the design into JSON so it can be implemented in code. Trigger even when the user just says "open this figma file", "what's in this .fig", "extract the design from X.fig", "get the colors out of the Figma file", or points at a path ending in `.fig` — they almost never know it's a proprietary binary, so don't make them ask for "decoding" by name. Do NOT use for live figma.com URLs (that needs the browser/Figma API, not this skill) or for already-exported PNG/SVG/PDF assets (just read those directly).
---

# open-fig — read a Figma `.fig` without Figma

A `.fig` file looks opaque but is fully decodable offline. This skill turns one into a JSON scene graph plus extracted assets, then lets you query screens, text, colors, and design tokens — so you can inspect a design or implement it in code without opening Figma or hitting its API.

## What a `.fig` actually is (so the steps make sense)

A `.fig` is a **ZIP** containing `canvas.fig`, `thumbnail.png`, `meta.json`, and `images/` (extension-less PNG/JPEG blobs). `canvas.fig` is Figma's **`fig-kiwi`** binary: an 8-byte magic, a version word, then length-prefixed blocks — block 0 is a Kiwi schema (deflate-raw), block 1 is the document tree. The tree decodes against its *own* embedded schema, so no external schema file is needed.

The one gotcha that breaks most third-party tools: **modern Figma compresses the data block with Zstandard** (magic `28 b5 2f fd`), not deflate. The bundled decoder auto-detects per block and uses Node's built-in zstd, so it handles both old and new exports. If you ever see a tool return "Attempted to parse invalid message" or a suspiciously tiny inflate, that tool predates the zstd switch — use this skill instead.

## Requirements

- **Node ≥ 23.8** (24 LTS recommended) — needs the built-in `zlib.zstdDecompressSync`. Check with `node -e "require('zlib').zstdDecompressSync && console.log('ok')"`. If it's missing, tell the user to use a newer Node; don't try to polyfill.
- `unzip` on PATH (standard on macOS/Linux) — used to expand the `.fig` container.
- No `npm install`, no network: the Kiwi decoder is vendored at `scripts/lib/kiwi.js`.

## Step 1 — decode

Run the decoder. It expands the container (so `images/`, `meta.json`, `thumbnail.png` land on disk) and writes `canvas.json` next to them.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/open-fig/scripts/fig2json.js" "<path/to/file.fig>" [outDir]
```

`outDir` defaults to `<file>.extracted/` beside the `.fig`. The command prints a summary: file name, node count, image count, design-token count, node-type histogram, and the top-level frames (screens) per page. That summary is usually enough to orient the user — relay the screen list and the headline counts.

`canvas.json` can be large (tens of MB) — **do not Read it into context wholesale.** Always go through Step 2's query helper or a targeted `node -e`/`jq` so only summaries enter context.

## Step 2 — inspect with the query helper

`query.js` rebuilds the node tree (the flat `nodeChanges` list is linked by `guid` = `sessionID:localID` and `parentIndex.guid`) and answers the common questions. Prefer it over hand-traversing the JSON.

```bash
Q="${CLAUDE_PLUGIN_ROOT}/skills/open-fig/scripts/query.js"
node "$Q" <canvas.json> screens [pageSubstr]   # list top-level frames per page
node "$Q" <canvas.json> find "<substr>"        # find any node by name substring
node "$Q" <canvas.json> frame "<name>"         # dump a frame's subtree: nesting, sizes, text, fonts, hex fills
node "$Q" <canvas.json> text  "<name>"         # just the text content under a frame (great for copy/i18n)
node "$Q" <canvas.json> tokens                 # design tokens (variables) grouped by set, with hex/number values
```

`frame`/`text` match by name (case-insensitive); on multiple matches they prefer an exact name, else the largest node (the screen, not a sub-element), and report what they picked.

## Choosing what to run

Map the user's intent to the smallest useful command — don't dump everything by default.

- **"open it" / "what's in this file"** → Step 1, then relay the printed screen list + counts.
- **"what does the X screen look like" / "implement the X screen"** → `frame "X"` for structure+styles; pair with the matching image in `images/` if they want the pixels.
- **"get the copy / text / translations"** → `text "X"` (or loop over screens).
- **"extract the colors / design tokens / theme"** → `tokens`. Offer to write them out as CSS variables / a TS theme / Tailwind config for the target codebase.
- **"show me the screens"** → view `thumbnail.png` (whole-canvas overview) and/or specific files under `images/`.

## Going deeper than the helper

For anything `query.js` doesn't cover (auto-layout, constraints, effects, component properties, exact transforms), query `canvas.json` directly but **keep raw data out of context** — print only what you need:

```bash
node -e '
const j=require("./canvas.json"); const n=j.nodeChanges;
const key=g=>g?g.sessionID+":"+g.localID:null;
// ...filter/summarize, console.log only the summary...
'
```

Useful node fields: `type`, `name`, `size {x,y}`, `transform`, `fillPaints[]` (`type:SOLID`, `color {r,g,b,a}` as 0–1 floats), `strokePaints[]`, `fontSize`, `fontName.family`, `textData.characters`, `cornerRadius`, `stackMode`/`stackSpacing` (auto-layout), `effects[]`. Colors are 0–1 floats — multiply by 255 for 8-bit / hex.

## Failure modes & honesty

- **`zstdDecompressSync` missing** → Node too old (see Requirements). Report it; don't fake a decode.
- **"kiwi decode failed"** → likely a `.fig` newer than the vendored `kiwi-schema` 0.5.0 schema model. Say so plainly; the assets (`images/`, `thumbnail.png`) are still extracted and usable. Refreshing the vendored `kiwi.js` (see `scripts/lib/NOTICE.md`) is the fix.
- **Vector shapes** carry no rasterized pixels — geometry is in path data. For visual fidelity, use the matching `images/` blob or the frame's exported asset, not the vector node.
- This reads designs; it does not write `.fig` files. If the user wants to *create/modify* a `.fig`, that's a different (lossy) path — say so rather than improvising.
