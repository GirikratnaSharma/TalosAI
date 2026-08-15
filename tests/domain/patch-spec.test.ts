import { describe, expect, it } from "vitest";

import {
  computePatchSpecSha256,
  DomainInvariantError,
  reduce,
  type PatchSpec,
} from "../../lib/domain";
import {
  event,
  makeBug,
  makeCandidate,
  makeCleanVerification,
  makePatchSpec,
  makePatchingOrder,
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

describe("Pioneer patch specification gate", () => {
  it("rejects a specification for anything but the exact Replay bugs", () => {
    const order = makeSpecifyingOrder();
    const spec = makePatchSpec(order, {
      evidence: {
        ...makePatchSpec(order).evidence,
        replayBugIds: ["bug_from_another_report"],
      },
    });

    expectDomainCode(
      () => reduce(order, event({ type: "PATCH_SPEC_COMPILED", spec })),
      "PATCH_SPEC_EVIDENCE_MISMATCH",
    );
  });

  it("rejects low-confidence, unsupported, or non-open-weight specifications", () => {
    const order = makeSpecifyingOrder();
    expectDomainCode(
      () =>
        reduce(
          order,
          event({
            type: "PATCH_SPEC_COMPILED",
            spec: makePatchSpec(order, { confidence: 0.79 }),
          }),
        ),
      "PATCH_SPEC_CONFIDENCE_TOO_LOW",
    );
    expectDomainCode(
      () =>
        reduce(
          order,
          event({
            id: "event_unsupported_spec",
            type: "PATCH_SPEC_COMPILED",
            spec: makePatchSpec(order, {
              bugClass: "UNBOUNDED_REWRITE" as PatchSpec["bugClass"],
            }),
          }),
        ),
      "PATCH_SPEC_BUG_CLASS_UNSUPPORTED",
    );
    expectDomainCode(
      () =>
        reduce(
          order,
          event({
            id: "event_closed_model_spec",
            type: "PATCH_SPEC_COMPILED",
            spec: makePatchSpec(order, {
              modelKind: "CLOSED_WEIGHT" as PatchSpec["modelKind"],
            }),
          }),
        ),
      "PATCH_SPEC_AUTHORITY_INVALID",
    );
  });

  it("rejects protected paths and candidates outside the approved changeset", () => {
    const order = makeSpecifyingOrder();
    expectDomainCode(
      () =>
        reduce(
          order,
          event({
            type: "PATCH_SPEC_COMPILED",
            spec: makePatchSpec(order, {
              changes: [
                {
                  filePath: "lib/server/payments/stripe-webhook.ts",
                  intent: "Bypass settlement verification",
                },
              ],
            }),
          }),
        ),
      "PATCH_SPEC_UNSAFE_CHANGE",
    );

    const patching = makePatchingOrder();
    expectDomainCode(
      () =>
        reduce(
          patching,
          event({
            type: "CANDIDATE_DEPLOYED",
            candidate: makeCandidate({ changedFiles: ["app/admin.tsx"] }),
          }),
        ),
      "CANDIDATE_OUTSIDE_PATCH_SPEC",
    );
  });

  it("rejects dot-segment protected paths and normalizes candidate comparisons", () => {
    const order = makeSpecifyingOrder();
    expectDomainCode(
      () =>
        reduce(
          order,
          event({
            type: "PATCH_SPEC_COMPILED",
            spec: makePatchSpec(order, {
              changes: [
                {
                  filePath: "./lib/server/payments/stripe-webhook.ts",
                  intent: "Attempt a protected edit through a dot segment",
                },
              ],
            }),
          }),
        ),
      "PATCH_SPEC_UNSAFE_CHANGE",
    );

    const patching = makePatchingOrder();
    expect(() =>
      reduce(
        patching,
        event({
          type: "CANDIDATE_DEPLOYED",
          candidate: makeCandidate({
            changedFiles: ["app\\request-form.tsx"],
          }),
        }),
      ),
    ).not.toThrow();
  });

  it("recomputes the canonical digest before accepting a specification", () => {
    const order = makeSpecifyingOrder();
    const sealed = makePatchSpec(order);
    const tampered = {
      ...sealed,
      changes: [
        {
          ...sealed.changes[0],
          intent: "Changed after the digest was sealed",
        },
      ],
    };

    expectDomainCode(
      () =>
        reduce(
          order,
          event({ type: "PATCH_SPEC_COMPILED", spec: tampered }),
        ),
      "PATCH_SPEC_HASH_MISMATCH",
    );
  });

  it("hashes equivalent evidence and change ordering identically", () => {
    const order = makeSpecifyingOrder();
    const first = makePatchSpec(order, {
      changes: [
        { filePath: "app/z.tsx", intent: "Repair z" },
        { filePath: "app/a.tsx", intent: "Repair a" },
      ],
    });
    const reordered = {
      ...first,
      evidence: {
        ...first.evidence,
        replayBugIds: [...first.evidence.replayBugIds].reverse(),
      },
      changes: [...first.changes].reverse(),
    };

    expect(computePatchSpecSha256(reordered)).toBe(first.specSha256);
  });

  it("invalidates an old spec and binds the retry to the current evidence", () => {
    const first = makeReplayVerifyingOrder();
    const oldSpec = first.repair.patchSpec;
    if (!oldSpec) throw new Error("Expected first patch spec");
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
    expect(retry.order.repair.patchSpec).toBeUndefined();
    expect(retry.commands[0]).toEqual(
      expect.objectContaining({
        type: "COMPILE_PATCH_SPEC",
        attempt: 2,
        evidence: expect.objectContaining({ replayBugIds: ["bug_retry"] }),
      }),
    );
    expectDomainCode(
      () =>
        reduce(
          retry.order,
          event({
            id: "event_reused_old_patch_spec",
            type: "PATCH_SPEC_COMPILED",
            spec: oldSpec,
          }),
        ),
      "PATCH_SPEC_ATTEMPT_MISMATCH",
    );
  });
});
