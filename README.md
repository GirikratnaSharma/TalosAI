# Talos — the autonomous repair company that cannot lie

**Give Talos one broken revenue flow. It gets paid only after independent machines and fresh humans prove the repair.**

Talos is a zero-employee software repair company for a bounded class of broken React/Next.js revenue flows. It is built on one principle: **no agent in this company marks its own homework.** The agent that writes the patch has no authority to approve it, the systems that verify it have no ability to modify it, and payment is structurally impossible until both proofs exist.

**No proof. No payment.**

🔗 **[Live company ledger](https://talos-ai-ten.vercel.app)** · [Seeded broken checkout](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=baseline) · [Repaired candidate](https://talos-ai-ten.vercel.app/fixtures/checkout?variant=candidate) · [140-second demo runbook](docs/DEMO_RUNBOOK.md)

---

## How an order flows

```
Customer authorizes one repo, one broken journey
        │
        ▼
DIAGNOSING ──── Replay reproduces & root-causes the bug (Talos may not self-diagnose)
        │        Terac baseline: real people attempt the broken flow — raw counts recorded
        ▼
SPEC ────────── Pioneer's open-weight model classifies Replay's evidence; Talos intersects
        │        it with a manifest pinned to the audited SHA and hashes an immutable
        │        repair specification. No valid spec → the sandbox never starts.
        ▼
PATCHING ────── Repair agent gets two attempts, inside an isolated Superserve VM
        │        No provider credentials, no payment code, no migrations. Exact SHA pinned.
        ▼
REPLAY_VERIFYING ── Replay retests the EXACT candidate build. Anything less than
        │            strictly clean — one open, invalid, or wontfix finding — is a VETO.
        ▼
HUMAN_VERIFYING ─── A fresh, disjoint Terac cohort attempts the repaired flow.
        │            Completion must beat the predeclared threshold and lift.
        ▼
RELEASE_DECISION ── The certified evidence bundle enters the Band room. An explicit
        │            approved/vetoed verdict is the only door to settlement.
        ▼
AWAITING_PAYMENT ── Only now does Stripe reveal the payment link. Signed webhook,
        │            authoritative re-fetch, idempotent delivery. Pay once, deliver once.
        ▼
DELIVERED           …or CLOSED_NO_CHARGE. Two failed attempts and Talos walks away.
```

Every transition is an append-only journal entry naming the actor, exact build SHA, provider receipt, evidence link, and financial effect. **The decision journal is the product.**

## The company at a glance

| Responsibility | System | Authority |
| --- | --- | --- |
| General manager | Talos policy engine | Accept or reject a bounded repair contract |
| Machine witness | Replay, outside Talos | Block release when the exact candidate is not clean |
| Evidence compiler | Pioneer open-weight model + Talos policy | Extract evidence-backed bug facts; intersect them with a predeclared repository manifest and hash the resulting repair contract |
| Repair engineer | Talos inside Superserve | Execute only the accepted specification; cannot approve its own candidate |
| Human witness | Fresh Terac cohort | Prove the declared task-completion outcome improved |
| Release chamber | Band | Carry the certified evidence bundle and the explicit verdict that gates settlement |
| Treasurer | Stripe | Reveal the one organizer-approved Payment Link only after both proofs |

---

## Every role is a sponsor system with real authority

Talos is not a chat room of agents role-playing executives. Each department is a real external system holding authority the others cannot override.

### 🟢 Replay — the release authority (the reason Talos can exist)

Replay is the dominant power in this company, and deliberately so. It is the **independent machine witness** with a **non-bypassable veto** over every release:

- Replay **finds and root-causes** the bug — the repair agent is forbidden from diagnosing its own work order.
- Replay **retests the exact candidate build**, verified by SHA against the deployed `/api/version` — not "a" build, *the* build.
- A clean run is defined strictly: idle, finished, **zero** open findings, **zero** dismissed as `invalid` or `wontfix`. The policy engine treats dismissed findings as evidence of manufactured cleanliness and refuses certification.
- **No clean Replay report → no payment link, no delivery, no revenue.** This gate is enforced in the domain layer (`hasCertifiableEvidence`), not in a prompt. There is no code path around it.

An autonomous company is only trustworthy if something it doesn't control can stop it. Replay is that something.

### 🧑‍🔬 Terac — the human witness (host)

Software proof is not outcome proof. Terac's general-population network provides the **only ground truth that matters: can real people actually complete the journey?**

- A **baseline cohort** attempts the broken flow before repair — raw counts, no massaging.
- A **holdout cohort** — provably fresh, disjoint by cohort fingerprint, baseline explicitly excluded — attempts the repaired candidate.
- Certification requires the predeclared completion threshold **and** minimum absolute lift. Thresholds are frozen at contract time; they cannot be tuned after results arrive.

Talos does not grade its own outcomes. Strangers do.

### 🧾 Pioneer — the specification compiler that authorizes work

Between diagnosis and repair sits a stage most autonomous coders skip: **turning messy evidence into a bounded contract.** Pioneer's open-weight model classifies Replay's raw root-cause evidence into typed, evidence-backed bug facts, and that classification is what authorizes the sandbox:

- **Every attempt requires a fresh Pioneer classification bound to the exact Replay evidence.** Talos intersects it with a repository manifest pinned to the original SHA and produces an **immutable, SHA-256-hashed repair specification.**
- **Raw model output is never executed.** Only the validated structured specification, with its immutable ID and hash, may authorize Superserve work — and Talos, not Pioneer, owns file scope and safety policy. A malicious model response suggesting extra files is ignored by construction.
- The state machine **cannot start Superserve without it**: the spec gate emits the canonical `PATCH_SPEC_COMPILED` event, and a failed repair attempt invalidates the spec, forcing re-classification rather than blind retry.

This is how a small open model becomes genuinely useful in an autonomous company: a compiler with no authority, feeding an engineer with no judgment, judged by an inspector with no pen.

### 🏗️ Superserve — the isolated repair floor

All repair work happens inside a disposable **Superserve VM**: one per order, cloned from the authorized repo at a pinned base SHA, **no provider or payment credentials inside the cell**, executing only the accepted specification. The sandbox is what makes autonomous code modification a bounded, insurable action instead of a leap of faith — the agent can be wrong in there, and nothing outside can break.

### 💳 Stripe — the treasurer that pays only on proof

Stripe is the company's financial constitution:

- The payment link is revealed **only after dual certification** — charge-on-verification, an SLA that enforces itself.
- Signed webhooks with raw-body verification, registered Payment Link ID matching, `client_reference_id` order reconciliation, and authoritative Checkout Session re-fetch — the webhook is a doorbell, never the source of truth.
- A **durable dedup inbox**: replay the same event twice and delivery count stays exactly one.
- Revenue accounting is honest by construction: only livemode payments matching the exact contract amount count (`isCountableLiveRevenue`); test and demo data are structurally excluded and visibly labeled.

### 🎛️ Band — the room where the company actually decides

Coordination in Talos is not a group chat that displays what already happened — **Band is where the release decision is made, and nothing ships without it.**

- When a candidate is certified, the release request enters the Band room as a **structured, evidence-linked message**: the certification proof, the patch receipt, and the holdout receipt, each pointing to its provider evidence — a Replay report, a commit SHA, a Terac study ID, a Stripe event.
- The decision comes back as an explicit verdict — `approved` or `vetoed`, with a reason code — and it is a **genuinely blocking handoff**: the state machine waits on that verdict; delivery and payment are unreachable until it exists. Remove the room and the company doesn't lose a dashboard — it loses the ability to release at all.
- Because every handoff between departments flows through Band with its evidence attached, the Band transcript doubles as the company's **append-only audit log**. The decision journal judges inspect *is* the coordination layer — one system, no reconciliation gap between "what the agents said" and "what the company did."

Separation of powers needs a chamber where the powers meet. Band is that chamber.

---

## The core contract: what Talos will not do

Honesty about limits is part of the product:

- One customer-authorized repository, one critical journey, one bounded repair class per order.
- Maximum **two** repair attempts in a Superserve sandbox — then `CLOSED_NO_CHARGE`. The company walks away rather than thrash.
- No production writes, no database migrations, no auth changes, and **never** changes to payment code.
- Raw model output is never executed; only a validated, hashed specification authorizes work.
- Replay findings cannot be dismissed as `invalid` or `wontfix` to manufacture a clean result.
- Baseline and holdout Terac cohorts are disjoint; raw counts are retained.
- Stripe payment is requested only after certification: no clean report, no charge.
- Demo data is visibly labeled and excluded from revenue and business metrics.

## Controlled Replay target

The repo includes a deterministic checkout bug so the full fail → veto → repair → certify story is reproducible without trusting an arbitrary customer repository:

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

## Verify it yourself

```bash
npm install
npm run check   # invariant, adapter, and API tests · typecheck · lint
npm run build
```

Copy `.env.example` to `.env.local` and add credentials as they are issued. The product defaults to an explicitly labeled demo mode while provider credentials are unavailable. Do not copy a parent `.insforge/project.json` into this repository; link Talos to the intended `mitos-preview` backend explicitly before applying the migration.

| Endpoint | What it proves |
| --- | --- |
| [`/api/orders/TAL-D04`](https://talos-ai-ten.vercel.app/api/orders/TAL-D04) | Provenance-labeled ledger read model |
| `/api/health` | Provider readiness — names, never secret values |
| `/api/version` | Exact deployed commit SHA (build identity for Replay verification) |
| `/api/webhooks/stripe` | Signed Stripe webhook inbox with durable deduplication |

More: [Threat model](docs/THREAT_MODEL.md) · [Sponsor integration checklist](docs/INTEGRATION_CHECKLIST.md) · [Demo runbook](docs/DEMO_RUNBOOK.md)

---

## The close

> **The agent repaired it. Replay proved the software. Fresh people proved the outcome. Stripe proved somebody paid.**

Built at the Zero-Human Company Hackathon by Terac — San Francisco, August 15, 2026.
