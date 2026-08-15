# Talos v0 threat model

## Product boundary

Talos repairs one customer-authorized, unauthenticated revenue journey in one controlled React/Next.js repository. It may create a branch and a preview build; it cannot deploy to production, modify authentication, payment processing, database migrations, infrastructure, or customer data.

The product promise is deliberately narrow:

> Replay must report a strictly clean result for the exact candidate build, and a fresh Terac cohort must cross the predeclared human-completion gate. Only then may Talos request payment and deliver the repair.

## Assets

- Customer source code and scoped repository credential.
- Provider credentials for Replay, Pioneer, Superserve, Terac, Stripe, and deployment.
- Candidate source commit and preview environment.
- Raw Replay and Terac evidence.
- Validated Pioneer patch specifications and their immutable IDs/hashes.
- Stripe revenue and payment status.
- Append-only decision journal and release certificate.

## Trust boundaries

### Customer intake

The customer supplies a URL, repository, and plain-language journey. Treat every string and repository as untrusted. Require explicit ownership/authorization; reject credentialed journeys and unsupported repair categories before any external work begins.

### Pioneer evidence compiler

Pioneer sits between diagnosis and execution; it is not the repair sandbox, file-scope authority, or release authority. It extracts and classifies bounded facts from the current Replay evidence. Talos fails closed unless the result comes from the approved Pioneer/open-weight boundary, matches the exact Replay bug IDs and model receipt, meets the routing-confidence threshold, and maps to a supported bug class. A failed Terac holdout is bound by study ID in the domain command when it triggers a retry.

Deterministic Talos policy then intersects those facts with a predeclared repository manifest pinned to the observed SHA. Pioneer cannot add a file. Raw model prose is evidence input, never executable input: Talos does not interpolate it into a shell or write arbitrary model-returned files. The resulting domain specification is canonically hashed and its digest is recomputed at the reducer boundary. Every retry invalidates the old specification and requires a new ID/hash bound to the current evidence.

### Superserve repair cell

Customer code and policy-approved patch actions execute only in a per-order sandbox. Superserve receives the validated Pioneer spec ID/hash and bounded changes, not raw model output. The sandbox receives no Stripe, Terac, Replay, Pioneer, or database credentials. Egress and repository scope are minimized; the workspace expires after the evidence retention window. The bounded lifecycle/exec client is implemented, but until it is exercised with issued credentials and produces a real sanitized provider receipt, this boundary remains a disclosed controlled fallback rather than claimed live sponsor usage.

### Replay release authority

Replay is independent of the patch author and has veto power. Webhooks are wakeups, not facts: Talos re-fetches the authoritative project and bug state. A release is not clean if any finding remains `open`, `invalid`, or `wontfix`.

### Terac human verification

Baseline and holdout are separate studies. Holdout participants must be fresh, the task and threshold are frozen before repair, and the patch author never receives holdout results. Exact participant counts are shown; small samples are described as directional evidence rather than statistical certainty.

### Stripe settlement

The organizer-approved Payment Link is sent only after certification. A signed webhook wakes the workflow, which retrieves the authoritative PaymentIntent and verifies amount, currency, and live/test mode before delivery. Duplicate or out-of-order events cannot deliver twice.

## Primary abuse cases and controls

| Abuse or failure | Control |
| --- | --- |
| A malicious repository exfiltrates provider secrets | No provider credentials enter the sandbox; deny-by-default egress and a disposable workspace |
| Prompt injection makes Pioneer request arbitrary execution | Pioneer can only classify/extract evidence; deterministic policy owns a SHA-pinned file manifest, recomputes the spec hash, and rejects unsupported classes or paths |
| A stale spec is reused after Replay or Terac changes | Bind spec to attempt, trigger, Replay project/snapshot/build/bug IDs, optional Terac study ID, and immutable spec hash; recompile every retry |
| The repair edits its evaluator or contract | Protected paths and immutable contract hash; compare changed files before accepting a candidate |
| A mutable preview changes after QA | Bind evidence to repository SHA, dependency-lock hash, preview URL, and `/api/version` identity |
| A team dismisses Replay bugs to look clean | `invalid` and `wontfix` findings fail the clean invariant |
| Replay webhook says finished while the project still runs | Re-fetch authoritative project state; require idle plus empty disqualifying sets |
| Terac feedback leaks into the holdout | Separate study IDs/cohorts; no holdout result is exposed to the repair agent |
| Human result is cherry-picked | Freeze success metric, minimum cohort, and absolute lift before the baseline launches |
| A duplicate Stripe webhook unlocks twice | Unique provider event ID, unique PaymentIntent, idempotent delivery command |
| A demo fixture is counted as business performance | Run mode is part of every event; `DEMO` and `TEST` are excluded from revenue/customer totals |
| Two failed patches loop forever | Maximum two attempts, then close as `CLOSED_NO_CHARGE` |
| An unsupported repair mutates production | Category/path allowlist, preview-only delivery, explicit no-production-write invariant |

## Non-goals

- Universal autonomous software engineering.
- Security auditing or vulnerability guarantees.
- Production deployment or automatic merge.
- Insurance, escrow, or loss reimbursement.
- Statistical claims from a same-day small cohort.
- A generic multi-agent organization simulator.

## Demo claims policy

Each number on screen must carry one of three labels:

- `LIVE`: a provider-confirmed live event from this hackathon window.
- `TEST`: a real provider flow using test-mode money or a controlled target.
- `DEMO DATA`: a deterministic local fixture used only to develop or recover the presentation.

Only `LIVE` Stripe payments count as revenue. A controlled fixture can demonstrate mechanics but cannot receive a Talos clean certificate presented as customer evidence.

A deterministic Pioneer patch spec is labeled `DEMO DATA` unless a real Pioneer key produced a verifiable provider receipt. Likewise, neither the controlled executor nor the unexercised Superserve HTTP client is represented as live Superserve evidence until a real provider receipt exists. These fallbacks may demonstrate fail-closed orchestration, but they do not qualify as sponsor-track proof.
