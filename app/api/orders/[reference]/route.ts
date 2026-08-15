import { lookupOrder } from "@/lib/server/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
  const result = await lookupOrder(reference);
  const provenance =
    result.status === 200 ? result.body.provenance.source : "NONE";

  return Response.json(result.body, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Talos-Provenance": provenance,
    },
  });
}
