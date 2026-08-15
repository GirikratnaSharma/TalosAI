import { describe, expect, it } from "vitest";

import type {
  CertificationProof,
} from "../../lib/adapters/contracts";
import {
  createFixtureExecution,
} from "../../lib/adapters/fixture";
import type {
  ReplayAdapter,
  ReplayAuthoritativeSnapshot,
  ReplayBug,
  ReplayFixedBug,
  ReplayProject,
} from "../../lib/adapters/replay";
import type {
  StripeUnlockPaymentLinkInput,
} from "../../lib/adapters/stripe";

const now = "2026-08-15T18:30:00.000Z";

function fixtureInput<
  TOperation extends
    | "create_project"
    | "capture_authoritative_snapshot"
    | "get_bug"
    | "mark_fixed",
>(
  operation: TOperation,
  requestId: string,
) {
  return {
    provider: "replay" as const,
    operation,
    requestId,
    fixtureId: "replay-contract-fixture",
    recordedAt: now,
  };
}

describe("provider contracts", () => {
  it("supports the complete Replay authority lifecycle without claiming live evidence", async () => {
    const certification: CertificationProof = {
      status: "certified",
      authority: "replay",
      certificationId: "certification-1",
      bugId: "bug-1",
      beforeSnapshotId: "snapshot-before",
      afterSnapshotId: "snapshot-after",
      candidateCommitSha: "abc123",
      certifiedAt: now,
      replayReceiptId: "receipt-mark-fixed",
    };

    const replay: ReplayAdapter = {
      provider: "replay",
      mode: "fixture",
      async createProject(input) {
        const data: ReplayProject = {
          projectId: "project-1",
          jobId: input.jobId,
          createdAt: now,
        };
        return createFixtureExecution(
          fixtureInput("create_project", input.jobId),
          data,
        );
      },
      async captureAuthoritativeSnapshot(input) {
        const data: ReplayAuthoritativeSnapshot = {
          projectId: input.projectId,
          snapshotId: "snapshot-before",
          replayId: "replay-1",
          releaseId: input.releaseId,
          capturedAt: now,
          authority: "replay",
          immutable: true,
        };
        return createFixtureExecution(
          fixtureInput(
            "capture_authoritative_snapshot",
            input.jobId,
          ),
          data,
        );
      },
      async getBug(input) {
        const data: ReplayBug = {
          bugId: "bug-1",
          projectId: input.projectId,
          snapshotId: input.snapshotId,
          status: "open",
          summary: "Checkout action does not complete.",
          failingStep: "submit checkout",
          evidenceSha256: "a".repeat(64),
          detectedAt: now,
        };
        return createFixtureExecution(
          fixtureInput("get_bug", input.jobId),
          data,
        );
      },
      async markFixed(input) {
        const data: ReplayFixedBug = {
          bugId: input.bugId,
          status: "fixed",
          authority: "replay",
          verifiedSnapshotId: input.afterSnapshotId,
          candidateCommitSha: input.candidateCommitSha,
          fixedAt: now,
          certification,
        };
        return createFixtureExecution(
          fixtureInput("mark_fixed", input.jobId),
          data,
        );
      },
    };

    const project = await replay.createProject({
      jobId: "job-1",
      name: "checkout repair",
      targetUrl: "https://example.test/checkout",
      idempotencyKey: "project-job-1",
    });
    const snapshot = await replay.captureAuthoritativeSnapshot({
      jobId: "job-1",
      projectId: project.data.projectId,
      targetUrl: "https://example.test/checkout",
      releaseId: "release-before",
      idempotencyKey: "snapshot-job-1",
    });
    const bug = await replay.getBug({
      jobId: "job-1",
      projectId: project.data.projectId,
      snapshotId: snapshot.data.snapshotId,
    });
    const fixed = await replay.markFixed({
      jobId: "job-1",
      projectId: project.data.projectId,
      bugId: bug.data.bugId,
      beforeSnapshotId: snapshot.data.snapshotId,
      afterSnapshotId: "snapshot-after",
      candidateCommitSha: "abc123",
      idempotencyKey: "fixed-job-1",
    });

    expect([
      project.mode,
      snapshot.mode,
      bug.mode,
      fixed.mode,
    ]).toEqual(["fixture", "fixture", "fixture", "fixture"]);
    expect(fixed.data.certification.authority).toBe("replay");
  });

  it("requires Replay and Terac proof before unlocking the organizer payment link", () => {
    const input: StripeUnlockPaymentLinkInput = {
      jobId: "job-1",
      authorization: {
        status: "certified",
        certificationId: "certification-1",
        candidateCommitSha: "abc123",
        issuedAt: now,
        replay: {
          status: "certified",
          authority: "replay",
          certificationId: "replay-certification-1",
          bugId: "bug-1",
          beforeSnapshotId: "snapshot-before",
          afterSnapshotId: "snapshot-after",
          candidateCommitSha: "abc123",
          certifiedAt: now,
          replayReceiptId: "receipt-mark-fixed",
        },
        human: {
          status: "verified",
          authority: "terac",
          baselineStudyId: "baseline-1",
          holdoutStudyId: "holdout-1",
          baselineCompletionRate: 0.4,
          holdoutCompletionRate: 0.8,
          minimumAbsoluteLift: 0.2,
          verifiedAt: now,
          teracReceiptId: "terac-holdout-receipt",
        },
      },
      amountMinor: 1000,
      currency: "usd",
      productName: "Verified repair",
      customerReference: "customer-1",
      idempotencyKey: "payment-link-job-1",
    };

    expect(input.authorization.replay).toMatchObject({
      status: "certified",
      authority: "replay",
    });
    expect(input.authorization.human).toMatchObject({
      status: "verified",
      authority: "terac",
    });
  });
});
