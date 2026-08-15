import { describe, expect, it } from "vitest";

import {
  FIXTURE_WARNING,
} from "../../lib/adapters/core";
import {
  createFixtureExecution,
} from "../../lib/adapters/fixture";
import {
  sanitizeProviderReceipt,
} from "../../lib/adapters/receipts";

const now = "2026-08-15T18:30:00.000Z";

describe("sanitized provider receipts", () => {
  it("marks fixture evidence at both the execution and receipt boundaries", () => {
    const execution = createFixtureExecution(
      {
        provider: "replay",
        operation: "create_project",
        requestId: "request-1",
        fixtureId: "fixture-replay-project",
        recordedAt: now,
        artifacts: [{ kind: "project", id: "project-fixture-1" }],
      },
      {
        projectId: "project-fixture-1",
        jobId: "job-1",
        createdAt: now,
      },
    );

    expect(execution).toMatchObject({
      mode: "fixture",
      isFixture: true,
      fixtureWarning: FIXTURE_WARNING,
      receipt: {
        provider: "replay",
        mode: "fixture",
        evidenceSource: "fixture",
        warning: FIXTURE_WARNING,
        fixtureId: "fixture-replay-project",
      },
    });
  });

  it("strips provider secrets and unknown nested fields from a live receipt", () => {
    const secret = "provider-secret-must-not-survive";
    const receipt = sanitizeProviderReceipt({
      schemaVersion: 1,
      provider: "stripe",
      operation: "retrieve_payment",
      mode: "live",
      evidenceSource: "provider",
      receiptId: "receipt-stripe-1",
      requestId: "request-stripe-1",
      recordedAt: now,
      artifacts: [
        {
          kind: "payment",
          id: "payment-1",
          authorization: secret,
        },
      ],
      apiKey: secret,
      rawPayload: {
        signature: secret,
      },
    });

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("rawPayload");
    expect(receipt.artifacts).toEqual([
      { kind: "payment", id: "payment-1" },
    ]);
  });

  it("rejects an operation that does not belong to the named provider", () => {
    expect(() =>
      sanitizeProviderReceipt({
        schemaVersion: 1,
        provider: "stripe",
        operation: "mark_fixed",
        mode: "live",
        evidenceSource: "provider",
        receiptId: "receipt-1",
        requestId: "request-1",
        recordedAt: now,
        artifacts: [],
      }),
    ).toThrow();
  });

  it("does not accept a fixture receipt without the exact warning", () => {
    expect(() =>
      sanitizeProviderReceipt({
        schemaVersion: 1,
        provider: "terac",
        operation: "run_baseline",
        mode: "fixture",
        evidenceSource: "fixture",
        receiptId: "receipt-1",
        requestId: "request-1",
        recordedAt: now,
        artifacts: [],
        fixtureId: "fixture-1",
        warning: "looks live",
      }),
    ).toThrow();
  });
});
