import { z } from "zod";

export const fixturePaymentIntentSchema = z.object({
  email: z.string().trim().email().max(254),
  intentId: z.string().regex(/^pi_fixture_[a-f0-9-]{12,64}$/),
});

export type FixturePaymentIntentInput = z.infer<
  typeof fixturePaymentIntentSchema
>;

export type FixturePaymentIntentResult =
  | {
      ok: true;
      intentId: string;
      status: "created";
      mode: "FIXTURE";
    }
  | {
      ok: false;
      code: "INTENT_ID_MISSING" | "INVALID_FIXTURE_INPUT";
      mode: "FIXTURE";
    };

export function validateFixturePaymentIntent(
  input: unknown,
): FixturePaymentIntentResult {
  if (
    typeof input === "object" &&
    input !== null &&
    "intentId" in input &&
    input.intentId === ""
  ) {
    return {
      ok: false,
      code: "INTENT_ID_MISSING",
      mode: "FIXTURE",
    };
  }

  const parsed = fixturePaymentIntentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_FIXTURE_INPUT",
      mode: "FIXTURE",
    };
  }

  return {
    ok: true,
    intentId: parsed.data.intentId,
    status: "created",
    mode: "FIXTURE",
  };
}
