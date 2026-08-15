import { describe, expect, it } from "vitest";

import { validateFixturePaymentIntent } from "../../lib/fixtures/payment-intent";

describe("controlled payment-intent fixture", () => {
  it("makes the seeded stale-state failure explicit", () => {
    expect(
      validateFixturePaymentIntent({
        email: "judge@example.com",
        intentId: "",
      }),
    ).toEqual({
      ok: false,
      code: "INTENT_ID_MISSING",
      mode: "FIXTURE",
    });
  });

  it("accepts the exact candidate value created during submission", () => {
    const result = validateFixturePaymentIntent({
      email: "judge@example.com",
      intentId: "pi_fixture_12345678-1234-1234-1234-123456789abc",
    });

    expect(result).toEqual({
      ok: true,
      intentId: "pi_fixture_12345678-1234-1234-1234-123456789abc",
      status: "created",
      mode: "FIXTURE",
    });
  });

  it("rejects inputs outside the controlled fixture contract", () => {
    expect(
      validateFixturePaymentIntent({
        email: "not-an-email",
        intentId: "pi_live_forbidden",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_FIXTURE_INPUT" });
  });
});
