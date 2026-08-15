import type {
  AdapterIdentity,
  IsoDateTime,
  ReleaseAuthorization,
} from "./contracts";
import type { ProviderOperationExecution } from "./core";
import type { StripeReceipt } from "./receipts";

export interface StripeUnlockPaymentLinkInput {
  readonly jobId: string;
  readonly authorization: ReleaseAuthorization;
  readonly amountMinor: number;
  readonly currency: string;
  readonly productName: string;
  readonly customerReference: string;
  readonly idempotencyKey: string;
}

export interface StripePaymentLink {
  readonly paymentLinkId: string;
  readonly url: string;
  readonly active: boolean;
  readonly certificationId: string;
  readonly amountMinor: number;
  readonly currency: string;
}

export interface StripeVerifyWebhookInput {
  readonly requestId: string;
  readonly rawBody: string | Uint8Array;
  readonly signatureHeader: string;
}

export interface StripeVerifiedWebhook {
  readonly verified: true;
  readonly eventId: string;
  readonly eventType:
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded";
  readonly checkoutSessionId: string;
  readonly paymentLinkId: string;
  readonly createdAt: IsoDateTime;
}

export interface StripeRetrievePaymentInput {
  readonly jobId: string;
  readonly checkoutSessionId: string;
  readonly expectedPaymentLinkId: string;
}

export interface StripeRetrievedPayment {
  readonly checkoutSessionId: string;
  readonly paymentIntentId: string | null;
  readonly paymentLinkId: string;
  readonly status: "paid" | "unpaid" | "no_payment_required";
  readonly amountTotalMinor: number;
  readonly currency: string;
  readonly paidAt: IsoDateTime | null;
}

export interface StripeAdapter extends AdapterIdentity<"stripe"> {
  /**
   * Reveals the single organizer-registered Payment Link after both the Replay
   * and Terac gates pass. It must not create an untracked per-order link.
   */
  unlockOrganizerPaymentLink(
    input: StripeUnlockPaymentLinkInput,
  ): Promise<
    ProviderOperationExecution<
      StripePaymentLink,
      StripeReceipt,
      "create_post_certification_payment_link"
    >
  >;

  verifySignedWebhook(
    input: StripeVerifyWebhookInput,
  ): Promise<
    ProviderOperationExecution<
      StripeVerifiedWebhook,
      StripeReceipt,
      "verify_signed_webhook"
    >
  >;

  retrievePayment(
    input: StripeRetrievePaymentInput,
  ): Promise<
    ProviderOperationExecution<
      StripeRetrievedPayment,
      StripeReceipt,
      "retrieve_payment"
    >
  >;
}
