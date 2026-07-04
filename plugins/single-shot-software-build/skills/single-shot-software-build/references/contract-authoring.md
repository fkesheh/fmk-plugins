# Contract Authoring — making the seed enforce, not suggest

The seed files are the only place where you, the architect, write production code. Everything here is designed around one goal: an implementer that violates the plan should get a compile error, not a code-review comment three phases later.

## 1. `shared/contract.ts` — the type contract

### Domain types

Define every entity as an interface with precise types. No `any`, no `Record<string, unknown>` escape hatches, no optional fields "to be flexible". Use branded ID types so an implementer cannot pass a `UserId` where an `InvoiceId` belongs:

```ts
export type UserId = string & { readonly __brand: 'UserId' };
export type InvoiceId = string & { readonly __brand: 'InvoiceId' };
```

Use string-literal unions for every enum-like field (`status: 'draft' | 'sent' | 'paid' | 'void'`). A union is a design decision made once by you; a bare `string` is eight design decisions made independently by eight agents.

### Service interfaces

One interface per domain area, method signatures fully typed, semantics documented in one-line doc comments where non-obvious. Implementers implement these EXACTLY — names, signatures, semantics:

```ts
export interface IInvoiceService {
  list(userId: UserId, filter: InvoiceFilter): Promise<Invoice[]>;
  create(userId: UserId, input: InvoiceCreateInput): Promise<Invoice>;
  /** Throws AppError('not_found') if missing, AppError('forbidden') if not owner. */
  markPaid(userId: UserId, id: InvoiceId): Promise<Invoice>;
}
```

Note the pattern: the authorization semantics live in the contract, so both the api agent and the domain agent implement the same rule without coordinating.

### The API route table

Define the complete HTTP surface as a typed map. This is the single most important structure in the contract, because it is the boundary between the two halves of the build — the backend agents implement it, the frontend agents consume it, and neither ever sees the other's code:

```ts
export interface ApiRoutes {
  'GET /api/invoices':        { query: InvoiceFilter; response: Invoice[] };
  'POST /api/invoices':       { body: InvoiceCreateInput; response: Invoice };
  'POST /api/invoices/:id/pay': { params: { id: InvoiceId }; response: Invoice };
  // ... every route in the product. If it's not here, it doesn't exist.
}
```

Have the typed API client (web-shell module) and the route registrar (server-api module) both key off this map, so an invented or misspelled route fails to compile on whichever side invented it.

### One error shape, everywhere

```ts
export type AppErrorCode = 'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'internal';
export interface ApiErrorBody { error: { code: AppErrorCode; message: string; field?: string } }
```

Every endpoint returns this shape on failure; the frontend error handling is written once against it. Without this, each backend agent invents its own error JSON and each frontend agent guesses differently.

### Events (if the app has realtime/cross-cutting signals)

A single typed payload map keyed by an event-name union, same trick as routes:

```ts
export type AppEvent = 'invoice:paid' | 'budget:exceeded';
export interface EventPayloads { 'invoice:paid': { id: InvoiceId }; 'budget:exceeded': { categoryId: CategoryId; overBy: number } }
```

## 2. `shared/config.ts` + `server/seed.ts` — design as data

Everything tunable lives here as typed constants: pagination sizes, validation limits (and their user-facing messages), category/status lists with display labels and colors, feature copy, date formats. The rule: **if changing it shouldn't require re-reading logic, it belongs in config.**

The seed script creates a demo account (log-in-able, credentials printed at boot and shown on the login screen) and a realistic dataset — enough rows in every entity that every list paginates, every chart draws, every empty state does NOT show by default (empty states are reached by filtering, so they get exercised, but the first impression is a living product). Give the seed data narrative coherence — real-looking names, plausible amounts, dates spread over recent months — because seeded data is the screenshot, the demo, and the smoke test all at once.

## 3. `web/src/ui/` — the design system

This is the visual analogue of the type contract: a shared vocabulary that makes independently-built screens cohere.

**Tokens first** (`theme.css` or a tokens module): a named palette (background layers, surface, border, primary, danger, success, muted-text — with dark-mode values if you choose dark), a spacing scale, radii, shadow levels, a type scale. Pick a deliberate aesthetic and write it down in one sentence inside the file (e.g. "calm linear-style dark UI: near-black layered surfaces, one saturated accent, generous whitespace, 8px rhythm"). That sentence propagates into every module brief.

**Primitives second**: Button (variants: primary/secondary/ghost/danger; sizes; loading state), Input + Field (label, error, hint), Select, Card, Table (with sortable headers and an inline empty-state slot), Modal, Toast, Badge, Skeleton, EmptyState (icon + title + description + action), PageHeader. Each ~30–80 lines, fully styled with the tokens, zero external UI-kit dependencies.

The primitives you provide are the primitives that get used. Screens compose what exists; anything you leave out gets improvised eight different ways. Budget the largest share of your personal coding time here and on the route table — they are the two places where coherence is bought.

## Freezing

Commit the seed with a message marking it as the contract, and state in every prompt that these files are FINAL. Only you may amend the contract, only for a genuine gap discovered mid-build (a missing route, not a preference), and any amendment is append-only — never change an existing signature after implementers have started, because half the fleet has already coded against it.
