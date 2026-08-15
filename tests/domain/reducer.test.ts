import { describe, expect, it } from "vitest";
import {
  DomainInvariantError,
  reduce,
  type TalosOrder,
} from "../../lib/domain";
import {
  CANDIDATE_SHA_2,
  PREVIEW_URL,
  event,
  makeAwaitingPaymentOrder,
  makeBaseline,
  makeBug,
  makeCandidate,
  makeCertificate,
  makeCleanVerification,
  makeDiagnosingOrder,
  makeDraftOrder,
  makeHoldout,
  makeHumanVerifyingOrder,
  makePatchingOrder,
  makePayment,
  makePatchSpec,
  makeReplaySnapshot,
  makeReplayVerifyingOrder,
  makeSpecifyingOrder,
} from "./fixtures";

function expectDomainCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected domain error ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainInvariantError);
    expect((error as DomainInvariantError).code).toBe(code);
  }
}

function makeAttemptTwoVerifyingOrder(): TalosOrder {
  const first = makeReplayVerifyingOrder();
  const dirty = reduce(
    first,
    event({
      id: "event_replay_dirty_1",
      type: "REPLAY_SYNCED",
      snapshot: makeCleanVerification({
        open: [makeBug("open", "bug_retry")],
        fixed: [],
      }),
    }),
  ).order;

  const patching = reduce(
    dirty,
    event({
      id: "event_patch_spec_compiled_2",
      type: "PATCH_SPEC_COMPILED",
      spec: makePatchSpec(dirty),
    }),
  ).order;

  return reduce(
    patching,
    event({
      id: "event_candidate_deployed_2",
      type: "CANDIDATE_DEPLOYED",
      candidate: makeCandidate({
        attempt: 2,
        sha: CANDIDATE_SHA_2,
      }),
    }),
  ).order;
}

