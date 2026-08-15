import { validateFixturePaymentIntent } from "@/lib/fixtures/payment-intent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        code: "INVALID_FIXTURE_INPUT",
        mode: "FIXTURE",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-Talos-Fixture": "true",
        },
      },
    );
  }

  const result = validateFixturePaymentIntent(body);

  return Response.json(result, {
    status: result.ok ? 201 : 422,
    headers: {
      "Cache-Control": "no-store",
      "X-Talos-Fixture": "true",
    },
  });
}
