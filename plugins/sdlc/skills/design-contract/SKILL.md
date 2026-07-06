---
name: design-contract
description: Executor discipline for authoring the FROZEN contract — the interfaces, types, error taxonomy, config schema, and constants that parallel implementers and test writers build against — with zero logic smuggled in. Enforces strong types (no any/dict/stringly-typed enums), first-class error shapes, boundary completeness between parallel tasks, a decision log, and a freeze protocol that makes the contract immutable once fan-out starts. Exists to prevent leaky, ambiguous contracts that cause parallel agents to diverge and integration to fail. TRIGGER on phrases like "design the contract", "write the contract first", "freeze the interfaces", "define the types and signatures", "contract-first", "set up the API contract before we split the work", "define the error shapes", "write the shared types for the parallel tasks", "spec the config schema", "the interface contract for the fan-out", "author the frozen contract", "define the seams between modules". SKIP when the user wants the implementation itself (this skill produces signatures and types, not bodies), when there is only one implementer and no seam to freeze (just write the code), or when an authoritative external contract already exists (OpenAPI/protobuf/published SDK) and the task is to conform to it, not to design it.
---

# design-contract — the frozen contract, done right

Produces ONE artifact: a frozen contract — type definitions, interface/function signatures, an error taxonomy, a config schema, and constants — that parallel implementers and test writers build against without further coordination. It contains zero logic. It is immutable the moment fan-out starts.

This skill exists because a capable model, asked to "write the contract," tends to leak. It smuggles a helper's logic into a signature, types a field `any`/`dict`/`string` because the exact shape "will be obvious later," leaves the error behavior of an operation unstated, and forgets that a data shape touched by two parallel tasks must live in the contract or the two tasks will invent two incompatible versions of it. Every one of those is invisible at authoring time and lethal at integration time: parallel agents diverge, the wiring step fails, and the whole point of fanning out is lost. The discipline below makes each leak mechanically catchable before you freeze.

## What a contract is — and is not

A contract is the set of promises two or more independently-built parts rely on. It answers, for every seam: *what types cross this boundary, what operations exist, what shape do they take, what can go wrong, and who imports whom.* It is the frozen reference every downstream task spec cites.

A contract is NOT: an implementation, a set of stubs you intend to fill, a place for "obvious" helper logic, or a suggestion. If an implementer can read your contract and still have to guess a type, an error, or a boundary, it is not a contract yet — it is a sketch.

Contains ONLY these five things:

1. **Type definitions** — the data shapes that cross boundaries.
2. **Interface / function signatures** — names, parameters (typed), return types. Bodies are type-level only.
3. **Error taxonomy** — every error a caller can observe, as typed variants, with recoverability and expected caller action.
4. **Config schema** — every configurable value, typed, with defaults and absence-meaning.
5. **Constants** — shared literals, enum members, limits, keys.

Anything else — control flow, calculations, I/O, orchestration — belongs in an implementation, not here.

## The Hard Gate — no logic in the contract

You may NOT declare the contract frozen while any executable logic lives in it. Mechanically checkable:

- A function/method has NO body beyond a type-level placeholder. Allowed placeholders, by language: an interface/abstract/protocol declaration; a `type`/signature-only declaration; `raise NotImplementedError` / `throw new Error("not implemented")` / `abstract`/`...`/`pass`. Anything that computes, branches, loops, mutates, or performs I/O fails the gate.
- No default value in the contract is computed by running code. A default is a literal or a named constant, never `factory()` that does work.
- No import of an implementation module. The contract may import only the standard type system, other contract files, and declared-type-only third-party symbols.

If a function body appears (beyond the placeholders above), it is not a contract — it is an implementation wearing a contract's name. Extract the logic to an implementer's task and leave the signature.

Why this gate is hard and not "guidance": the instant logic lives in the contract, one of two things happens — implementers duplicate it (drift) or import the contract for behavior (the contract becomes a runtime dependency and can no longer be frozen). Both defeat the parallel build.

## Workflow

### 1. Enumerate the seams before you type anything

List every boundary in the planned decomposition where two independently-built parts meet. A seam is any of: a function one task calls that another implements; a data shape produced by one task and consumed by another; a config value read in more than one place; an error one task raises and another must handle.

