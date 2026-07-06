---
name: design-api
description: Executor discipline for designing a PUBLIC or consumer-facing API surface — HTTP/REST, RPC, GraphQL, webhooks/events, or an SDK surface that callers you do not control will depend on. Forces a surface-wide inventory FIRST so new endpoints match existing naming, envelope, pagination, error, and auth conventions instead of each being locally elegant and collectively incoherent; makes auth (authn + object-level authz), idempotency, pagination, a single error envelope, and a stated compatibility stance mandatory per endpoint; and runs a consumer-journey walkthrough before freezing. Emits the surface as an executable spec (OpenAPI/proto/GraphQL SDL or a typed endpoint table). Exists to prevent the verb-soup RPC surface, the unguarded endpoint, and the accidental forever-contract. TRIGGER on phrases like "design the API", "design the REST endpoints", "design the public API surface", "spec the HTTP API", "design the GraphQL schema", "write the OpenAPI spec", "design the webhook/events contract", "design the SDK surface", "what should these endpoints look like", "add endpoints to our public API", "design the RPC methods", "consumer-facing API design". SKIP when the task is the INTERNAL contract between parallel implementers rather than a consumer-facing surface (use design-contract), when you are conforming to an authoritative external API someone else owns (implement against it, don't design it), or when it is a one-off internal helper no external caller depends on.
---

# design-api — the coherent, guarded, evolvable surface

Designs a PUBLIC or consumer-facing API surface — REST/HTTP, RPC, GraphQL, webhooks/events, or an SDK — that outside callers depend on. The artifact is a spec: an endpoint/operation table plus types, auth, errors, and a compatibility stance, emitted in the project's spec convention.

This skill exists because a capable model, asked to "design the API," designs each endpoint as if it were the first one ever built. Left alone it invents fresh naming, a new envelope, a bespoke pagination style, and an ad-hoc error shape for every endpoint — each individually reasonable, the set collectively incoherent, and consumers experience that incoherence as bugs. Three specific failure modes follow: the **locally-elegant endpoint** (ignores the conventions already on the surface); the **unguarded surface** (auth bolted on afterward, object-level authorization forgotten, so any authenticated caller reads anyone's data); and the **accidental forever-contract** (a shape shipped to consumers you cannot reach, so you can never change it). The discipline below makes each of these mechanically catchable before you freeze.

## Relationship to design-contract (read this first)

`design-contract` freezes the INTERNAL seams between parallel implementers you control — types, signatures, error taxonomy — so a fan-out doesn't diverge. `design-api` designs the EXTERNAL surface that callers you do NOT control depend on. The boundary: if breaking it only breaks your own build, it's a design-contract concern; if breaking it breaks a caller you can't redeploy, it's a design-api concern.

They compose. When the feature's seam IS the API itself — the parallel tasks are "implement these endpoints" and "test these endpoints" — this skill's output can BE the frozen contract for the fan-out. In that case emit the surface as the spec, add design-contract's freeze header, and hand the same artifact to the implement-feature and design-tests executors. Do not author two overlapping contracts; author one and note which role it plays.

## The Hard Gate — inventory before you invent

You may NOT specify a single new endpoint until you have written down the existing surface's conventions. Consumers experience inconsistency as bugs, so consistency outranks your local taste. Produce an **API style note** covering, from the existing surface:

- **Naming**: casing (`snake_case` vs `camelCase` vs `kebab` paths), verb choices, resource path shape.
- **Resource form**: plural vs singular collections (`/users/{id}` vs `/user/{id}` — pick the one already used).
- **ID format**: integer, UUID, prefixed (`inv_...`), opaque — and whether IDs are exposed at all.
- **Envelope**: are responses raw (`{...}`) or wrapped (`{ "data": {...}, "meta": {...} }`)? Match it.
- **Pagination style**: cursor vs offset/limit vs page-number; where the cursor/next-link lives.
- **Error format**: the exact error envelope already in use (code, message, details location).
- **Versioning stance**: URL path (`/v1/`), header, or none — how the surface versions today.
- **Auth scheme**: bearer/OAuth/API-key/session; where credentials go; how scopes/roles are expressed.

Establish this by inspecting the actual surface — grep sibling route definitions, read an existing OpenAPI/proto/SDL file, call a couple of live endpoints if available. Do not infer conventions from one endpoint; sample several.

**Greenfield (genuinely no existing surface):** you still may not skip the gate — you satisfy it by DECIDING each convention once, writing it into the API style note, and then following it for every endpoint. The failure mode is identical whether the inconsistency comes from ignoring a convention or from never having one.

**Deviation rule:** a new endpoint that breaks an existing convention requires a one-line written justification in the spec AND orchestrator sign-off before freeze. "I'd have chosen differently" is not a justification; "the existing cursor scheme cannot express this bidirectional feed, so this endpoint uses X, flagged for the orchestrator" is.

Until the API style note exists, every endpoint you write is a guess. That is why this is a gate, not guidance.

## Workflow

### 1. Model the resources before the endpoints

Design nouns and their relationships first, operations second. Write down the resource model: the entities the API exposes, their fields, and how they relate (a `Subscription` belongs to a `Customer`; an `Invoice` has many `LineItems`). Only then map operations onto resources.

Skipping this produces **verb soup**: `/getUserData`, `/doProcessOrder`, `/updateThingAndNotify` — one bespoke RPC endpoint per feature, forever, with no shared shape a consumer can learn once and reuse. A resource model turns "50 unrelated verbs" into "8 nouns with standard operations," which a consumer can predict rather than memorize.

RPC/GraphQL note: even where the transport is verb- or query-shaped, the underlying resource model still governs. GraphQL types ARE the resource model; RPC method names should still cluster around resources (`OrderService.Create`, not `doProcessOrder`).

### 2. Specify every endpoint in a table — no field left implicit

Each operation on the surface gets a row/spec entry covering ALL of the following. A missing column is not "to be decided later"; it is an unguarded, unspecified endpoint. Columns:

- **Method + path** (or RPC method / GraphQL field name), following the style note.
- **Request type** — a named, strongly-typed shape. No bag-of-anything (`params: object`, `body: dict`, `data: any`) fields. If a field is genuinely open passthrough, name the alias and document why.
- **Response type** — likewise strongly typed, in the surface's envelope.
- **Auth requirement** — see step 3. "Authenticated" alone is NOT an acceptable value.
- **Error responses** — the failure modes this endpoint surfaces, each mapped to a status/code in the standard error envelope (step 4).
- **Idempotency** — for every mutation: is it naturally idempotent (PUT to a known id), or does it need an idempotency-key mechanism? See step 5.
- **Pagination / filtering / sorting** — for every collection response. See step 6.
- **Rate-limit class** — where the project has the concept, which bucket/tier this endpoint falls in.

A capable model tends to fill method, path, and the happy-path response, then stop. The columns after "response type" are exactly the ones that turn a demo into a production surface; they are mandatory, not optional polish.

### 3. Auth is per-endpoint and object-level — not a footer

Every endpoint states, up front, two distinct things:

- **Authentication** — who the caller must prove to be (valid bearer token / API key / session), and
- **Authorization** — what they must be permitted to do, INCLUDING object-level: not just "an authenticated user" but "the user who OWNS this resource," or "a user with the `billing:read` scope on THIS account."

The failure this prevents is the classic broken-object-level-authorization bug: `GET /invoices/{id}` checks the caller is logged in but not that the invoice belongs to them, so any authenticated caller reads every invoice by iterating ids. "Authenticated" as an auth answer is how that ships. Restating the security-first house rule: no endpoint is unauthenticated by default; a genuinely public endpoint (health check, public docs) is an explicit, justified exception, not an omission.

For each mutating or data-exposing endpoint, the auth cell reads like: `bearer token; caller must be owner of {account_id} OR hold role admin` — a sentence a reviewer can check, not the word "yes."

### 4. One error envelope across the whole surface

The surface has exactly ONE error shape, reused everywhere. Consumers write error handling once against it; a per-endpoint error shape forces them to special-case every call. The standard envelope carries:

- **A machine-readable code** — a stable enum string consumers branch on (`invoice_not_found`, `rate_limited`), never a human sentence they'd have to string-match.
- **A human-readable message** — for logs and developers, not for branching.
- **A correlation / request id** — so a consumer's bug report maps to your logs.
- **Field-level details** for validation errors — which field failed and why, structured.

Never leak internals: no stack traces, SQL fragments, internal service names, or internal ids in error bodies that cross the trust boundary. That is the security-first house rule applied to errors — the sanitized shape is the contract; the rich detail goes to your logs keyed by the correlation id. Map each error variant from step 2 to a status code consistently (same failure class → same code across all endpoints).

### 5. Idempotency for every mutation

Unsafe-to-retry mutations are a consumer-side data-duplication factory: a network blip makes the client retry `POST /payments`, and now the customer is charged twice. For every mutating endpoint, state the idempotency mechanism:

- **Naturally idempotent** — `PUT`/`DELETE` to a known id, or a create keyed by a caller-supplied unique field. State that it is and why.
- **Idempotency key** — creation/payment endpoints where retries must not duplicate get an `Idempotency-Key` header (or equivalent) that the server deduplicates on. Specify the key's scope and retention.

Payment and resource-creation endpoints especially may not ship without an answer here. "The client shouldn't retry" is not an answer — networks retry whether the client means to or not.

### 6. No unbounded collection responses

Every endpoint that returns a collection specifies pagination, using the surface's existing style (step 0). An endpoint that returns "all the widgets" is a time bomb: it works in the demo with 12 rows and takes the service down the day the table has two million. For each collection:

- **Pagination** — cursor or offset/limit or page, matching the house style; the response carries the next-cursor/next-link/total per that style.
- **Filtering & sorting** — which fields are filterable and sortable, as a typed, closed set (not "any column" — that leaks the schema and invites unindexed scans).

Default and maximum page sizes are stated. A collection with no page-size cap is unbounded even if it has a cursor.

### 7. State the compatibility stance — then stop

The consumer-facing surface is effectively FROZEN the day it ships, because callers you don't control depend on it and you cannot redeploy them. So the cheapest time to get the shape right is now, before freeze. State explicitly:

- **What is additive-safe**: new optional request fields, new response fields, new endpoints, new enum members consumers must tolerate. Consumers must ignore unknown fields — say so.
- **What is breaking**: removing/renaming a field, tightening a type, changing a status code or an error code's meaning, changing pagination semantics, making an optional field required.
- **How breaking changes ship**: version bump / new endpoint alongside the old / a deprecation window — pick the project's mechanism (from the style note's versioning stance).

Per the house rules, DO NOT build speculative versioning machinery, compatibility shims, or deprecated-but-kept fields nobody asked for. State the stance in a paragraph; do not gold-plate it into infrastructure. The stance is a decision recorded, not a framework built.

### 8. Consumer walkthrough — before you freeze

Walk the primary consumer journeys end-to-end through the spec, on paper, before freezing. A surface designed endpoint-by-endpoint routinely fails this walk because each endpoint was designed in isolation.

For each journey (typically: **list → fetch detail → update**, plus any create/delete flow and any webhook-driven flow), step through and confirm every step has, from the PREVIOUS step's response, exactly what it needs to make the NEXT call:

- Does the list response carry the `id` the detail call requires?
- Does the detail response carry the version/etag the update call needs for optimistic concurrency?
- Does the create response return the id the caller needs to poll or delete?
- Does the paginated list return a cursor the next-page call consumes?
- For webhooks: does the event payload carry enough for the consumer to act, or must they immediately call back — and if so, does the referenced resource endpoint exist?

Every "no" is a gap in the surface, not a caller problem. Fix it (usually: add the missing field to the earlier response) before freeze. Record the walkthrough result — it is part of your return.

### 9. Webhooks and events are API surface too

If the surface emits webhooks or events, they get the same rigor as request/response endpoints — they are a contract consumers build against. Specify per event:

- **Payload type** — strongly typed, versioned, in a consistent envelope (event id, type, timestamp, resource ref).
- **Delivery semantics** — at-least-once vs at-most-once; consumers must therefore be idempotent (say so, and give them an event id to dedupe on).
- **Retry policy** — how many times, over what window, with what backoff; what a 2xx from the consumer means.
- **Signature verification** — how the consumer verifies the event came from you (HMAC over the body with a shared secret, signature header name, the exact bytes signed). An unsigned webhook is an unauthenticated inbound endpoint on the CONSUMER — restating security-first, this is mandatory, not optional.
- **Ordering** — whether events can arrive out of order (they usually can), so consumers don't assume sequence.

### 10. Emit the surface as an executable spec

Emit in the project's spec convention, not prose. If the project uses OpenAPI, proto, or GraphQL SDL, write it there; otherwise emit a typed endpoint table in the design doc with named request/response types. This spec is what the implement-feature and design-tests executors receive. Hand-wavy prose endpoints ("returns the user's stuff") produce divergent implementations — the implementer guesses the shape, the tester guesses a different one, and they meet at a bug. The spec is the single source of truth for both.

## Scope defaults

- **Consistency outranks personal preference.** Where you'd have chosen a different convention than the surface already uses, follow the surface. Deviations require justification + orchestrator sign-off (Hard Gate). Consumers pay for inconsistency; you pay for consistency once.
- **Security-first, restated for this task:** no unauthenticated endpoints by default; every endpoint states authn AND object-level authz; error and webhook payloads carry sanitized shapes with no internal leakage; webhooks are signed; no secrets in the spec or in examples.
- **No speculative machinery.** State the compatibility stance; do not build versioning infrastructure or compat shims nobody asked for. No stubs, no `TODO decide shape` in the emitted spec — decide it or report the blocker.
- **Strong types everywhere.** No `any`/`object`/untyped-`dict`/stringly-typed-enum in request or response shapes without a documented justification at its site — the same standard design-contract enforces, applied to the wire.

## Definition of done

Mechanical exit criteria — all must hold:

1. The **API style note** exists (inventoried from the existing surface, or decided-and-written for greenfield) and covers naming, resource form, id format, envelope, pagination, error format, versioning, auth scheme.
2. A **resource model** precedes the endpoints; operations map onto resources (no orphan verb-soup endpoints).
3. **Every endpoint** has all step-2 columns filled: method+path, typed request, typed response, auth requirement, error responses, idempotency (mutations), pagination/filter/sort (collections), rate-limit class where applicable.
4. **Auth** on every endpoint states authn AND object-level authz — never the bare word "authenticated." No endpoint is unauthenticated except explicit, justified public exceptions.
5. **One error envelope** across the whole surface, with machine-readable codes, correlation id, and field-level validation details; no internal leakage.
6. **Every mutation** has a stated idempotency mechanism; creation/payment endpoints have a concrete dedupe answer.
7. **Every collection** has pagination with default+max page size and a typed, closed filter/sort set.
8. The **compatibility stance** is stated (additive-safe vs breaking vs how breaking ships) — stated, not over-built.
9. **Webhooks/events** (if any) specify payload type, delivery semantics, retry, signature verification, and ordering.
10. The **consumer walkthrough** passed for every primary journey — no step lacks data from the prior response.
11. The surface is emitted in the **project's spec convention** (OpenAPI/proto/SDL or a typed table), with strong types throughout and no `any`/stringly-typed-enum without documented justification.
12. Any **deviation** from an existing convention carries a written justification and is flagged for orchestrator sign-off.

If the surface cannot satisfy these because requirements or the existing conventions are underspecified, do not paper over it — report the specific gap to the orchestrator.

## Return format

You are typically a subagent reporting to an orchestrator. Return a structured summary, NOT the file contents:

- **Spec path & format**: the file written and its convention (OpenAPI/proto/SDL/table). Note if it also serves as the frozen contract for a fan-out.
- **API style note**: the inventoried (or decided) conventions in a few lines — naming, envelope, pagination, error shape, auth scheme, versioning.
- **Resource model**: the nouns and their key relationships.
- **Endpoint table**: every operation as a row — `method path — request → response — auth — idempotency — pagination`, with `file:line` into the spec. This is the core deliverable; include it in full.
- **Error envelope**: the one shape, its codes, and the status-code mapping.
- **Consumer walkthrough result**: each primary journey stepped through, PASS/FAIL, and any field you had to ADD to make a step's data available.
- **Compatibility stance**: the one-paragraph decision.
- **Deviations**: any convention break, its justification, flagged for sign-off.
- **Open risks / questions**: any endpoint where auth, an error mode, or a consumer's next-step data was guessed and needs orchestrator confirmation before freeze.

Never dump full request/response schemas into the return beyond the endpoint table; the orchestrator opens the spec for detail.

## Anti-patterns

Each disqualifies the surface. Stop and fix if you catch yourself.

- **The locally-elegant endpoint.** Designing one endpoint's naming/pagination/error shape without checking the rest of the surface. Why: each is fine alone, the set is incoherent, and consumers hit the seams as bugs.
- **Verb-soup RPC.** `/getUserData`, `/doProcessOrder` — endpoints as one-off verbs with no resource model. Why: the surface grows one bespoke endpoint per feature forever and nothing is predictable.
- **"Authenticated" as the auth answer.** Omitting object-level authz. Why: any logged-in caller iterates ids and reads everyone's data — the classic BOLA breach.
- **Per-endpoint error shapes.** A different error body per endpoint. Why: consumers cannot write error handling once; every call site special-cases.
- **Leaking internals in errors.** Stack traces, SQL, internal ids in responses. Why: it's an information-disclosure vulnerability and couples consumers to your internals.
- **Unbounded collection responses.** A list endpoint with no pagination/cap. Why: it works at 12 rows and takes the service down at two million.
- **Retry-unsafe mutations.** A `POST /payments` with no idempotency key. Why: a network retry double-charges the customer — the API is a data-duplication factory.
- **Bag-of-anything fields.** `body: object`, `params: dict`, `data: any` on the wire. Why: implementer and tester each guess a different real shape and meet at a bug; consumers get no contract.
- **Unsigned webhooks.** Emitting events with no signature scheme. Why: the consumer's inbound endpoint is unauthenticated — anyone can forge your events.
- **Freezing without the consumer walkthrough.** Why: an endpoint-by-endpoint surface routinely can't complete "list → detail → update" because the list response lacks a field the detail call needs — cheap to fix now, a breaking change later.
- **Speculative versioning machinery.** Building compat shims and deprecated-kept fields nobody asked for. Why: it burdens every task and consumer with surface area for no requested benefit — state the stance, don't build the framework.

## Worked micro-examples

**Example A — verb-soup vs. resource-modeled, and the auth cell.**

Input: "We need endpoints to get a user's orders, place an order, and cancel one."

Rejected (verb soup, unguarded):
```
POST /getUserOrders        req: { userId }        resp: any        auth: authenticated
POST /doPlaceOrder         req: { ...stuff }      resp: any        auth: authenticated
POST /cancelOrderNow       req: { orderId }       resp: any        auth: authenticated
```
Problems: RPC verbs not resources, `any` on the wire, `authenticated` with no object-level check (any user reads any user's orders by passing a `userId`), no idempotency on order placement (double-submit double-orders), no pagination on the order list.

Accepted (resource model, guarded, matching an existing cursor-paginated `{data,meta}` surface):
```
GET  /v1/customers/{cid}/orders
     resp: { data: Order[], meta: { next_cursor: string | null } }
     query: status? (enum: open|shipped|cancelled), sort? (enum: created_at|total), limit? (default 20, max 100), cursor?
     auth: bearer; caller must own {cid} OR hold role support
     errors: 404 customer_not_found, 403 forbidden
GET  /v1/orders/{id}
     resp: { data: Order }
     auth: bearer; caller must own the order's customer OR role support
     errors: 404 order_not_found, 403 forbidden
POST /v1/customers/{cid}/orders
     req: CreateOrderRequest (typed line items)   resp: { data: Order }
     auth: bearer; caller must own {cid}
     idempotency: Idempotency-Key header, deduped 24h   errors: 422 validation_failed, 409 duplicate_request
DELETE /v1/orders/{id}       (cancels; naturally idempotent)
     auth: bearer; caller must own the order's customer
     errors: 404 order_not_found, 409 order_not_cancellable
```
Why it passes: resources not verbs, strong types, object-level authz per endpoint, cursor pagination with a max on the collection, an idempotency key on creation, a consistent envelope and error codes.

**Example B — the consumer walkthrough catches the missing field.**

Input: a list endpoint returns `Order { id, total }`; the detail endpoint requires an `etag` for optimistic-concurrency updates via `If-Match`.

Walk **list → detail → update**: list gives `id` → detail call works; detail returns `Order { id, total, etag }` → update call has its `etag`. But walk **list → update directly** (a consumer batch-updating from the list): the list response has no `etag`, so the consumer cannot issue `If-Match` without an extra detail round-trip per row. Correct behavior: recognize the gap during the walkthrough and ADD `etag` (or a version) to the list response's `Order` shape before freeze — an additive change now, a breaking one after consumers ship. This is exactly the class of gap the walkthrough exists to catch.
