import "server-only";

import Stripe from "stripe";
import { z } from "zod";

const paidEventTypes = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
] as const;

const stripeEnvironmentSchema = z.object({
  STRIPE_SECRET_KEY: z.string().trim().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().trim().startsWith("whsec_"),
  STRIPE_PAYMENT_LINK_ID: z.string().trim().startsWith("plink_"),
});

const orderReferenceSchema = z.string().regex(/^TAL-[A-Z0-9]{2,48}$/);

export interface VerifiedStripePayment {
  eventId: string;
  eventType: (typeof paidEventTypes)[number];
  checkoutSessionId: string;
  paymentIntentId: string | null;
  paymentLinkId: string;
  orderReference: string;
  amountTotal: number;
  currency: "usd";
  livemode: boolean;
  createdAt: string;
}

export class StripeWebhookRejectedError extends Error {
  constructor(
    readonly code:
      | "STRIPE_UNCONFIGURED"
      | "SIGNATURE_INVALID"
      | "EVENT_IGNORED"
      | "SESSION_NOT_PAID"
      | "ORDER_REFERENCE_MISSING"
      | "PAYMENT_LINK_MISMATCH"
      | "PAYMENT_TERMS_INVALID",
  ) {
    super(code);
    this.name = "StripeWebhookRejectedError";
  }
}

export function constructVerifiedStripeEvent(input: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): Stripe.Event {
  try {
    return Stripe.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      input.webhookSecret,
    );
  } catch {
    throw new StripeWebhookRejectedError("SIGNATURE_INVALID");
  }
}

function isPaidEventType(
  type: string,
): type is (typeof paidEventTypes)[number] {
  return paidEventTypes.some((eventType) => eventType === type);
}

export function parsePaidCheckoutSession(input: {
  event: Stripe.Event;
  session: Stripe.Checkout.Session;
  expectedPaymentLinkId: string;
}): VerifiedStripePayment {
  const { event, session, expectedPaymentLinkId } = input;
  if (!isPaidEventType(event.type)) {
    throw new StripeWebhookRejectedError("EVENT_IGNORED");
  }
  if (session.payment_status !== "paid") {
    throw new StripeWebhookRejectedError("SESSION_NOT_PAID");
  }

  const orderReference = orderReferenceSchema.safeParse(
    session.client_reference_id,
  );
  if (!orderReference.success) {
    throw new StripeWebhookRejectedError("ORDER_REFERENCE_MISSING");
  }

  const paymentLinkId =
    typeof session.payment_link === "string"
      ? session.payment_link
      : session.payment_link?.id;
  if (paymentLinkId !== expectedPaymentLinkId) {
    throw new StripeWebhookRejectedError("PAYMENT_LINK_MISMATCH");
  }
  if (
    session.currency !== "usd" ||
    session.amount_total === null ||
    session.amount_total <= 0
  ) {
    throw new StripeWebhookRejectedError("PAYMENT_TERMS_INVALID");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  return {
    eventId: event.id,
    eventType: event.type,
    checkoutSessionId: session.id,
    paymentIntentId,
    paymentLinkId,
    orderReference: orderReference.data,
    amountTotal: session.amount_total,
    currency: "usd",
    livemode: event.livemode,
    createdAt: new Date(event.created * 1_000).toISOString(),
  };
}

export function createStripeWebhookVerifier(
  environment: Record<string, string | undefined> = process.env,
) {
  const parsedEnvironment = stripeEnvironmentSchema.safeParse(environment);
  if (!parsedEnvironment.success) {
    throw new StripeWebhookRejectedError("STRIPE_UNCONFIGURED");
  }

  const stripe = new Stripe(parsedEnvironment.data.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 0,
    timeout: 5_000,
  });

  return {
    async verify(input: {
      rawBody: string;
      signature: string;
    }): Promise<VerifiedStripePayment> {
      const event = constructVerifiedStripeEvent({
        ...input,
        webhookSecret: parsedEnvironment.data.STRIPE_WEBHOOK_SECRET,
      });
      if (!isPaidEventType(event.type)) {
        throw new StripeWebhookRejectedError("EVENT_IGNORED");
      }

      const deliveredSession = event.data.object as Stripe.Checkout.Session;
      const session = await stripe.checkout.sessions.retrieve(
        deliveredSession.id,
      );

      return parsePaidCheckoutSession({
        event,
        session,
        expectedPaymentLinkId:
          parsedEnvironment.data.STRIPE_PAYMENT_LINK_ID,
      });
    },
  };
}