For each seam, name the two parties (Producer, Consumer) and the direction of the import (who is allowed to import whom — see step 5). Write this list down first. It is the checklist that step 8 audits against. A seam you did not enumerate is a seam you will not cover, and an uncovered seam is exactly where two implementers diverge.

If the decomposition is not yet known, STOP — you cannot design a contract for an unknown set of seams. Ask the orchestrator for the task breakdown first.

### 2. Type the data shapes — strong types only

For every shape crossing a seam, write a precise type. The standard is: **make illegal states unrepresentable** to the extent the type system allows.

Forbidden without explicit, documented justification:

- **`any` / `unknown` / untyped `dict` / `object` / `interface{}` / bare `map`** as a way to avoid naming a shape. If the shape is known, name it. If it is genuinely open (e.g. passthrough JSON), type it as a named alias (`RawProviderPayload = Record<string, JsonValue>`) and document at the field why it is open.
- **Stringly-typed enums.** A field with a fixed set of values is an enum / union / sealed type, never a `string` with the allowed values buried in a comment. `status: "pending" | "active" | "closed"` or a real enum — never `status: string`.
- **Optional fields with unspecified absence-meaning.** Every nullable/optional field must document what its absence *means* (not set yet? not applicable? use default?). If absence and a sentinel value mean different things, that is two states — model them as two states. If you cannot state what `null` means, the field is under-designed.
- **Primitive obsession at critical boundaries.** IDs, money, durations, and units that must not be confused benefit from distinct types (branded types, newtypes, value objects) where the language supports it cheaply. Use judgment: a `UserId` newtype prevents a class of integration bug; over-wrapping every string does not.

Prefer sum types / discriminated unions to model "one of N shapes" over a wide struct with many mutually-exclusive optional fields. A discriminated union makes the consumer's exhaustive handling checkable by the compiler; a bag of optionals does not.

### 3. Write the operation signatures

For each operation crossing a seam: exact name, each parameter typed (no positional `any`), and a precise return type. The return type must encode success AND the ways it can fail that the caller is expected to branch on (see step 4 — errors as return values vs. thrown, per language convention).

Naming: match the existing codebase's conventions exactly — casing (`camelCase` vs `snake_case`), verb choices (`get`/`fetch`/`load`, `create`/`build`/`make`), pluralization, module layout. Grep the codebase for sibling names before inventing one. A contract whose names fight the house style invites implementers to "correct" them, which breaks the freeze.

No body. The signature plus its types and the error contract IS the specification. If you feel you must write a body to explain behavior, the behavior belongs in the task spec prose, not the contract.

### 4. Design the error shapes — first-class, not an afterthought

Unspecified error behavior is the single most common integration failure. For EVERY operation, specify:

- **What errors it can surface** — as typed variants, never raw strings. An error taxonomy is a closed enum/union/sealed hierarchy the caller can exhaustively handle: `ValidationError | NotFoundError | UpstreamTimeoutError`, each carrying typed context (which field, which id, retry-after). "Throws Error" is not an error contract.
- **Recoverable or not** — can the caller retry, fall back, or must it propagate? State it per variant. A `RateLimited { retryAfter: Seconds }` is recoverable; a `MalformedContract` is not.
- **What the caller is expected to do** — one line per variant. "On `NotFound`, the caller renders empty state; on `UpstreamTimeout`, the caller retries up to config `maxRetries` then surfaces `ServiceUnavailable`." This is the promise the consumer builds against.

Follow the language's convention for the error *channel* (exceptions vs. `Result`/`Either`/`(value, err)` tuples) but the taxonomy is explicit either way. Security note: error variants that cross a trust boundary must not leak secrets or internal detail — specify the sanitized shape the caller receives.

### 5. Specify boundaries and import direction

Two things per seam, both in the contract:

- **Ownership of shared shapes.** If two implementers will both touch a data shape, that shape lives in the contract, owned by neither task. State it. The failure this prevents: each task defines its own near-identical struct, and the integrator discovers at wiring time they are subtly incompatible.
- **Import direction.** State who may import whom. Contract is imported by all; implementers do not import each other across a seam — they meet only at the contract. Document the allowed dependency edges ("`api` layer imports `contract`; `worker` imports `contract`; `api` and `worker` never import each other"). This is the import whitelist every task spec will echo.

