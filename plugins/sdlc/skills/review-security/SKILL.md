---
name: review-security
description: Defensive security review of a diff or module, driven by a threat model and an explicit absence checklist. Forces the reviewer to enumerate what SHOULD be present (authn, authz/IDOR, input validation, parameterized queries, secret handling, SSRF, rate limiting) rather than only critiquing the code that exists, and to prove every finding with a concrete attack scenario before reporting it. Blocks generic CVE trivia and unexploitable hardening noise dressed up as vulnerabilities. TRIGGER on phrases like "security review", "review this for security", "is this endpoint safe", "audit this diff for vulnerabilities", "check for injection/XSS/SSRF", "any authz holes here", "IDOR in this code", "threat model this change", "pentest this module (code-level)", "security sign-off on this PR", "review the auth flow for holes", "/review-security". SKIP when the task is offensive tooling against systems the team does not own, a pure dependency-version bump with no code change (run an SCA/`audit` tool instead), or a general "is library X vulnerable" question answerable from an advisory database without reading this codebase.
---

# review-security — threat-modeled defensive review

Enforces a defensive, code-level security review that starts from a threat model and walks an explicit absence checklist, so the reviewer catches what is *missing* — the authz check that was never written, the validation that was skipped, the rate limit nobody added — not just what is present and wrong.

This skill exists because a capable model reviewing security defaults to **presence bias**: it reads the code that exists, comments on the code that exists, and reports plausible-sounding generic issues (outdated TLS advice, textbook OWASP definitions, "consider using bcrypt") while walking straight past the endpoint that has no authorization check at all. The dangerous vulnerabilities are usually absences, and absences are invisible unless you go looking for them by name. The second failure mode is **CVE theater**: reporting severity-inflated, unexploitable findings that waste the fixing developer's time and erode trust in the whole review. This skill counters both by forcing (a) a threat model that every finding must map to, (b) an item-by-item absence checklist that proves coverage, and (c) an exploitability gate that separates real vulnerabilities from hardening suggestions.

Scope: this is **defensive** review of code your team owns. No exploit frameworks, no live attacks, no scanning third-party systems. PoC snippets appear only to the extent needed to show the fixing developer that the flaw is real.

## Workflow

### 1. Threat-model the change (5 minutes, not a document)

Before reading for bugs, answer four questions in prose. This is a scoping tool, not a deliverable — keep it to a short paragraph or a few bullets.

- **What data does this code touch?** PII, credentials, tokens, payment data, tenant-scoped records, internal-only config, nothing sensitive. Name it.
- **Who can reach it?** Anonymous internet, authenticated user, specific role, another internal service, cron/offline only. Trace the actual entry path — an endpoint behind an auth middleware is a different threat surface than a raw public route.
- **What would an attacker want here?** Read someone else's data, escalate privilege, exfiltrate secrets, forge a request, run code, deny service, pivot to internal network. Be specific to THIS code.
- **What trust boundaries does it cross?** Every point where data moves from a less-trusted zone to a more-trusted one: HTTP request → handler, user input → SQL, user-supplied URL → server-side fetch, uploaded file → storage, one tenant → shared table.

**Gate 1 — threat model exists.** You may not report findings until this paragraph is written. Every finding you later report MUST map to one of the boundaries or attacker goals named here. A finding that maps to nothing in the threat model is either out of scope or a sign the threat model is incomplete — fix the model, don't smuggle the finding.

### 2. Walk the absence checklist item by item

This is the core of the skill. For **each** item below, record a verdict: `checked-clean`, `FINDING`, or `n.a.` (with a one-line reason for n.a.). "I didn't look" is not one of the three verdicts. Walking every item, even the ones that turn out n.a., is what defeats presence bias — you cannot skip an item just because the code doesn't obviously touch it; you have to look and decide.

For each new or changed **entry point / handler / endpoint**:

