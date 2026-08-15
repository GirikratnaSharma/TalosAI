const STRIPE_PAYMENT_LINK_HOST = "buy.stripe.com";
const CLIENT_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export class OrganizerPaymentLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizerPaymentLinkError";
  }
}

/**
 * Talos must use the single Payment Link registered with the organizers. We
 * append only Stripe's documented client_reference_id so the completion
 * webhook can reconcile a payment to one certified order.
 */
export function buildOrganizerPaymentLink(
  configuredLink: string,
  orderReference: string,
): string {
  if (!CLIENT_REFERENCE_PATTERN.test(orderReference)) {
    throw new OrganizerPaymentLinkError(
      "Order references must be 1-200 URL-safe characters.",
    );
  }

  let link: URL;
  try {
    link = new URL(configuredLink);
  } catch {
    throw new OrganizerPaymentLinkError(
      "The organizer Payment Link is not a valid URL.",
    );
  }

  if (link.protocol !== "https:" || link.hostname !== STRIPE_PAYMENT_LINK_HOST) {
    throw new OrganizerPaymentLinkError(
      "The organizer Payment Link must use https://buy.stripe.com.",
    );
  }

  if (link.username || link.password) {
    throw new OrganizerPaymentLinkError(
      "The organizer Payment Link cannot contain URL credentials.",
    );
  }

  link.searchParams.set("client_reference_id", orderReference);
  link.searchParams.set("utm_source", "talos");
  link.searchParams.set("utm_medium", "verified_repair");
  return link.toString();
}
