# Sponsor integration checklist

The proof-and-execution stack is intentionally load-bearing. Do not add another sponsor unless removing it would break a real boundary in the product.

## Replay — release authority

- [ ] Obtain API key and hackathon QA credits.
- [ ] Confirm the authoritative definition of a clean report.
- [ ] Confirm how `invalid` and `wontfix` findings affect judging.
- [ ] Create a project for Talos itself and preserve at least one organic bug/fix.
- [ ] Create, poll, read bugs, read root cause, mark fixed, and observe automatic retry.
- [ ] Record the Replay project/report URL in the final evidence manifest.
- [ ] Verify the exact candidate SHA through the target's build-identity endpoint.

## Pioneer — evidence compiler

- [ ] Obtain a Pioneer API key and select an open-weight model; record the provider/model identity in the receipt.
- [ ] Compile only from current Replay evidence whose IDs match the domain command. Include the failed Terac study ID in the domain evidence binding when a holdout triggers the retry.
- [ ] Parse Pioneer into evidence-backed facts only: supported bug class, route/selector, expected/actual behavior, evidence IDs, model identity, and confidence.
- [ ] Let deterministic Talos policy map that class and intersect it with a predeclared repository manifest pinned to the original SHA. Pioneer never proposes or expands the file allowlist.
- [ ] Canonically hash the complete domain specification and recompute the digest at the reducer boundary. Reject low-confidence, stale, mismatched, duplicate, traversal, dot-segment, protected-path, non-open-weight, or out-of-manifest specifications.
- [ ] Pass only the validated spec ID/hash and policy-resolved changes to the executor. Never place raw model output in a shell command, prompt-to-bash bridge, or file-write API.
- [ ] Recompile after repair failure, a dirty Replay retest, or a failed Terac holdout; never reuse the prior attempt's spec.
- [ ] If no Pioneer key is present, show the deterministic fixture spec as `DEMO DATA` and do not claim a live Pioneer call or track qualification.

## Superserve — isolated repair executor

- [ ] Obtain API key and SDK/API examples from the booth.
- [ ] Create one disposable VM per order.
- [ ] Clone only the authorized repository and pin `base_sha`.
- [ ] Start the controlled app and expose it to Replay using the documented proxy path.
- [ ] Keep provider and payment credentials out of the VM.
- [ ] Accept only a policy-approved Pioneer spec and verify the immutable spec ID/hash before execution.
- [ ] Apply only the spec's allowlisted files, build, capture changed files, and expose `/api/version`.
- [x] Implement a bounded lifecycle/exec client with fail-closed validation, timeouts, output limits, sanitized receipts, and no provider secrets in the VM.
- [ ] Exercise the client end to end with issued credentials and retain a real sanitized provider receipt; until then, keep the provider disconnected and label the controlled executor as fallback.
- [ ] Pause/resume once only if it is genuinely needed while human results are pending.

## Terac — independent human proof

- [ ] Obtain API/MCP credential and a real feasibility quote.
- [ ] Launch the baseline immediately with a general-population task.
- [ ] Freeze: journey, success condition, minimum participants, minimum completion rate, and minimum absolute lift.
- [ ] Launch a separate fresh holdout against the candidate preview.
- [ ] Preserve real study IDs, timestamps, raw success counts, and provider evidence for cohort freshness.
- [ ] Show exact before/after counts; never pre-fill a promised delta.

## Stripe — post-proof settlement

- [ ] Create the single organizer-registered Payment Link.
- [ ] Record both its public URL and `plink_…` ID for strict webhook matching.
- [ ] Obtain restricted read-only key for organizer tracking as required.
- [ ] Configure Talos's signed webhook endpoint.
- [ ] Send the link only after certification.
- [ ] Retrieve and verify the PaymentIntent before delivery.
- [ ] Replay the same webhook and prove the delivery count remains one.
- [ ] Display live revenue separately from test payments and demo data.

## Deployment and orchestration

- [x] Deploy the public app and controlled target on Vercel; verify the production domain without an authenticated session.
- [ ] Deploy a Render Workflow only if entering the Render track; do not make it a decorative duplicate coordinator.
- [ ] Keep the durable workflow event-driven: provider callbacks wake it; provider retrieval supplies authority.
- [ ] Add Band only if its room performs a real, blocking handoff. Do not ship a decorative agent chat.

## Questions to ask before coding against sponsor APIs

1. Replay: Do customer-target QA projects count for the track, or must the submitted app itself be the target?
2. Replay: What exact state and finding categories constitute the track's required clean report?
3. Pioneer: Which response fields provide a stable model/run receipt, and which open-weight model is available under the hackathon key?
4. Superserve: What is the fastest supported way to expose a localhost preview to Replay, and is the live client/API stable enough for the complete execute/build/preview flow?
5. Terac: What participant count and turnaround can be supported in the remaining event window?
6. Stripe/organizers: Must every qualifying charge use the exact Payment Link URL, and which webhook object should be treated as authoritative?