1. **Authentication** — is the caller's identity verified? A new route with no auth is a critical finding unless the threat model says it is deliberately public.
2. **Authorization (function-level)** — is the caller's *role/permission* checked, not just their identity? An authenticated user is not an authorized one.
3. **Authorization (object-level / IDOR)** — does the code confirm the authenticated user owns or may access the *specific object* referenced by an id in the request? Change `GET /orders/123` to `/orders/124`: does user A now read user B's order? This is the single most-missed class — check it on every id, key, filename, or foreign reference that comes from the request.
4. **Input validation** — is every field from a trust boundary validated for type, range, length, format, and allowed set before use? Missing validation is the root of most other findings.
5. **Injection — parameterized queries** — SQL/NoSQL built with string concatenation of user input; command execution with user input; path traversal (`../`) in file paths; template injection (user input into a template engine); LDAP/XML/header injection. Confirm queries are parameterized/bound, paths are canonicalized and confined, commands avoid a shell.
6. **Output encoding (XSS)** — user-controlled data rendered into HTML/JS/attributes/URLs without context-appropriate encoding; `dangerouslySetInnerHTML`, `innerHTML`, `v-html`, unescaped template output, reflected error messages.
7. **Secrets** — no credentials, API keys, tokens, or private keys in code, config committed to the repo, logs, error messages, or responses. Secrets come from env or a secret manager. Grep the diff for high-entropy strings and obvious key names.
8. **Unsafe deserialization** — untrusted input into `pickle`, Java/`ObjectInputStream`, PHP `unserialize`, YAML `load` (vs `safe_load`), `eval`/`Function`, or any deserializer that can instantiate arbitrary types.
9. **SSRF** — any server-side fetch (HTTP client, image loader, webhook, URL preview, PDF renderer) whose target URL is influenced by user input. Can it hit `169.254.169.254`, `localhost`, or internal hosts? Is there an allowlist?
10. **File uploads** — is upload type, size, and count limited? Is the stored filename sanitized (no path traversal, no attacker-controlled extension executed by the server)? Is storage outside the web root / not publicly served by default?
11. **Rate limiting / abuse** — do expensive operations, auth/login, password-reset, token issuance, and enumeration-prone lookups have rate limiting or another anti-abuse control? Absence enables brute force, credential stuffing, and resource-exhaustion DoS.
12. **Error handling / info leak** — do error responses or logs expose stack traces, SQL, internal paths, framework versions, or whether a username exists (enumeration)?
13. **CORS** — is `Access-Control-Allow-Origin` reflective or `*` on any endpoint that carries credentials or sensitive data?
14. **Security headers** — where the framework does not set them by default: is auth cookie `HttpOnly`/`Secure`/`SameSite` set, CSRF protection present for state-changing form/cookie-auth requests, `Content-Security-Policy` where relevant?
15. **Dependency risk** — for newly added packages: is the package real and maintained (not typosquatted/hallucinated), does the version have known critical advisories, is it pulling far more capability than the task needs?

Adapt the list to the code's actual surface — a pure data-processing library legitimately marks endpoint items `n.a.` — but mark them, don't silently drop them.

**Gate 2 — checklist complete.** Every item above has a recorded verdict before you write the report. The completed checklist ships *with* the report; it is the proof of coverage and is as valuable to the reader as the findings themselves.

### 3. Prove exploitability before reporting

For every item marked `FINDING`, construct a concrete attack scenario in three parts:

> **Attacker capability → input / path → impact**
> e.g. "An authenticated free-tier user (capability) sends `GET /api/invoices/{id}` iterating `id` (input/path) and reads any tenant's invoices because the handler queries by id without a `WHERE tenant_id = :caller_tenant` clause (impact: cross-tenant data disclosure)."

