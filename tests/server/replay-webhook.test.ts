import { describe, expect, it } from "vitest";

import "../support/server-only";

import {
  parseReplayWebhookEvent,
  ReplayWebhookRejectedError,
  verifyReplayWebhookToken,
} from "../../lib/server/replay-webhook";

const SECRET = "talos-replay-webhook-secret-01";

describe("Replay webhook token verification", () => {
  it("accepts the exact configured token", () => {
    expect(() =>
      verifyReplayWebhookToken({
        presentedToken: SECRET,
        environment: { REPLAY_WEBHOOK_SECRET: SECRET },
      }),
    ).not.toThrow();
  });

  it("rejects a wrong token", () => {
    expect(() =>
      verifyReplayWebhookToken({
        presentedToken: "wrong-token-entirely-here",
        environment: { REPLAY_WEBHOOK_SECRET: SECRET },
      }),
    ).toThrowError(ReplayWebhookRejectedError);
  });

  it("rejects a missing token", () => {
    expect(() =>
      verifyReplayWebhookToken({
        presentedToken: null,
        environment: { REPLAY_WEBHOOK_SECRET: SECRET },
      }),
    ).toThrow("TOKEN_INVALID");
  });

  it("fails closed when the secret is not configured", () => {
    expect(() =>
      verifyReplayWebhookToken({
        presentedToken: SECRET,
        environment: {},
      }),
    ).toThrow("REPLAY_WEBHOOK_UNCONFIGURED");
  });

  it("fails closed when the configured secret is too short", () => {
    expect(() =>
      verifyReplayWebhookToken({
        presentedToken: "short",
        environment: { REPLAY_WEBHOOK_SECRET: "short" },
      }),
    ).toThrow("REPLAY_WEBHOOK_UNCONFIGURED");
  });
});

describe("Replay webhook event parsing", () => {
  it("prefers an explicit event id", () => {
    const event = parseReplayWebhookEvent(
      JSON.stringify({ id: "evt-123", type: "qa.completed" }),
    );
    expect(event.providerEventId).toBe("evt-123");
    expect(event.eventType).toBe("qa.completed");
    expect(event.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("falls back to a bug id when no event id exists", () => {
    const event = parseReplayWebhookEvent(
      JSON.stringify({ bug_id: "bug-42", event: "bug.filed" }),
    );
    expect(event.providerEventId).toBe("bug-42");
    expect(event.eventType).toBe("bug.filed");
  });

  it("falls back to a payload-hash id for unrecognized shapes", () => {
    const event = parseReplayWebhookEvent(JSON.stringify({ hello: "world" }));
    expect(event.providerEventId).toMatch(/^payload-[a-f0-9]{32}$/);
    expect(event.eventType).toBe("replay.event");
  });

  it("produces identical ids for identical payloads (dedup holds)", () => {
    const body = JSON.stringify({ hello: "again" });
    expect(parseReplayWebhookEvent(body).providerEventId).toBe(
      parseReplayWebhookEvent(body).providerEventId,
    );
  });

  it("rejects a non-JSON body", () => {
    expect(() => parseReplayWebhookEvent("not json")).toThrow(
      "PAYLOAD_INVALID",
    );
  });
});
