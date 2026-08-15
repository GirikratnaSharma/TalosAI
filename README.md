# Talos

Talos is an autonomous repair company for one bounded class of broken React/Next.js revenue flows. Replay is the independent release authority: a repair cannot be sold or delivered until Replay reports a strictly clean run for the exact candidate build and a fresh Terac cohort demonstrates a predeclared improvement in task completion.

**No proof. No payment.**

[Open the deployed company ledger](https://talos-ai-ten.vercel.app)

## The company

| Responsibility | System | Authority |
| --- | --- | --- |
| General manager | Talos policy engine | Accept or reject a bounded repair contract |
| Machine witness | Replay, outside Talos | Block release when the exact candidate is not clean |
| Evidence compiler | Pioneer open-weight model + Talos policy | Extract evidence-backed bug facts; intersect them with a predeclared repository manifest and hash the resulting repair contract |
| Repair engineer | Talos inside Superserve | Execute only the accepted specification; cannot approve its own candidate |
| Human witness | Fresh Terac cohort | Prove the declared task-completion outcome improved |
| Treasurer | Stripe | Reveal the one organizer-approved Payment Link only after both proofs |

The decision journal is the product—not a decorative multi-agent chat. Every state transition names the actor, exact build, provider receipt, evidence source, and financial effect.

## Core contract

- One customer-authorized repository and one critical journey per order.
- Maximum two repair attempts in a Superserve sandbox.
- Every attempt requires a fresh Pioneer classification bound to the exact Replay evidence. Talos then intersects it with a repository manifest pinned to the original SHA and produces the immutable repair specification.
- Raw model output is never executed. Only a validated structured specification with an immutable ID and SHA-256 may authorize Superserve work.
- No production writes, database migrations, auth changes, or payment-code changes.
- Replay findings cannot be dismissed as `invalid` or `wontfix` to manufacture a clean result.
- Baseline and holdout Terac cohorts are disjoint; raw counts are retained.
- Stripe payment is requested only after certification: no clean report, no charge.
- Demo data is visibly labeled and excluded from revenue and business metrics.

## Controlled Replay target

The repo includes a deterministic checkout bug so the full fail/retest story can be exercised without trusting an arbitrary customer repository:

- [Seeded baseline](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=baseline) sends a stale empty intent ID and must return `422 INTENT_ID_MISSING`.
- [Repaired candidate](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=candidate) sends the value created by the current submission and returns a fixture receipt.

Both paths are conspicuously labeled `FIXTURE`; neither touches Stripe or represents revenue.

## Current integration state

- Domain policy, the Pioneer specification gate, two-attempt reducer, proof gates, receipt sanitization, and invariant/adapter/API tests are implemented.
- The Talos company ledger and evidence inspector are implemented and deployed.
- InsForge order/event reads fall back only for the known `TAL-D04` demo and disclose that provenance in the response and `X-Talos-Provenance` header.
- Stripe has an implemented raw-body signature boundary, authoritative Checkout Session re-fetch, registered Payment Link ID check, `client_reference_id` order reconciliation, and durable provider-inbox deduplication.
- Pioneer is load-bearing in the domain flow: the live-client result has a tested bridge into the canonical `PATCH_SPEC_COMPILED` event, while Talos—not Pioneer—owns file scope and safety policy. A run is not a live Pioneer run unless a real API key and provider receipt are present; without them, the structured result is labeled fixture/demo evidence.
- The bounded Superserve lifecycle/exec client is implemented and fail-closed; the higher-level repair orchestrator remains a separate contract. It has not been live-tested and cannot qualify as live Superserve usage until issued credentials produce a real sanitized provider receipt.
- Replay and Terac also require real credentials and receipts before Talos labels their evidence `LIVE`; the UI does not fabricate provider evidence.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add credentials as they are issued. The product defaults to an explicitly labeled demo mode while provider credentials are unavailable.

Do not copy a parent `.insforge/project.json` into this repository. Link Talos to the intended `mitos-preview` backend explicitly before applying the migration.

## Verification

```bash
npm run check
npm run build
```

`/api/health` reports only provider capability states and environment-variable names; it never serializes secret values. `/api/version` binds a candidate deployment to `VERCEL_GIT_COMMIT_SHA`, `RENDER_GIT_COMMIT`, or the explicitly configured `TALOS_BUILD_SHA`, in that order.

Useful endpoints:

- `/api/orders/TAL-D04` — provenance-labeled company ledger read model
- `/api/health` — provider readiness without secret values
- `/api/version` — exact deployed commit identity
- `/api/webhooks/stripe` — signed Stripe webhook inbox (503/retry while persistence is unavailable)

See [the threat model](docs/THREAT_MODEL.md), [integration checklist](docs/INTEGRATION_CHECKLIST.md), and [140-second demo runbook](docs/DEMO_RUNBOOK.md).