### 6. Config as a schema, never scattered reads

Every configurable value gets a single typed schema entry: name, type, default (a literal or named constant), and absence-meaning. No loose `getenv("X")` / `process.env.X` reads scattered across implementations — those are un-typed, un-defaulted, and un-discoverable, and two implementers will read the same variable with two different fallbacks. The contract's config schema is the one place the set of knobs is enumerated; implementers receive parsed, typed config, not raw env access.

Secrets are referenced by key in the schema, never given a literal default value. No credential appears in the contract.

### 7. Decision log — one line of *why* per non-obvious choice

For each choice an implementer might be tempted to "fix," record a one-line rationale: why this shape and not the obvious alternative, why this field is nullable, why this operation returns a union instead of throwing, why this default. Implementers who understand *why* do not silently amend the contract; implementers who do not, do. The decision log is the cheapest insurance against a well-meaning "improvement" that breaks the freeze.

Keep it terse — a bulleted `## Decision Log` with `- <choice>: <why in one line>`.

### 8. Self-check against every task and every test — then freeze

Before declaring the contract frozen, walk it against reality:

- **Per implementer task**: "Could this task be built with only the contract in hand — no questions to me, no peeking at another task's code?" Every "no" names a contract gap. Fill it.
- **Per test scenario the test-writer will author**: "Could this behavior be tested against only the contract — inputs, outputs, and error variants all nameable from the contract?" Every "no" is a gap. Fill it.
- **Per seam from step 1**: confirm it is covered — shape defined, ownership assigned, import direction stated, errors enumerated.

Only when every task and every test scenario passes do you freeze. Add the freeze header (below) and stop.

### The freeze header (mandatory, verbatim intent)

The contract file MUST open with an escalation rule so downstream agents cannot amend it locally:

```
FROZEN CONTRACT — immutable once fan-out has started.
If this contract is wrong or incomplete, STOP and report to the orchestrator;
do not amend locally. Local amendments cause parallel implementers to diverge.
```

Every downstream task spec cites the frozen contract by path. From freeze onward, the only legal change is: an implementer or reviewer reports a gap to the orchestrator, the orchestrator amends centrally and re-freezes, and the change is re-broadcast to all tasks. Never a local edit.

## Scope defaults

- **Versioning / backwards compatibility is OUT of scope unless the orchestrator explicitly asks.** Design the contract as it should be, not as a migration from an old one. Do not add compatibility shims, deprecated-but-kept fields, or version negotiation on your own initiative — they add surface area the tasks must honor for no requested reason.
- **No stubs, no TODOs** inside the contract's substantive content. A signature is not a stub; a half-named type with `// TODO decide shape` is. Decide it now or report the blocker to the orchestrator.
- **Security-first**, restated for this task: no credentials or secrets in the contract; error variants crossing a trust boundary carry sanitized shapes; any operation that touches protected data names the auth/authorization requirement in its signature or its decision-log line.

## Definition of done

Mechanical exit criteria — all must hold:

1. The contract file exists at the path the orchestrator assigned and opens with the freeze header.
2. Hard Gate passes: no executable logic anywhere; every signature body is a type-level placeholder; no default is computed; no implementation import.
3. Every seam from step 1 is covered: shape defined, ownership assigned, import direction stated.
4. No `any`/`unknown`/untyped-`dict`/stringly-typed-enum appears without a documented justification at its site.
5. Every operation has a typed error taxonomy with recoverability and expected caller action per variant.
6. Config is a single typed schema with literal/constant defaults and documented absence-meaning; no scattered raw env reads implied; no secret literals.
7. A `## Decision Log` records a one-line *why* for each non-obvious choice.
8. The self-check (step 8) passed for every planned task and every test scenario — no remaining "no".
9. Naming matches the existing codebase conventions (verified by grepping siblings).

If the contract cannot satisfy these because the decomposition or requirements are underspecified, do not paper over it — report the specific gap to the orchestrator.

## Return format

You are typically a subagent reporting to an orchestrator. Return a structured summary, NOT the file contents:

- **Contract path**: the file written.
- **Seams covered**: bullet list, each `Producer → Consumer: <shape/operation>` with the `file:line` in the contract where it is defined.
- **Types & operations**: count and the notable ones by name (with `file:line`), especially any discriminated unions or newtypes and why.
- **Error taxonomy**: the variant names and, per operation, which it can surface (reference `file:line`).
- **Config schema**: keys with types and defaults (reference `file:line`); flag any secret-by-key entries.
- **Decisions**: the non-obvious ones and their one-line rationale.
- **Gate results**: Hard Gate pass/fail; Definition-of-done checklist pass/fail per item.
- **Open risks / questions**: any seam you were forced to guess, any place the requirements were thin, anything the orchestrator must confirm before fan-out.

Never dump full file contents into the return. The orchestrator reads the summary; it opens the file only if it needs a specific detail.

## Anti-patterns

Each disqualifies the contract. Stop and fix if you catch yourself.

- **Logic in the contract.** A helper's body, a computed default, a validation loop. Why: implementers duplicate it (drift) or depend on it at runtime (can't freeze).
- **`any`/`dict`/`string`-as-enum to dodge naming a shape.** Why: the two implementers on either side of the seam each invent the real shape, and they disagree.
- **Silent error behavior.** An operation with no stated error taxonomy. Why: the consumer builds no handling, and the first upstream failure at integration is unhandled.
- **Optional field with no absence-meaning.** Why: one side treats `null` as "use default," the other as "not applicable" — same field, two semantics, guaranteed bug.
- **A shared shape defined in a task instead of the contract.** Why: two tasks define two near-identical versions; the integrator finds them incompatible at wiring time.
- **Unstated import direction.** Why: implementers reach across a seam into each other's modules, coupling parts that were meant to be independent.
- **Scattered raw env reads instead of a config schema.** Why: untyped, un-defaulted, and two readers pick two different fallbacks for the same variable.
- **Amending the contract after freeze, locally.** Why: the whole point of freezing is a single source of truth; a local edit re-introduces divergence. Report to the orchestrator instead.
- **Adding versioning/compat nobody asked for.** Why: it burdens every task with surface area to honor for no requested benefit.
- **Freezing without the self-check.** Why: an untested-against-tasks contract has gaps that only surface mid-build, when they are expensive.

## Worked micro-examples

**Example A — leaky vs. clean signature (TypeScript flavor).**

Input: "Contract for a `getInvoice(id)` the API task calls and the billing task implements."

Leaky (rejected):
```ts
// returns the invoice, or null if not found, or throws on db errors
function getInvoice(id: string): Promise<any> { /* look up in db */ }
```
Problems: `any` return, `string` id, `null` meaning undocumented, "throws on db errors" is not a taxonomy, and a body is present.

Clean (accepted):
```ts
type InvoiceId = string & { readonly __brand: "InvoiceId" };

type Invoice = {
  id: InvoiceId;
  status: "draft" | "open" | "paid" | "void";
  amountCents: number;        // integer cents; never a float. See decision log.
  issuedAt: string;           // ISO-8601; absent status "draft" is the only state without it — modeled below
};

type GetInvoiceError =
  | { kind: "not-found"; id: InvoiceId }                 // recoverable: caller renders empty state
  | { kind: "upstream-timeout"; retryAfterMs: number }; // recoverable: caller retries up to config.maxRetries

// contract-only: no body. billing task implements; api task consumes.
declare function getInvoice(id: InvoiceId): Promise<Result<Invoice, GetInvoiceError>>;
```
Why it passes: branded id, enum status, documented integer unit, closed error taxonomy with recoverability and caller action, success/failure in the return type, no body.

**Example B — the seam nobody put in the contract.**

Input: task "worker" produces a `Job` record; task "api" reads it. The `Job` shape was defined inside the worker task.

Correct behavior: recognize `Job` crosses the worker→api seam, MOVE its definition into the contract owned by neither task, add its import-direction note ("`contract` defines `Job`; `worker` and `api` both import `contract`; they never import each other"), and record in the decision log why the discriminant field on `Job.state` is a union and not a boolean pair. This is exactly the class of seam step 1 exists to catch.
