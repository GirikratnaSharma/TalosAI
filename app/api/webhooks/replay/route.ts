import { createProviderInbox } from "@/lib/server/provider-inbox";
import {
  parseReplayWebhookEvent,
  ReplayWebhookRejectedError,
  verifyReplayWebhookToken,
} from "@/lib/server/replay-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 262_144;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  try {
    const url = new URL(request.url);
    verifyReplayWebhookToken({
      presentedToken:
        request.headers.get("x-talos-webhook-token") ??
        url.searchParams.get("token"),
    });

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
      return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const event = parseReplayWebhookEvent(rawBody);
    const receipt = await createProviderInbox().record({
      provider: "replay",
      providerEventId: event.providerEventId,
      payloadHash: event.payloadHash,
    });

    return Response.json(
      {
        received: true,
        duplicate: receipt.duplicate,
        eventId: event.providerEventId,
        eventType: event.eventType,
        effect: receipt.duplicate ? "ALREADY_ENQUEUED" : "ENQUEUED",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ReplayWebhookRejectedError) {
      if (error.code === "REPLAY_WEBHOOK_UNCONFIGURED") {
        return Response.json({ error: error.code }, { status: 503 });
      }
      const status = error.code === "TOKEN_INVALID" ? 401 : 400;
      return Response.json({ error: error.code }, { status });
    }

    // 503 intentionally asks Replay to retry while the durable inbox is
    // temporarily unavailable. The webhook is a doorbell: authoritative bug
    // and test-run state is always re-read from the Replay project itself.
    return Response.json({ error: "WEBHOOK_RETRY_REQUIRED" }, { status: 503 });
  }
}
