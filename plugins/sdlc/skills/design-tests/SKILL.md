---
name: design-tests
description: Executor discipline for designing and writing tests (unit + integration) that catch real defects instead of restating the implementation. Forces every test case to be derived from a behavioral requirement in the contract/spec, a systematic edge-case enumeration before any test code is written, and a "can this test fail?" mutation check on each assertion. Kills the implementation-mirroring failure mode — tests that assert a mock was called or copy the code's own logic into the assertion and therefore pass forever while catching nothing. TRIGGER on phrases like "write tests for X", "add unit tests", "design a test suite", "test this function/module", "improve test coverage", "write integration tests", "what edge cases should I test", "add a regression test", "these tests pass but the bug shipped", "tests for the new endpoint", "cover this with tests", "test plan for this feature". SKIP when the user is running an existing suite with no new tests to author, when they want the red step of a strict TDD red-green-refactor loop (use the tdd skill), or when they explicitly asked only for a quick smoke check with no design rigor.
---

# design-tests — tests that can actually fail

This skill enforces the discipline of a senior test engineer: every test is derived from a
behavioral requirement, edge cases are enumerated systematically before a line of test code
is written, and every assertion is checked against the question "if the code were wrong, would
this test go red?" A test that cannot fail is not a test — it is maintenance cost disguised as
confidence.

It exists to kill one specific failure mode of a capable-but-undisciplined model:
**implementation-mirroring**. Handed some code and asked to "write tests," the undisciplined
move is to read the implementation and describe it back — assert that a mock was called with the
arguments the code obviously passes it, or copy the function's own arithmetic into the expected
value. Such tests pass forever, turn green on the day the behavior breaks, and give false
confidence that is worse than no tests at all. The antidote is to test against the CONTRACT — the
externally observable behavior the code promises — and never against its internals.

## Inputs you need before you start

- **The contract/spec**: the function/API signatures, types, error shapes, and behavioral
  requirements the unit promises to satisfy. This is your source of truth for what to assert.
- **The unit(s) under test**: their public surface. You read the implementation to find edge
  cases and integration seams — never to derive expected values from it.
- If no contract exists, reconstruct one first from the spec, ticket, or docstring and state it
  in your test plan. You cannot test behavior you cannot name. If behavior is genuinely
  ambiguous, surface the ambiguity as an open question rather than inventing an assertion that
  merely echoes the code.

## Workflow

### 1. Derive test cases from behavior, not from code

For each requirement in the contract, name the behavior in plain language: "rejects an expired
token", "returns cents rounded half-up", "retries twice then surfaces the upstream error". Each
such behavior becomes one or more tests. Everything you assert must trace to one of these named
behaviors.

**Name every test after the behavior it verifies, not the method it calls.** `test_validate_2`
and `test_process_success` are code-shaped names that hide what broke when they go red. Use
`rejects_expired_token`, `rounds_half_cent_up`, `retries_twice_then_raises_upstream_error`.
When a test fails in CI, its name should tell you which promise the code broke without opening
the file.

The tell-tale sign of implementation-mirroring: your expected value is computed the same way the
production code computes it, or your only assertion is that a collaborator was invoked. Both mean
the test would survive the code being wrong. Rewrite the expected value as an independently-known
truth — a fixture with a hand-computed result, a golden value, a property that must hold
regardless of algorithm.

### 2. GATE — enumerate the edge-case taxonomy before writing test code

You may not write test code until your test plan lists, for the unit under test, which of these
rows apply and which do not (each "not" gets a one-word reason). This is mechanical and
checkable: an orchestrator reading your plan can see every row addressed.

| Row | Look for | If N/A, why |
| --- | --- | --- |
| **Empty / null / missing** | empty string/list/map, null, absent optional field, zero-length input | — |
| **Boundary values** | 0, 1, min, max, max+1, off-by-one at every range edge, first/last element | — |
| **Invalid input** | wrong type, malformed, out-of-range, unparseable, injection-shaped | — |
| **Dependency failure** | each dependency: timeout, error/exception, partial result, empty result, slow | — |
| **Concurrency / ordering** | interleaving, out-of-order arrival, shared-state races (where applicable) | — |
| **Idempotency / duplicate delivery** | same request twice, replay, at-least-once delivery | — |
| **Unicode / encoding / timezone** | non-ASCII, emoji, normalization, DST, offset, locale — where data crosses a boundary | — |

The gate output is a short table or list in your test plan: `Empty: apply (3 cases)`,
`Concurrency: n/a — pure sync function`, and so on. Enumerating first is what separates a
systematic suite from "I tested the happy path and one error." Most shipped bugs live in the rows
a happy-path author never listed.

### 3. Risk-weight coverage — cover expensive failures, not a percentage

