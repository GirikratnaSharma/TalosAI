import { describe, expect, it } from "vitest";
import {
  DomainInvariantError,
  assertOrderInvariants,
  hasCertifiableEvidence,
  holdoutPasses,
  isCountableLiveRevenue,
  isReplayStrictlyClean,
  reduce,
} from "../../lib/domain";
import {
  CANDIDATE_SHA_1,
  makeAwaitingPaymentOrder,
  makeBug,
  makeCertificate,
  makeCleanVerification,
  makeDraftOrder,
  makeHoldout,
  makeHumanVerifyingOrder,
  makePayment,
  makeReplaySnapshot,
  event,
} from "./fixtures";

describe("Replay certification policy", () => {
  it("accepts an idle report with fixed history and no unresolved or dismissed findings", () => {
    expect(isReplayStrictlyClean(makeCleanVerification())).toBe(true);
  });

  it.each([
    ["running", { idle: false }],
    ["unfinished", { finishedAt: undefined }],
    ["open", { open: [makeBug()] }],
    ["invalid", { invalid: [makeBug("invalid")] }],
    ["wontfix", { wontfix: [makeBug("wontfix")] }],
  ])("rejects a %s Replay report", (_name, overrides) => {
    expect(
      isReplayStrictlyClean(makeCleanVerification(overrides)),
    ).toBe(false);
  });

  it("requires the exact Replay-tested SHA", () => {
    const order = makeHumanVerifyingOrder();
    const tampered = {
      ...order,
      replay: {
        ...order.replay,
        verificationSnapshot: makeCleanVerification({
          observedBuildSha: "another_sha",
        }),
      },
    };

    expect(() => assertOrderInvariants(tampered)).toThrowError(
      DomainInvariantError,
    );
  });
});

describe("Terac holdout policy", () => {
  it("passes only a fresh cohort with declared completion and lift", () => {
    const order = makeHumanVerifyingOrder();
    expect(holdoutPasses(order, makeHoldout())).toBe(true);
    expect(
      holdoutPasses(
        order,
        makeHoldout({
          successfulParticipants: 3,
          completionRate: 0.6,
        }),
      ),
    ).toBe(false);
  });

  it("rejects cohort reuse rather than silently treating it as a failed result", () => {
    const order = makeHumanVerifyingOrder();
    expect(() =>
      holdoutPasses(
        order,
        makeHoldout({
          cohortFingerprint: "cohort_baseline_hash",
          isFreshCohort: false,
        }),
      ),
    ).toThrowError(DomainInvariantError);
  });

  it("does not consider evidence certifiable until the passing holdout is persisted", () => {
    const before = makeHumanVerifyingOrder();
    expect(hasCertifiableEvidence(before)).toBe(false);

    const after = reduce(
      before,
      event({ type: "HOLDOUT_COMPLETED", result: makeHoldout() }),
    ).order;
    expect(hasCertifiableEvidence(after)).toBe(true);
  });
});

describe("mode and revenue honesty", () => {
  it("counts only a real live Stripe payment after certification", () => {
    const awaiting = makeAwaitingPaymentOrder("LIVE");
    const delivering = reduce(
      awaiting,
      event({ type: "PAYMENT_CONFIRMED", payment: makePayment("LIVE") }),
    ).order;
    expect(isCountableLiveRevenue(delivering)).toBe(true);
  });

  it.each(["TEST", "DEMO"] as const)(
    "never counts %s payment evidence as revenue",
    (mode) => {
      const awaiting = makeAwaitingPaymentOrder(mode);
      const delivering = reduce(
        awaiting,
        event({ type: "PAYMENT_CONFIRMED", payment: makePayment(mode) }),
      ).order;
      expect(isCountableLiveRevenue(delivering)).toBe(false);
    },
  );

  it("rejects a certificate that references another candidate", () => {
    const order = makeHumanVerifyingOrder();
    const certifiable = reduce(
      order,
      event({ type: "HOLDOUT_COMPLETED", result: makeHoldout() }),
    ).order;

    expect(() =>
      reduce(
        certifiable,
        event({
          type: "CERTIFICATE_ISSUED",
          certificate: makeCertificate("LIVE", {
            candidateSha: `${CANDIDATE_SHA_1}_wrong`,
          }),
        }),
      ),
    ).toThrowError(DomainInvariantError);
  });

  it("rejects a certificate that references another Replay run", () => {
    const certifiable = reduce(
      makeHumanVerifyingOrder(),
      event({ type: "HOLDOUT_COMPLETED", result: makeHoldout() }),
    ).order;

    expect(() =>
      reduce(
        certifiable,
        event({
          type: "CERTIFICATE_ISSUED",
          certificate: makeCertificate("LIVE", {
            replayFinishedAt: "2026-08-15T11:47:00.000Z",
          }),
        }),
      ),
    ).toThrowError(DomainInvariantError);
  });

  it("rejects an invalid aggregate assembled with a certificate before evidence", () => {
    const draft = makeDraftOrder();
    const invalid = {
      ...draft,
      state: "AWAITING_PAYMENT" as const,
      repair: { attempt: 1 as const },
      certificate: makeCertificate(),
      replay: {
        ...draft.replay,
        verificationSnapshot: makeReplaySnapshot({
          targetUrl: "https://unrelated.test",
          observedBuildSha: CANDIDATE_SHA_1,
          open: [],
        }),
      },
    };
    expect(() => assertOrderInvariants(invalid)).toThrowError(
      DomainInvariantError,
    );
  });
});
