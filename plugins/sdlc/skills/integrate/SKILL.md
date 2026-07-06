---
name: integrate
description: Executor discipline for the integration task at the end of a multi-agent parallel build — wiring independently-built, contract-conforming modules into a running whole. Enforces an inventory gate (no wiring while any module reports a red gate or contract conflict), wiring-files-only ownership (never edit an implementer's module), composition strictly through the frozen contract types, typed config assembly validated at startup, and a driven end-to-end smoke test (primary path + one error path + auth on the wired surface) as the done criterion. Prevents integration from becoming the place where hacks accumulate — the silent adapter/cast/glue-shim that makes mismatched modules "fit" and converts a loud compile-time defect into a quiet runtime one. TRIGGER on phrases like "integrate the modules", "wire everything together", "run the integration task", "compose the built modules", "wire the composition root", "assemble and smoke test", "hook up the DI/entry point", "final wiring and end-to-end", "stitch the slices together", "wire config and routes", "bring up the assembled system", "/integrate". SKIP when a module still has a red gate or open contract conflict (send it back through the orchestrator first — do not integrate a known-red module), when the change is a single self-contained module with nothing to wire, or when the request is to write feature/module code rather than wire already-built modules.
---

# integrate — wire contract-conforming modules into a running whole

Assembles the modules that a parallel fan-out produced — independently built, each passing its own gates against a frozen contract — into a system that actually starts and serves a request. Its whole job is discipline at the seam: own only the wiring, compose modules through the contract, and prove the assembled path works end to end.

This skill exists because integration is where the contract-first method quietly dies. When two modules do not fit, the undisciplined move is to patch over the mismatch right here — a cast, a field-mapping shim, an adapter that translates module A's shape into what module B expects — instead of reporting which module deviated from the contract. That silent adapter is the single most damaging thing an integrator can do: it takes a defect the whole method exists to catch loudly at compile time and buries it as a quiet runtime bug, while making the deviating module look conformant. The integrator's power is that it sees all the modules at once; that is exactly why its temptation — "I'll just make them fit" — is so expensive.

## The core failure this prevents

Two concrete disasters, both born at the wiring seam:

- **The silent adapter.** Module A returns `PaymentResult` with `amountCents: number`; module B's checkout expects `amount: Money`. Instead of reporting that one side deviated from the contract, the integrator writes `{ amount: toMoney(a.amountCents) }` in the wiring. Now both modules "pass," the contract is a lie, and the mismatch resurfaces as a rounding bug in production. Root cause: a mismatch that should have gone back to an implementer was absorbed into glue.
- **"It compiles" mistaken for "it works."** The integrator wires everything, the typechecker is green, and the task is declared done — but no one ever started the system and drove a request through it. Auth middleware was never mounted, config was read from an env var that is unset in the real environment, and error shapes never propagate through the composition. Root cause: the done criterion was compilation, not a driven end-to-end path.

Everything below is machinery to make these two failures hard to reach by accident.

## Workflow

### 1. INVENTORY the built modules first

You cannot wire what you have not accounted for. Before touching a wiring file, collect each implementer's return summary and build a short inventory: for every module — the files it owns, its gate results (typecheck/compile, lint, tests), the decisions it made, and its open risks. Cross-check each module's public surface against the frozen contract: does it export the types/functions/error shapes the contract promised, with the promised signatures?

Read the contract, not the module bodies. You are protecting your context and your objectivity — you want to catch a shape mismatch from the contract + the module's declared exports, not by reverse-engineering its implementation.

**GATE 1 — all modules green and contract-clean before any wiring.** You may not start wiring while any module reports a red gate (failing typecheck/lint/tests) or an unresolved contract conflict (an export whose shape disagrees with the contract). A red module goes back through the orchestrator to its owning implementer — you do not fix it, and you do not wire around it. Integrating a known-red module buries its failure under integration noise, so that when the smoke test fails you cannot tell whether the defect is the module or your wiring. Green-in, then wire.

### 2. OWN ONLY THE WIRING FILES

Your exclusive files are the composition surface and nothing else: entry point(s), the DI / composition root, route or handler registration, config assembly, app startup/shutdown, and health wiring if the project has that convention. These are the files the decomposition assigned to the integrator. You never edit an implementer's module — not one line.

**GATE 2 — if wiring needs a module change, STOP and attribute.** The moment you find yourself wanting to edit a module's code to make integration work, integration has surfaced a real defect: either that module deviated from the contract, or the contract has a gap. Do not edit the module and do not paper over it in the wiring. Stop, and report to the orchestrator WHICH side is wrong, with the exact evidence: the contract's declared shape, the module's actual shape, and the file:line of each. The orchestrator routes it back to the owning implementer (module defect) or amends and re-freezes (contract gap).

The forbidden move here is the silent adapter — a cast (`as`), an `any`, a field-mapping object, or a translation shim inserted into the wiring to make two mismatched modules line up. It is forbidden because it is a lie about conformance: it makes a deviating module pass, hides the defect the contract-first method was built to expose, and turns a compile-time error into a runtime one. If you write a type assertion to force two modules together, you have re-introduced exactly the defect this whole method exists to prevent.

### 3. COMPOSE THROUGH THE CONTRACT

Modules meet only at the frozen contract types. The composition root is the one place that knows concrete implementations — it constructs `StripeGateway` and hands it to `Checkout` typed as the contract's `PaymentGateway` interface. The modules themselves never import each other; checkout knows the `PaymentGateway` *type*, never the `StripeGateway` *class*.

- Inject dependencies as their contract interface, not their concrete type. If a module can only be wired by importing another module's concrete class, that coupling should have been a contract seam — flag it (GATE 2 territory).
- The composition root is allowed to know everything; the modules are allowed to know only the contract. Keep that asymmetry: concrete knowledge flows down into the root, never sideways between modules.
- No business logic in the wiring. The composition root constructs and connects; it does not compute. Logic that creeps into wiring is usually an adapter in disguise.

### 4. CONFIG ASSEMBLY — typed, sourced, validated at startup

Wire the contract's typed config schema to its real sources: environment variables, config files, secret manager. The config is assembled in one place (the config-assembly file you own) and passed down as the contract's typed config object — modules receive typed config, they do not read the environment themselves.

- **No scattered env reads introduced at integration time.** Every `process.env` / `os.environ` / equivalent read lives in your config-assembly file and nowhere else. A module reaching into the environment is a wiring leak — the config seam exists precisely so modules stay environment-agnostic and testable.
- **Secrets come from the environment or a secret store only** — never a literal in code, never a committed default. If a secret has no source, that is a deployment gap to report, not a hardcoded fallback to invent.
- **Validate config at startup, fail fast and loud.** Parse and validate the whole config against its typed schema before the app begins serving. A missing or malformed value must crash startup with a clear message naming the offending key — not surface as an undefined at first request. A bad deployment should be un-startable, not subtly broken.

### 5. END-TO-END SMOKE — drive the assembled system

The done criterion is a driven end-to-end path through the real, assembled system — start it, hit the actual entry point, observe the real result and side effects. "It compiles" is not it. Re-running the modules' unit tests is not it; those already passed in isolation and prove nothing about the composition. You must exercise the wired whole.

Cover, at minimum, three paths:

- **The primary user path.** The main happy-path request, driven through the real entry point, producing the expected observable result and side effects (row written, message published, response body correct).
- **One error path.** Drive an input that must fail, and confirm the contract's error shape propagates all the way out through the composition — proving errors are not swallowed or reshaped at a seam.
- **Auth on the wired surface.** Drive a protected route with no / invalid / insufficient credentials and confirm it is actually rejected (401/403 or the project's equivalent). Middleware wiring is invisible to module-level tests — a route that is protected in the module's design but unmounted in the wiring will pass every unit test and be wide open in production. This is exactly the class of defect only integration can catch, so it is non-negotiable.

**GATE 3 — driven smoke green on the assembled system.** All three paths must pass against the actually-started system before the task is done. A green typecheck with no driven run does not satisfy this gate.

### 6. GAP TRIAGE — attribute before you fix

When the smoke test fails, do not reach for the nearest patch. Attribute the failure first, because where the defect lives determines who fixes it — and fixing the wrong-layer defect inside the wiring is the hack-absorption anti-pattern this skill exists to stop.

Three categories, each with a different owner:

- **(a) Wiring bug — yours.** Wrong construction order, a dependency not passed, a route not registered, a config key mis-mapped. This is your code; fix it in the wiring files.
- **(b) Module defect — report, route back.** A module does not behave as its contract promises (returns the wrong shape, throws the wrong error, ignores an input). Report to the orchestrator with file:line evidence; it routes back to the owning implementer. You do **not** fix it in the wiring — a fix here is the silent adapter.
- **(c) Contract gap — report, re-freeze.** Two modules each conform to the contract, but the contract itself under-specified the seam (missing field, ambiguous error case). Report to the orchestrator; it amends and re-freezes the contract, then affected modules update against it. You do **not** invent the missing piece in the wiring.

Every attribution carries file:line evidence — the contract line, the module line, and (for wiring bugs) your wiring line. Fixing a (b) or (c) defect yourself inside the composition layer is precisely the hack that buries a module or contract failure under integration glue; the discipline is to push it back to the layer that owns it.

### 7. STARTUP / SHUTDOWN HYGIENE

Wire the process lifecycle deterministically:

- **Deterministic init order.** Construct and initialize dependencies in an explicit, repeatable order (config → clients/pools → services → routes → listen). No reliance on import side effects or module-load ordering for correctness.
- **Graceful shutdown.** On termination signal, stop accepting new work and release resources (drain the server, close pools/connections) so shutdown is clean, not a hard kill mid-request.
- **Health endpoint** if the project has that convention — wire it so orchestration can tell live from dead. Do not invent one where the project has no such convention.

## Definition of done

The integration task is complete only when ALL hold:

1. Inventory built: every module's owned files, gate results, decisions, and risks accounted for; every module green and contract-clean (GATE 1).
2. Only wiring files were edited; no implementer module was modified (GATE 2). Any mismatch was reported and attributed, not absorbed.
3. Modules are composed through contract types only; the composition root is the sole holder of concrete implementations; no module imports another module's concrete class.
4. Config is assembled in one typed place from real sources, secrets from env/secret store only, validated at startup so a bad deployment fails fast.
5. Driven end-to-end smoke passes on the started system: primary path, one error path, and auth-rejection on a protected route (GATE 3).
6. No silent adapters: zero casts / `any` / field-mapping shims introduced to force mismatched modules together; wiring code is strongly typed.
7. No stubs, no TODOs in the wiring. Startup/shutdown order is deterministic; shutdown is graceful; health wiring present if conventional.
8. A one-screen composition map is included in the return.

## Return format

You are usually a subagent reporting to an orchestrator. Return a structured summary — never file dumps:

```
Integration summary
- Assembled: <one line — what system was wired from how many modules>
- Inventory: <N modules, all green + contract-clean: yes/no; any red module sent back: which>
- Wiring files owned: <exact path list — entry point, composition root, config, routes>
- Composition map: <one screen — what plugs into what, e.g.
    Checkout(PaymentGateway=StripeGateway, config.payments)
    WebhookHandler(config.webhooks) -> mounted at POST /webhooks (auth: signature)
    ...>
- Config keys consumed: <key -> source (env/file/secret store); validated-at-startup: yes>
- Smoke results: <primary path: pass; error path: pass (error shape propagated); auth-rejection: pass (401/403)>
- Gap triage: <any failures found, each attributed (a) wiring / (b) module defect / (c) contract gap, with file:line; what was routed back>
- Open risks / assumptions: <anything the wiring assumes that isn't proven>
```

Do not paste implementation code or full file contents into the summary. Report mismatches as evidence (contract shape vs module shape + file:line), never as a diff you applied to a module.

## Anti-patterns

- **The silent adapter.** A cast, `any`, or field-mapping shim in the wiring to make two mismatched modules fit — it hides a module/contract defect and converts a compile-time error into a runtime one. Report the mismatch; never absorb it.
- **Editing an implementer's module.** The moment wiring requires changing module code, a defect surfaced — attribute and route it back, don't fix it under integration noise.
- **Wiring a red module.** Integrating a module with a failing gate buries its failure so you can't tell module bug from wiring bug when smoke fails. Green-in first.
- **"It compiles" as done.** A green typecheck with no driven run proves nothing about the composition — unmounted middleware, unset config, and swallowed errors all compile fine.
- **Re-running unit tests instead of driving the system.** The modules' own tests already passed in isolation; they say nothing about the wired whole. Drive the real entry point.
- **Skipping the auth path.** Auth middleware wiring is invisible to module-level tests; a route protected in design but unmounted in wiring passes every unit test and is open in production.
- **Scattered env reads at integration time.** A `process.env` / `os.environ` read outside the config-assembly file is a wiring leak that makes modules environment-coupled and untestable.
- **Business logic in the composition root.** The root constructs and connects; logic creeping into wiring is usually an adapter in disguise.
- **Fixing a contract gap in the wiring.** Inventing the missing field/error in glue instead of reporting it means the contract stays a lie and the next build re-hits the gap.

## Worked micro-examples

**Input:** modules `StripeGateway`, `Checkout`, `WebhookHandler` all landed green against a frozen `payments` contract; wire them and smoke-test.

Correct behavior:
- **Inventory:** confirm each module's gates are green and its exports match the contract (`StripeGateway implements PaymentGateway`, `Checkout(deps: { gateway: PaymentGateway })`, webhook event types match). All clean → GATE 1 passes.
- **Wire (composition root only):** construct `StripeGateway` from `config.payments`, inject it into `Checkout` typed as `PaymentGateway`; register `WebhookHandler` at `POST /webhooks` behind signature verification. Assemble config from env, validate at startup.
- **Smoke on the started system:** place an order → gateway charges → `PaymentResult` returned → order marked paid (primary); submit a declined card → contract's `PaymentError` propagates to a clean 402 (error path); POST `/webhooks` with a bad signature → rejected 401 (auth). All green → GATE 3 passes. Return the composition map.

**Input:** during wiring, `Checkout` expects `amount: Money` but `StripeGateway.charge` returns `PaymentResult` with `amountCents: number`.

Wrong: write `{ amount: toMoney(res.amountCents) }` in the composition root to make them line up — a silent adapter that hides the deviation and buries a rounding bug for later.

Correct: STOP (GATE 2). Attribute the mismatch: the contract declares `PaymentResult.amount: Money` at `contract/payments.d.ts:12`, but `StripeGateway.charge` returns `amountCents: number` at `payments/gateway.ts:44` — the gateway deviated from the contract. Report to the orchestrator with both file:line refs; it routes back to the gateway's implementer to conform. Do not touch the module, and do not adapt in the wiring. If instead both modules matched their own reading of the contract and the contract itself never fixed the money representation, that is a contract gap (c) — report it; the orchestrator amends and re-freezes.