Do not chase a coverage number. Chase the paths whose failure is expensive: money movement,
auth/authz decisions, data deletion, anything irreversible, anything user-facing at scale. A 100%
line-coverage suite that exercises every trivial getter and skips the one branch that grants
admin access is worse than an 80% suite that hammers the auth branch from every edge. Rank the
behaviors by blast-radius-of-failure and spend your test budget top-down. State the ranking
implicitly by which behaviors get the densest edge-case treatment.

### 4. Parametrize over duplication; separate tests for separate behaviors

Same behavior, different data → one parametrized/table-driven test with a row per case. This
keeps the intent in one place and makes adding a case a one-line change. Different behaviors →
different tests, even if the setup overlaps; collapsing two behaviors into one test means one
failure can mask the other.

A parametrized table is also the natural home for the edge-case rows from step 2: each taxonomy
case becomes a labeled row. Label rows by behavior (`"empty list returns zero"`), not by index.

> Language aside (Python): use `pytest.mark.parametrize` for the table, FactoryBoy for building
> fixture objects, and free functions — no test classes. Other stacks: table tests in Go,
> `it.each` in Jest, `@ParameterizedTest` in JUnit. Same principle everywhere.

### 5. MOCK BOUNDARY RULE — mock only what you don't own, at the edge

Mock at architectural boundaries you do not control: the network, the system clock, the
filesystem, external services, message brokers, payment gateways, the random source. These are
the seams where determinism and cost force a double.

Do **not** mock the unit-under-test's own collaborators just to make an assertion convenient. A
test whose payload is `assert mock_repo.save.called_with(x)` is asserting *how the code is wired*,
not *what it does* — it mirrors the implementation and will pass even when `save` persists garbage.
Prefer real collaborators, in-memory fakes, or a real test database over mocks of code you own.
When you must verify an interaction (e.g. "an audit event was emitted"), assert the observable
consequence (the event landed in the sink) rather than that a method was called.

Rule of thumb: if renaming a private method or reordering two internal calls breaks your test
without any behavior changing, the test is coupled to the implementation. Fix the test.

### 6. GATE — every test must be able to fail (mutation check)

Before a test is done, confirm it can go red. For each assertion, mentally (or actually) mutate
the production code — flip a comparison, off-by-one a boundary, return a constant, delete the
retry — and confirm *this test would catch that mutation*. If no plausible mutation makes the test
fail, the test asserts nothing; delete or rewrite it.

For genuinely high-risk paths, do it for real: temporarily break the code, run the test, watch it
go red, revert. This is the durable proof the test discriminates. A test you have never seen fail
is a test you cannot trust.

### 7. Determinism — no ambient nondeterminism

A flaky test is a broken test; it trains the team to ignore red. Eliminate every ambient input:

- **Time**: inject a clock or freeze it. Never call the real `now()`.
- **Randomness**: seed it, or inject the random source.
- **Network / IO**: stub at the boundary (step 5); never hit a live endpoint in a unit test.
- **Ordering**: never depend on hash-map iteration order, filesystem listing order, or the order
  other tests ran in. Each test sets up and tears down its own state.

If a test needs the real world (a real DB, a real broker), that is an integration test — label it
as such and isolate its fixtures so a unit run stays fast and hermetic.

### 8. Integration tests for what unit tests structurally cannot see

Unit tests with mocked boundaries cannot catch wiring and configuration defects: a wrong
connection string, a serializer that disagrees with the deserializer on the other side, a
migration that never ran, a route mounted at the wrong path, an auth middleware not actually
applied. Add integration tests that exercise the real seam end-to-end for:

- The composition of modules across a boundary you mocked in unit tests.
- Config and environment wiring (the values that only exist at deploy time).
- Contract agreement between a producer and consumer (schema, encoding, error shape).
- **Security wiring**: prove protected endpoints actually reject unauthenticated and
  unauthorized callers — a unit test of the handler cannot see whether the middleware is mounted.

Keep them fewer and higher-value than unit tests (the classic pyramid), but do not skip them:
the most embarrassing outages are wiring bugs that every unit test was blind to.

### 9. What NOT to test

Spending test budget here is negative-value — it adds maintenance cost and brittleness for no
defect-catching power:

- Framework internals and language guarantees (that the ORM's `save` writes a row, that `+` adds).
- Third-party libraries you don't own (test *your usage* at the boundary, not their correctness).
- Trivial getters/setters and pass-through delegations with no logic.
- Auto-generated code, constant declarations, type definitions.
- The exact wording of log lines or internal call order (implementation detail, see step 5).

If a test would only fail when someone else's well-tested code breaks, don't write it.

## Test code is production code

Hold test code to the same bar as the code it guards. Strong, explicit types — no `any`, no
untyped fixtures. No dead code, no commented-out cases, no `TODO` placeholders masquerading as
tests, no skipped tests left in the suite without a tracked reason. Names, structure, and lint
rules match the production standard. A sloppy test suite decays into one nobody trusts, and an
untrusted suite is deleted. Security-first applies here too: never hardcode a real credential,
token, or secret in a fixture — synthesize obviously-fake values.

## Definition of done

- Every named behavior in the contract has at least one test asserting it, named after the
  behavior.
- The edge-case taxonomy table (step 2) is present in the test plan, every row marked apply/N/A
  with a reason, and every "apply" row has corresponding test cases.
- Same-behavior-different-data cases are parametrized; distinct behaviors are separate tests.
- Mocks exist only at boundaries you don't own; no assertion is of the form "own collaborator was
  called."
- The mutation check (step 6) has been applied to every test; each has at least one mutation that
  turns it red.
- No test depends on real time, randomness, network, or inter-test ordering.
- Integration tests exist for cross-module wiring, config, and security enforcement that unit
  tests cannot see.
- The suite runs green, and it typechecks/lints to the same standard as production code.

## Return format

You are usually a subagent reporting to an orchestrator. Return a structured summary — never full
file contents or full test dumps:

- **Behaviors covered**: bullet list of behavior names → the test(s) that assert each.
- **Edge-case taxonomy result**: the table with apply/N/A per row and case counts.
- **Files touched**: each test file with `file:line` anchors for the notable cases.
- **Boundaries mocked**: what was doubled and why it qualifies as un-owned.
- **Mutation check**: confirmation it was run; note any test you could not make fail and how you
  fixed it.
- **Gate results**: typecheck / lint / test-run status.
- **Open risks**: untested paths you deliberately left (with the risk rationale) and any contract
  ambiguity you had to resolve or flag.

## Anti-patterns

- **Asserting a mock was called.** `assert repo.save.called` tests wiring, not behavior; it
  passes when `save` persists garbage. Assert the observable consequence instead.
- **Expected value computed like the code.** If your `expected` runs the same formula as the
  production code, the test can't catch a wrong formula. Use an independently-known truth.
- **Method-shaped test names.** `test_process_3` hides what broke. Name it after the behavior so a
  red test is self-explaining.
- **Happy-path-only suites.** Skipping the edge-case gate ships the bugs that live in the rows you
  never enumerated. Fill the taxonomy first.
- **Coverage-percentage chasing.** 100% lines with the auth branch untested is false confidence.
  Weight by failure cost, not line count.
- **Over-mocking owned code.** Doubling your own collaborators couples tests to structure; a
  harmless rename goes red. Use real objects or fakes.
- **Nondeterministic tests.** Real clocks, unseeded randomness, live network → flake → a suite the
  team learns to ignore. Inject every ambient input.
- **Tests that can't fail.** If no mutation of the code turns the test red, it asserts nothing.
  Delete it or give it a real assertion.
- **Testing the framework or third-party libs.** Negative value; you maintain tests that only
  break when someone else's tested code breaks.

## Worked micro-examples

**Input**: "Write tests for `charge(amount_cents, card)` which calls the Stripe SDK and returns a
`Receipt`."

Implementation-mirroring (wrong): mock the Stripe client, call `charge`, assert
`stripe.charges.create.called_with(amount=amount_cents)`. This passes even if `charge` double-bills,
returns the wrong receipt, or mangles the currency — it only proves the SDK was invoked.

Correct: mock the Stripe boundary (un-owned network) to return known responses, then assert on the
`Receipt` `charge` *produces* — the right amount, currency, status mapping from an approved
response; a `DeclinedError` from a declined response; a `RetryableError` after a simulated timeout.
Parametrize the response→outcome mapping. Add a boundary case (`amount_cents = 0` rejected before
any SDK call) and an idempotency case (same idempotency key charged twice → one charge). Each
assertion would go red if the mapping logic were wrong — that is the point.

**Input**: "Cover `parse_date(s)`."

Taxonomy-first plan: Empty → `""` and `None` raise `ValueError` (apply). Boundary → leap day
`"2024-02-29"` parses, `"2023-02-29"` rejects; first/last day of month (apply). Invalid →
`"2024-13-01"`, `"not-a-date"`, `"2024/01/01"` wrong separator (apply). Timezone → `"...Z"` vs
`"...+05:30"` produce the correct UTC instant (apply — data crosses a boundary). Unicode → Arabic-
indic digits: decide and assert accept-or-reject (apply). Concurrency → n/a (pure function).
Dependency failure → n/a (no dependencies). Idempotency → n/a (pure). Only after this table do you
write the parametrized cases.