**Gate 3 — exploitability separates vulns from hardening.** A finding with a plausible, concrete attack path is a **vulnerability** — report it in the ranked findings. A finding with no plausible attack path (defense-in-depth you'd like to see, style-level crypto preferences, "consider adding X" with no reachable exploit) is a **hardening suggestion** — it goes in a clearly separate section, explicitly labeled, never ranked alongside real vulnerabilities. Mixing the two is the CVE-theater failure mode: it inflates the report and trains the reader to ignore it. If you cannot write the attacker→input→impact line, it is not a vulnerability.

Keep PoC to the minimum that convinces the fixing developer — the malicious id, the injection string, the crafted URL. No weaponized exploit chains.

### 4. Rate severity by impact × reachability

Severity is a function of blast radius and who can reach it, not a CVSS recital.

- **Critical** — unauthenticated attacker achieves data access, RCE, auth bypass, or secret disclosure. Reachable by anyone.
- **High** — authenticated attacker crosses a trust boundary: cross-tenant/IDOR data access, privilege escalation, stored XSS hitting other users, SSRF into internal network.
- **Medium** — requires specific preconditions or yields limited impact: self-XSS with a plausible delivery, info leak that aids a larger attack, missing rate limit on a sensitive-but-not-catastrophic endpoint.
- **Low** — hardening with a real but marginal exploit path, or a defense-in-depth gap.

State the two factors explicitly (e.g. "High: authenticated, cross-tenant read"). If reachability is gated by an auth check you could not confirm exists, say so — an unconfirmed assumption changes the rating.

### 5. Least-privilege review

For any new IAM policy, DB grant, OAuth scope, service account, token, or capability introduced by the change: is each grant the **minimum** the code actually needs? Flag wildcards (`s3:*`, `Resource: "*"`), broad DB roles where read-only would do, long-lived tokens where short-lived would do, and scopes requested but unused. Over-provisioning is a finding because it widens the blast radius of every other flaw.

## How to read the diff (order of operations)

Presence bias is partly a *reading-order* problem: reviewers read top-to-bottom and comment as they go, so they only ever see present code. Read for security in this order instead:

1. **Map entry points first.** Before reading logic, list every new/changed way data enters: routes, handlers, message consumers, CLI args, deserializers, file readers, webhook receivers. These are where the threat model applies. A change with zero entry points has a much smaller attack surface — say so and focus elsewhere.
2. **For each entry point, trace input to sink.** Follow each request-controlled value from the boundary to where it is *used*: a query, a filesystem path, an HTML response, an outbound URL, a shell. The dangerous moment is the sink, and the question at every sink is "was this validated/encoded/parameterized between here and the boundary?"
3. **Then walk the checklist against that map.** Now the absence items have concrete targets: item 3 (IDOR) runs against every id you found in step 1; item 5 (injection) runs against every sink from step 2.
4. **Finally, read the surrounding auth context.** Confirm the middleware/guards you assumed in the threat model actually wrap these routes. If they are defined outside the diff, note it under open risks rather than assuming.

This sequence makes absences visible because you are asking "where is the check for *this* input" rather than "does this line look wrong."

## Definition of done

- Threat model paragraph written; every reported finding maps to a boundary or attacker goal in it (Gate 1).
- All 15 absence-checklist items carry a verdict (`checked-clean` / `FINDING` / `n.a.`+reason) (Gate 2).
- Every `FINDING` has a concrete attacker→input→impact scenario; items without one are moved to the labeled hardening section (Gate 3).
- Every vulnerability has a `file:line`, a severity with its impact×reachability justification, and a concrete remediation.
- Least-privilege pass done on any new grants/scopes/tokens.
- No offensive tooling used; PoC limited to demonstration.

## Return format

The executor is usually a subagent reporting to an orchestrator. Return a structured summary, never full file dumps:

```markdown
## Security review — <target: PR/branch/module>

### Threat model
<3-6 line paragraph: data, reachability, attacker goals, trust boundaries>

### Findings (ranked, highest severity first)
1. [CRITICAL] <title> — `path/to/file.ext:42`
   - Attack: <attacker capability> → <input/path> → <impact>
   - Why this severity: <impact × reachability>
   - Remediation: <concrete, specific fix — not "sanitize input">
2. [HIGH] ...

### Hardening suggestions (no confirmed exploit path — NOT vulnerabilities)
- <suggestion> — `path:line` — rationale.

### Least-privilege review
- <grant/scope> — minimal? yes/no — <finding if no>

### Absence checklist (coverage proof)
| # | Item | Verdict | Note |
|---|------|---------|------|
| 1 | Authn on new/changed endpoints | checked-clean / FINDING #n / n.a. | ... |
| ... | ... | ... | ... |

### Open risks / could-not-verify
- <anything you could not confirm — e.g. "auth middleware assumed but defined outside the diff; confirm it covers this route">
```

Report the completed checklist even when it is mostly clean — the clean walk is the evidence the review was thorough.

## Anti-patterns

- **Presence-only review.** Commenting only on code that exists and never asking "what protection should be here and isn't." The absence checklist is mandatory precisely to stop this.
- **CVE trivia / textbook padding.** Reporting generic OWASP definitions or advisories not tied to a line in this diff. Every finding cites `file:line` in the reviewed code.
- **Unexploitable findings ranked as vulns.** No attacker→input→impact line means it is hardening, not a vulnerability. Mixing them destroys the report's signal.
- **Skipping IDOR/object-level authz.** Function-level auth ("is the user logged in") is not object-level auth ("may this user touch THIS record"). The most-missed real vulnerability — check every request-supplied id.
- **CVSS theater.** Reciting a score instead of stating impact × reachability in plain terms. Severity must name who can reach the flaw and what they get.
- **Vague remediation.** "Sanitize the input" / "add validation" is not actionable. Say which function, which parameterization, which allowlist, which encoding context.
- **Assuming unseen protections.** Concluding "authz is probably handled upstream" without confirming. If you can't see it, list it under open risks and downgrade confidence, don't hand-wave it clean.
- **Offensive scope creep.** Building working exploits, scanning external hosts, or attacking systems outside the reviewed codebase. Defensive, code-level only.

## Worked micro-examples

**Input:** A diff adds `GET /api/documents/:id` that runs `db.query("SELECT * FROM documents WHERE id = " + req.params.id)` inside an authenticated route.

**Correct behavior:** Two findings, not one, both mapped to the "user input → SQL" and "one user → another's records" boundaries.
- [CRITICAL] SQL injection — `routes/documents.js:88`. Attack: authenticated user sends `id=0 OR 1=1` (or a `UNION SELECT`), returning arbitrary rows / dumping the table. Remediation: parameterized query `WHERE id = ?` with a bound value.
- [HIGH] IDOR / missing object-level authz — `routes/documents.js:88`. Attack: user A requests `id` of user B's document; handler never checks ownership, disclosing cross-user data. Remediation: `WHERE id = ? AND owner_id = :caller_id`, or an ownership check before return.
Checklist item 6 (XSS) → `n.a.` (JSON API, no HTML render), item 11 (rate limit) → note enumeration risk now that IDOR is possible.

**Input:** A diff adds a server-side "fetch preview image from URL" feature taking `req.body.url`.

**Correct behavior:** [HIGH] SSRF — `services/preview.js:31`. Attack: authenticated user submits `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (or `http://localhost:6379`), and the server fetches it, returning cloud credentials or hitting internal services. Remediation: resolve the host, reject private/link-local/loopback ranges, enforce an allowlist of schemes/hosts, and disable redirects to internal targets. Do not report a generic "URLs can be dangerous" note — report the concrete metadata-endpoint path.
