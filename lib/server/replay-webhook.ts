import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const environmentSchema = z.object({
  REPLAY_WEBHOOK_SECRET: z.string().trim().min(16),
});

export class ReplayWebhookRejectedError extends Error {
  constructor(
    readonly code:
      | "REPLAY_WEBHOOK_UNCONFIGURED"
      | "TOKEN_INVALID"
      | "PAYLOAD_INVALID",
  ) {
    super(code);
    this.name = "ReplayWebhookRejectedError";
  }
}

/**
 * Replay QA does not publish a signed-webhook scheme, so authentication uses a
 * shared-secret token carried in the `x-talos-webhook-token` header or the
 * `token` query parameter of the registered webhook URL. The comparison is
 * constant-time. A request without a valid token is rejected before the body
 * is inspected.
 */
export function verifyReplayWebhookToken(input: {
  presentedToken: string | null;
  environment?: Record<string, string | undefined>;
}): void {
  const parsedEnvironment = environmentSchema.safeParse(
    input.environment ?? process.env,
  );
  if (!parsedEnvironment.success) {
    throw new ReplayWebhookRejectedError("REPLAY_WEBHOOK_UNCONFIGURED");
  }

  const expected = parsedEnvironment.data.REPLAY_WEBHOOK_SECRET;
  const presented = input.presentedToken ?? "";

  const expectedDigest = createHash("sha256").update(expected).digest();
  const presentedDigest = createHash("sha256").update(presented).digest();

  if (!timingSafeEqual(expectedDigest, presentedDigest)) {
    throw new ReplayWebhookRejectedError("TOKEN_INVALID");
  }
}

const eventPayloadSchema = z
  .object({
    id: z.string().min(1).max(255).optional(),
    event_id: z.string().min(1).max(255).optional(),
    eventId: z.string().min(1).max(255).optional(),
    bug_id: z.string().min(1).max(255).optional(),
    bugId: z.string().min(1).max(255).optional(),
    test_run_id: z.string().min(1).max(255).optional(),
    testRunId: z.string().min(1).max(255).optional(),
    type: z.string().min(1).max(255).optional(),
    event: z.string().min(1).max(255).optional(),
  })
  .passthrough();

export interface ReplayWebhookEvent {
  providerEventId: string;
  eventType: string;
  payloadHash: string;
}

/**
 * Replay's payload schema is not publicly documented, so identification is
 * defensive: prefer an explicit event id, then a bug or test-run id, and fall
 * back to the payload hash itself so deduplication still holds. The raw body
 * is never trusted beyond extraction — downstream consumers must re-read
 * authoritative state from the Replay project before acting.
 */
export function parseReplayWebhookEvent(rawBody: string): ReplayWebhookEvent {
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    throw new ReplayWebhookRejectedError("PAYLOAD_INVALID");
  }

  const parsed = eventPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ReplayWebhookRejectedError("PAYLOAD_INVALID");
  }

  const data = parsed.data;
  const providerEventId =
    data.id ??
    data.event_id ??
    data.eventId ??
    data.bug_id ??
    data.bugId ??
    data.test_run_id ??
    data.testRunId ??
    `payload-${payloadHash.slice(0, 32)}`;

  const eventType = data.type ?? data.event ?? "replay.event";

  return { providerEventId, eventType, payloadHash };
}
