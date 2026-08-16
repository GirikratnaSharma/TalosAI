# Talos — the autonomous repair company that cannot mark its own homework

**Give Talos one broken revenue flow. It repairs it — and it is structurally incapable of certifying its own work.**

Talos is a zero-employee software repair company for a bounded class of broken React/Next.js revenue flows. One principle holds the whole thing up: **the party that does the work is never the party that approves it.** The agent that writes the patch cannot diagnose it, cannot test it, and cannot release it. Payment is unreachable until an independent machine and a fresh panel of real humans both agree the repair worked.

We do not automate QA — Replay does that, and we buy it from them. **Talos automates the repair and purchases the proof.**

**No proof. No payment.**

🔗 **[Live company ledger](https://talos-ai-ten.vercel.app)** · [Broken checkout](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=baseline) · [Repaired candidate](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=candidate) · [Health / provider status](https://talos-ai-ten.vercel.app/api/health) · [Demo runbook](docs/DEMO_RUNBOOK.md)

---

## The order lifecycle

```
Customer authorizes one repository, one broken journey
        │
        ▼
DIAGNOSING ────── REPLAY independently reproduces and root-causes the defect.
        │         TERAC baseline cohort attempts the broken flow — raw counts recorded.
        ▼
SPECIFYING ────── PIONEER (GLiNER2) compiles Replay's raw report into typed bug facts.
        │         Talos intersects them with a file manifest pinned to the audited SHA
        │         and hashes an immutable repair specification. No spec → no sandbox.
        ▼
PATCHING ──────── The repair agent executes ONLY that specification inside an isolated
        │         SUPERSERVE VM. No provider or payment credentials in the cell.
        │         Two attempts maximum.
        ▼
REPLAY_VERIFYING  REPLAY retests the EXACT candidate build, matched by SHA against
        │         /api/version. One open, invalid, or wontfix finding = VETO.
        ▼
HUMAN_VERIFYING   A fresh, provably disjoint TERAC cohort attempts the repaired flow.
        │         Must beat the completion threshold and lift frozen at contract time.
        ▼
AWAITING_PAYMENT  Only now does STRIPE reveal the payment link. Signed webhook,
        │         authoritative re-fetch, durable dedup. Pay once, deliver once.
        ▼
DELIVERED         …or CLOSED_NO_CHARGE. Two failed attempts and the company walks
                  away, having charged nothing.
```

Every transition is an append-only journal entry naming the actor, the exact build SHA, the provider receipt, the evidence link, and the financial effect. **The decision journal is the product.**

---

## What each system actually does

### 🟢 REPLAY — the release authority

**Replay is the dominant power in this company, and every other component is arranged around that fact.** It is the independent machine witness, and it holds a veto no part of Talos can route around.

| What it does | Concretely |
| --- | --- |
| **Discovers** the defect | Talos is forbidden from diagnosing its own work order. Replay explored the app on its own and filed **9 bugs — 8 of which we never planted.** |
| **Root-causes** it | It traced the seeded defect through *minified JavaScript with no source maps*: the component reads stale React state (`c`) instead of the ID generated in that submission (`a`), so the POST carries an empty `intentId` and the server returns `422 INTENT_ID_MISSING`. Full reproduction steps, screenshots, and a hosted recording. |
| **Retests** the exact build | Verification is bound by SHA against the deployed `/api/version`. Not "a" build — *the* build Talos claims to have repaired. |
| **Vetoes** release | A clean run is strict: finished, idle, **zero** open findings, **zero** dismissed as `invalid` or `wontfix`. The policy engine treats dismissed findings as manufactured cleanliness and refuses certification outright. |
| **Files evidence** | Connected to GitHub Issues on this repository — every bug Replay finds is filed here by Replay's own integration, with root cause, steps, screenshots, and recording. Third-party evidence, in the open. |
| **Watches every deploy** | The repo is connected to Replay QA; new deployments are detected and retested automatically. |

**No clean Replay report → no payment link, no delivery, no revenue.** This gate lives in the domain layer (`hasCertifiableEvidence`), not in a prompt. There is no code path around it.

*Integration note, stated honestly:* Replay publishes no public API (confirmed with Replay during the event). Talos therefore ingests Replay evidence through the channels Replay does provide — hosted report and recording URLs, GitHub Issues filed by their integration, automatic retests on deployment, and a token-verified webhook inbox at `/api/webhooks/replay`. Every Replay claim in the ledger links to an artifact Replay itself hosts. Nothing is transcribed by us and presented as theirs.

*An autonomous company is only trustworthy if something it does not control can stop it. Replay is that something.*

---

### 🧑‍🔬 TERAC — the human witness (host)

Software passing tests is not the same as a person succeeding. Terac supplies the only ground truth that matters: **can a real human complete the journey?**

- **Baseline cohort** (`an6hs3jus9r0edp1bmd1bgjs`) — general-population participants attempted the *broken* flow. Raw counts, no massaging.
- **Holdout cohort** (`gah2yu8adyu0kjdqrpny49yq`) — a **provably fresh** panel attempts the *repaired* candidate. Freshness is enforced at recruitment by a screener that rejects anyone who took the baseline, and again in policy by cohort-fingerprint disjointness.
- **Thresholds frozen before data.** Minimum participants, minimum completion rate, and minimum absolute lift are fixed at contract time and cannot be tuned once results arrive.
- Results are pulled programmatically via the Terac API v2 with the organization key.

*Talos does not grade its own outcomes. Strangers do.*

---

### 🧾 PIONEER — the specification compiler that authorizes work

Between diagnosis and repair sits the stage most autonomous coders skip: **turning messy evidence into a bounded, executable contract.**

- Pioneer's open-weight model (**GLiNER2**, a Fastino model built for structured extraction) reads Replay's raw root-cause report and emits **typed, evidence-backed bug facts** — bug class, affected route, expected behavior, risk.
- Talos intersects those facts with a **repository manifest pinned to the audited SHA** and produces an **immutable, SHA-256-hashed repair specification.** Pioneer proposes; Talos — not Pioneer — owns file scope and safety policy, so a model response inventing extra files is ignored by construction.
- **The state machine cannot start Superserve without a valid spec** bound to that exact Replay evidence. Every failed attempt invalidates the spec, forcing re-classification rather than blind retry.
- **Raw model output is never executed.** Only the validated, hashed specification can authorize work.

*A compiler with no authority, feeding an engineer with no judgment, judged by an inspector with no pen.*

---

### 🏗️ SUPERSERVE — the isolated repair floor

Autonomous code modification is only safe if the blast radius is bounded. Every repair runs in a **disposable Superserve VM**, one per order:

- Cloned from the authorized repository at a **pinned base SHA**.
- **No provider credentials, no payment credentials inside the cell** — the sandbox cannot reach Stripe, Terac, or the ledger.
- Executes **only** the accepted specification: no production writes, no migrations, no auth changes, and never any change to payment code.
- Two attempts, then the order closes unpaid.

*The agent is allowed to be wrong in there, and nothing outside can break.*

---

### 💳 STRIPE — the treasurer that pays only on proof

Stripe is the company's financial constitution, and it is wired the way a payments engineer would expect:

- **Charge-on-verification.** The payment link is revealed only after dual certification — the SLA enforces itself.
- **Raw-body signature verification**, then the webhook is treated as a doorbell, never as truth: Talos re-fetches the Checkout Session from Stripe's API as the authority.
- **Registered payment-link matching** (`plink_…`) plus `client_reference_id` reconciliation — *a payment that cannot be attributed to an order is refused.* Verified live: an unattributed payment returns `400 ORDER_REFERENCE_MISSING`.
- **Durable dedup inbox.** Verified live: the same event delivered twice returns `{"received":true,"duplicate":true,"effect":"ALREADY_ENQUEUED"}` — one payment, one record, one delivery.
- **Honest revenue accounting.** Only livemode payments matching the exact contract amount count (`isCountableLiveRevenue`); test and demo data are structurally excluded and visibly labeled.

Durable state lives in an InsForge Postgres backend (`talos_orders`, `talos_provider_inbox`, `talos_evidence`, `talos_order_events`). When persistence is unavailable the webhook **fails closed with 503** and asks Stripe to retry, rather than acknowledging a payment it cannot record.

---

### ⚪ BAND and RENDER — deliberately not wired

Both exist in this repository as **typed adapter contracts only**. Neither is claimed as live, neither appears in the release path, and `/api/health` reports both as `disabled`.

We would rather ship four provably live integrations than six half-wired ones. If a claim isn't in the code, it isn't in this README.

---

## The core contract: what Talos will not do

- One authorized repository, one critical journey, one bounded repair class per order.
- Maximum **two** repair attempts — then `CLOSED_NO_CHARGE`.
- No production writes, no database migrations, no auth changes, no payment-code changes.
- Raw model output is never executed; only a validated, hashed specification authorizes work.
- Replay findings cannot be dismissed as `invalid` or `wontfix` to manufacture a clean result.
- Baseline and holdout cohorts must be disjoint; raw counts are retained.
- Stripe payment is requested only after certification.
- Demo data is visibly labeled and excluded from revenue and business metrics.

---

## The controlled target

A deterministic checkout defect ships in this repo so the full fail → veto → repair → certify story is reproducible without trusting an arbitrary customer repository:

- [**Baseline**](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=baseline) — sends a stale empty intent ID, returns `422 INTENT_ID_MISSING`.
- [**Candidate**](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=candidate) — sends the value created in that submission, returns a fixture receipt.

Both are conspicuously labeled `FIXTURE`. Neither touches Stripe or represents revenue.

---

## Verify it yourself

```bash
npm install
npm run check   # 137 invariant, adapter, and API tests · typecheck · lint
npm run build
```

| Endpoint | What it proves |
| --- | --- |
| [`/api/health`](https://talos-ai-ten.vercel.app/api/health) | Live provider status — names only, never secret values |
| [`/api/version`](https://talos-ai-ten.vercel.app/api/version) | Exact deployed commit SHA (build identity for Replay verification) |
| `/api/webhooks/stripe` | Signed Stripe inbox with durable deduplication |
| `/api/webhooks/replay` | Token-verified Replay event inbox |

More: [Threat model](docs/THREAT_MODEL.md) · [Integration checklist](docs/INTEGRATION_CHECKLIST.md) · [Demo runbook](docs/DEMO_RUNBOOK.md)

---

## The close

> **The agent repaired it. Replay proved the software. Fresh people proved the outcome. Stripe proved somebody paid.**

Built at the Zero-Human Company Hackathon by Terac — San Francisco, August 15, 2026.
