import { describe, expect, it } from "vitest";

import {
  OrganizerPaymentLinkError,
  buildOrganizerPaymentLink,
} from "../../lib/payments/organizer-link";

describe("organizer Payment Link", () => {
  it("keeps one registered Stripe link and adds order reconciliation", () => {
    const result = new URL(
      buildOrganizerPaymentLink(
        "https://buy.stripe.com/test_123?prefilled_email=judge%40example.com",
        "TAL-D04",
      ),
    );

    expect(result.origin + result.pathname).toBe(
      "https://buy.stripe.com/test_123",
    );
    expect(result.searchParams.get("prefilled_email")).toBe(
      "judge@example.com",
    );
    expect(result.searchParams.get("client_reference_id")).toBe("TAL-D04");
    expect(result.searchParams.get("utm_source")).toBe("talos");
  });

  it.each([
    "http://buy.stripe.com/test_123",
    "https://buy.stripe.com.evil.example/test_123",
    "https://example.com/pay",
  ])("rejects an untrusted payment host: %s", (configuredLink) => {
    expect(() => buildOrganizerPaymentLink(configuredLink, "TAL-D04")).toThrow(
      OrganizerPaymentLinkError,
    );
  });

  it("rejects order references Stripe would silently discard", () => {
    expect(() =>
      buildOrganizerPaymentLink(
        "https://buy.stripe.com/test_123",
        "customer@example.com/order 4",
      ),
    ).toThrow("Order references must be 1-200 URL-safe characters.");
  });
});
