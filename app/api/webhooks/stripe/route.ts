import { createHash } from "node:crypto";

import { createProviderInbox } from "@/lib/server/provider-inbox";
import {
  createStripeWebhookVerifier,
  StripeWebhookRejectedError,
} from "@/lib/server/payments/stripe-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 65_536;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "SIGNATURE_REQUIRED" }, { status: 400 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  try {
    const payment = await createStripeWebhookVerifier().verify({
      rawBody,
      signature,
    });
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const receipt = await createProviderInbox().record({
      provider: "stripe",
      providerEventId: payment.eventId,
      payloadHash,
    });

    return Response.json(
      {
        received: true,
        duplicate: receipt.duplicate,
        eventId: payment.eventId,
        orderReference: payment.orderReference,
        effect: receipt.duplicate ? "ALREADY_ENQUEUED" : "ENQUEUED",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StripeWebhookRejectedError) {
      if (error.code === "EVENT_IGNORED") {
        return Response.json({ received: true, effect: "IGNORED" });
      }
      const status = error.code === "STRIPE_UNCONFIGURED" ? 503 : 400;
      return Response.json({ error: error.code }, { status });
    }

    // Returning 503 intentionally asks Stripe to retry if the authoritative
    // re-fetch or durable inbox is temporarily unavailable. The failure is
    // surfaced as a short operator-facing reason so a retrying provider (and
    // the delivery log) shows which dependency degraded. No secret values are
    // ever included.
    const reason =
      error instanceof Error
        ? `${error.name}: ${error.message}`.slice(0, 300)
        : "UNKNOWN_ERROR";
    console.error("[talos] stripe webhook dependency failure", reason);
    return Response.json(
      { error: "WEBHOOK_RETRY_REQUIRED", reason },
      { status: 503 },
    );
  }
}