describe("Talos reducer", () => {
  it("starts Replay and Terac diagnosis without asking for payment", () => {
    const draft = makeDraftOrder();
    const intake = event({ type: "INTAKE_ACCEPTED" });
    const result = reduce(draft, intake);

    expect(result.order.state).toBe("DIAGNOSING");
    expect(result.order.payment).toBeUndefined();
    expect(result.commands.map((command) => command.type)).toEqual([
      "CREATE_REPLAY_PROJECT",
      "START_BASELINE_STUDY",
    ]);
  });

  it("deduplicates the same event before emitting a second command", () => {
    const draft = makeDraftOrder();
    const intake = event({ type: "INTAKE_ACCEPTED" });
    const first = reduce(draft, intake);
    const duplicate = reduce(first.order, intake);

    expect(duplicate.order).toBe(first.order);
    expect(duplicate.order.version).toBe(1);
    expect(duplicate.commands).toEqual([]);
  });

  it("requires both an idle initial Replay and a valid baseline", () => {
    const diagnosing = makeDiagnosingOrder();
    expectDomainCode(
      () =>
        reduce(
          diagnosing,
          event({
            type: "DIAGNOSIS_COMPLETED",
            replay: makeReplaySnapshot({ idle: false }),
            baseline: makeBaseline(),
            repairRequired: true,
          }),
        ),
      "INITIAL_REPLAY_NOT_IDLE",
    );
  });

  it("requires Pioneer to compile a spec from organic Replay evidence", () => {
    const diagnosing = makeDiagnosingOrder();
    const result = reduce(
      diagnosing,
      event({
        type: "DIAGNOSIS_COMPLETED",
        replay: makeReplaySnapshot(),
        baseline: makeBaseline(),
        repairRequired: true,
      }),
    );

    expect(result.order.state).toBe("SPECIFYING");
    expect(result.order.repair.attempt).toBe(1);
    expect(result.commands).toEqual([
      expect.objectContaining({
        type: "COMPILE_PATCH_SPEC",
        attempt: 1,
        trigger: "INITIAL_DIAGNOSIS",
        evidence: expect.objectContaining({ replayBugIds: ["bug_001"] }),
      }),
    ]);
  });

  it("runs repair only after an immutable evidence-bound spec is accepted", () => {
    const specifying = makeSpecifyingOrder();
    const spec = makePatchSpec(specifying);
    const result = reduce(
      specifying,
      event({ type: "PATCH_SPEC_COMPILED", spec }),
    );

    expect(result.order.state).toBe("PATCHING");
    expect(result.order.repair.patchSpec).toEqual(spec);
    expect(result.order.repair.patchSpec).not.toBe(spec);
    expect(result.commands).toEqual([
      expect.objectContaining({
        type: "RUN_REPAIR",
        attempt: 1,
        trigger: "INITIAL_DIAGNOSIS",
        replayBugIds: ["bug_001"],
        patchSpecId: spec.specId,
        patchSpecSha256: spec.specSha256,
      }),
    ]);
  });

  it("closes cleanly without charging when no repair is needed", () => {
    const diagnosing = makeDiagnosingOrder();
    const result = reduce(
      diagnosing,
      event({
        type: "DIAGNOSIS_COMPLETED",
        replay: makeReplaySnapshot({ open: [] }),
        baseline: makeBaseline(),
        repairRequired: false,
      }),
    );
    expect(result.order.state).toBe("CLOSED_NO_CHARGE");
    expect(result.order.closure?.reason).toBe("NO_REPAIR_NEEDED");
    expect(result.order.payment).toBeUndefined();
  });

  it("will not ignore an open Replay bug", () => {
    const diagnosing = makeDiagnosingOrder();
    expectDomainCode(
      () =>
        reduce(
          diagnosing,
          event({
            type: "DIAGNOSIS_COMPLETED",
            replay: makeReplaySnapshot(),
            baseline: makeBaseline(),
            repairRequired: false,
          }),
        ),
      "OPEN_BUGS_IGNORED",
    );
  });

  it.each(["invalid", "wontfix"] as const)(
    "closes without charge rather than certifying a Replay %s dismissal",
    (status) => {
      const diagnosing = makeDiagnosingOrder();
      const result = reduce(
        diagnosing,
        event({
          type: "DIAGNOSIS_COMPLETED",
          replay: makeReplaySnapshot({
            open: [],
            [status]: [makeBug(status)],
          }),
          baseline: makeBaseline(),
          repairRequired: true,
        }),
      );
      expect(result.order.state).toBe("CLOSED_NO_CHARGE");
      expect(result.order.closure?.reason).toBe(
        "REPLAY_DISMISSED_FINDINGS",
      );
    },
  );

  it("bounds failed repair execution at two attempts", () => {
    const first = makePatchingOrder();
    const retry = reduce(
      first,
      event({ type: "REPAIR_FAILED", reason: "build failed" }),
    );
    expect(retry.order.state).toBe("SPECIFYING");
    expect(retry.order.repair.attempt).toBe(2);
    expect(retry.commands[0]).toEqual(
      expect.objectContaining({ type: "COMPILE_PATCH_SPEC", attempt: 2 }),
    );

    const secondPatching = reduce(
      retry.order,
      event({
        id: "event_patch_spec_retry",
        type: "PATCH_SPEC_COMPILED",
        spec: makePatchSpec(retry.order),
      }),
    ).order;

    const exhausted = reduce(
      secondPatching,
      event({
        id: "event_repair_failed_again",
        type: "REPAIR_FAILED",
        reason: "build failed again",
      }),
    );
    expect(exhausted.order.state).toBe("CLOSED_NO_CHARGE");
    expect(exhausted.order.closure?.reason).toBe("ATTEMPTS_EXHAUSTED");
  });

  it("invalidates old verification and requests Replay sync for a candidate", () => {
    const patching = makePatchingOrder();
    const result = reduce(
      patching,
      event({
        type: "CANDIDATE_DEPLOYED",
        candidate: makeCandidate(),
      }),
    );

    expect(result.order.state).toBe("REPLAY_VERIFYING");
    expect(result.order.replay.verificationSnapshot).toBeUndefined();
    expect(result.order.human.holdout).toBeUndefined();
    expect(result.commands.map((command) => command.type)).toEqual([
      "MARK_REPLAY_BUGS_FIXED",
      "SYNC_REPLAY",
    ]);
  });

  it("refuses Replay evidence for another URL or SHA", () => {
    const verifying = makeReplayVerifyingOrder();
    expectDomainCode(
      () =>
        reduce(
          verifying,
          event({
            type: "REPLAY_SYNCED",
            snapshot: makeCleanVerification({
              targetUrl: "https://wrong-target.test",
            }),
          }),
        ),
      "REPLAY_TARGET_MISMATCH",
    );
    expectDomainCode(
      () =>
        reduce(
          verifying,
          event({
            id: "event_wrong_sha",
            type: "REPLAY_SYNCED",
            snapshot: makeCleanVerification({ observedBuildSha: "wrong_sha" }),
          }),
        ),
      "REPLAY_SHA_MISMATCH",
    );
  });

  it("waits when Replay is not idle", () => {
    const verifying = makeReplayVerifyingOrder();
    const result = reduce(
      verifying,
      event({
        type: "REPLAY_SYNCED",
        snapshot: makeCleanVerification({ idle: false, finishedAt: undefined }),
      }),
    );
    expect(result.order.state).toBe("REPLAY_VERIFYING");
    expect(result.order.replay.status).toBe("RUNNING");
    expect(result.commands).toEqual([]);
  });

  it("retries a dirty Replay result once, then closes without charging", () => {
    const first = makeReplayVerifyingOrder();
    const retry = reduce(
      first,
      event({
        type: "REPLAY_SYNCED",
        snapshot: makeCleanVerification({
          open: [makeBug("open", "bug_retry")],
          fixed: [],
        }),
      }),
    );
    expect(retry.order.state).toBe("SPECIFYING");
    expect(retry.order.repair.attempt).toBe(2);
    expect(retry.order.repair.patchSpec).toBeUndefined();
    expect(retry.commands[0]).toEqual(
      expect.objectContaining({
        type: "COMPILE_PATCH_SPEC",
        trigger: "REPLAY_DIRTY",
        evidence: expect.objectContaining({ replayBugIds: ["bug_retry"] }),
      }),
    );

    const second = makeAttemptTwoVerifyingOrder();
    const exhausted = reduce(
      second,
      event({
        id: "event_replay_dirty_2",
        type: "REPLAY_SYNCED",
        snapshot: makeCleanVerification({
          observedBuildSha: CANDIDATE_SHA_2,
          open: [makeBug("open", "bug_still_open")],
          fixed: [],
        }),
      }),
    );
    expect(exhausted.order.state).toBe("CLOSED_NO_CHARGE");
    expect(exhausted.order.closure?.reason).toBe("ATTEMPTS_EXHAUSTED");
  });

  it("moves to fresh human verification only after strict Replay cleanliness", () => {
    const verifying = makeReplayVerifyingOrder();
    const result = reduce(
      verifying,
      event({ type: "REPLAY_SYNCED", snapshot: makeCleanVerification() }),
    );
    expect(result.order.state).toBe("HUMAN_VERIFYING");
    expect(result.order.replay.status).toBe("CLEAN");
    expect(result.commands[0]).toEqual(
      expect.objectContaining({
        type: "START_HOLDOUT_STUDY",
        excludeCohortFingerprint: "cohort_baseline_hash",
      }),
    );
  });

  it("rejects a reused or undersized Terac holdout", () => {
    const order = makeHumanVerifyingOrder();
    expectDomainCode(
      () =>
        reduce(
          order,
          event({
            type: "HOLDOUT_COMPLETED",
            result: makeHoldout({
              isFreshCohort: false,
              cohortFingerprint: "cohort_baseline_hash",
            }),
          }),
        ),
      "COHORT_NOT_FRESH",
    );
    expectDomainCode(
      () =>
        reduce(
          order,
          event({
            id: "event_small_holdout",
            type: "HOLDOUT_COMPLETED",
            result: makeHoldout({
              participantCount: 2,
              successfulParticipants: 2,
              completionRate: 1,
            }),
          }),
        ),
      "HOLDOUT_TOO_SMALL",
    );
  });

  it("repairs once more when a valid holdout misses the declared lift", () => {
    const order = makeHumanVerifyingOrder();
    const result = reduce(
      order,
      event({
        type: "HOLDOUT_COMPLETED",
        result: makeHoldout({
          participantCount: 5,
          successfulParticipants: 3,
          completionRate: 0.6,
        }),
      }),
    );
    expect(result.order.state).toBe("SPECIFYING");
    expect(result.order.repair.attempt).toBe(2);
    expect(result.commands[0]).toEqual(
      expect.objectContaining({
        type: "COMPILE_PATCH_SPEC",
        trigger: "HUMAN_HOLDOUT_FAILED",
        evidence: expect.objectContaining({
          replayBugIds: ["bug_001"],
          humanStudyId: "terac_holdout_001",
        }),
      }),
    );
  });

  it("issues a sealed certificate before requesting payment", () => {
    const order = makeHumanVerifyingOrder();
    const passed = reduce(
      order,
      event({ type: "HOLDOUT_COMPLETED", result: makeHoldout() }),
    );
    expect(passed.order.state).toBe("HUMAN_VERIFYING");
    expect(passed.order.payment).toBeUndefined();
    expect(passed.commands[0]?.type).toBe("ISSUE_CERTIFICATE");

    const certified = reduce(
      passed.order,
      event({
        type: "CERTIFICATE_ISSUED",
        certificate: makeCertificate(),
      }),
    );
    expect(certified.order.state).toBe("AWAITING_PAYMENT");
    expect(certified.order.certificate).toBeDefined();
    expect(certified.order.payment).toBeUndefined();
    expect(certified.commands[0]).toEqual(
      expect.objectContaining({
        type: "REQUEST_PAYMENT_LINK",
        amountCents: 1_000,
      }),
    );
  });

  it("rejects payment before certification", () => {
    const order = makeHumanVerifyingOrder();
    expectDomainCode(
      () =>
        reduce(
          order,
          event({ type: "PAYMENT_CONFIRMED", payment: makePayment() }),
        ),
      "INVALID_TRANSITION",
    );
  });

  it("requires exact price and honest mode after certification", () => {
    const live = makeAwaitingPaymentOrder("LIVE");
    expectDomainCode(
      () =>
        reduce(
          live,
          event({
            type: "PAYMENT_CONFIRMED",
            payment: makePayment("LIVE", { amountCents: 999 }),
          }),
        ),
      "PAYMENT_TERMS_MISMATCH",
    );
    expectDomainCode(
      () =>
        reduce(
          live,
          event({
            id: "event_test_payment_on_live",
            type: "PAYMENT_CONFIRMED",
            payment: makePayment("TEST"),
          }),
        ),
      "PAYMENT_MODE_MISMATCH",
    );
  });

  it("unlocks exactly one delivery after confirmed payment", () => {
    const awaiting = makeAwaitingPaymentOrder();
    const paymentEvent = event({
      type: "PAYMENT_CONFIRMED",
      payment: makePayment(),
    });
    const paid = reduce(awaiting, paymentEvent);
    expect(paid.order.state).toBe("DELIVERING");
    expect(paid.commands).toEqual([
      expect.objectContaining({
        type: "DELIVER_CERTIFICATE",
        certificateId: "certificate_001",
      }),
    ]);

    const duplicate = reduce(paid.order, paymentEvent);
    expect(duplicate.order).toBe(paid.order);
    expect(duplicate.commands).toEqual([]);

    const delivered = reduce(
      paid.order,
      event({
        id: "event_delivery_confirmed_1",
        type: "DELIVERY_CONFIRMED",
        certificateId: "certificate_001",
        receiptId: "delivery_receipt_001",
      }),
    );
    expect(delivered.order.state).toBe("DELIVERED");
    expect(delivered.order.delivery?.receiptId).toBe("delivery_receipt_001");
  });

  it("cannot close a charged order as no-charge", () => {
    const awaiting = makeAwaitingPaymentOrder();
    const paid = reduce(
      awaiting,
      event({ type: "PAYMENT_CONFIRMED", payment: makePayment() }),
    ).order;
    expectDomainCode(
      () =>
        reduce(
          paid,
          event({
            id: "event_close_after_payment",
            type: "CLOSE_NO_CHARGE",
            reason: "DEADLINE_EXCEEDED",
          }),
        ),
      "INVALID_TRANSITION",
    );
  });

  it("closes an unpaid verification job without a refund branch", () => {
    const order = makeHumanVerifyingOrder();
    const closed = reduce(
      order,
      event({ type: "CLOSE_NO_CHARGE", reason: "DEADLINE_EXCEEDED" }),
    ).order;
    expect(closed.state).toBe("CLOSED_NO_CHARGE");
    expect(closed.payment).toBeUndefined();
    expect(closed.closure?.reason).toBe("DEADLINE_EXCEEDED");
  });

  it("records retryable provider errors without weakening the release gate", () => {
    const order = makeReplayVerifyingOrder();
    const result = reduce(
      order,
      event({
        type: "PROVIDER_ERROR_RECORDED",
        provider: "replay",
        code: "TEMPORARY_UNAVAILABLE",
        retryable: true,
      }),
    );
    expect(result.order.state).toBe("REPLAY_VERIFYING");
    expect(result.order.lastError?.code).toBe("TEMPORARY_UNAVAILABLE");
    expect(result.commands).toEqual([]);
  });

  it("never mutates the prior aggregate", () => {
    const draft = makeDraftOrder();
    const frozen = structuredClone(draft);
    reduce(draft, event({ type: "INTAKE_ACCEPTED" }));
    expect(draft).toEqual(frozen);
  });

  it("does not accept a second distinct payment for the same order", () => {
    const awaiting = makeAwaitingPaymentOrder();
    const paid = reduce(
      awaiting,
      event({ type: "PAYMENT_CONFIRMED", payment: makePayment() }),
    ).order;

    expectDomainCode(
      () =>
        reduce(
          paid,
          event({
            id: "event_another_payment",
            type: "PAYMENT_CONFIRMED",
            payment: makePayment("LIVE", {
              providerPaymentId: "live_payment_002",
              providerEventId: "live_event_002",
            }),
          }),
        ),
      "INVALID_TRANSITION",
    );
  });

  it("requires a delivery receipt for the same certificate", () => {
    const awaiting = makeAwaitingPaymentOrder();
    const paid = reduce(
      awaiting,
      event({ type: "PAYMENT_CONFIRMED", payment: makePayment() }),
    ).order;

    expectDomainCode(
      () =>
        reduce(
          paid,
          event({
            type: "DELIVERY_CONFIRMED",
            certificateId: "another_certificate",
            receiptId: "receipt_wrong",
          }),
        ),
      "DELIVERY_CERTIFICATE_MISMATCH",
    );
  });

  it("accepts the second candidate only for the second active attempt", () => {
    const first = makePatchingOrder();
    expectDomainCode(
      () =>
        reduce(
          first,
          event({
            type: "CANDIDATE_DEPLOYED",
            candidate: makeCandidate({ attempt: 2, sha: CANDIDATE_SHA_2 }),
          }),
        ),
      "CANDIDATE_ATTEMPT_MISMATCH",
    );
  });

  it("keeps the candidate preview as the single human and Replay target", () => {
    const human = makeHumanVerifyingOrder();
    expect(human.repair.candidate?.previewUrl).toBe(PREVIEW_URL);
    expect(human.replay.verificationSnapshot?.targetUrl).toBe(PREVIEW_URL);
    const passed = reduce(
      human,
      event({ type: "HOLDOUT_COMPLETED", result: makeHoldout() }),
    ).order;
    expect(passed.human.holdout?.targetUrl).toBe(PREVIEW_URL);
  });
});
