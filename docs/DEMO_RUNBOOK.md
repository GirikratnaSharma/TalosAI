# Talos demo runbook

Target: 140 seconds. The story is one order and one release decision—not a tour of sponsor logos.

## Golden path

### 0:00–0:15 — Contract

Open the controlled checkout journey and fail the task once.

> “Talos is a zero-employee software repair company. Give it one broken revenue flow. It gets paid only after independent machines and fresh people prove the repair.”

Show the frozen journey, baseline URL, allowed repair class, two-attempt limit, and `NO CLEAN RUN · NO CHARGE`.

### 0:15–0:45 — Independent diagnosis

Show the real Replay finding, reproduction, recording, and root cause. Show the real Terac baseline as raw counts, for example `1 / 5 completed`—only if those are the returned results.

> “The repair agent cannot mark its own work. Replay is the release authority; Terac measures whether people can actually finish the task.”

### 0:45–0:57 — Evidence compiler

Show Pioneer receive the exact Replay evidence and return a structured classification—not raw model prose—with the bug class, route/selector, evidence IDs, model identity, and confidence. Then show Talos policy intersect that result with the repository manifest pinned to the observed SHA and issue the bounded file list, immutable spec ID, and SHA-256.

> “Replay found the failure. Pioneer structures the evidence; Talos policy decides the only files the repair cell may touch. Wrong evidence, low confidence, or an unsafe path stops the company here.”

If there is no live Pioneer key and receipt, label this panel `DEMO DATA · DETERMINISTIC SPEC` and say so. The fallback demonstrates the policy gate; it is not a claimed Pioneer API call.

### 0:57–1:10 — Isolated repair

For a genuinely live Superserve run, open the workspace receipt and show that the executor accepted the Pioneer spec ID/hash, touched only allowlisted files, has no provider credentials, and exposed the candidate SHA. If no credentialed run and real provider receipt exists, show the controlled executor with a prominent fallback label and do not claim Superserve track qualification.

> “The code runs in an isolated repair cell with no production credentials. Talos gets two attempts, then it walks away and charges nothing.”

### 1:10–1:38 — Dual gate

Show Replay's automatic retest on the exact candidate: idle, no open/invalid/wontfix findings. Then show a fresh Terac cohort's exact completion delta and the predeclared threshold.

Make the physical release gate in the UI move from blocked to cleared only after both receipts are present.

### 1:38–2:03 — Settlement

Show Talos send the organizer-approved Stripe Payment Link after certification. Complete or switch to a previously started live order, then show the signed webhook being reconciled to the authoritative payment and unlocking delivery once.

Replay the webhook if time permits: delivery count stays one.

### 2:03–2:20 — Close

Show the exact-SHA certificate and the real job ledger.

> “Replay proved the software. Fresh people proved the outcome. Stripe proved the company. No clean run, no charge.”

## Honest fallback ladder

1. **Provider latency:** show the still-live workflow and switch to a time-stamped recorded real run. Do not relabel it as current.
2. **Replay outage:** show the real earlier Replay report, then a local deterministic test labeled fallback. It cannot issue a live certificate.
3. **Terac quorum missing:** display `INSUFFICIENT EVIDENCE`, do not unlock payment, and explain the fail-closed decision.
4. **Pioneer unavailable or no key:** show the deterministic structured spec labeled `DEMO DATA`; demonstrate that malformed specs are blocked, but do not claim a live call or Pioneer track qualification.
5. **Superserve unavailable or no real provider receipt:** use the controlled local executor labeled fallback; do not claim the Superserve track.
6. **Stripe webhook delayed:** retrieve the live PaymentIntent from the server and remain `AWAITING PAYMENT` until confirmed.
7. **Venue network failure:** play a 60-second capture of the genuine run, then show the local append-only journal.
