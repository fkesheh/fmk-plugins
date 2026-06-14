# Contract-First Prep — Worked Example & Language Variants

## Table of contents
- [Worked example: a 3D RTS prepped for an 8-module fan-out](#worked-example)
- [What each contract artifact held](#artifacts)
- [The disjoint decomposition](#decomposition)
- [Sample per-module specs](#specs)
- [Language variants](#language-variants)
- [Sizing the decomposition](#sizing)
- [Expanded contract-writing checklist](#checklist)

<a name="worked-example"></a>
## Worked example: a 3D RTS prepped for an 8-module fan-out

A "medieval survival RTS" was built in TypeScript + Three.js by eight implementer agents working in
parallel. None of them read each other's code; they each implemented against one frozen contract.
The reason it fit together on the first typecheck was the prep below.

<a name="artifacts"></a>
### What each contract artifact held

**1. Type contract — `src/types.ts` (types only, no logic):**
- Every entity interface: `IEntity`, `IUnit`, `IBuilding`, `IResourceNode`, `IEnemy`, `IAnimal`.
- The **wiring interface** `IGameCtx` — the star at the center of the graph. Every module reaches
  shared services and live collections through it instead of importing concrete classes:

  ```ts
  export interface IGameCtx {
    scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    terrain: ITerrain; grid: IGrid; pathfinder: IPathfinder; dayNight: IDayNight;
    units: IUnit[]; enemies: IEnemy[]; buildings: IBuilding[]; nodes: IResourceNode[];
    bus: IEventBus;
    addUnit(u: IUnit): void;
    payCost(cost: Cost): boolean;            // false + 'error' sound if unaffordable
    findDropOff(pos: THREE.Vector3, type: ResourceType): IBuilding | null;
    spawnProjectile(from: THREE.Vector3, target: IEntity, damage: number, attacker: IEntity): void;
    // ...every cross-module capability, fully signed
  }
  ```

- The **event contract** — `EventPayloads` mapping each event name to its payload type, so emit and
  listen sides can't drift: `unitDied`, `buildingComplete`, `waveStarted`, `gameOver`, ...
- **Semantics the types can't carry**, in comments: *"update(ctx, dt): dt is game-seconds,
  pre-scaled by speed, 0 while paused"*; *"distance measured in the XZ plane"*;
  *"every entity sits at y = ctx.terrain.getHeight(x, z)"*.

**2. Pure-data config — `src/config/gameData.ts` (data only, no logic):**
- All balance in one immutable place: `BUILDINGS`, `UNITS`, `ENEMIES`, `WAVES`, `UPGRADES`, world
  constants. Every module read these; none of them could conflict over a number.

**3. Shared helpers — `src/meshes/common.ts`:**
- The low-level primitives many modules needed: a color palette, mesh builders (`box`, `cyl`,
  `cone`), a `bakeGroup` merge helper, and a **single seeded `rng`**. Writing the RNG once meant
  the world generator and the prop placer produced consistent results instead of diverging.

<a name="decomposition"></a>
### The disjoint decomposition (8 modules, no shared files)

| Module | Owns (disjoint file set) |
| --- | --- |
| core | eventBus, input, cameraController, sound |
| world | noise, terrain, water, grid, dayNight, worldGen |
| meshes-buildings | props, buildings |
| meshes-units | units (rigs), fx |
| entities | entity base, resourceNode, building, unit, enemy, animal |
| systems | pathfinding, combat, waves, production |
| ui | index.html, styles, hud, buildMenu, selectionPanel, minimap, messages, overlays |
| **game (integrator)** | game, selection, commands, placement, main |

`game` is the **integrator**: the only module allowed broad concrete imports. It constructs the
`IGameCtx`, instantiates every service, runs the loop, and wires the leaves together. Every other
module is a leaf that depends only on the contract.

<a name="specs"></a>
### Sample per-module specs

Each implementer got the full contract plus a focused spec like these:

- **entities** — "Implement `src/entities/*` against the interfaces in `types.ts`. The villager FSM
  must be bulletproof: every state has an exit for death/depletion/destruction of its target;
  orders clear prior state cleanly; no entity ever references a dead target (check `.dead` before
  every use). Buildings drive construction/training/farming per the contract."
- **systems** — "Implement `src/systems/*`. A* with no corner-cutting and snap-to-walkable
  endpoints. Wave timing math exactly per the contract formula; never spawn a wave twice; handle
  3× game speed without skipping the warning."

Plus shared rules every implementer received: *contract files are immutable; create only your
assigned files; import other modules only through their documented exports; no TODOs or stubs.*

<a name="language-variants"></a>
## Language variants

The three artifacts map onto any statically checkable stack:

| Artifact | TypeScript | Python | Rust | Go | Java / Kotlin |
| --- | --- | --- | --- | --- | --- |
| Type contract | `types.ts` (interfaces, types, unions) | `protocols.py` (`typing.Protocol`, `dataclass`, `Literal`, `TypedDict`) | a `contract` module (traits, structs, enums) | a `contract` package (interfaces, structs) | interfaces + records |
| Pure-data config | `config.ts` (`const`) | `config.py` (constants / frozen dataclasses) | `consts.rs` | `config.go` (`const`/vars) | a `Config` class of constants |
| Shared helpers | `common.ts` | `common.py` | `util.rs` | `util` package | a `Util` class |
| Typecheck gate | `tsc --noEmit` (strict) | `pyright`/`mypy --strict` | `cargo check` | `go build` + `go vet` | the compiler |

The technique is sharpest in languages where the contract is *compiler-enforced*. In Python, the
discipline only holds if you actually run `pyright`/`mypy` in strict mode — otherwise `Protocol`
definitions are just suggestions.

<a name="sizing"></a>
## Sizing the decomposition

- **One module ≈ one coherent layer** an implementer can hold in its head end to end.
- **5–10 modules** is the sweet spot. Fewer and each is too big to parallelize usefully; more and
  the contract surface between them grows faster than the speedup.
- Split by **layer/responsibility**, not by feature, so files cluster naturally and the boundaries
  fall on the contract.
- Always carve out **one integrator** that owns wiring + entry point. Without it, leaves end up
  importing each other and the parallelism collapses.

<a name="checklist"></a>
## Expanded contract-writing checklist

- [ ] Every planned module's cross-boundary calls resolve to a signature already in the contract.
- [ ] No `any` / untyped escape hatches.
- [ ] Units, ranges, coordinate frames, ownership, lifecycle, and formulas are stated in comments.
- [ ] A single wiring interface (the "context") routes cross-module capability.
- [ ] Every event/message has a named payload type.
- [ ] The contract file holds no runtime logic and typechecks on its own.
- [ ] The config file holds pure data and no logic.
- [ ] Shared helpers exist for primitives more than one module needs (RNG, math, formatting).
