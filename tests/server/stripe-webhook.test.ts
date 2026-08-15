import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import {
  constructVerifiedStripeEvent,
  parsePaidCheckoutSession,
  StripeWebhookRejectedError,
} from "../../lib/server/payments/stripe-webhook";

const secret = "whsec_unit_test_only";

function makeEvent(type = "checkout.session.completed"): Stripe.Event {
  return {
    id: "evt_123",
    object: "event",
    api_version: "2026-07-29.basil",
    created: 1_776_456_000,
    data: { object: { id: "cs_test_123", object: "checkout.session" } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: "req_123", idempotency_key: null },
    type,
  } as Stripe.Event;
}

function makeSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    object: "checkout.session",
    client_reference_id: "TAL-D04",
    payment_status: "paid",
    payment_link: "plink_123",
    payment_intent: "pi_123",
    amount_total: 14900,
    currency: "usd",
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe("Stripe webhook boundary", () => {
  it("verifies the exact raw request body", () => {
    const rawBody = JSON.stringify(makeEvent());
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret,
    });

    expect(
      constructVerifiedStripeEvent({ rawBody, signature, webhookSecret: secret })
        .id,
    ).toBe("evt_123");
    expect(() =>
      constructVerifiedStripeEvent({
        rawBody: `${rawBody} `,
        signature,
        webhookSecret: secret,
      }),
    ).toThrow(StripeWebhookRejectedError);
  });

  it("binds a paid session to the organizer link and Talos order", () => {
    expect(
      parsePaidCheckoutSession({
        event: makeEvent(),
        session: makeSession(),
        expectedPaymentLinkId: "plink_123",
      }),
    ).toMatchObject({
      orderReference: "TAL-D04",
      amountTotal: 14900,
      paymentLinkId: "plink_123",
      livemode: false,
    });
  });

  it("rejects unpaid, uncorrelated, or foreign-link sessions", () => {
    expect(() =>
      parsePaidCheckoutSession({
        event: makeEvent(),
        session: makeSession({ payment_status: "unpaid" }),
        expectedPaymentLinkId: "plink_123",
      }),
    ).toThrow("SESSION_NOT_PAID");
    expect(() =>
      parsePaidCheckoutSession({
        event: makeEvent(),
        session: makeSession({ client_reference_id: null }),
        expectedPaymentLinkId: "plink_123",
      }),
    ).toThrow("ORDER_REFERENCE_MISSING");
    expect(() =>
      parsePaidCheckoutSession({
        event: makeEvent(),
        session: makeSession(),
        expectedPaymentLinkId: "plink_other",
      }),
    ).toThrow("PAYMENT_LINK_MISMATCH");
  });
});
